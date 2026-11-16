const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');

const MIN_SHUTDOWN_SECONDS = 10;
const MAX_SHUTDOWN_SECONDS = 24 * 60 * 60; // 24hs, para no dejar algo programado por error para siempre

const CONFIG_PATH = path.join(__dirname, 'config.json');

// config.json no va en el repo (tiene tu PIN): en un clon nuevo se crea desde el ejemplo.
if (!fs.existsSync(CONFIG_PATH)) {
  fs.copyFileSync(path.join(__dirname, 'config.example.json'), CONFIG_PATH);
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// --- App web ---
const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');

// Temas: una carpeta themes/<nombre>/ con los archivos que cambian (index.html,
// style.css, theme.js, imágenes…). Lo que no traiga se toma de public/.
// Con "theme": "<nombre>" en config.json, ese tema se sirve en "/";
// la versión base queda siempre disponible en "/base/".
const themeName = String(loadConfig().theme || '').replace(/[^\w-]/g, '');
const themeDir = themeName && path.join(__dirname, 'themes', themeName);
const hasTheme = Boolean(themeDir && fs.existsSync(themeDir));

// Sin la barra final, las rutas relativas (style.css, app.js…) se pedirían en "/".
app.get(/^\/base$/, (req, res) => res.redirect('/base/'));
app.use('/base', express.static(PUBLIC_DIR));
if (hasTheme) app.use(express.static(themeDir));
app.use(express.static(PUBLIC_DIR));

// El cliente pide su configuracion (botones, sensibilidad) sin el PIN.
app.get('/api/config', (req, res) => {
  const { pin, ...safeConfig } = loadConfig();
  res.json(safeConfig);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// --- Agente de entrada (PowerShell persistente) ---
const agentScript = path.join(__dirname, 'agent', 'input-agent.ps1');
const psExe = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
);

let agent = null;

function startAgent() {
  agent = spawn(psExe, [
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', agentScript,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  agent.stdout.on('data', (d) => process.stdout.write(`[agent] ${d}`));
  agent.stderr.on('data', (d) => process.stderr.write(`[agent-err] ${d}`));

  agent.on('exit', (code) => {
    console.error(`El agente de entrada se cerro (codigo ${code}). Reiniciando en 1s...`);
    agent = null;
    setTimeout(startAgent, 1000);
  });
}

function sendCommand(line) {
  if (agent && agent.stdin.writable) {
    agent.stdin.write(line + '\n');
  }
}

function toBase64(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}

startAgent();

// --- Apagado programado ---
// Se persiste en disco para no perder la referencia si el servidor se reinicia
// (por una actualización, un cuelgue, etc.) mientras Windows sigue con el
// apagado real corriendo en segundo plano.
const SHUTDOWN_STATE_PATH = path.join(__dirname, '.shutdown-state.json');

function loadShutdownState() {
  try {
    const data = JSON.parse(fs.readFileSync(SHUTDOWN_STATE_PATH, 'utf-8'));
    if (typeof data.scheduledAt === 'number' && data.scheduledAt > Date.now()) {
      return data.scheduledAt;
    }
  } catch {
    // No existe el archivo o esta corrupto: no hay nada programado que restaurar.
  }
  return null;
}

function saveShutdownState(scheduledAt) {
  try {
    if (scheduledAt) {
      fs.writeFileSync(SHUTDOWN_STATE_PATH, JSON.stringify({ scheduledAt }));
    } else {
      fs.rmSync(SHUTDOWN_STATE_PATH, { force: true });
    }
  } catch (err) {
    console.error('No se pudo guardar el estado del apagado:', err.message);
  }
}

let shutdownAt = loadShutdownState(); // timestamp (ms) en el que el PC se va a apagar, o null

function broadcast(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.authed) {
      client.send(payload);
    }
  });
}

function broadcastShutdownStatus(errorMessage) {
  broadcast({ type: 'shutdown', scheduledAt: shutdownAt, error: errorMessage || null });
}

function scheduleShutdown(seconds, isRetry) {
  const clamped = Math.max(MIN_SHUTDOWN_SECONDS, Math.min(MAX_SHUTDOWN_SECONDS, Math.round(seconds)));
  exec(`shutdown /s /t ${clamped}`, (err, _stdout, stderr) => {
    if (err) {
      // Error 1190: Windows ya tiene uno programado (posiblemente de una sesion anterior
      // que el servidor perdio de vista). Lo cancelamos y reintentamos una sola vez.
      if (!isRetry && /1190/.test(stderr || err.message || '')) {
        exec('shutdown /a', () => scheduleShutdown(seconds, true));
        return;
      }
      console.error('No se pudo programar el apagado:', err.message);
      broadcastShutdownStatus('No se pudo programar el apagado. Inténtalo de nuevo.');
      return;
    }
    shutdownAt = Date.now() + clamped * 1000;
    saveShutdownState(shutdownAt);
    broadcastShutdownStatus();
  });
}

function cancelShutdown() {
  exec('shutdown /a', () => {
    // "shutdown /a" falla si no hay nada programado; lo ignoramos y limpiamos igual.
    shutdownAt = null;
    saveShutdownState(null);
    broadcastShutdownStatus();
  });
}

// --- Baúl de copiados (historial del portapapeles) ---
// Se guarda fuera de la carpeta del proyecto (que está en OneDrive) para que lo que
// copies no se suba a la nube.
const CLIP_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'MouseFinal');
const CLIP_PATH = path.join(CLIP_DIR, 'clipboard.json');
const CLIP_MAX_ITEMS = 60; // sin contar los fijados
const CLIP_MAX_CHARS = 20000;

// Se comparan y guardan con saltos de línea "\n" (Windows usa "\r\n").
const normalizeClip = (text) => String(text).replace(/\r\n?/g, '\n');

function loadClipItems() {
  try {
    const items = JSON.parse(fs.readFileSync(CLIP_PATH, 'utf-8'));
    if (Array.isArray(items)) return items.filter((i) => i && typeof i.text === 'string' && i.id);
  } catch {
    // Todavía no hay historial guardado.
  }
  return [];
}

let clipItems = loadClipItems(); // más nuevo primero
// Texto que puso la propia app en el portapapeles al "Pegar": cuando el vigilante
// lo detecte no hay que agregarlo de nuevo (ya está en la lista).
let clipIgnoreText = null;

function saveClipItems() {
  try {
    fs.mkdirSync(CLIP_DIR, { recursive: true });
    fs.writeFileSync(CLIP_PATH, JSON.stringify(clipItems));
  } catch (err) {
    console.error('No se pudo guardar el baúl de copiados:', err.message);
  }
}

function clipChanged() {
  saveClipItems();
  broadcast({ type: 'clipboard', items: clipItems });
}

function addClipItem(rawText, source) {
  if (typeof rawText !== 'string') return;
  const text = normalizeClip(rawText);
  if (!text.trim() || text.length > CLIP_MAX_CHARS) return;

  const existing = clipItems.findIndex((i) => i.text === text);
  if (existing >= 0) {
    // Copiar algo que ya estaba lo sube arriba en vez de duplicarlo.
    const [item] = clipItems.splice(existing, 1);
    item.at = Date.now();
    clipItems.unshift(item);
  } else {
    clipItems.unshift({ id: crypto.randomUUID(), text, source, pinned: false, at: Date.now() });
  }

  let unpinned = 0;
  clipItems = clipItems.filter((i) => i.pinned || ++unpinned <= CLIP_MAX_ITEMS);
  clipChanged();
}

function handleClipMessage(msg) {
  const item = clipItems.find((i) => i.id === msg.id);
  switch (msg.action) {
    case 'paste':
      if (!item) return;
      clipIgnoreText = item.text;
      sendCommand(`CLIP|${toBase64(item.text)}`);
      sendCommand('KEY|CTRL+V');
      break;
    case 'add':
      addClipItem(msg.text, 'phone');
      break;
    case 'pin':
      if (!item) return;
      item.pinned = !item.pinned;
      clipChanged();
      break;
    case 'delete':
      if (!item) return;
      clipItems = clipItems.filter((i) => i !== item);
      clipChanged();
      break;
    case 'clear':
      clipItems = clipItems.filter((i) => i.pinned);
      clipChanged();
      break;
    default:
      break;
  }
}

const clipWatchScript = path.join(__dirname, 'agent', 'clipboard-watch.ps1');

function startClipWatcher() {
  const watcher = spawn(psExe, [
    '-NoLogo', '-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', clipWatchScript, String(process.pid),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let pending = '';
  watcher.stdout.on('data', (chunk) => {
    pending += chunk.toString();
    let nl;
    while ((nl = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, nl).trim();
      pending = pending.slice(nl + 1);
      if (!line.startsWith('CLIP|')) continue;
      const text = normalizeClip(Buffer.from(line.slice(5), 'base64').toString('utf-8'));
      if (clipIgnoreText !== null && text === normalizeClip(clipIgnoreText)) {
        clipIgnoreText = null;
        continue;
      }
      addClipItem(text, 'pc');
    }
  });
  watcher.stderr.on('data', (d) => process.stderr.write(`[clip-err] ${d}`));
  watcher.on('exit', (code) => {
    console.error(`El vigilante del portapapeles se cerro (codigo ${code}). Reiniciando en 2s...`);
    setTimeout(startClipWatcher, 2000);
  });
}

startClipWatcher();

// --- WebSocket: protocolo de control ---
wss.on('connection', (ws) => {
  ws.authed = false;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'auth') {
      ws.authed = String(msg.pin) === String(loadConfig().pin);
      ws.send(JSON.stringify({ type: 'auth', ok: ws.authed }));
      if (ws.authed) {
        ws.send(JSON.stringify({ type: 'shutdown', scheduledAt: shutdownAt }));
        ws.send(JSON.stringify({ type: 'clipboard', items: clipItems }));
      }
      return;
    }

    if (!ws.authed) return;

    switch (msg.type) {
      case 'move':
        sendCommand(`MOVE|${Math.round(msg.dx)}|${Math.round(msg.dy)}`);
        break;
      case 'click':
        sendCommand(`CLICK|${msg.button}`);
        break;
      case 'scroll':
        sendCommand(`SCROLL|${Math.round(msg.dy)}`);
        break;
      case 'key':
        sendCommand(`KEY|${msg.code}`);
        break;
      case 'type':
        sendCommand(`TYPE|${toBase64(msg.text)}`);
        break;
      case 'brightness':
        if (Number.isFinite(msg.percent)) {
          const percent = Math.max(0, Math.min(100, Math.round(msg.percent)));
          sendCommand(`BRIGHTNESS|${percent}`);
        }
        break;
      case 'open': {
        // Lista blanca de atajos que se pueden abrir en la PC, para no permitir comandos arbitrarios.
        const OPEN_TARGETS = {
          cursor_settings: 'ms-settings:easeofaccess-mousepointer',
        };
        const uri = OPEN_TARGETS[msg.target];
        if (uri) exec(`explorer.exe ${uri}`);
        break;
      }
      case 'shutdown':
        if (msg.action === 'schedule' && Number.isFinite(msg.seconds)) {
          scheduleShutdown(msg.seconds);
        } else if (msg.action === 'cancel') {
          cancelShutdown();
        }
        break;
      case 'clip':
        handleClipMessage(msg);
        break;
      default:
        break;
    }
  });
});

// --- Arranque ---
const config = loadConfig();
const PORT = config.port || 5577;

server.listen(PORT, () => {
  console.log(`Mouse_Final escuchando en el puerto ${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  -> Abre desde el celular (misma red WiFi): http://${net.address}:${PORT}`);
        if (hasTheme) console.log(`     Tema "${themeName}" en "/", versión base en http://${net.address}:${PORT}/base/`);
      }
    }
  }
  if (themeName && !hasTheme) console.log(`  (No existe themes/${themeName}/: se usa la versión base)`);
});

process.on('SIGINT', () => {
  if (agent) agent.kill();
  process.exit(0);
});

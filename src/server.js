// Servidor de Cursor Remoto como módulo reutilizable.
// Lo usan tanto `npm start` (server.js, sin interfaz) como la app de escritorio
// (desktop/main.js), que lo puede iniciar, detener y reconfigurar en caliente.

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { spawn, exec } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');

const MIN_SHUTDOWN_SECONDS = 10;
const MAX_SHUTDOWN_SECONDS = 24 * 60 * 60; // 24hs, para no dejar algo programado por error para siempre

const CLIP_MAX_ITEMS = 60; // sin contar los fijados
const CLIP_MAX_CHARS = 20000;

// Emparejamiento: el QR lleva un código que se renueva solo, así una foto vieja
// del QR no sirve para entrar.
const PAIRING_TTL_MS = 10 * 60 * 1000;

// Límite de intentos (PIN o QR) por dirección IP: después de 5 fallos se bloquea
// 30 s, y cada fallo extra duplica la espera hasta 15 min.
const FREE_ATTEMPTS = 5;
const BASE_LOCK_MS = 30 * 1000;
const MAX_LOCK_MS = 15 * 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b));
const newToken = () => crypto.randomBytes(32).toString('base64url');

// Nombre legible del dispositivo a partir del navegador que se conecta.
function deviceNameFromUA(ua = '') {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Celular Android' : 'Tablet Android';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'PC Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Dispositivo';
}

const ROOT_DIR = path.join(__dirname, '..');

// Dentro de un paquete de Electron los archivos viven en app.asar, que PowerShell
// no puede leer: los scripts del agente se copian sin empaquetar a app.asar.unpacked.
function unpacked(p) {
  return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

const psExe = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
);

// Se comparan y guardan con saltos de línea "\n" (Windows usa "\r\n").
const normalizeClip = (text) => String(text).replace(/\r\n?/g, '\n');
const toBase64 = (str) => Buffer.from(str, 'utf-8').toString('base64');

/**
 * Eventos:
 *  - 'status'  -> { running, port, clients }
 *  - 'log'     -> string
 */
class MouseServer extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.configPath  config.json del usuario (con el PIN)
   * @param {string} opts.dataDir     carpeta para estado interno (apagado programado)
   * @param {string} [opts.seedConfigPath] de dónde copiar la config si no existe
   * @param {string} [opts.themesDir] carpeta con los temas locales (themes/<nombre>/)
   */
  constructor({ configPath, dataDir, seedConfigPath, themesDir }) {
    super();
    this.configPath = configPath;
    this.dataDir = dataDir;
    this.seedConfigPath = seedConfigPath || path.join(ROOT_DIR, 'config.example.json');
    this.publicDir = path.join(ROOT_DIR, 'public');
    this.themesDir = themesDir || path.join(ROOT_DIR, 'themes');
    this.theme = { name: '', active: false };
    this.agentScript = unpacked(path.join(ROOT_DIR, 'agent', 'input-agent.ps1'));
    this.clipWatchScript = unpacked(path.join(ROOT_DIR, 'agent', 'clipboard-watch.ps1'));

    this.shutdownStatePath = path.join(dataDir, '.shutdown-state.json');
    // Dispositivos emparejados: archivo aparte para que nunca se mande por /api/config.
    this.devicesPath = path.join(dataDir, 'devices.json');
    // Fuera de la carpeta del proyecto (que puede estar en OneDrive) para que lo
    // que copies no se suba a la nube.
    this.clipDir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'MouseFinal');
    this.clipPath = path.join(this.clipDir, 'clipboard.json');

    this.running = false;
    this.port = null;
    this.httpServer = null;
    this.wss = null;
    this.agent = null;
    this.watcher = null;
    this.restartTimers = new Set();

    this.ensureConfig();
    this.devices = this.loadDevices();
    this.pairing = null; // { token, expiresAt }
    this.pairingTimer = null;
    this.attempts = new Map(); // ip -> { fails, lockedUntil }
    this.shutdownAt = this.loadShutdownState(); // timestamp (ms) o null
    this.clipItems = this.loadClipItems(); // más nuevo primero
    // Texto que puso la propia app en el portapapeles al "Pegar": cuando el vigilante
    // lo detecte no hay que agregarlo de nuevo (ya está en la lista).
    this.clipIgnoreText = null;
  }

  // ---------- Config ----------

  ensureConfig() {
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.copyFileSync(this.seedConfigPath, this.configPath);
    }
  }

  loadConfig() {
    return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
  }

  saveConfig(patch) {
    const config = { ...this.loadConfig(), ...patch };
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2) + '\n');
    return config;
  }

  // Si falta la clave (configs viejas) se mantiene el comportamiento original: activado.
  clipboardEnabled() {
    return this.loadConfig().clipboardHistory !== false;
  }

  // El PIN solo sirve para emparejar dispositivos nuevos: los que ya están
  // emparejados siguen funcionando (para sacarlos está revokeDevice).
  setPin(pin) {
    this.saveConfig({ pin: String(pin) });
    this.emitStatus();
  }

  // ---------- Dispositivos emparejados ----------

  loadDevices() {
    try {
      const list = JSON.parse(fs.readFileSync(this.devicesPath, 'utf-8'));
      if (Array.isArray(list)) return list.filter((d) => d && d.id && d.hash);
    } catch {
      // Todavía no hay dispositivos.
    }
    return [];
  }

  saveDevices() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(this.devicesPath, JSON.stringify(this.devices, null, 2));
    } catch (err) {
      this.emit('log', `No se pudo guardar la lista de dispositivos: ${err.message}`);
    }
  }

  // Crea un dispositivo y devuelve su token. Del token solo se guarda el hash.
  addDevice(name) {
    const token = newToken();
    const now = Date.now();
    const device = { id: crypto.randomUUID(), name, hash: sha256(token).toString('hex'), createdAt: now, lastSeen: now };
    this.devices.push(device);
    this.saveDevices();
    return { device, token };
  }

  findDevice(token) {
    if (typeof token !== 'string' || !token) return null;
    const hash = sha256(token);
    return this.devices.find((d) => crypto.timingSafeEqual(Buffer.from(d.hash, 'hex'), hash)) || null;
  }

  listDevices() {
    const online = new Set();
    if (this.wss) this.wss.clients.forEach((c) => { if (c.authed && c.deviceId) online.add(c.deviceId); });
    return this.devices
      .map(({ id, name, createdAt, lastSeen }) => ({ id, name, createdAt, lastSeen, online: online.has(id) }))
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }

  revokeDevice(id) {
    this.devices = this.devices.filter((d) => d.id !== id);
    this.saveDevices();
    this.disconnect((c) => c.deviceId === id);
    this.emitStatus();
  }

  revokeAllDevices() {
    this.devices = [];
    this.saveDevices();
    this.disconnect(() => true);
    this.emitStatus();
  }

  disconnect(predicate) {
    if (!this.wss) return;
    this.wss.clients.forEach((c) => { if (predicate(c)) c.close(4003, 'Dispositivo desvinculado'); });
  }

  // ---------- Código de emparejamiento (QR) ----------

  currentPairing() {
    if (!this.pairing || this.pairing.expiresAt <= Date.now()) {
      this.pairing = { token: newToken(), expiresAt: Date.now() + PAIRING_TTL_MS };
      clearTimeout(this.pairingTimer);
      this.pairingTimer = setTimeout(() => {
        this.pairing = null;
        this.emit('pairing');
      }, PAIRING_TTL_MS);
      this.pairingTimer.unref?.();
    }
    return { ...this.pairing };
  }

  // ---------- Límite de intentos ----------

  lockRemaining(ip) {
    const entry = this.attempts.get(ip);
    return entry && entry.lockedUntil > Date.now() ? entry.lockedUntil - Date.now() : 0;
  }

  registerFailure(ip) {
    let entry = this.attempts.get(ip);
    // Después de una hora sin fallos, el contador vuelve a cero.
    if (!entry || Date.now() - entry.lastFail > 60 * 60 * 1000) entry = { fails: 0, lockedUntil: 0 };
    entry.fails += 1;
    entry.lastFail = Date.now();
    if (entry.fails >= FREE_ATTEMPTS) {
      const lock = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (entry.fails - FREE_ATTEMPTS));
      entry.lockedUntil = Date.now() + lock;
      this.emit('log', `Demasiados intentos fallidos desde ${ip}: bloqueado ${Math.round(lock / 1000)} s`);
    }
    this.attempts.set(ip, entry);
  }

  setClipboardEnabled(enabled) {
    this.saveConfig({ clipboardHistory: !!enabled });
    if (!this.running) return;
    if (enabled) this.startClipWatcher();
    else this.stopClipWatcher();
  }

  // ---------- Ciclo de vida ----------

  start() {
    if (this.running) return Promise.resolve(this.status());
    const config = this.loadConfig();
    const port = Number(config.port) || 5577;

    const app = express();

    // Temas: una carpeta themes/<nombre>/ con los archivos que cambian (index.html,
    // style.css, theme.js, imágenes…). Lo que no traiga se toma de public/.
    // Con "theme": "<nombre>" en config.json, ese tema se sirve en "/";
    // la versión base queda siempre disponible en "/base/".
    const themeName = String(config.theme || '').replace(/[^\w-]/g, '');
    const themeDir = themeName && path.join(this.themesDir, themeName);
    this.theme = { name: themeName, active: Boolean(themeDir && fs.existsSync(themeDir)) };

    // Sin la barra final, las rutas relativas (style.css, app.js…) se pedirían en "/".
    app.get(/^\/base$/, (req, res) => res.redirect('/base/'));
    app.use('/base', express.static(this.publicDir));
    if (this.theme.active) app.use(express.static(themeDir));
    app.use(express.static(this.publicDir));
    // El cliente pide su configuracion (botones, sensibilidad) sin el PIN.
    app.get('/api/config', (req, res) => {
      const { pin, ...safeConfig } = this.loadConfig();
      res.json(safeConfig);
    });

    const httpServer = http.createServer(app);
    const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    return new Promise((resolve, reject) => {
      httpServer.once('error', (err) => {
        wss.close();
        reject(err);
      });
      httpServer.listen(port, () => {
        this.httpServer = httpServer;
        this.wss = wss;
        this.port = port;
        this.running = true;
        this.startAgent();
        if (this.clipboardEnabled()) this.startClipWatcher();
        this.emit('log', `Escuchando en el puerto ${port}`);
        this.emitStatus();
        resolve(this.status());
      });
    });
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    this.restartTimers.forEach(clearTimeout);
    this.restartTimers.clear();

    if (this.agent) { this.agent.removeAllListeners('exit'); this.agent.kill(); this.agent = null; }
    this.stopClipWatcher();

    this.wss.clients.forEach((client) => client.terminate());
    await new Promise((resolve) => this.wss.close(() => resolve()));
    await new Promise((resolve) => this.httpServer.close(() => resolve()));
    this.wss = null;
    this.httpServer = null;
    this.port = null;
    this.emit('log', 'Servidor detenido');
    this.emitStatus();
  }

  status() {
    let clients = 0;
    if (this.wss) this.wss.clients.forEach((c) => { if (c.authed && c.readyState === WebSocket.OPEN) clients++; });
    return { running: this.running, port: this.port, clients, theme: { ...this.theme } };
  }

  emitStatus() {
    this.emit('status', this.status());
  }

  later(fn, ms) {
    const t = setTimeout(() => { this.restartTimers.delete(t); fn(); }, ms);
    this.restartTimers.add(t);
  }

  // ---------- Agente de entrada (PowerShell persistente) ----------

  startAgent() {
    const agent = spawn(psExe, [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', this.agentScript,
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.agent = agent;

    agent.stdout.on('data', (d) => this.emit('log', `[agent] ${d}`));
    agent.stderr.on('data', (d) => this.emit('log', `[agent-err] ${d}`));
    agent.on('exit', (code) => {
      if (this.agent !== agent) return;
      this.agent = null;
      if (!this.running) return;
      this.emit('log', `El agente de entrada se cerro (codigo ${code}). Reiniciando en 1s...`);
      this.later(() => { if (this.running) this.startAgent(); }, 1000);
    });
  }

  sendCommand(line) {
    // Un salto de linea dentro de un valor colaria un segundo comando al agente.
    const safe = String(line).replace(/[\r\n]/g, '');
    if (this.agent && this.agent.stdin.writable) this.agent.stdin.write(safe + '\n');
  }

  // ---------- Apagado programado ----------
  // Se persiste en disco para no perder la referencia si el servidor se reinicia
  // mientras Windows sigue con el apagado real corriendo en segundo plano.

  loadShutdownState() {
    try {
      const data = JSON.parse(fs.readFileSync(this.shutdownStatePath, 'utf-8'));
      if (typeof data.scheduledAt === 'number' && data.scheduledAt > Date.now()) return data.scheduledAt;
    } catch {
      // No existe el archivo o esta corrupto: no hay nada programado que restaurar.
    }
    return null;
  }

  saveShutdownState(scheduledAt) {
    try {
      if (scheduledAt) {
        fs.mkdirSync(this.dataDir, { recursive: true });
        fs.writeFileSync(this.shutdownStatePath, JSON.stringify({ scheduledAt }));
      } else {
        fs.rmSync(this.shutdownStatePath, { force: true });
      }
    } catch (err) {
      this.emit('log', `No se pudo guardar el estado del apagado: ${err.message}`);
    }
  }

  broadcast(message) {
    if (!this.wss) return;
    const payload = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.authed) client.send(payload);
    });
  }

  broadcastShutdownStatus(errorMessage) {
    this.broadcast({ type: 'shutdown', scheduledAt: this.shutdownAt, error: errorMessage || null });
  }

  scheduleShutdown(seconds, isRetry) {
    const clamped = Math.max(MIN_SHUTDOWN_SECONDS, Math.min(MAX_SHUTDOWN_SECONDS, Math.round(seconds)));
    exec(`shutdown /s /t ${clamped}`, (err, _stdout, stderr) => {
      if (err) {
        // Error 1190: Windows ya tiene uno programado (posiblemente de una sesion anterior
        // que el servidor perdio de vista). Lo cancelamos y reintentamos una sola vez.
        if (!isRetry && /1190/.test(stderr || err.message || '')) {
          exec('shutdown /a', () => this.scheduleShutdown(seconds, true));
          return;
        }
        this.emit('log', `No se pudo programar el apagado: ${err.message}`);
        this.broadcastShutdownStatus('No se pudo programar el apagado. Inténtalo de nuevo.');
        return;
      }
      this.shutdownAt = Date.now() + clamped * 1000;
      this.saveShutdownState(this.shutdownAt);
      this.broadcastShutdownStatus();
    });
  }

  cancelShutdown() {
    exec('shutdown /a', () => {
      // "shutdown /a" falla si no hay nada programado; lo ignoramos y limpiamos igual.
      this.shutdownAt = null;
      this.saveShutdownState(null);
      this.broadcastShutdownStatus();
    });
  }

  // ---------- Baúl de copiados (historial del portapapeles) ----------

  loadClipItems() {
    try {
      const items = JSON.parse(fs.readFileSync(this.clipPath, 'utf-8'));
      if (Array.isArray(items)) return items.filter((i) => i && typeof i.text === 'string' && i.id);
    } catch {
      // Todavía no hay historial guardado.
    }
    return [];
  }

  saveClipItems() {
    try {
      fs.mkdirSync(this.clipDir, { recursive: true });
      fs.writeFileSync(this.clipPath, JSON.stringify(this.clipItems));
    } catch (err) {
      this.emit('log', `No se pudo guardar el baúl de copiados: ${err.message}`);
    }
  }

  clipChanged() {
    this.saveClipItems();
    this.broadcast({ type: 'clipboard', items: this.clipItems });
  }

  addClipItem(rawText, source) {
    if (typeof rawText !== 'string') return;
    const text = normalizeClip(rawText);
    if (!text.trim() || text.length > CLIP_MAX_CHARS) return;

    const existing = this.clipItems.findIndex((i) => i.text === text);
    if (existing >= 0) {
      // Copiar algo que ya estaba lo sube arriba en vez de duplicarlo.
      const [item] = this.clipItems.splice(existing, 1);
      item.at = Date.now();
      this.clipItems.unshift(item);
    } else {
      this.clipItems.unshift({ id: crypto.randomUUID(), text, source, pinned: false, at: Date.now() });
    }

    let unpinned = 0;
    this.clipItems = this.clipItems.filter((i) => i.pinned || ++unpinned <= CLIP_MAX_ITEMS);
    this.clipChanged();
  }

  handleClipMessage(msg) {
    const item = this.clipItems.find((i) => i.id === msg.id);
    switch (msg.action) {
      case 'paste':
        if (!item) return;
        this.clipIgnoreText = item.text;
        this.sendCommand(`CLIP|${toBase64(item.text)}`);
        this.sendCommand('KEY|CTRL+V');
        break;
      case 'add':
        this.addClipItem(msg.text, 'phone');
        break;
      case 'pin':
        if (!item) return;
        item.pinned = !item.pinned;
        this.clipChanged();
        break;
      case 'delete':
        if (!item) return;
        this.clipItems = this.clipItems.filter((i) => i !== item);
        this.clipChanged();
        break;
      case 'clear':
        this.clipItems = this.clipItems.filter((i) => i.pinned);
        this.clipChanged();
        break;
      default:
        break;
    }
  }

  startClipWatcher() {
    if (this.watcher) return;
    const watcher = spawn(psExe, [
      '-NoLogo', '-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', this.clipWatchScript, String(process.pid),
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    this.watcher = watcher;

    let pending = '';
    watcher.stdout.on('data', (chunk) => {
      pending += chunk.toString();
      let nl;
      while ((nl = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, nl).trim();
        pending = pending.slice(nl + 1);
        if (!line.startsWith('CLIP|')) continue;
        const text = normalizeClip(Buffer.from(line.slice(5), 'base64').toString('utf-8'));
        if (this.clipIgnoreText !== null && text === normalizeClip(this.clipIgnoreText)) {
          this.clipIgnoreText = null;
          continue;
        }
        this.addClipItem(text, 'pc');
      }
    });
    watcher.stderr.on('data', (d) => this.emit('log', `[clip-err] ${d}`));
    watcher.on('exit', (code) => {
      if (this.watcher !== watcher) return;
      this.watcher = null;
      if (!this.running || !this.clipboardEnabled()) return;
      this.emit('log', `El vigilante del portapapeles se cerro (codigo ${code}). Reiniciando en 2s...`);
      this.later(() => { if (this.running && this.clipboardEnabled()) this.startClipWatcher(); }, 2000);
    });
  }

  stopClipWatcher() {
    if (!this.watcher) return;
    const w = this.watcher;
    this.watcher = null;
    w.kill();
  }

  // ---------- WebSocket: protocolo de control ----------

  // Formas de entrar:
  //  - { type:'auth', device:<token> }  dispositivo ya emparejado (lo normal)
  //  - { type:'pair', token:<código QR> } emparejar escaneando el QR de la PC
  //  - { type:'auth', pin:<PIN> }       emparejar a mano con el PIN
  // Las dos últimas cuentan para el límite de intentos y devuelven un token de
  // dispositivo, que el celular guarda en lugar del PIN.
  handleAuth(ws, msg, ip, userAgent) {
    const reply = (payload) => ws.send(JSON.stringify({ type: 'auth', ...payload }));

    const grant = (device, token) => {
      ws.authed = true;
      ws.deviceId = device.id;
      device.lastSeen = Date.now();
      this.saveDevices();
      this.attempts.delete(ip);
      reply({ ok: true, ...(token ? { device: token } : {}) });
      ws.send(JSON.stringify({ type: 'shutdown', scheduledAt: this.shutdownAt }));
      ws.send(JSON.stringify({ type: 'clipboard', items: this.clipboardEnabled() ? this.clipItems : [] }));
      this.emitStatus();
    };

    if (msg.type === 'auth' && msg.device !== undefined) {
      const device = this.findDevice(msg.device);
      // Un token de 256 bits no se puede adivinar: no hace falta contarlo como intento.
      if (device) grant(device);
      else reply({ ok: false, reason: 'device' });
      return;
    }

    const locked = this.lockRemaining(ip);
    if (locked) {
      reply({ ok: false, reason: 'locked', retryIn: Math.ceil(locked / 1000) });
      return;
    }

    let valid = false;
    if (msg.type === 'pair') {
      valid = !!this.pairing && this.pairing.expiresAt > Date.now()
        && typeof msg.token === 'string' && safeEqual(msg.token, this.pairing.token);
    } else if (msg.pin !== undefined) {
      valid = safeEqual(String(msg.pin), String(this.loadConfig().pin));
    }

    if (!valid) {
      this.registerFailure(ip);
      const retryIn = Math.ceil(this.lockRemaining(ip) / 1000);
      reply({ ok: false, reason: msg.type === 'pair' ? 'pair' : 'pin', ...(retryIn ? { retryIn } : {}) });
      return;
    }

    const { device, token } = this.addDevice(deviceNameFromUA(userAgent));
    this.emit('log', `Nuevo dispositivo emparejado: ${device.name} (${ip})`);
    grant(device, token);
  }

  handleConnection(ws, req) {
    ws.authed = false;
    const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    const userAgent = req.headers['user-agent'] || '';
    ws.on('close', () => { if (ws.authed) this.emitStatus(); });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'auth' || msg.type === 'pair') {
        this.handleAuth(ws, msg, ip, userAgent);
        return;
      }

      if (!ws.authed) return;

      switch (msg.type) {
        case 'move':
          this.sendCommand(`MOVE|${Math.round(msg.dx)}|${Math.round(msg.dy)}`);
          break;
        case 'click':
          this.sendCommand(`CLICK|${msg.button}`);
          break;
        case 'scroll':
          this.sendCommand(`SCROLL|${Math.round(msg.dy)}`);
          break;
        case 'key':
          this.sendCommand(`KEY|${msg.code}`);
          break;
        case 'type':
          if (typeof msg.text === 'string') this.sendCommand(`TYPE|${toBase64(msg.text)}`);
          break;
        case 'brightness':
          if (Number.isFinite(msg.percent)) {
            const percent = Math.max(0, Math.min(100, Math.round(msg.percent)));
            this.sendCommand(`BRIGHTNESS|${percent}`);
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
            this.scheduleShutdown(msg.seconds);
          } else if (msg.action === 'cancel') {
            this.cancelShutdown();
          }
          break;
        case 'clip':
          if (this.clipboardEnabled()) this.handleClipMessage(msg);
          break;
        default:
          break;
      }
    });
  }
}

// Direcciones IPv4 de la PC, la más probable de ser la red WiFi/LAN primero.
// Los adaptadores virtuales (WSL, Hyper-V, VPNs) quedan al final.
function lanAddresses() {
  const VIRTUAL = /vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback|Tailscale|ZeroTier|Hamachi|docker/i;
  const isPrivate = (ip) => /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  const list = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      let score = 0;
      if (isPrivate(net.address)) score += 2;
      if (/^192\.168\./.test(net.address)) score += 1;
      if (VIRTUAL.test(name)) score -= 5;
      list.push({ address: net.address, iface: name, score });
    }
  }
  return list.sort((a, b) => b.score - a.score);
}

module.exports = { MouseServer, lanAddresses, PAIRING_TTL_MS };

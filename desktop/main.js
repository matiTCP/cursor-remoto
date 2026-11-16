// App de escritorio: icono en la bandeja + ventana con QR, PIN y opciones.
// Corre el mismo servidor que `npm start`, pero dentro del proceso de Electron,
// así el usuario final no necesita instalar Node.js.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, clipboard, shell } = require('electron');
const QRCode = require('qrcode');
const { MouseServer, lanAddresses } = require('../src/server');

const ROOT_DIR = path.join(__dirname, '..');
const START_HIDDEN = process.argv.includes('--hidden');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
let tray = null;
let server = null;
let quitting = false;
let lastError = null;
let addresses = [];
let settingsPath = null;
let settings = { address: null };

// ---------- Ajustes propios del escritorio (no viajan al celular) ----------

function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) }; } catch {}
}

function saveSettings() {
  try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); } catch {}
}

// ---------- Inicio con Windows ----------
// En desarrollo el ejecutable es electron.exe y hay que pasarle la carpeta de la app.

function loginItemOptions() {
  const args = app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'];
  // "name" es el valor en HKCU\...\Run; el desinstalador lo borra con este mismo nombre.
  return { path: process.execPath, args, name: 'MouseFinal' };
}

function autostartEnabled() {
  return app.getLoginItemSettings(loginItemOptions()).openAtLogin;
}

// ---------- Estado para la ventana ----------

function currentAddress() {
  const found = addresses.find((a) => a.address === settings.address);
  return (found || addresses[0] || {}).address || null;
}

async function buildState() {
  const status = server.status();
  const config = server.loadConfig();
  const port = status.port || Number(config.port) || 5577;
  const address = currentAddress();
  const url = address ? `http://${address}:${port}/` : null;
  // El QR lleva además un código de emparejamiento: escanearlo deja el celular
  // conectado sin escribir el PIN. El link de "Copiar" no lo lleva.
  let qr = null;
  let pairingExpiresAt = null;
  if (url && status.running) {
    const pairing = server.currentPairing();
    pairingExpiresAt = pairing.expiresAt;
    qr = await QRCode.toDataURL(`${url}#pair=${pairing.token}`, { margin: 1, width: 560, errorCorrectionLevel: 'M' });
  }
  return {
    ...status,
    port,
    pairingExpiresAt,
    devices: server.listDevices(),
    pin: String(config.pin),
    clipboardHistory: config.clipboardHistory !== false,
    autostart: autostartEnabled(),
    addresses: addresses.map(({ address: a, iface }) => ({ address: a, iface })),
    address,
    url,
    qr,
    error: lastError,
    version: app.getVersion(),
  };
}

async function pushState() {
  updateTray();
  if (win && !win.isDestroyed()) win.webContents.send('state', await buildState());
}

function refreshAddresses() {
  const next = lanAddresses();
  const changed = next.map((a) => a.address).join() !== addresses.map((a) => a.address).join();
  addresses = next;
  return changed;
}

// ---------- Servidor ----------

async function startServer() {
  lastError = null;
  try {
    await server.start();
  } catch (err) {
    lastError = err.code === 'EADDRINUSE'
      ? `El puerto ${server.loadConfig().port || 5577} ya está en uso. ¿Hay otra copia de Mouse Final abierta? Cerrala o cambiá el puerto.`
      : `No se pudo iniciar el servidor: ${err.message}`;
  }
  await pushState();
}

async function stopServer() {
  lastError = null;
  await server.stop();
  await pushState();
}

// ---------- Ventana y bandeja ----------

function iconImage(size) {
  return nativeImage.createFromPath(path.join(ROOT_DIR, 'public', 'icon-192.png')).resize({ width: size, height: size });
}

function createWindow() {
  win = new BrowserWindow({
    width: 440,
    height: 760,
    minWidth: 380,
    minHeight: 560,
    show: false,
    title: 'Mouse Final',
    icon: iconImage(64),
    autoHideMenuBar: true,
    backgroundColor: '#16161a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Los links (p. ej. abrir la URL en el navegador) salen al navegador del sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Cerrar la ventana la esconde: el servidor sigue andando desde la bandeja.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.once('ready-to-show', () => { if (!START_HIDDEN) win.show(); });
}

function showWindow() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function updateTray() {
  if (!tray) return;
  const { running, clients } = server.status();
  tray.setToolTip(running
    ? `Mouse Final · activo${clients ? ` · ${clients} conectado${clients > 1 ? 's' : ''}` : ''}`
    : 'Mouse Final · detenido');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Mouse Final', click: showWindow },
    { type: 'separator' },
    running
      ? { label: 'Detener servidor', click: stopServer }
      : { label: 'Iniciar servidor', click: startServer },
    { type: 'separator' },
    { label: 'Salir', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(iconImage(16));
  tray.on('click', showWindow);
  updateTray();
}

// ---------- IPC desde la ventana ----------

function registerIpc() {
  ipcMain.handle('state:get', () => buildState());
  ipcMain.handle('server:start', () => startServer());
  ipcMain.handle('server:stop', () => stopServer());

  ipcMain.handle('pin:set', async (_e, pin) => {
    const value = String(pin || '').trim();
    if (!/^\d{4,12}$/.test(value)) return { ok: false, error: 'El PIN tiene que tener entre 4 y 12 números.' };
    server.setPin(value);
    await pushState();
    return { ok: true };
  });

  ipcMain.handle('port:set', async (_e, port) => {
    const value = Number(port);
    if (!Number.isInteger(value) || value < 1024 || value > 65535) {
      return { ok: false, error: 'El puerto tiene que ser un número entre 1024 y 65535.' };
    }
    const wasRunning = server.status().running;
    if (wasRunning) await server.stop();
    server.saveConfig({ port: value });
    if (wasRunning) await startServer(); else await pushState();
    return { ok: !lastError, error: lastError };
  });

  ipcMain.handle('clipboard:set', async (_e, enabled) => {
    server.setClipboardEnabled(!!enabled);
    await pushState();
  });

  ipcMain.handle('autostart:set', async (_e, enabled) => {
    app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: !!enabled });
    await pushState();
  });

  ipcMain.handle('address:set', async (_e, address) => {
    settings.address = String(address);
    saveSettings();
    await pushState();
  });

  ipcMain.handle('device:revoke', async (_e, id) => {
    server.revokeDevice(String(id));
    await pushState();
  });

  ipcMain.handle('devices:revoke-all', async () => {
    server.revokeAllDevices();
    await pushState();
  });

  ipcMain.handle('copy', (_e, text) => { clipboard.writeText(String(text)); });
  ipcMain.handle('open-url', (_e, url) => {
    if (/^https?:\/\//.test(String(url))) shell.openExternal(String(url));
  });
}

// ---------- Arranque ----------

app.on('second-instance', showWindow);

app.whenReady().then(async () => {
  app.setAppUserModelId('cl.mousefinal.desktop');

  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  settingsPath = path.join(userData, 'desktop-settings.json');
  loadSettings();

  // En desarrollo, la primera vez se toma el config.json del repo (si existe)
  // para no perder el PIN y los botones que ya tenías.
  const devConfig = path.join(ROOT_DIR, 'config.json');
  server = new MouseServer({
    configPath: path.join(userData, 'config.json'),
    dataDir: userData,
    seedConfigPath: !app.isPackaged && fs.existsSync(devConfig) ? devConfig : undefined,
  });
  // Nadie debería quedarse con el PIN de ejemplo: si es el de fábrica, se cambia
  // por uno al azar (igual se puede ver y cambiar en la ventana).
  if (String(server.loadConfig().pin) === '1234') {
    server.setPin(String(crypto.randomInt(0, 1000000)).padStart(6, '0'));
  }

  server.on('status', () => pushState());
  server.on('pairing', () => pushState());
  server.on('log', (line) => process.stdout.write(line.endsWith('\n') ? line : `${line}\n`));

  refreshAddresses();
  registerIpc();
  createTray();
  createWindow();
  await startServer();

  // Si cambia la red (otro WiFi, se reconecta el cable) se actualiza la IP y el QR.
  setInterval(() => { if (refreshAddresses()) pushState(); }, 5000);
});

// Con la ventana cerrada la app sigue viva en la bandeja.
app.on('window-all-closed', () => {});

app.on('before-quit', (e) => {
  quitting = true;
  if (server && server.status().running) {
    e.preventDefault();
    server.stop().finally(() => app.quit());
  }
});

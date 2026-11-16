// Puente seguro entre la ventana y el proceso principal: la ventana no tiene
// acceso a Node, solo a estas funciones.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mf', {
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
  start: () => ipcRenderer.invoke('server:start'),
  stop: () => ipcRenderer.invoke('server:stop'),
  setPin: (pin) => ipcRenderer.invoke('pin:set', pin),
  setPort: (port) => ipcRenderer.invoke('port:set', port),
  setClipboard: (enabled) => ipcRenderer.invoke('clipboard:set', enabled),
  setAutostart: (enabled) => ipcRenderer.invoke('autostart:set', enabled),
  setAddress: (address) => ipcRenderer.invoke('address:set', address),
  revokeDevice: (id) => ipcRenderer.invoke('device:revoke', id),
  revokeAllDevices: () => ipcRenderer.invoke('devices:revoke-all'),
  copy: (text) => ipcRenderer.invoke('copy', text),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
});

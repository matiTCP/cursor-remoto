const $ = (id) => document.getElementById(id);

const el = {
  dot: $('statusDot'),
  statusText: $('statusText'),
  toggle: $('toggleServer'),
  banner: $('errorBanner'),
  qrWrap: $('qrWrap'),
  qrImg: $('qrImg'),
  urlText: $('urlText'),
  copyUrl: $('copyUrl'),
  addressField: $('addressField'),
  addressSelect: $('addressSelect'),
  pinForm: $('pinForm'),
  pinInput: $('pinInput'),
  pinReveal: $('pinReveal'),
  pinMsg: $('pinMsg'),
  autostart: $('autostart'),
  clipboard: $('clipboard'),
  portForm: $('portForm'),
  portInput: $('portInput'),
  portMsg: $('portMsg'),
  version: $('version'),
  qrExpiry: $('qrExpiry'),
  deviceList: $('deviceList'),
  devicesEmpty: $('devicesEmpty'),
  revokeAll: $('revokeAll'),
};

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} día${d > 1 ? 's' : ''}`;
}

function renderDevices(devices) {
  el.devicesEmpty.hidden = devices.length > 0;
  el.revokeAll.hidden = devices.length < 2;
  el.deviceList.replaceChildren(...devices.map((d) => {
    const li = document.createElement('li');

    const dot = document.createElement('span');
    dot.className = `dev-dot${d.online ? ' on' : ''}`;

    const info = document.createElement('div');
    info.className = 'dev-info';
    const name = document.createElement('div');
    name.className = 'dev-name';
    name.textContent = d.name;
    const meta = document.createElement('div');
    meta.className = 'dev-meta';
    meta.textContent = d.online ? 'Conectado ahora' : `Última vez ${timeAgo(d.lastSeen)}`;
    info.append(name, meta);

    const forget = document.createElement('button');
    forget.type = 'button';
    forget.className = 'btn ghost small';
    forget.textContent = 'Olvidar';
    forget.setAttribute('aria-label', `Olvidar ${d.name}`);
    forget.addEventListener('click', () => {
      if (confirm(`¿Olvidar ${d.name}? Para volver a usarlo tendrá que escanear el QR o ingresar el PIN.`)) {
        window.mf.revokeDevice(d.id);
      }
    });

    li.append(dot, info, forget);
    return li;
  }));
}

// Texto "el código se renueva en X min"; el QR nuevo llega solo desde el proceso principal.
function updateExpiry() {
  if (!state || !state.pairingExpiresAt) { el.qrExpiry.textContent = ''; return; }
  const min = Math.max(1, Math.ceil((state.pairingExpiresAt - Date.now()) / 60000));
  el.qrExpiry.textContent = `Por seguridad el código se renueva solo (en ${min} min).`;
}
setInterval(updateExpiry, 1000);

let state = null;
let pinDirty = false;
let portDirty = false;

function setMsg(node, text, kind) {
  node.textContent = text || '';
  node.className = `msg${kind ? ` ${kind}` : ''}`;
}

function render(s) {
  state = s;

  el.dot.classList.toggle('on', s.running);
  if (s.running) {
    el.statusText.textContent = s.clients
      ? `Activo · ${s.clients} celular${s.clients > 1 ? 'es' : ''} conectado${s.clients > 1 ? 's' : ''}`
      : 'Activo · esperando conexión';
  } else {
    el.statusText.textContent = 'Detenido';
  }
  el.toggle.textContent = s.running ? 'Detener' : 'Iniciar';
  el.toggle.classList.toggle('ghost', s.running);

  el.banner.hidden = !s.error;
  el.banner.textContent = s.error || '';

  el.qrWrap.classList.toggle('off', !s.qr);
  if (s.qr) el.qrImg.src = s.qr;
  if (!s.url) {
    el.urlText.textContent = 'Sin conexión de red';
  } else {
    el.urlText.textContent = s.url.replace(/\/$/, '');
  }
  el.copyUrl.disabled = !s.url;

  el.addressField.hidden = s.addresses.length < 2;
  const opts = s.addresses.map((a) => `${a.address}|${a.iface}`).join();
  if (el.addressSelect.dataset.opts !== opts) {
    el.addressSelect.dataset.opts = opts;
    el.addressSelect.replaceChildren(...s.addresses.map((a) => {
      const o = document.createElement('option');
      o.value = a.address;
      o.textContent = `${a.address} — ${a.iface}`;
      return o;
    }));
  }
  if (s.address) el.addressSelect.value = s.address;

  if (!pinDirty) el.pinInput.value = s.pin;
  if (!portDirty) el.portInput.value = s.port;
  el.autostart.checked = s.autostart;
  el.clipboard.checked = s.clipboardHistory;
  el.version.textContent = `v${s.version}`;
  renderDevices(s.devices || []);
  updateExpiry();
}

el.revokeAll.addEventListener('click', () => {
  if (confirm('¿Olvidar todos los dispositivos? Cada uno tendrá que volver a escanear el QR o ingresar el PIN.')) {
    window.mf.revokeAllDevices();
  }
});

el.toggle.addEventListener('click', async () => {
  el.toggle.disabled = true;
  try {
    if (state && state.running) await window.mf.stop();
    else await window.mf.start();
  } finally {
    el.toggle.disabled = false;
  }
});

el.copyUrl.addEventListener('click', async () => {
  if (!state || !state.url) return;
  await window.mf.copy(state.url);
  el.copyUrl.textContent = 'Copiado';
  setTimeout(() => { el.copyUrl.textContent = 'Copiar'; }, 1400);
});

el.addressSelect.addEventListener('change', () => window.mf.setAddress(el.addressSelect.value));

el.pinInput.addEventListener('input', () => {
  el.pinInput.value = el.pinInput.value.replace(/\D/g, '');
  pinDirty = true;
  setMsg(el.pinMsg, '');
});

el.pinReveal.addEventListener('click', () => {
  const show = el.pinInput.type === 'password';
  el.pinInput.type = show ? 'text' : 'password';
  el.pinReveal.textContent = show ? 'Ocultar' : 'Ver';
  el.pinReveal.setAttribute('aria-label', show ? 'Ocultar PIN' : 'Mostrar PIN');
});

el.pinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state && el.pinInput.value === state.pin) {
    setMsg(el.pinMsg, 'Ese ya es el PIN actual.');
    return;
  }
  const res = await window.mf.setPin(el.pinInput.value);
  if (res.ok) {
    pinDirty = false;
    setMsg(el.pinMsg, 'PIN guardado.', 'ok');
  } else {
    setMsg(el.pinMsg, res.error, 'err');
  }
});

el.portInput.addEventListener('input', () => { portDirty = true; setMsg(el.portMsg, ''); });

el.portForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state && Number(el.portInput.value) === state.port) {
    setMsg(el.portMsg, 'Ese ya es el puerto actual.');
    return;
  }
  setMsg(el.portMsg, 'Reiniciando el servidor…');
  const res = await window.mf.setPort(el.portInput.value);
  if (res.ok) {
    portDirty = false;
    setMsg(el.portMsg, 'Puerto aplicado. Escanea el QR de nuevo en el celular.', 'ok');
  } else {
    setMsg(el.portMsg, res.error, 'err');
  }
});

el.autostart.addEventListener('change', () => window.mf.setAutostart(el.autostart.checked));
el.clipboard.addEventListener('change', () => window.mf.setClipboard(el.clipboard.checked));

window.mf.onState(render);
window.mf.getState().then(render);

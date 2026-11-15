(() => {
  const ICONS = {
    play: '<path d="M7 4l13 8-13 8V4z" fill="currentColor"/>',
    volume_up: '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.2a5 5 0 0 1 0 7.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19.3 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    volume_down: '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.2a5 5 0 0 1 0 7.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M15.5 9l5.5 6M21 9l-5.5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    esc: '<path d="M10 4H4v16h6M15 8l5 4-5 4M9 12h11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    fullscreen: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    middle_click: '<rect x="7" y="2" width="10" height="20" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="6" x2="12" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    back: '<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    forward: '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    switch: '<rect x="3" y="3" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="9" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>',
    windows: '<rect x="3" y="3" width="8" height="8" fill="currentColor"/><rect x="13" y="3" width="8" height="8" fill="currentColor"/><rect x="3" y="13" width="8" height="8" fill="currentColor"/><rect x="13" y="13" width="8" height="8" fill="currentColor"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    paste: '<rect x="6" y="4" width="12" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="2" width="6" height="4" rx="1" fill="currentColor"/>',
    refresh: '<path d="M20 11A8 8 0 1 0 18.5 16.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 5v6h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  };

  function iconSvg(key) {
    const inner = ICONS[key];
    if (!inner) return '';
    return `<svg viewBox="0 0 24 24">${inner}</svg>`;
  }

  const statusBar = document.getElementById('statusBar');
  const statusText = document.getElementById('statusText');
  const trackpad = document.getElementById('trackpad');
  const keyboardFab = document.getElementById('keyboardFab');
  const keyboardPanel = document.getElementById('keyboardPanel');
  const closeKeyboard = document.getElementById('closeKeyboard');
  const backspaceBtn = document.getElementById('backspaceBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const hiddenInput = document.getElementById('hiddenInput');
  const pinOverlay = document.getElementById('pinOverlay');
  const pinInput = document.getElementById('pinInput');
  const pinSubmit = document.getElementById('pinSubmit');
  const pinError = document.getElementById('pinError');

  const mouseButtons = document.getElementById('mouseButtons');
  const multimediaButtons = document.getElementById('multimediaButtons');
  const navChips = document.getElementById('navChips');
  const atajosButtons = document.getElementById('atajosButtons');
  const volumeSlider = document.getElementById('volumeSlider');
  const brightnessSlider = document.getElementById('brightnessSlider');
  const openCursorSettings = document.getElementById('openCursorSettings');

  const shutdownStatus = document.getElementById('shutdownStatus');
  const presetChips = document.getElementById('presetChips');
  const customMinutes = document.getElementById('customMinutes');
  const scheduleCustom = document.getElementById('scheduleCustom');
  const customTime = document.getElementById('customTime');
  const scheduleAtTime = document.getElementById('scheduleAtTime');
  const cancelShutdownBtn = document.getElementById('cancelShutdown');

  const confirmModal = document.getElementById('confirmModal');
  const confirmKicker = document.getElementById('confirmKicker');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmText = document.getElementById('confirmText');
  const confirmCancel = document.getElementById('confirmCancel');
  const confirmOk = document.getElementById('confirmOk');

  const clipNew = document.getElementById('clipNew');
  const clipSave = document.getElementById('clipSave');
  const clipList = document.getElementById('clipList');
  const clipEmpty = document.getElementById('clipEmpty');
  const clipClear = document.getElementById('clipClear');

  const sfxToggle = document.getElementById('sfxToggle');
  const sfxVolume = document.getElementById('sfxVolume');
  const sfx = (name) => window.SFX && window.SFX.play(name);

  let ws = null;
  let authed = false;
  let sensitivity = 1.4;
  let pendingPin = null;
  let shutdownScheduledAt = null;
  let countdownTimer = null;

  // --- Mantener la pantalla despierta mientras se usa la app ---
  let wakeLock = null;
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      // Puede fallar si la batería está muy baja o el navegador lo bloquea; no pasa nada.
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
  requestWakeLock();

  // --- Mantener presionado para repetir (flechas, volumen) ---
  function bindRepeatable(el, fn) {
    let timeout = null;
    let interval = null;
    function stop() {
      clearTimeout(timeout);
      clearInterval(interval);
      timeout = null;
      interval = null;
    }
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
      timeout = setTimeout(() => {
        interval = setInterval(fn, 110);
      }, 400);
    });
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('pointerleave', stop);
  }

  // --- Navegación por pestañas ---
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.panel[data-panel="${btn.dataset.tab}"]`).classList.add('active');
      document.body.dataset.tab = btn.dataset.tab;
      sfx('cursor');
    });
  });

  // Estado de conexión al estilo Resident Evil: fine / caution / danger.
  function setStatus(state, text) {
    statusBar.classList.remove('fine', 'caution', 'danger');
    statusBar.classList.add(state);
    statusText.textContent = text;
  }

  function getStoredPin() {
    try { return localStorage.getItem('mf_pin'); } catch { return null; }
  }
  function storePin(pin) {
    try { localStorage.setItem('mf_pin', pin); } catch {}
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.addEventListener('open', () => {
      setStatus('caution', 'Caution · Verificando…');
      const pin = pendingPin || getStoredPin();
      if (pin) {
        ws.send(JSON.stringify({ type: 'auth', pin }));
      } else {
        setStatus('caution', 'Caution · Identifícate');
        showPinOverlay();
      }
    });

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === 'auth') {
        if (msg.ok) {
          authed = true;
          if (pendingPin) {
            storePin(pendingPin);
            sfx('select');
          }
          pinOverlay.style.display = 'none';
          setStatus('fine', 'Fine · Enlace establecido');
        } else {
          authed = false;
          pendingPin = null;
          try { localStorage.removeItem('mf_pin'); } catch {}
          pinError.textContent = 'Código incorrecto. Acceso denegado.';
          sfx('error');
          showPinOverlay();
          setStatus('danger', 'Danger · Acceso denegado');
        }
      } else if (msg.type === 'shutdown') {
        shutdownScheduledAt = msg.scheduledAt;
        updateShutdownUI(msg.error);
      } else if (msg.type === 'clipboard') {
        renderClipItems(msg.items || []);
      }
    });

    ws.addEventListener('close', () => {
      authed = false;
      setStatus('danger', 'Danger · Sin señal');
      setTimeout(connect, 1500);
    });

    ws.addEventListener('error', () => ws.close());
  }

  function send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN && authed) {
      ws.send(JSON.stringify(payload));
    }
  }

  function showPinOverlay() {
    pinOverlay.style.display = 'flex';
    pinInput.value = '';
    setTimeout(() => pinInput.focus(), 100);
  }

  pinSubmit.addEventListener('click', () => {
    const pin = pinInput.value.trim();
    if (!pin) return;
    pendingPin = pin;
    pinError.textContent = '';
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'auth', pin }));
    } else {
      connect();
    }
  });
  pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') pinSubmit.click();
  });

  // --- Config (botones + sensibilidad) ---
  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      sensitivity = cfg.sensitivity || 1.4;
      renderButtons(cfg.buttons || []);
    })
    .catch(() => {});

  function makeButton(b) {
    const el = document.createElement('button');
    el.className = 'btn';
    el.innerHTML = `${iconSvg(b.icon)}<span class="label">${b.label || ''}</span>`;
    if (b.repeat) {
      bindRepeatable(el, () => { sfx('cursor'); send(b.action); });
    } else {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sfx('select');
        send(b.action);
      });
    }
    return el;
  }

  function makeChip(b) {
    const el = document.createElement('button');
    el.className = 'btn';
    el.innerHTML = `${iconSvg(b.icon)}<span class="label">${b.label || ''}</span>`;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sfx('select');
      send(b.action);
    });
    return el;
  }

  function renderButtons(buttons) {
    for (const b of buttons) {
      if (b.category === 'mouse') mouseButtons.appendChild(makeButton(b));
      else if (b.category === 'multimedia') multimediaButtons.appendChild(makeButton(b));
      else if (b.category === 'navegacion') navChips.appendChild(makeChip(b));
      else if (b.category === 'atajos') atajosButtons.appendChild(makeButton(b));
    }
  }

  // --- D-Pad de navegación (con repetición al mantener presionado) ---
  document.querySelectorAll('.dpad-btn').forEach((btn) => {
    const fire = () => send({ type: 'key', code: btn.dataset.code });
    if (btn.dataset.area === 'center') {
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); sfx('select'); fire(); });
    } else {
      bindRepeatable(btn, () => { sfx('cursor'); fire(); });
    }
  });

  // Tick de cursor al arrastrar un slider, sin que se amontonen los sonidos.
  let lastSliderTick = 0;
  function sliderTick() {
    const now = Date.now();
    if (now - lastSliderTick < 70) return;
    lastSliderTick = now;
    sfx('cursor');
  }

  // --- Slider de volumen (aproximado: simula pulsaciones de Vol +/-) ---
  let lastVolumeValue = Number(localStorage.getItem('mf_volume')) || 50;
  volumeSlider.value = lastVolumeValue;
  volumeSlider.addEventListener('input', () => {
    const newVal = Number(volumeSlider.value);
    const steps = Math.trunc((newVal - lastVolumeValue) / 2);
    if (steps !== 0) {
      const code = steps > 0 ? 'VOLUME_UP' : 'VOLUME_DOWN';
      for (let i = 0; i < Math.abs(steps); i++) send({ type: 'key', code });
      lastVolumeValue += steps * 2;
      sliderTick();
      try { localStorage.setItem('mf_volume', lastVolumeValue); } catch {}
    }
  });

  // --- Slider de brillo (DDC/CI) ---
  let brightnessDebounce = null;
  brightnessSlider.addEventListener('input', () => {
    const percent = Number(brightnessSlider.value);
    sliderTick();
    clearTimeout(brightnessDebounce);
    brightnessDebounce = setTimeout(() => {
      send({ type: 'brightness', percent });
    }, 80);
  });

  // --- Abrir ajustes de cursor de Windows ---
  openCursorSettings.addEventListener('click', () => {
    sfx('select');
    send({ type: 'open', target: 'cursor_settings' });
  });

  // --- Baúl de copiados (historial del portapapeles del PC) ---
  const CLIP_ICONS = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  function clipTime(ts) {
    const d = new Date(ts);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (d.toDateString() === new Date().toDateString()) return hhmm;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hhmm}`;
  }

  function renderClipItems(items) {
    // Fijados arriba; dentro de cada grupo, lo más nuevo primero (el servidor ya los manda así).
    const sorted = [...items.filter((i) => i.pinned), ...items.filter((i) => !i.pinned)];
    const openIds = new Set([...clipList.querySelectorAll('.clip-item.open')].map((li) => li.dataset.id));

    clipList.replaceChildren(...sorted.map((item) => {
      const li = document.createElement('li');
      li.className = 'clip-item' + (item.pinned ? ' pinned' : '') + (openIds.has(item.id) ? ' open' : '');
      li.dataset.id = item.id;

      const text = document.createElement('p');
      text.className = 'clip-text';
      text.textContent = item.text; // textContent: nunca se interpreta como HTML

      const row = document.createElement('div');
      row.className = 'clip-row';
      const meta = document.createElement('span');
      meta.className = 'clip-meta';
      meta.textContent = `${item.pinned ? 'Fijado · ' : ''}${item.source === 'phone' ? 'Celu' : 'PC'} · ${clipTime(item.at)}`;

      const pin = document.createElement('button');
      pin.className = 'clip-icon-btn pin';
      pin.dataset.action = 'pin';
      pin.setAttribute('aria-label', item.pinned ? 'Desfijar' : 'Fijar');
      pin.innerHTML = CLIP_ICONS.pin;

      const del = document.createElement('button');
      del.className = 'clip-icon-btn';
      del.dataset.action = 'delete';
      del.setAttribute('aria-label', 'Borrar');
      del.innerHTML = CLIP_ICONS.del;

      const paste = document.createElement('button');
      paste.className = 'btn-accent';
      paste.dataset.action = 'paste';
      paste.textContent = 'Pegar';

      row.append(meta, pin, del, paste);
      li.append(text, row);
      return li;
    }));

    clipEmpty.hidden = sorted.length > 0;
    clipClear.hidden = !items.some((i) => !i.pinned);
  }

  // Se usa "click" (no pointerdown) para que deslizar la lista no pegue nada sin querer.
  clipList.addEventListener('click', (e) => {
    const li = e.target.closest('.clip-item');
    if (!li) return;
    const btn = e.target.closest('button[data-action]');
    if (!btn) {
      // Tocar el texto lo expande o lo achica
      li.classList.toggle('open');
      sfx('cursor');
      return;
    }
    const action = btn.dataset.action;
    sfx(action === 'paste' ? 'select' : action === 'delete' ? 'cancel' : 'cursor');
    send({ type: 'clip', action, id: li.dataset.id });
  });

  clipSave.addEventListener('click', () => {
    const text = clipNew.value;
    if (!text.trim()) { sfx('error'); return; }
    sfx('select');
    send({ type: 'clip', action: 'add', text });
    clipNew.value = '';
    clipNew.blur();
  });

  clipClear.addEventListener('click', () => {
    setConfirmText('Me llevo ', 'todo lo que no esté fijado', '. Lo fijado se queda contigo.');
    openConfirm('¿Vaciar el baúl, extranjero?', () => send({ type: 'clip', action: 'clear' }), 'El Buhonero');
  });

  // --- Sonidos de menú ---
  function renderSfxToggle() {
    const on = window.SFX ? window.SFX.isEnabled() : false;
    sfxToggle.setAttribute('aria-pressed', String(on));
    sfxToggle.textContent = on ? 'Activados' : 'Desactivados';
    sfxVolume.disabled = !on;
  }
  if (window.SFX) sfxVolume.value = Math.round(window.SFX.getVolume() * 100);
  renderSfxToggle();

  sfxToggle.addEventListener('click', () => {
    if (!window.SFX) return;
    window.SFX.setEnabled(!window.SFX.isEnabled());
    renderSfxToggle();
    sfx('select'); // solo suena al activarlos
  });

  sfxVolume.addEventListener('input', () => {
    if (!window.SFX) return;
    window.SFX.setVolume(Number(sfxVolume.value) / 100);
    sliderTick();
  });

  // --- Trackpad (pointer events: 1 dedo mover/clic, 2 dedos clic der/scroll) ---
  const pointers = new Map();
  let lastAvg = null;
  let gestureMoved = false;
  // Una vez que se apoyan dos dedos, el gesto queda en modo scroll hasta soltar todo,
  // así el cursor no salta si levantás un dedo antes que el otro.
  let scrollGesture = false;
  // El scroll se manda en "clics" de rueda completos (120 = un clic de una rueda real),
  // que es lo que entienden bien todos los programas. Cada tantos px de dedo = un clic.
  const WHEEL_NOTCH = 120;
  const PX_PER_NOTCH = 22;
  let scrollAccum = 0;

  function avgPoint(pts) {
    const arr = Array.from(pts.values());
    const x = arr.reduce((s, p) => s + p.x, 0) / arr.length;
    const y = arr.reduce((s, p) => s + p.y, 0) / arr.length;
    return { x, y };
  }

  trackpad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    trackpad.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, t: Date.now() });
    lastAvg = avgPoint(pointers);
    if (pointers.size === 1) {
      gestureMoved = false;
      scrollGesture = false;
      scrollAccum = 0;
    } else if (pointers.size === 2) {
      scrollGesture = true;
    }
  });

  trackpad.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    e.preventDefault();
    const p = pointers.get(e.pointerId);
    p.x = e.clientX; p.y = e.clientY;

    const count = pointers.size;
    const avg = avgPoint(pointers);
    const dx = avg.x - lastAvg.x;
    const dy = avg.y - lastAvg.y;

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) gestureMoved = true;

    if (scrollGesture) {
      // Dedos hacia arriba = la página sube (baja el scroll), igual que en el iPhone.
      if (count >= 2) {
        scrollAccum += dy;
        const notches = Math.trunc(scrollAccum / PX_PER_NOTCH);
        if (notches !== 0) {
          send({ type: 'scroll', dy: notches * WHEEL_NOTCH });
          scrollAccum -= notches * PX_PER_NOTCH;
        }
      }
    } else if (count === 1) {
      send({ type: 'move', dx: dx * sensitivity, dy: dy * sensitivity });
    }
    lastAvg = avg;
  });

  function endPointer(e) {
    const p = pointers.get(e.pointerId);
    const countBefore = pointers.size;
    pointers.delete(e.pointerId);

    if (p && !gestureMoved) {
      const dt = Date.now() - p.t;
      if (dt < 300) {
        if (countBefore === 1 && !scrollGesture) {
          send({ type: 'click', button: 'left' });
        } else if (countBefore === 2) {
          send({ type: 'click', button: 'right' });
        }
      }
    }

    if (pointers.size === 0) {
      gestureMoved = false;
      scrollGesture = false;
      scrollAccum = 0;
      lastAvg = null;
    } else {
      lastAvg = avgPoint(pointers);
    }
  }

  trackpad.addEventListener('pointerup', endPointer);
  trackpad.addEventListener('pointercancel', endPointer);

  // --- Teclado nativo del telefono (panel visible, mas confiable en iOS que un input oculto) ---
  // El campo se mantiene relleno con caracteres invisibles (espacio de ancho cero).
  // Sin ese relleno, apretar "borrar" con el campo vacio no cambia nada en el celular,
  // el navegador no dispara ningun evento, y la PC nunca se entera de que queres borrar
  // texto que YA estaba escrito alla. Con el relleno, cada "borrar" consume un caracter
  // invisible y podemos reenviarlo a la PC, aunque vos no hayas escrito nada en esta tanda.
  const PAD_CHAR = '​';
  const PAD_SIZE = 40;
  const PAD_MIN = 12;
  const MAX_BACKSPACES_POR_EVENTO = 40;
  let lastTypedValue = '';

  // Rellena el campo (sin disparar eventos: los cambios por codigo no cuentan como "input")
  // y deja el cursor al final.
  function ensureKeyboardBuffer() {
    if (hiddenInput.value.length >= PAD_MIN) return;
    const next = PAD_CHAR.repeat(PAD_SIZE) + hiddenInput.value;
    hiddenInput.value = next;
    lastTypedValue = next; // se sincroniza a la vez, asi el relleno nunca se envia a la PC
    try { hiddenInput.setSelectionRange(next.length, next.length); } catch {}
  }

  keyboardFab.addEventListener('click', () => {
    sfx('open');
    keyboardPanel.hidden = false;
    hiddenInput.value = '';
    lastTypedValue = '';
    hiddenInput.focus();
    ensureKeyboardBuffer();
  });

  closeKeyboard.addEventListener('click', () => {
    sfx('cancel');
    hiddenInput.blur();
    keyboardPanel.hidden = true;
    hiddenInput.value = '';
    lastTypedValue = '';
  });

  // Botones explicitos de borrado: respaldo 100% confiable que no depende de
  // como el teclado del iPhone reporte la tecla de borrar.
  // Usamos pointerdown + preventDefault para no robarle el foco al campo
  // (si se lo sacamos, el iPhone cierra el teclado).
  bindRepeatable(backspaceBtn, () => { sfx('cursor'); send({ type: 'key', code: 'BACKSPACE' }); });

  clearAllBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sfx('cancel');
    send({ type: 'key', code: 'CTRL+A' });
    send({ type: 'key', code: 'BACKSPACE' });
  });

  hiddenInput.addEventListener('input', () => {
    let value = hiddenInput.value;

    // Enter inserta un salto de linea real en el textarea: lo mandamos como
    // tecla ENTER y lo sacamos del valor para que no quede "pegado".
    if (value.includes('\n')) {
      send({ type: 'key', code: 'ENTER' });
      value = value.replace(/\n/g, '');
      hiddenInput.value = value;
    }

    if (value.length > lastTypedValue.length && value.startsWith(lastTypedValue)) {
      const added = value.slice(lastTypedValue.length).split(PAD_CHAR).join('');
      if (added) send({ type: 'type', text: added });
    } else if (value.length < lastTypedValue.length) {
      const removed = Math.min(lastTypedValue.length - value.length, MAX_BACKSPACES_POR_EVENTO);
      for (let i = 0; i < removed; i++) send({ type: 'key', code: 'BACKSPACE' });
    } else if (value !== lastTypedValue) {
      // Caso raro (autocorrección reemplazó una palabra entera, etc.): no intentamos adivinar.
    }

    lastTypedValue = value;
    ensureKeyboardBuffer();
  });

  // --- Apagado automático ---
  function updateShutdownUI(errorMessage) {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    if (errorMessage) {
      shutdownStatus.textContent = errorMessage;
      shutdownStatus.classList.add('active');
      cancelShutdownBtn.hidden = true;
      setTimeout(() => updateShutdownUI(), 4000);
      return;
    }

    if (!shutdownScheduledAt) {
      shutdownStatus.textContent = 'Secuencia inactiva';
      shutdownStatus.classList.remove('active');
      cancelShutdownBtn.hidden = true;
      return;
    }

    cancelShutdownBtn.hidden = false;
    shutdownStatus.classList.add('active');

    const tick = () => {
      const remainingMs = shutdownScheduledAt - Date.now();
      if (remainingMs <= 0) {
        shutdownStatus.textContent = 'Evacúe de inmediato';
        clearInterval(countdownTimer);
        countdownTimer = null;
        return;
      }
      const totalSec = Math.round(remainingMs / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const parts = [h, m, s].map((n) => String(n).padStart(2, '0'));
      shutdownStatus.textContent = `Apagado en ${parts.join(':')}`;
    };

    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // Ventana emergente de confirmación: se usa tanto para programar como para
  // cancelar el apagado, así ninguna de las dos cosas pasa por un toque accidental.
  let pendingConfirmAction = null;

  function describeDelay(seconds) {
    const min = Math.round(seconds / 60);
    if (min < 60) return `en ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
    const h = Math.floor(min / 60);
    const rest = min % 60;
    if (rest) return `en ${h} h ${rest} min`;
    return `en ${h} ${h === 1 ? 'hora' : 'horas'}`;
  }

  // Arma el texto con el dato resaltado sin usar innerHTML.
  function setConfirmText(before, highlight, after) {
    const strong = document.createElement('strong');
    strong.textContent = highlight;
    confirmText.replaceChildren(document.createTextNode(before), strong, document.createTextNode(after));
  }

  function openConfirm(title, action, kicker = 'Sistema de autodestrucción') {
    confirmKicker.textContent = kicker;
    confirmTitle.textContent = title;
    pendingConfirmAction = action;
    confirmModal.hidden = false;
    sfx('open');
  }

  function closeConfirm() {
    confirmModal.hidden = true;
    pendingConfirmAction = null;
  }

  function dismissConfirm() {
    sfx('cancel');
    closeConfirm();
  }

  function askShutdownConfirm(seconds, detail) {
    if (!seconds || seconds <= 0) return;
    setConfirmText('El equipo se apagará ', detail || describeDelay(seconds), '. Todo el personal debe evacuar.');
    openConfirm('¿Activar la autodestrucción?', () => {
      send({ type: 'shutdown', action: 'schedule', seconds });
    });
  }

  function askCancelConfirm() {
    if (shutdownScheduledAt) {
      const at = new Date(shutdownScheduledAt);
      const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
      setConfirmText('Se cancelará el apagado de las ', hhmm, '. El equipo seguirá encendido.');
    } else {
      setConfirmText('Se cancelará el apagado. ', 'El equipo seguirá encendido', '.');
    }
    openConfirm('¿Abortar la secuencia?', () => {
      send({ type: 'shutdown', action: 'cancel' });
    });
  }

  confirmCancel.addEventListener('click', dismissConfirm);

  confirmOk.addEventListener('click', () => {
    const action = pendingConfirmAction;
    sfx('select');
    closeConfirm();
    if (action) action();
  });

  confirmModal.querySelector('.modal-backdrop').addEventListener('click', dismissConfirm);

  presetChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    askShutdownConfirm(Number(chip.dataset.min) * 60);
  });

  scheduleCustom.addEventListener('click', () => {
    askShutdownConfirm(Number(customMinutes.value) * 60);
  });

  scheduleAtTime.addEventListener('click', () => {
    if (!customTime.value) { sfx('error'); return; }
    const [h, m] = customTime.value.split(':').map(Number);
    const target = new Date();
    target.setSeconds(0, 0);
    target.setHours(h, m);
    if (target.getTime() <= Date.now()) {
      target.setDate(target.getDate() + 1); // si ya paso esa hora hoy, programa para mañana
    }
    const seconds = Math.round((target.getTime() - Date.now()) / 1000);
    askShutdownConfirm(seconds, `a las ${customTime.value} (${describeDelay(seconds)})`);
  });

  cancelShutdownBtn.addEventListener('click', askCancelConfirm);

  connect();
})();

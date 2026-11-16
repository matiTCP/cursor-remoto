// Efectos de sonido de menú, sintetizados con Web Audio (sin archivos de audio).
// Si pones tus propios archivos en public/sfx/ y los anotas en public/sfx/index.json
// (claves: cursor, select, cancel, open, error), se usan esos en vez de los sintetizados.
window.SFX = (() => {
  const NAMES = ['cursor', 'select', 'cancel', 'open', 'error'];
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  const custom = {};

  let enabled = true;
  let volume = 0.7;
  try {
    enabled = localStorage.getItem('mf_sfx') !== 'off';
    const v = Number(localStorage.getItem('mf_sfx_volume'));
    if (localStorage.getItem('mf_sfx_volume') !== null && !Number.isNaN(v)) volume = v;
  } catch {}

  // Con 'ambient' el sonido se mezcla con la música que tengas en el celu en vez de cortarla
  // (y respeta el switch de silencio del iPhone).
  try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch {}

  // iOS solo deja crear/reanudar el audio dentro de un toque del usuario.
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      loadCustom();
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }
  ['pointerdown', 'touchend', 'click'].forEach((ev) =>
    document.addEventListener(ev, unlock, { capture: true, passive: true }));

  // sfx/index.json lista los archivos propios, ej: { "cursor": "cursor.mp3" }
  function loadCustom() {
    fetch('sfx/index.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((files) => {
        for (const name of NAMES) {
          if (!files[name]) continue;
          fetch(`sfx/${files[name]}`)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
            .then((buf) => ctx.decodeAudioData(buf))
            .then((audio) => { custom[name] = audio; })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }

  // Un "pip" con envolvente corta y caída de tono, filtrado para que suene a parlante chico.
  function tone({ type = 'square', f0, f1 = f0, at = 0, dur, gain, cutoff = 4200 }) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp).connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Ruido pasado por un filtro de banda: clicks y el "deslizar" mecánico.
  function noise({ at = 0, dur, gain, f0, f1 = f0, q = 1.5 }) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = noiseBuffer;
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  const SOUNDS = {
    // Mover el cursor por un menú: un "pip" corto y agudo
    cursor() {
      noise({ dur: 0.012, gain: 0.25, f0: 5200 });
      tone({ f0: 1760, f1: 1480, dur: 0.05, gain: 0.16 });
    },
    // Elegir / usar un objeto: click + dos pips subiendo
    select() {
      noise({ dur: 0.02, gain: 0.35, f0: 2800 });
      tone({ f0: 1175, dur: 0.055, gain: 0.15 });
      tone({ f0: 1568, at: 0.05, dur: 0.09, gain: 0.15 });
    },
    // Volver / cancelar: dos pips bajando, más apagados
    cancel() {
      tone({ type: 'triangle', f0: 988, dur: 0.06, gain: 0.3, cutoff: 3000 });
      tone({ type: 'triangle', f0: 659, f1: 600, at: 0.055, dur: 0.1, gain: 0.3, cutoff: 3000 });
    },
    // Abrir una ventana: golpe sordo + deslizamiento + click final
    open() {
      tone({ type: 'sine', f0: 150, f1: 55, dur: 0.14, gain: 0.5, cutoff: 800 });
      noise({ dur: 0.17, gain: 0.22, f0: 350, f1: 2600, q: 2.2 });
      noise({ at: 0.16, dur: 0.015, gain: 0.3, f0: 4000 });
      tone({ f0: 2090, f1: 1900, at: 0.16, dur: 0.04, gain: 0.1 });
    },
    // "No se puede": zumbido grave doble
    error() {
      tone({ f0: 140, dur: 0.1, gain: 0.22, cutoff: 1300 });
      tone({ f0: 140, at: 0.14, dur: 0.14, gain: 0.22, cutoff: 1300 });
    },
  };

  function play(name) {
    if (!enabled || volume <= 0) return;
    unlock();
    if (!ctx) return;
    if (custom[name]) {
      const src = ctx.createBufferSource();
      src.buffer = custom[name];
      src.connect(master);
      src.start();
      return;
    }
    if (SOUNDS[name]) SOUNDS[name]();
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem('mf_sfx', on ? 'on' : 'off'); } catch {}
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.value = v;
    try { localStorage.setItem('mf_sfx_volume', String(v)); } catch {}
  }

  return {
    play,
    setEnabled,
    setVolume,
    isEnabled: () => enabled,
    getVolume: () => volume,
  };
})();

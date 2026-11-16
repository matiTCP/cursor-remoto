// Textos que app.js muestra según el tema. Un tema en themes/<nombre>/ puede
// traer su propio theme.js con las mismas claves (ver "Temas" en el README).
window.THEME = {
  status: {
    verifying: 'Conectando…',
    askPin: 'Ingresa el PIN',
    linked: 'Conectado',
    denied: 'PIN incorrecto',
    offline: 'Sin conexión',
  },
  pinError: 'PIN incorrecto. Inténtalo de nuevo.',
  shutdown: {
    idle: 'Sin apagado programado',
    countdown: 'Apagado en',
    now: 'Apagando…',
    kicker: 'Apagado',
    scheduleTitle: '¿Programar el apagado?',
    scheduleAfter: '.',
    cancelTitle: '¿Cancelar el apagado?',
  },
  clip: {
    clearTitle: '¿Vaciar el historial?',
    clearKicker: 'Portapapeles',
    clearBefore: 'Se borrará ',
    clearHighlight: 'todo lo que no esté fijado',
    clearAfter: '. Lo fijado se mantiene.',
  },
};

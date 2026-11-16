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
  // Emparejamiento por QR y límite de intentos. {s} = segundos de espera.
  auth: {
    deviceRevoked: 'Este dispositivo fue desvinculado. Escanea el QR de la PC o ingresa el PIN.',
    pairExpired: 'El código QR venció. Escanéalo de nuevo o ingresa el PIN.',
    locked: 'Demasiados intentos. Espera {s} s.',
    wrongPinLocked: 'PIN incorrecto. Bloqueado por {s} s.',
  },
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

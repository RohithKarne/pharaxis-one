const listeners = new Set()

function emit(toast) {
  const entry = { ...toast, id: Date.now() + Math.random() }
  listeners.forEach(fn => fn(entry))
}

const toast = {
  success: (msg, duration = 3000) => emit({ type: 'success', msg, duration }),
  error:   (msg, duration = 4500) => emit({ type: 'error',   msg, duration }),
  warn:    (msg, duration = 4000) => emit({ type: 'warn',    msg, duration }),
  info:    (msg, duration = 3000) => emit({ type: 'info',    msg, duration }),
  _subscribe:   (fn) => { listeners.add(fn);    return () => listeners.delete(fn) },
}

export default toast

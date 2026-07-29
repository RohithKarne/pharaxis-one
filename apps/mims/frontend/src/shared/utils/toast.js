const listeners = new Set()

function emit(toast) {
  const entry = { ...toast, id: Date.now() + Math.random() }
  listeners.forEach(fn => fn(entry))
}

const toast = {
  success: (msg, duration = 3000, action = null) => emit({ type: 'success', msg, duration, action }),
  error:   (msg, duration = 4500, action = null) => emit({ type: 'error',   msg, duration, action }),
  warn:    (msg, duration = 4000, action = null) => emit({ type: 'warn',    msg, duration, action }),
  info:    (msg, duration = 3000, action = null) => emit({ type: 'info',    msg, duration, action }),
  _subscribe:   (fn) => { listeners.add(fn);    return () => listeners.delete(fn) },
}

export default toast

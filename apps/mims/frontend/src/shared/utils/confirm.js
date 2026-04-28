let _openFn = null

export function _registerConfirm(fn) { _openFn = fn }

export function confirm(message, title) {
  if (!_openFn) return Promise.resolve(window.confirm(message))
  return _openFn(message, title)
}

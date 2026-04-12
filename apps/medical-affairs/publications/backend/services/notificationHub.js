const { EventEmitter } = require('events')

const hub = new EventEmitter()
hub.setMaxListeners(200)

function publishToUser(userId, payload) {
  if (!userId) return
  hub.emit(`user:${userId}`, payload)
}

function subscribeToUser(userId, listener) {
  const channel = `user:${userId}`
  hub.on(channel, listener)
  return () => {
    hub.off(channel, listener)
  }
}

module.exports = {
  publishToUser,
  subscribeToUser
}

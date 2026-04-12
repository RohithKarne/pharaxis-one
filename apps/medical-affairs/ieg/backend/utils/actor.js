function actorFromAuth(auth) {
  if (!auth) {
    return { actorType: 'system', actorId: null, actorLabel: 'system' }
  }

  if (auth.type === 'external') {
    return {
      actorType: 'external',
      actorId: String(auth.userId),
      actorLabel: auth.displayName || auth.email || 'external-user'
    }
  }

  return {
    actorType: 'internal',
    actorId: String(auth.userId),
    actorLabel: auth.fullName || auth.email || 'internal-user'
  }
}

module.exports = { actorFromAuth }

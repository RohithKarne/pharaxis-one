function makeCode(prefix) {
  const rand = Math.floor(Math.random() * 900000 + 100000)
  return `${prefix}-${new Date().getFullYear()}-${rand}`
}

module.exports = {
  makeCode
}

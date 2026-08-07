const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Mirrors apps/cp-portal/backend/tests/syntax-check.js. The CI "Backend Syntax"
// job only runs `node --check` on the entrypoint, so a parse error anywhere else
// in the backend reaches main unnoticed. This walks the whole tree.
const backendRoot = path.resolve(__dirname, '..')
const skipSegments = new Set(['node_modules', 'uploads', 'storage', 'dist', 'build'])
const files = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipSegments.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full)
    }
  }
}

walk(backendRoot)

let failures = 0
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    failures += 1
    process.stderr.write(`Syntax check failed: ${path.relative(backendRoot, file)}\n`)
    process.stderr.write(result.stderr || result.stdout || '')
  }
}

if (failures > 0) {
  process.stderr.write(`MIMS backend syntax check failed for ${failures} file(s).\n`)
  process.exit(1)
}

// Fail loudly rather than pass on an empty walk. A quality gate that silently
// checks nothing reports success without doing the work - SOP 37.2.
if (files.length === 0) {
  process.stderr.write('MIMS backend syntax check found no files to check. Refusing to pass.\n')
  process.exit(1)
}

console.log(`MIMS backend syntax check passed for ${files.length} file(s).`)

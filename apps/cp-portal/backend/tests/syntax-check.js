const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

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
  process.stderr.write(`CP Portal backend syntax check failed for ${failures} file(s).\n`)
  process.exit(1)
}

// Fail loudly rather than pass on an empty walk. Rename or move a directory and
// this would otherwise print "passed for 0 file(s)" and exit 0 - a gate that
// reports success without doing the work, which is the bug it exists to catch.
// SOP 37.2. Added to the MIMS copy first in #533.
if (files.length === 0) {
  process.stderr.write('CP Portal backend syntax check found no files to check. Refusing to pass.\n')
  process.exit(1)
}

console.log(`CP Portal backend syntax check passed for ${files.length} file(s).`)

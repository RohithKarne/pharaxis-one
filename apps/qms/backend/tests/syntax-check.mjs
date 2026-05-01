import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = new Set(['node_modules', 'dist', 'build', 'storage']);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && /\.(js|mjs)$/.test(entry.name)) files.push(full);
  }
}
walk(backendRoot);
let failures = 0;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    process.stderr.write(`Syntax check failed: ${path.relative(backendRoot, file)}\n${result.stderr || result.stdout || ''}`);
  }
}
if (failures) {
  process.stderr.write(`QMS backend syntax check failed for ${failures} file(s).\n`);
  process.exit(1);
}
console.log(`QMS backend syntax check passed for ${files.length} file(s).`);

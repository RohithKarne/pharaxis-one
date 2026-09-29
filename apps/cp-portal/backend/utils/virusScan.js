'use strict';

/**
 * virusScan.js — CPPM-39: check an uploaded file against ClamAV's list of known
 * viruses. Phase 2 of CPPM-12: phase 1 refuses the *ways* a document attack works
 * (macros, PDF scripts…); this catches a *known* virus hidden in an ordinary file.
 *
 * Talks to a clamd on this machine using its INSTREAM command, so files never leave
 * our own infrastructure (side-effect attachments carry patient health data) and no
 * new library is needed.
 */

const fs  = require('fs');
const net = require('net');

const HOST       = process.env.CLAMAV_HOST || '127.0.0.1';
const PORT       = Number(process.env.CLAMAV_PORT || 3310);
const TIMEOUT_MS = Number(process.env.CLAMAV_TIMEOUT_MS || 30000);

/**
 * Resolves { status: 'clean' } | { status: 'infected', virus } | { status: 'error', error }.
 * Never throws: a scanner that is down or silent is an 'error', never a 'clean'.
 */
function scanFile(filePath) {
  return new Promise(resolve => {
    let settled = false;
    let reply = '';
    const socket = net.createConnection({ host: HOST, port: PORT });
    const done = result => { if (!settled) { settled = true; socket.destroy(); resolve(result); } };

    socket.setTimeout(TIMEOUT_MS, () => done({ status: 'error', error: 'the virus scanner did not answer in time' }));
    socket.on('error', err => done({ status: 'error', error: `virus scanner unreachable (${err.code || err.message})` }));
    socket.on('data', chunk => { reply += chunk.toString('utf8'); });
    socket.on('end', () => {
      const text = reply.replace(/\0/g, '').trim();      // "stream: OK" | "stream: <name> FOUND" | "... ERROR"
      if (/: OK$/.test(text)) return done({ status: 'clean' });
      const found = text.match(/: (.+) FOUND$/);
      if (found) return done({ status: 'infected', virus: found[1] });
      done({ status: 'error', error: text || 'no answer from the virus scanner' });
    });
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
      stream.on('data', buf => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(buf.length);
        socket.write(len);
        socket.write(buf);
      });
      stream.on('end', () => socket.write(Buffer.alloc(4)));   // a zero-length chunk ends the stream
      stream.on('error', err => done({ status: 'error', error: err.message }));
    });
  });
}

/**
 * Admin uploads: the person is right there, so anything that is not clean is refused
 * with a reason and every file in the request is deleted. Returns null when all clean.
 */
async function refuseUnlessClean(files) {
  for (const f of files) {
    const result = await scanFile(f.path);
    if (result.status === 'clean') continue;
    for (const g of files) { try { fs.unlinkSync(g.path); } catch { /* already gone */ } }
    return result.status === 'infected'
      ? { status: 400, error: `"${f.originalname}" was not accepted because it contains a known virus (${result.virus}).` }
      : { status: 503, error: `"${f.originalname}" could not be checked for viruses right now. Please try again in a minute.` };
  }
  return null;
}

/** Downloads: only a file ClamAV has cleared is served. Returns null when it may be served. */
function downloadRefusal(scanStatus) {
  if (scanStatus === 'clean') return null;
  if (scanStatus === 'infected') return { status: 410, error: 'This file was removed because it contains a known virus.' };
  if (scanStatus === 'missing')  return { status: 404, error: 'This file is no longer available.' };
  return { status: 409, error: 'This file is still being checked for viruses. Please try again shortly.' };
}

module.exports = { scanFile, refuseUnlessClean, downloadRefusal };

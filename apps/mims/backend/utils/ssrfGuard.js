'use strict';

/**
 * ssrfGuard.js — validate that an outbound URL points at a PUBLIC http(s) host.
 *
 * Used for user-supplied egress targets (webhook subscription URLs, etc.) to block
 * SSRF against cloud metadata (169.254.169.254), loopback, and internal networks.
 * Resolves the hostname and rejects if ANY resolved address is non-public, which
 * also defends against DNS-rebinding to an internal IP. (Finding H-01.)
 */

const dns = require('dns').promises;
const net = require('net');

function isPrivateIpv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true;                        // "this" network
  if (a === 10) return true;                       // private
  if (a === 127) return true;                      // loopback
  if (a === 169 && b === 254) return true;         // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true;         // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true;                        // multicast / reserved
  return false;
}

function isPrivateIpv6(ip) {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;      // loopback / unspecified
  if (v.startsWith('fe80')) return true;           // link-local
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique-local
  const m = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (m) return isPrivateIpv4(m[1]);
  return false;
}

function isBlockedIp(ip) {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (net.isIPv6(ip)) return isPrivateIpv6(ip);
  return true; // unknown format → block
}

/**
 * assertPublicHttpUrl(raw) → normalized URL string, or throws Error.
 * Rejects non-http(s) schemes, internal hostnames, and hosts that resolve
 * to any private / loopback / link-local address.
 */
async function assertPublicHttpUrl(raw) {
  let url;
  try { url = new URL(String(raw)); } catch { throw new Error('Invalid URL'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL must use http or https');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new Error('URL host is missing');
  if (/^(localhost|.*\.local|.*\.internal|metadata(\..*)?)$/i.test(host)) {
    throw new Error('URL host is not permitted');
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error('URL resolves to a non-public address');
    return url.toString();
  }
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); } catch { throw new Error('URL host could not be resolved'); }
  if (!addrs.length) throw new Error('URL host could not be resolved');
  for (const a of addrs) {
    if (isBlockedIp(a.address)) throw new Error('URL resolves to a non-public address');
  }
  return url.toString();
}

module.exports = { assertPublicHttpUrl, isBlockedIp };

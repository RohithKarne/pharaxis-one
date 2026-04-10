import { createHash } from 'crypto';

export function createSha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

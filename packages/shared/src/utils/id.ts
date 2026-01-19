import { randomBytes } from 'crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function generateId(prefix?: string, length = 21): string {
  const bytes = randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return prefix ? `${prefix}_${id}` : id;
}

export function generateApiKey(type: 'public' | 'secret'): string {
  const prefix = type === 'public' ? 'pk' : 'sk';
  const key = randomBytes(32).toString('base64url');
  return `${prefix}_${key}`;
}

export function extractApiKeyPrefix(key: string): string {
  const parts = key.split('_');
  if (parts.length >= 2) {
    return `${parts[0]}_${parts[1].substring(0, 8)}`;
  }
  return key.substring(0, 12);
}

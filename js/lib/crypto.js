// @ts-check

const encoder = new TextEncoder();
const ECDSA_KEY = { name: 'ECDSA', namedCurve: 'P-256' };
const ECDSA_SIGN = { name: 'ECDSA', hash: 'SHA-256' };

/** @param {Uint8Array | ArrayBuffer} bytes */
const toHex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/** @param {ArrayBuffer} buffer */
const bytesToBase64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));

/** @param {string} base64 */
const base64ToBytes = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

/** @param {string} text */
export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

export function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Random token that starts with a letter, so spreadsheets never read it as a number.
 * @param {number} length
 */
export function randomToken(length) {
  const characters = Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => (b % 36).toString(36));
  return 'k' + characters.join('').slice(0, length - 1);
}

/** Six-digit code, never starting with 0. */
export function randomSixDigits() {
  return String(100_000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900_000));
}

/**
 * The private key is created non-extractable: it can sign, but can never be copied out of this browser.
 * @returns {Promise<CryptoKeyPair>}
 */
export function generateDeviceKeys() {
  return crypto.subtle.generateKey(ECDSA_KEY, false, ['sign', 'verify']);
}

/** @param {CryptoKeyPair} keys */
export function exportPublicKey(keys) {
  return crypto.subtle.exportKey('jwk', keys.publicKey);
}

/** @param {CryptoKey} privateKey @param {string} text */
export async function signText(privateKey, text) {
  return bytesToBase64(await crypto.subtle.sign(ECDSA_SIGN, privateKey, encoder.encode(text)));
}

/** @param {JsonWebKey} publicKey @param {string} text @param {string} signature */
export async function verifySignature(publicKey, text, signature) {
  try {
    const key = await crypto.subtle.importKey('jwk', publicKey, ECDSA_KEY, false, ['verify']);
    return await crypto.subtle.verify(ECDSA_SIGN, key, base64ToBytes(signature), encoder.encode(text));
  } catch {
    return false;
  }
}

/**
 * Salted, repeated hash. A 4-digit PIN is still guessable offline, so the real protection is the attempt limit.
 * @param {string} pin @param {string} salt @param {number} rounds
 */
export async function hashPin(pin, salt, rounds) {
  let value = `${salt}:${pin}`;
  for (let i = 0; i < rounds; i++) value = await sha256Hex(salt + value);
  return value;
}

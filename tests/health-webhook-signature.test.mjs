import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derToP1363, protobufBytes, verifyGoogleHealthSignature } from '../supabase/functions/google-health/webhook-signature.mjs';

const b64 = value => Buffer.from(value).toString('base64');
const field = (number, value) => Buffer.concat([Buffer.from([(number << 3) | 2, value.length]), Buffer.from(value)]);
const derInteger = value => {
  let bytes = Buffer.from(value);
  while (bytes.length > 1 && bytes[0] === 0 && !(bytes[1] & 0x80)) bytes = bytes.subarray(1);
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return Buffer.concat([Buffer.from([2, bytes.length]), bytes]);
};
const toDer = raw => {
  const body = Buffer.concat([derInteger(raw.subarray(0, 32)), derInteger(raw.subarray(32))]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
};

test('extracts Google Health public-key coordinates from protobuf fields', () => {
  const x = Buffer.alloc(32, 7), y = Buffer.alloc(32, 9);
  const fields = protobufBytes(Buffer.concat([field(3, x), field(4, y)]), new Set([3, 4]));
  assert.deepEqual(Buffer.from(fields.get(3)), x);
  assert.deepEqual(Buffer.from(fields.get(4)), y);
});

test('converts DER ECDSA signatures to WebCrypto P1363 format', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, Buffer.from('run')));
  assert.deepEqual(derToP1363(toDer(raw)), raw);
});

test('accepts a valid Google Health-style prefixed signature and rejects changed data', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const x = Buffer.from(jwk.x, 'base64url'), y = Buffer.from(jwk.y, 'base64url');
  const keyId = 4242;
  const prefix = Buffer.alloc(5); prefix[0] = 1; prefix.writeUInt32BE(keyId, 1);
  const rawBody = '{"data":{"dataType":"exercise"}}';
  const rawSignature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, Buffer.from(rawBody)));
  const header = b64(Buffer.concat([prefix, toDer(rawSignature)]));
  const keyset = { key: [{ keyId, status: 'ENABLED', keyData: { value: b64(Buffer.concat([field(3, x), field(4, y)])) } }] };
  const fetchKeyset = async () => keyset;
  assert.equal(await verifyGoogleHealthSignature(rawBody, header, fetchKeyset), true);
  assert.equal(await verifyGoogleHealthSignature(rawBody + ' ', header, fetchKeyset), false);
});

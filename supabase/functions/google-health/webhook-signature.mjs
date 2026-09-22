const KEYSET_URL = 'https://www.gstatic.com/googlehealthapi/webhooks/webhooks_public_keyset.json';

const decode64 = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const encode64url = value => btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

function readVarint(bytes, position) {
  let value = 0;
  let shift = 0;
  while (position < bytes.length && shift < 35) {
    const byte = bytes[position++];
    value |= (byte & 0x7f) << shift;
    if (!(byte & 0x80)) return [value >>> 0, position];
    shift += 7;
  }
  throw new Error('invalid_protobuf');
}

export function protobufBytes(bytes, wanted) {
  const fields = new Map();
  let position = 0;
  while (position < bytes.length) {
    let tag;
    [tag, position] = readVarint(bytes, position);
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire === 0) {
      [, position] = readVarint(bytes, position);
    } else if (wire === 1) {
      position += 8;
    } else if (wire === 2) {
      let length;
      [length, position] = readVarint(bytes, position);
      if (position + length > bytes.length) throw new Error('invalid_protobuf');
      if (wanted.has(field)) fields.set(field, bytes.slice(position, position + length));
      position += length;
    } else if (wire === 5) {
      position += 4;
    } else {
      throw new Error('invalid_protobuf');
    }
    if (position > bytes.length) throw new Error('invalid_protobuf');
  }
  return fields;
}

export function derToP1363(signature, size = 32) {
  let position = 0;
  const readLength = () => {
    const first = signature[position++];
    if (first < 0x80) return first;
    const count = first & 0x7f;
    if (!count || count > 2 || position + count > signature.length) throw new Error('invalid_signature');
    let length = 0;
    for (let i = 0; i < count; i++) length = (length << 8) | signature[position++];
    return length;
  };
  if (signature[position++] !== 0x30) throw new Error('invalid_signature');
  const sequenceLength = readLength();
  if (position + sequenceLength !== signature.length) throw new Error('invalid_signature');
  const values = [];
  for (let i = 0; i < 2; i++) {
    if (signature[position++] !== 0x02) throw new Error('invalid_signature');
    const length = readLength();
    let integer = signature.slice(position, position + length);
    position += length;
    while (integer.length > size && integer[0] === 0) integer = integer.slice(1);
    if (!integer.length || integer.length > size) throw new Error('invalid_signature');
    const padded = new Uint8Array(size);
    padded.set(integer, size - integer.length);
    values.push(padded);
  }
  const raw = new Uint8Array(size * 2);
  raw.set(values[0]);
  raw.set(values[1], size);
  return raw;
}

function keyId(prefix) {
  if (prefix.length < 5 || prefix[0] !== 1) throw new Error('invalid_signature');
  return new DataView(prefix.buffer, prefix.byteOffset + 1, 4).getUint32(0, false);
}

export async function verifyGoogleHealthSignature(raw, signatureHeader, fetchKeyset = async () => {
  const response = await fetch(KEYSET_URL, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('keyset_unavailable');
  return response.json();
}) {
  if (!signatureHeader) return false;
  let signed;
  try { signed = decode64(signatureHeader); } catch { return false; }
  if (signed.length < 7) return false;
  let id;
  try { id = keyId(signed.slice(0, 5)); } catch { return false; }
  const keyset = await fetchKeyset();
  const entry = keyset?.key?.find(item => Number(item.keyId) === id && item.status === 'ENABLED');
  if (!entry?.keyData?.value) return false;
  let coordinates;
  try { coordinates = protobufBytes(decode64(entry.keyData.value), new Set([3, 4])); } catch { return false; }
  const x = coordinates.get(3), y = coordinates.get(4);
  if (!x || !y) return false;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: encode64url(x), y: encode64url(y), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToP1363(signed.slice(5)), new TextEncoder().encode(raw));
  } catch {
    return false;
  }
}

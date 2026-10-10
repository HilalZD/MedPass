/**
 * MedPass card engine: turns a MedPassRecord into one QR-sized text payload and back.
 *
 * Payload format (3 parts joined by "."):
 *
 *   MP1 . <emergency part> . <secret part>
 *
 *   MP1             version prefix, so future formats can be told apart.
 *   emergency part  base64url(deflateRaw(JSON {name, allergies, critical})).
 *                   NOT encrypted: a paramedic must read it without the PIN.
 *   secret part     base64url(salt[16] | iv[12] | AES-GCM ciphertext + 16-byte tag)
 *                   of deflateRaw(JSON of everything else, with short keys).
 *
 * Runs in the browser and in Node 20+: only globalThis.crypto.subtle (Web Crypto),
 * TextEncoder/TextDecoder and pako. Nothing is sent over the network or stored.
 */

import { deflateRaw, inflateRaw } from "pako";
import { z } from "zod";
import type { MedPassRecord } from "./types";

const PREFIX = "MP1";
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PBKDF2_ITERATIONS = 200_000;

export const WRONG_PIN = "Wrong PIN";
export const NOT_A_CARD = "Not a MedPass card";

export type Emergency = { name: string; allergies: string[]; critical: string[] };

// ---------------------------------------------------------------------------
// Validation (zod). The type check below makes the build fail if this schema
// ever drifts from MedPassRecord in lib/types.ts.
// ---------------------------------------------------------------------------

const verifiedSchema = z.enum(["patient", "clinician"]);

const emergencySchema = z.object({
  name: z.string(),
  allergies: z.array(z.string()),
  critical: z.array(z.string()),
});

const recordSchema = z.object({
  v: z.literal(1),
  patient: z.object({
    name: z.string(),
    birthYear: z.number().int().optional(),
    bloodType: z.string().optional(),
  }),
  emergency: z.object({ allergies: z.array(z.string()), critical: z.array(z.string()) }),
  conditions: z.array(z.object({ name: z.string(), verified: verifiedSchema })),
  meds: z.array(
    z.object({
      raw: z.string().optional(),
      name: z.string(),
      ingredient: z.string().optional(),
      strength: z.string().optional(),
      frequency: z.string().optional(),
      drugId: z.string().optional(),
      status: z.enum(["green", "yellow", "unreadable"]),
      verified: verifiedSchema,
    }),
  ),
  referrals: z.array(
    z.object({ to: z.string(), reason: z.string().optional(), status: z.enum(["open", "done"]) }),
  ),
  visits: z.array(z.object({ date: z.string(), place: z.string(), note: z.string() })),
  updated: z.string(),
});

// Compile-time guard: the schema's output must be exactly a MedPassRecord.
const _schemaMatchesType: z.ZodType<MedPassRecord> = recordSchema;
void _schemaMatchesType;

// ---------------------------------------------------------------------------
// Short keys. Every character counts in a QR code, so the encrypted part uses
// one-letter keys and one-letter enum values. They are mapped back on decode.
// ---------------------------------------------------------------------------

const VERIFIED = { patient: "p", clinician: "c" } as const;
const STATUS = { green: "g", yellow: "y", unreadable: "u" } as const;
const REFERRAL = { open: "o", done: "d" } as const;

function invert<K extends string, V extends string>(map: Record<K, V>): Record<V, K> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as Record<V, K>;
}
const UN_VERIFIED = invert(VERIFIED);
const UN_STATUS = invert(STATUS);
const UN_REFERRAL = invert(REFERRAL);

type Packed = {
  b?: number; // patient.birthYear
  t?: string; // patient.bloodType
  c: { n: string; v: string }[]; // conditions: name, verified
  m: { n: string; i?: string; s?: string; f?: string; d?: string; st: string; v: string }[]; // meds (no raw)
  r: { t: string; r?: string; s: string }[]; // referrals: to, reason, status
  w: { d: string; p: string; n: string }[]; // visits: date, place, note
  u: string; // updated
};

/** Drop keys whose value is undefined, so optional fields stay truly absent. */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function pack(rec: MedPassRecord): Packed {
  return compact({
    b: rec.patient.birthYear,
    t: rec.patient.bloodType,
    c: rec.conditions.map((c) => ({ n: c.name, v: VERIFIED[c.verified] })),
    // `raw` (the exact paper text) is deliberately left out: it is only for the review screen.
    m: rec.meds.map((m) =>
      compact({ n: m.name, i: m.ingredient, s: m.strength, f: m.frequency, d: m.drugId, st: STATUS[m.status], v: VERIFIED[m.verified] }),
    ),
    r: rec.referrals.map((r) => compact({ t: r.to, r: r.reason, s: REFERRAL[r.status] })),
    w: rec.visits.map((v) => ({ d: v.date, p: v.place, n: v.note })),
    u: rec.updated,
  });
}

function unpack(p: Packed, em: Emergency): unknown {
  return {
    v: 1,
    patient: compact({ name: em.name, birthYear: p.b, bloodType: p.t }),
    emergency: { allergies: em.allergies, critical: em.critical },
    conditions: p.c.map((c) => ({ name: c.n, verified: UN_VERIFIED[c.v as keyof typeof UN_VERIFIED] })),
    meds: p.m.map((m) =>
      compact({
        name: m.n, ingredient: m.i, strength: m.s, frequency: m.f, drugId: m.d,
        status: UN_STATUS[m.st as keyof typeof UN_STATUS],
        verified: UN_VERIFIED[m.v as keyof typeof UN_VERIFIED],
      }),
    ),
    referrals: p.r.map((r) => compact({ to: r.t, reason: r.r, status: UN_REFERRAL[r.s as keyof typeof UN_REFERRAL] })),
    visits: p.w.map((v) => ({ date: v.d, place: v.p, note: v.n })),
    updated: p.u,
  };
}

// ---------------------------------------------------------------------------
// Bytes <-> text helpers (no Node Buffer, so this also runs in the browser).
// ---------------------------------------------------------------------------

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url: like base64 but uses - and _ (URL/QR safe) and no "=" padding. */
function toBase64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  if (text.length % 4 === 1) throw new Error(NOT_A_CARD);
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let value = 0;
  let bits = 0;
  let j = 0;
  for (const ch of text) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) throw new Error(NOT_A_CARD);
    value = ((value << 6) | digit) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

const utf8 = (text: string) => new TextEncoder().encode(text);
const fromUtf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** JSON -> UTF-8 bytes -> raw DEFLATE (no zlib header: saves 6 bytes). */
const squeeze = (value: unknown) => deflateRaw(utf8(JSON.stringify(value)));
const unsqueeze = (bytes: Uint8Array): unknown => JSON.parse(fromUtf8(inflateRaw(bytes)));

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

/**
 * Turn a short PIN into a 256-bit AES key with PBKDF2-SHA256.
 * - The salt is 16 random bytes stored on the card. It makes every card's key
 *   different even when two patients choose the same PIN, so an attacker
 *   cannot pre-compute a table of "PIN -> key".
 * - 200,000 iterations make each PIN guess slow (a fraction of a second), so
 *   trying many PINs costs real time. A 6-digit PIN only has 1,000,000 options,
 *   so this slows down, but cannot fully stop, a determined attacker who holds
 *   the card. That is why only non-emergency data sits behind the PIN.
 */
async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const pinKey = await subtle.importKey("raw", utf8(pin), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    pinKey,
    { name: "AES-GCM", length: 256 },
    false, // the key can never be exported from the crypto engine
    ["encrypt", "decrypt"],
  );
}

/**
 * The emergency part is not secret, but it must not be silently editable.
 * We feed its exact text to AES-GCM as "additional authenticated data" (AAD):
 * it is not encrypted, but it is covered by the GCM tag. If anyone changes a
 * single character of it (e.g. removes an allergy), decryption with the right
 * PIN fails.
 */
const aadFor = (emergencyPart: string) => utf8(`${PREFIX}.${emergencyPart}`);

function splitPayload(payload: string): { emergencyPart: string; secretPart: string } {
  const parts = payload.trim().split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1] || !parts[2]) {
    throw new Error(NOT_A_CARD);
  }
  return { emergencyPart: parts[1], secretPart: parts[2] };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function encode(record: MedPassRecord, pin: string): Promise<string> {
  if (!/^\d{6}$/.test(pin)) throw new Error("PIN must be 6 digits");
  const rec = recordSchema.parse(record); // refuse to print a card from malformed data

  // 1. Plaintext part: only what a first responder needs with no PIN.
  const emergency: Emergency = { name: rec.patient.name, ...rec.emergency };
  const emergencyPart = toBase64url(squeeze(emergency));

  // 2. Fresh random salt and IV for every card. The IV ("nonce") must never be
  //    reused with the same key; a random 12-byte IV is the AES-GCM standard.
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(pin, salt);

  // 3. AES-GCM encrypts AND authenticates: the output ends with a 16-byte tag
  //    that proves nothing (secret part or emergency part) was changed.
  const plaintext = squeeze(pack(rec)) as Uint8Array<ArrayBuffer>;
  const ciphertext = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aadFor(emergencyPart) },
      key,
      plaintext,
    ),
  );

  // 4. Store salt | iv | ciphertext+tag together. Salt and IV are not secret;
  //    the decoder needs them to rebuild the same key.
  const secret = new Uint8Array(SALT_BYTES + IV_BYTES + ciphertext.length);
  secret.set(salt, 0);
  secret.set(iv, SALT_BYTES);
  secret.set(ciphertext, SALT_BYTES + IV_BYTES);

  return `${PREFIX}.${emergencyPart}.${toBase64url(secret)}`;
}

export async function decode(payload: string, pin: string): Promise<MedPassRecord> {
  const { emergencyPart, secretPart } = splitPayload(payload);
  const emergency = readEmergency(payload);

  const secret = fromBase64url(secretPart);
  if (secret.length < SALT_BYTES + IV_BYTES + TAG_BYTES) throw new Error(NOT_A_CARD);
  const salt = secret.slice(0, SALT_BYTES);
  const iv = secret.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const ciphertext = secret.slice(SALT_BYTES + IV_BYTES);

  // Re-derive the key from the spoken PIN and try to decrypt. AES-GCM checks
  // the tag first: a wrong PIN (wrong key) or any tampering makes it throw,
  // and it never returns partially-decrypted garbage.
  let plaintext: Uint8Array;
  try {
    const key = await deriveKey(pin, salt);
    plaintext = new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aadFor(emergencyPart) },
        key,
        ciphertext,
      ),
    );
  } catch {
    // GCM cannot tell "wrong PIN" from "card was edited"; both mean: do not trust it.
    throw new Error(WRONG_PIN);
  }

  try {
    return recordSchema.parse(unpack(unsqueeze(plaintext) as Packed, emergency));
  } catch {
    throw new Error(NOT_A_CARD);
  }
}

/**
 * Read the name + emergency info with no PIN. Note: this part is readable by
 * anyone and is only proven untampered once decode() succeeds with the PIN.
 */
export function readEmergency(payload: string): Emergency {
  const { emergencyPart } = splitPayload(payload);
  try {
    return emergencySchema.parse(unsqueeze(fromBase64url(emergencyPart)));
  } catch {
    throw new Error(NOT_A_CARD);
  }
}

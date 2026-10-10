/**
 * MedPass card engine: turns a MedPassRecord into one QR-sized text payload and back.
 *
 * Payload format:
 *
 *   "MP1:" + base45( emLen[2] | emergency[emLen] | salt[16] | iv[12] | ciphertext + tag[16] )
 *
 *   MP1:        version prefix, so future formats can be told apart.
 *   emLen       length of the emergency bytes, 2 bytes, big-endian.
 *   emergency   deflateRaw(JSON {id, cardVersion, name, dateOfBirth, bloodType,
 *               allergies, critical}). NOT encrypted: a paramedic must read it
 *               without the PIN, and the scanner needs id + cardVersion for the
 *               "Open in hospital portal" button and the "card was replaced" check.
 *   salt, iv    random per card; needed to rebuild the key. Not secret.
 *   ciphertext  AES-GCM of deflateRaw(JSON of everything else, packed as arrays).
 *
 * Why Base45 (RFC 9285)? QR codes have an "alphanumeric" mode that stores
 * 0-9 A-Z space $ % * + - . / : at 5.5 bits per character, instead of 8 bits
 * in byte mode. Base45 only uses those 45 characters, so the same data needs
 * a smaller (easier to scan) QR code than base64 would. EU COVID certificates
 * used the same trick.
 *
 * Runs in the browser and in Node 20+: only globalThis.crypto.subtle (Web Crypto),
 * TextEncoder/TextDecoder and pako. Nothing is sent over the network or stored.
 */

import { deflateRaw, inflateRaw } from "pako";
import QRCode from "qrcode";
import { z } from "zod";
import type { MedPassRecord } from "./types";

const PREFIX = "MP1:";
const LEN_BYTES = 2;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PBKDF2_ITERATIONS = 600_000;

export const WRONG_PIN = "Wrong PIN";
export const NOT_A_CARD = "Not a MedPass card";
export const CARD_FULL = "Card is full";

/**
 * Size budget. The biggest QR (version 1-40, error correction level M) we
 * allow on a card. Level M can lose ~15% of the code to scratches/folds and
 * still scan. Provisional: will be adjusted after testing printed cards.
 */
export const MAX_QR_VERSION = 20;

let maxQrChars: number | undefined;
/**
 * How many alphanumeric characters fit in a MAX_QR_VERSION, level-M QR.
 * Measured once with qrcode itself (binary search), so changing
 * MAX_QR_VERSION is the only edit needed.
 */
function maxQrCharsFor(): number {
  if (maxQrChars === undefined) {
    const fits = (n: number) => {
      try {
        QRCode.create("A".repeat(n), { version: MAX_QR_VERSION, errorCorrectionLevel: "M" });
        return true;
      } catch {
        return false;
      }
    };
    let lo = 1; // fits
    let hi = 4297; // more than any QR (v40-L holds 4296)
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    maxQrChars = lo;
  }
  return maxQrChars;
}

/** The part of the card anyone can read without the PIN (unverified until decode() succeeds). */
export type Emergency = {
  id: string;
  cardVersion: number;
  name: string;
  dateOfBirth?: string;
  bloodType?: string;
  allergies: string[];
  critical: string[];
};

// ---------------------------------------------------------------------------
// Validation (zod). The type check below makes the build fail if this schema
// ever drifts from MedPassRecord in lib/types.ts.
// ---------------------------------------------------------------------------

const verifiedSchema = z.enum(["patient", "clinician"]);

const emergencySchema = z.object({
  id: z.string(),
  cardVersion: z.number().int(),
  name: z.string(),
  dateOfBirth: z.string().optional(),
  bloodType: z.string().optional(),
  allergies: z.array(z.string()),
  critical: z.array(z.string()),
});

const recordSchema = z.object({
  v: z.literal(2),
  id: z.string().min(1),
  cardVersion: z.number().int().min(1),
  patient: z.object({
    name: z.string(),
    dateOfBirth: z.string().optional(),
    sex: z.enum(["F", "M"]).optional(),
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
// Packing. Every character counts in a QR code, so the encrypted part is
// stored as arrays in a fixed order (no key names at all) and enum values as
// small numbers (their index in the lists below). Missing optional fields
// become null. unpack() turns it back into a normal record.
// ---------------------------------------------------------------------------

const VERIFIED = ["patient", "clinician"] as const;
const STATUS = ["green", "yellow", "unreadable"] as const;
const REFERRAL = ["open", "done"] as const;

type Opt<T> = T | null;
// id, cardVersion, name, dateOfBirth and bloodType live in the plaintext
// (emergency) part, so they are not repeated here.
type Packed = [
  sex: Opt<"F" | "M">,
  conditions: [name: string, verified: number][],
  meds: [
    name: string,
    ingredient: Opt<string>,
    strength: Opt<string>,
    frequency: Opt<string>,
    drugId: Opt<string>,
    status: number,
    verified: number,
  ][],
  referrals: [to: string, reason: Opt<string>, status: number][],
  visits: [date: string, place: string, note: string][],
  updated: string,
];

const orNull = <T>(value: T | undefined): Opt<T> => (value === undefined ? null : value);

/** Drop keys whose value is null/undefined, so optional fields stay truly absent. */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as T;
}

function pack(rec: MedPassRecord): Packed {
  return [
    orNull(rec.patient.sex),
    rec.conditions.map((c) => [c.name, VERIFIED.indexOf(c.verified)]),
    // `raw` (the exact paper text) is deliberately left out: it is only for the review screen.
    rec.meds.map((m) => [
      m.name,
      orNull(m.ingredient),
      orNull(m.strength),
      orNull(m.frequency),
      orNull(m.drugId),
      STATUS.indexOf(m.status),
      VERIFIED.indexOf(m.verified),
    ]),
    rec.referrals.map((r) => [r.to, orNull(r.reason), REFERRAL.indexOf(r.status)]),
    rec.visits.map((v) => [v.date, v.place, v.note]),
    rec.updated,
  ];
}

function unpack(p: Packed, em: Emergency): unknown {
  const [sex, conditions, meds, referrals, visits, updated] = p;
  return {
    v: 2,
    id: em.id,
    cardVersion: em.cardVersion,
    patient: compact({ name: em.name, dateOfBirth: em.dateOfBirth, sex, bloodType: em.bloodType }),
    emergency: { allergies: em.allergies, critical: em.critical },
    conditions: conditions.map(([name, v]) => ({ name, verified: VERIFIED[v] })),
    meds: meds.map(([name, ingredient, strength, frequency, drugId, s, v]) =>
      compact({ name, ingredient, strength, frequency, drugId, status: STATUS[s], verified: VERIFIED[v] }),
    ),
    referrals: referrals.map(([to, reason, s]) => compact({ to, reason, status: REFERRAL[s] })),
    visits: visits.map(([date, place, note]) => ({ date, place, note })),
    updated,
  };
}

// ---------------------------------------------------------------------------
// Base45 (RFC 9285). Every 2 bytes (0..65535) become 3 characters, because
// 45^3 = 91125 > 65536. A final single byte (0..255) becomes 2 characters.
// Characters are written least-significant first, as the RFC specifies.
// Exported only so the tests can build tampered cards.
// ---------------------------------------------------------------------------

const BASE45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export function toBase45(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    let n = bytes[i] * 256 + bytes[i + 1];
    for (let k = 0; k < 3; k++) {
      out += BASE45[n % 45];
      n = Math.floor(n / 45);
    }
  }
  if (bytes.length % 2 === 1) {
    const n = bytes[bytes.length - 1];
    out += BASE45[n % 45] + BASE45[Math.floor(n / 45)];
  }
  return out;
}

export function fromBase45(text: string): Uint8Array<ArrayBuffer> {
  if (text.length % 3 === 1) throw new Error(NOT_A_CARD);
  const out = new Uint8Array(Math.floor(text.length / 3) * 2 + (text.length % 3 === 2 ? 1 : 0));
  const digit = (ch: string) => {
    const d = BASE45.indexOf(ch);
    if (d < 0) throw new Error(NOT_A_CARD);
    return d;
  };
  let j = 0;
  for (let i = 0; i < text.length; i += 3) {
    if (i + 2 < text.length) {
      const n = digit(text[i]) + digit(text[i + 1]) * 45 + digit(text[i + 2]) * 2025;
      if (n > 0xffff) throw new Error(NOT_A_CARD);
      out[j++] = n >> 8;
      out[j++] = n & 0xff;
    } else {
      const n = digit(text[i]) + digit(text[i + 1]) * 45;
      if (n > 0xff) throw new Error(NOT_A_CARD);
      out[j++] = n;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Small byte helpers
// ---------------------------------------------------------------------------

const utf8 = (text: string) => new TextEncoder().encode(text);
const fromUtf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** JSON -> UTF-8 bytes -> raw DEFLATE (no zlib header: saves 6 bytes). */
const squeeze = (value: unknown) => deflateRaw(utf8(JSON.stringify(value)));
const unsqueeze = (bytes: Uint8Array): unknown => JSON.parse(fromUtf8(inflateRaw(bytes)));

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

/**
 * Turn a short PIN into a 256-bit AES key with PBKDF2-SHA256.
 * - The salt is 16 random bytes stored on the card. It makes every card's key
 *   different even when two patients choose the same PIN, so an attacker
 *   cannot pre-compute a table of "PIN -> key".
 * - 600,000 iterations is the current OWASP recommendation for PBKDF2-SHA256.
 *   Each PIN guess costs 600k hash rounds, so trying many PINs takes real time.
 *   A 6-digit PIN still only has 1,000,000 options: this slows down, but cannot
 *   fully stop, a determined attacker who holds the card. That is why only
 *   non-emergency data sits behind the PIN.
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
 * We feed it to AES-GCM as "additional authenticated data" (AAD): it is not
 * encrypted, but it is covered by the GCM tag. If anyone changes a single
 * byte of it (e.g. removes an allergy), decryption with the right PIN fails.
 */
const aadFor = (emergency: Uint8Array) => concat(utf8(PREFIX), emergency);

type Parts = {
  emergency: Uint8Array<ArrayBuffer>;
  salt: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
};

function splitPayload(payload: string): Parts {
  const text = payload.trim();
  if (!text.startsWith(PREFIX)) throw new Error(NOT_A_CARD);
  const bytes = fromBase45(text.slice(PREFIX.length));
  if (bytes.length < LEN_BYTES) throw new Error(NOT_A_CARD);
  const emLen = (bytes[0] << 8) | bytes[1];
  const saltAt = LEN_BYTES + emLen;
  const ivAt = saltAt + SALT_BYTES;
  const ctAt = ivAt + IV_BYTES;
  if (emLen === 0 || bytes.length < ctAt + TAG_BYTES) throw new Error(NOT_A_CARD);
  return {
    emergency: bytes.slice(LEN_BYTES, saltAt),
    salt: bytes.slice(saltAt, ivAt),
    iv: bytes.slice(ivAt, ctAt),
    ciphertext: bytes.slice(ctAt),
  };
}

function parseEmergency(bytes: Uint8Array): Emergency {
  try {
    return emergencySchema.parse(unsqueeze(bytes));
  } catch {
    throw new Error(NOT_A_CARD);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** The two byte strings that go on a card: plaintext emergency + (unencrypted) secret part. */
function serialize(rec: MedPassRecord): { emergency: Uint8Array; plaintext: Uint8Array } {
  const emergency = squeeze(
    compact({
      id: rec.id,
      cardVersion: rec.cardVersion,
      name: rec.patient.name,
      dateOfBirth: rec.patient.dateOfBirth,
      bloodType: rec.patient.bloodType,
      allergies: rec.emergency.allergies,
      critical: rec.emergency.critical,
    }) satisfies Emergency,
  );
  if (emergency.length > 0xffff) throw new Error(CARD_FULL);
  return { emergency, plaintext: squeeze(pack(rec)) };
}

/** One binary blob: length | emergency | salt | iv | ciphertext+tag, as "MP1:" + Base45. */
function assemble(emergency: Uint8Array, salt: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): string {
  const length = new Uint8Array([emergency.length >> 8, emergency.length & 0xff]);
  return PREFIX + toBase45(concat(length, emergency, salt, iv, ciphertext));
}

/** QR version qrcode would pick at level M; 41 means "too big for any QR". */
function qrVersionOf(payload: string): number {
  try {
    return QRCode.create(payload, { errorCorrectionLevel: "M" }).version;
  } catch {
    return 41;
  }
}

/**
 * The payload a record WOULD produce, without knowing the PIN. AES-GCM output
 * is always plaintext length + 16 (the tag), so dummy bytes of the right length
 * give the right size. 0xFF bytes become letters ("FGW") in Base45, never runs
 * of digits that a QR could pack more tightly, so this is a safe upper bound.
 */
function estimatePayload(rec: MedPassRecord): string {
  const { emergency, plaintext } = serialize(rec);
  const dummy = (n: number) => new Uint8Array(n).fill(0xff);
  return assemble(emergency, dummy(SALT_BYTES), dummy(IV_BYTES), dummy(plaintext.length + TAG_BYTES));
}

export type FitResult = {
  record: MedPassRecord;
  droppedVisits: MedPassRecord["visits"];
  qrVersion: number;
  fillPercent: number;
};

/**
 * Make a record fit the card's size budget by dropping the OLDEST visits only.
 * Allergies, critical info, conditions, meds and referrals are never dropped.
 * Visits come back sorted newest first. If it still does not fit with zero
 * visits, qrVersion stays > MAX_QR_VERSION and the UI should say "Card is full".
 * Nothing is dropped silently: the UI shows droppedVisits for a human to confirm.
 */
export function fitRecord(record: MedPassRecord): FitResult {
  const rec = recordSchema.parse(record);
  let visits = [...rec.visits].sort((a, b) => b.date.localeCompare(a.date));
  const droppedVisits: MedPassRecord["visits"] = [];

  let payload = estimatePayload({ ...rec, visits });
  let qrVersion = qrVersionOf(payload);
  while (qrVersion > MAX_QR_VERSION && visits.length > 0) {
    droppedVisits.unshift(visits[visits.length - 1]); // keep droppedVisits newest first too
    visits = visits.slice(0, -1);
    payload = estimatePayload({ ...rec, visits });
    qrVersion = qrVersionOf(payload);
  }

  return {
    record: { ...rec, visits },
    droppedVisits,
    qrVersion,
    fillPercent: Math.round((payload.length / maxQrCharsFor()) * 100),
  };
}

/**
 * Encrypt a record into a card payload. Never drops data: if the result is
 * bigger than MAX_QR_VERSION it throws "Card is full". Call fitRecord() first
 * and let a human confirm what gets left off.
 */
export async function encode(record: MedPassRecord, pin: string): Promise<string> {
  if (!/^\d{6}$/.test(pin)) throw new Error("PIN must be 6 digits");
  const rec = recordSchema.parse(record); // refuse to print a card from malformed data

  // 1. Plaintext part: only what a first responder needs with no PIN.
  //    Secret part: everything else, packed and compressed (encrypted below).
  const { emergency, plaintext } = serialize(rec);

  // 2. Fresh random salt and IV for every card. The IV ("nonce") must never be
  //    reused with the same key; a random 12-byte IV is the AES-GCM standard.
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(pin, salt);

  // 3. AES-GCM encrypts AND authenticates: the output ends with a 16-byte tag
  //    that proves nothing (secret part or emergency part) was changed.
  const ciphertext = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aadFor(emergency) },
      key,
      concat(plaintext),
    ),
  );

  // 4. Salt and IV are not secret; the decoder needs them to rebuild the key.
  const payload = assemble(emergency, salt, iv, ciphertext);
  if (qrVersionOf(payload) > MAX_QR_VERSION) throw new Error(CARD_FULL);
  return payload;
}

export async function decode(payload: string, pin: string): Promise<MedPassRecord> {
  const { emergency, salt, iv, ciphertext } = splitPayload(payload);
  const em = parseEmergency(emergency);

  // Re-derive the key from the spoken PIN and try to decrypt. AES-GCM checks
  // the tag first: a wrong PIN (wrong key) or any tampering makes it throw,
  // and it never returns partially-decrypted garbage.
  let plaintext: Uint8Array;
  try {
    const key = await deriveKey(pin, salt);
    plaintext = new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aadFor(emergency) },
        key,
        ciphertext,
      ),
    );
  } catch {
    // GCM cannot tell "wrong PIN" from "card was edited"; both mean: do not trust it.
    throw new Error(WRONG_PIN);
  }

  try {
    return recordSchema.parse(unpack(unsqueeze(plaintext) as Packed, em));
  } catch {
    throw new Error(NOT_A_CARD);
  }
}

/**
 * Read the card's public part with no PIN: MedPass ID, card version, name,
 * date of birth, blood type, allergies, critical conditions.
 * Note: anyone can read (or forge) this part. It is only proven untampered
 * once decode() succeeds with the PIN, so show it as "Not yet verified".
 */
export function readEmergency(payload: string): Emergency {
  return parseEmergency(splitPayload(payload).emergency);
}

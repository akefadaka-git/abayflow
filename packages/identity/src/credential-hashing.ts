import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const FORMAT = "scrypt";
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;
const MAX_CREDENTIAL_BYTES = 1024;

export type CredentialFailure = "invalid" | "malformed" | "unsupported";

export class CredentialFormatError extends Error {
  constructor(readonly reason: CredentialFailure) {
    super("Credential hash is invalid or unsupported");
    this.name = "CredentialFormatError";
  }
}

/**
 * Versioned password credential contract:
 * scrypt N=32768,r=8,p=1, 16-byte random salt, 64-byte derived key.
 * Store only this encoded string; never store/log the plaintext credential.
 * Policy must be re-reviewed against production capacity before route exposure.
 */
export async function hashCredential(credential: string): Promise<string> {
  validateCredential(credential);
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(credential, salt, KEY_LENGTH, {
    N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: MAX_MEMORY
  }) as Buffer;
  return [FORMAT, COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64url"), derived.toString("base64url")].join("$");
}

export async function verifyCredential(credential: string, encoded: string): Promise<boolean> {
  if (typeof credential !== "string" || Buffer.byteLength(credential, "utf8") > MAX_CREDENTIAL_BYTES) return false;
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== FORMAT) throw new CredentialFormatError("unsupported");
  const n = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  if (n !== COST || r !== BLOCK_SIZE || p !== PARALLELIZATION) throw new CredentialFormatError("unsupported");
  let salt: Buffer, expected: Buffer;
  try {
    salt = Buffer.from(parts[4] ?? "", "base64url");
    expected = Buffer.from(parts[5] ?? "", "base64url");
  } catch {
    throw new CredentialFormatError("malformed");
  }
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH ||
      salt.toString("base64url") !== parts[4] || expected.toString("base64url") !== parts[5]) {
    throw new CredentialFormatError("malformed");
  }
  const actual = await scrypt(credential, salt, KEY_LENGTH, {
    N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: MAX_MEMORY
  }) as Buffer;
  return timingSafeEqual(actual, expected);
}

function validateCredential(credential: string): void {
  if (typeof credential !== "string" || credential.length === 0 ||
      Buffer.byteLength(credential, "utf8") > MAX_CREDENTIAL_BYTES) {
    throw new Error("Credential must contain 1 to 1024 UTF-8 bytes");
  }
}

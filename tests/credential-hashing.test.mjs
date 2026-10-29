import test from "node:test";
import assert from "node:assert/strict";
import { hashCredential, verifyCredential } from "../dist/packages/identity/src/credential-hashing.js";

test("credential hashing uses salted encoded hashes and verifies only the original credential", async () => {
  const first = await hashCredential("correct horse battery staple");
  const second = await hashCredential("correct horse battery staple");
  assert.notEqual(first, second, "independent hashes must use independent salts");
  assert.equal(await verifyCredential("correct horse battery staple", first), true);
  assert.equal(await verifyCredential("incorrect credential", first), false);
  assert.equal(first.split("$").length, 7);
  assert.equal(first.includes("correct horse battery staple"), false);
});

test("credential verifier rejects malformed and unsupported encodings", async () => {
  await assert.rejects(() => verifyCredential("secret", "plaintext"), /invalid or unsupported/i);
  await assert.rejects(() => verifyCredential("secret", "argon2$1$1$1$abc$def"), /invalid or unsupported/i);
  await assert.rejects(() => hashCredential(""), /at least 12 characters/);
});

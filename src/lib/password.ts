// Password hashing — bcryptjs, 12 salt rounds. Boring on purpose (CLAUDE.md
// preamble: "Favour the simple, boring implementation everywhere").
//
// Passwords are only ever set by an administrator (create user / reset
// password) — there is no self-service signup or reset flow (CLAUDE.md hard
// constraint #1).
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

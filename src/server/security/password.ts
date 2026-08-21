import argon2 from "argon2";

export const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, passwordOptions);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function passwordNeedsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, passwordOptions);
}

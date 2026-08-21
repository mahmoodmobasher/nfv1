export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
export const PASSWORD_POLICY_MESSAGE = "Use at least 12 characters, including a number and a symbol.";

export function meetsPasswordPolicy(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export function assertPasswordPolicy(password: string): void {
  if (!meetsPasswordPolicy(password)) throw new PasswordPolicyError();
}

export class PasswordPolicyError extends Error {
  readonly code = "password_policy";
  constructor() { super(PASSWORD_POLICY_MESSAGE); }
}

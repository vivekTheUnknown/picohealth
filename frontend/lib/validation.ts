/** Validation helpers shared by the auth and settings forms. */

/** Mirrors the backend's password_min_length setting. */
export const MIN_PASSWORD_LENGTH = 12;

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email address.";
  if (trimmed.length > 254) return "This email address is too long.";
  return null;
}

export function validateNewPassword(value: string): string | null {
  if (!value) return "Enter a password.";
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (value.length > 256) return "This password is too long.";
  return null;
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
): string | null {
  if (!confirmation) return "Repeat the password.";
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}

export interface SanitizeResult {
  valid: boolean;
  sanitized: string;
  error?: string;
}

export function sanitizeDisplayName(rawName: unknown): SanitizeResult {
  if (typeof rawName !== "string") {
    return { valid: false, sanitized: "", error: "Display name must be a string" };
  }

  // Reject null bytes or control characters
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F-\u009F]/.test(rawName)) {
    return { valid: false, sanitized: "", error: "Display name contains invalid control characters" };
  }

  // Trim leading/trailing whitespace and collapse internal whitespace
  let processed = rawName.trim().replace(/\s+/g, " ");

  if (processed.length === 0) {
    return { valid: false, sanitized: "", error: "Display name cannot be empty" };
  }

  if (processed.length > 30) {
    return { valid: false, sanitized: "", error: "Display name must not exceed 30 characters" };
  }

  // Validate allowed set: Unicode letters, numbers, spaces, hyphens, underscores
  const allowedPattern = /^[\p{L}\p{N} _-]+$/u;
  if (!allowedPattern.test(processed)) {
    return { valid: false, sanitized: "", error: "Display name contains unsupported characters" };
  }

  // HTML-escape all sensitive characters before storage/echo
  const escaped = processed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  return {
    valid: true,
    sanitized: escaped
  };
}

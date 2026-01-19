export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function sanitizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '');
}

export function normalizeProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;

    const normalizedKey = key.trim();
    if (normalizedKey.length === 0) continue;

    if (typeof value === 'string') {
      normalized[normalizedKey] = value.trim();
    } else if (value instanceof Date) {
      normalized[normalizedKey] = value.toISOString();
    } else if (Array.isArray(value)) {
      normalized[normalizedKey] = value.map(v =>
        typeof v === 'string' ? v.trim() : v
      );
    } else if (typeof value === 'object' && value !== null) {
      normalized[normalizedKey] = normalizeProperties(value as Record<string, unknown>);
    } else {
      normalized[normalizedKey] = value;
    }
  }

  return normalized;
}

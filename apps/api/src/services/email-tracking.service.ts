import crypto from 'crypto';

const TRACKING_SECRET = process.env.TRACKING_SECRET || 'default-tracking-secret-change-me';

export interface TrackingData {
  emailSendId: string;
  profileId: string;
  organizationId: string;
  campaignId?: string;
  flowId?: string;
}

export function encodeTrackingToken(data: TrackingData): string {
  const payload = JSON.stringify(data);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    crypto.scryptSync(TRACKING_SECRET, 'salt', 32),
    Buffer.alloc(16, 0)
  );
  let encrypted = cipher.update(payload, 'utf8', 'base64url');
  encrypted += cipher.final('base64url');
  const authTag = cipher.getAuthTag().toString('base64url');
  return `${encrypted}.${authTag}`;
}

export function decodeTrackingToken(token: string): TrackingData | null {
  try {
    const [encrypted, authTag] = token.split('.');
    if (!encrypted || !authTag) return null;

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      crypto.scryptSync(TRACKING_SECRET, 'salt', 32),
      Buffer.alloc(16, 0)
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
    let decrypted = decipher.update(encrypted, 'base64url', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

export interface EmailTrackingResult {
  html: string;
  text?: string;
  trackingPixelUrl: string;
  wrappedLinks: Map<string, string>;
}

export function addEmailTracking(
  html: string,
  text: string | undefined,
  trackingData: TrackingData,
  baseUrl: string
): EmailTrackingResult {
  const token = encodeTrackingToken(trackingData);
  const trackingPixelUrl = `${baseUrl}/t/o/${token}`;
  const wrappedLinks = new Map<string, string>();

  // Add tracking pixel before closing body tag
  const pixelHtml = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
  let trackedHtml = html;

  if (trackedHtml.includes('</body>')) {
    trackedHtml = trackedHtml.replace('</body>', `${pixelHtml}</body>`);
  } else {
    trackedHtml = trackedHtml + pixelHtml;
  }

  // Wrap links in HTML
  const linkRegex = /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi;
  let match;
  let linkIndex = 0;

  while ((match = linkRegex.exec(html)) !== null) {
    const originalUrl = match[2];

    // Skip mailto:, tel:, and tracking URLs
    if (
      originalUrl.startsWith('mailto:') ||
      originalUrl.startsWith('tel:') ||
      originalUrl.includes('/t/c/') ||
      originalUrl.includes('/t/o/')
    ) {
      continue;
    }

    const linkId = `link_${linkIndex++}`;
    const trackingUrl = `${baseUrl}/t/c/${token}?url=${encodeURIComponent(originalUrl)}&lid=${linkId}`;
    wrappedLinks.set(originalUrl, trackingUrl);

    trackedHtml = trackedHtml.replace(
      new RegExp(`href=["']${escapeRegExp(originalUrl)}["']`, 'g'),
      `href="${trackingUrl}"`
    );
  }

  return {
    html: trackedHtml,
    text,
    trackingPixelUrl,
    wrappedLinks,
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function generateUnsubscribeUrl(
  trackingData: TrackingData,
  baseUrl: string
): string {
  const token = encodeTrackingToken(trackingData);
  return `${baseUrl}/unsubscribe/${token}`;
}

export function generatePreferencesUrl(
  trackingData: TrackingData,
  baseUrl: string
): string {
  const token = encodeTrackingToken(trackingData);
  return `${baseUrl}/preferences/${token}`;
}

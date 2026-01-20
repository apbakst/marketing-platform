export const QUEUE_NAMES = {
  EMAIL_SEND: 'email-send',
  EMAIL_BATCH: 'email-batch',
  SMS_SEND: 'sms-send',
  SEGMENT_CALCULATE: 'segment-calculate',
  FLOW_TRIGGER: 'flow-trigger',
  FLOW_ENROLLMENT: 'flow-enrollment',
  FLOW_EXECUTE: 'flow-execute',
  WEBHOOK: 'webhook',
  ANALYTICS: 'analytics',
} as const;

export const CACHE_KEYS = {
  PROFILE: (orgId: string, id: string) => `profile:${orgId}:${id}`,
  PROFILE_BY_EMAIL: (orgId: string, email: string) => `profile:email:${orgId}:${email}`,
  SEGMENT: (id: string) => `segment:${id}`,
  SEGMENT_MEMBERS: (id: string) => `segment:members:${id}`,
  CAMPAIGN: (id: string) => `campaign:${id}`,
  FLOW: (id: string) => `flow:${id}`,
  ORG_SETTINGS: (id: string) => `org:settings:${id}`,
  API_KEY: (keyHash: string) => `apikey:${keyHash}`,
  SUPPRESSION: (orgId: string, email: string) => `suppression:${orgId}:${email}`,
  RATE_LIMIT: (key: string) => `ratelimit:${key}`,
} as const;

export const CACHE_TTL = {
  PROFILE: 300,
  SEGMENT: 60,
  SEGMENT_MEMBERS: 300,
  CAMPAIGN: 60,
  FLOW: 60,
  ORG_SETTINGS: 3600,
  API_KEY: 300,
  SUPPRESSION: 3600,
} as const;

export const DEFAULTS = {
  PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 200,
  MAX_BATCH_SIZE: 1000,
  EVENT_RETENTION_DAYS: 365,
  SEGMENT_REFRESH_INTERVAL: 3600,
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT: 60000,
} as const;

export const EVENT_NAMES = {
  PROFILE_CREATED: '$profile_created',
  PROFILE_UPDATED: '$profile_updated',
  EMAIL_SENT: '$email_sent',
  EMAIL_DELIVERED: '$email_delivered',
  EMAIL_OPENED: '$email_opened',
  EMAIL_CLICKED: '$email_clicked',
  EMAIL_BOUNCED: '$email_bounced',
  EMAIL_COMPLAINED: '$email_complained',
  EMAIL_UNSUBSCRIBED: '$email_unsubscribed',
  SMS_SENT: '$sms_sent',
  SMS_DELIVERED: '$sms_delivered',
  SMS_FAILED: '$sms_failed',
  SMS_RECEIVED: '$sms_received',
  SMS_OPTED_OUT: '$sms_opted_out',
  FLOW_ENTERED: '$flow_entered',
  FLOW_EXITED: '$flow_exited',
  SEGMENT_ENTERED: '$segment_entered',
  SEGMENT_EXITED: '$segment_exited',
} as const;

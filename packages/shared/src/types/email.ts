export type EmailProviderType = 'ses' | 'sendgrid' | 'mixmax';

export interface EmailProviderConfig {
  ses?: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    configurationSet?: string;
  };
  sendgrid?: {
    apiKey: string;
  };
  mixmax?: {
    apiKey: string;
  };
}

export interface EmailProvider {
  id: string;
  organizationId: string;
  name: string;
  type: EmailProviderType;
  config: EmailProviderConfig[EmailProviderType];
  priority: number;
  isActive: boolean;
  isDefault: boolean;
  dailyLimit?: number;
  hourlyLimit?: number;
  currentDailyUsage: number;
  currentHourlyUsage: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastHealthCheck?: Date;
  circuitBreakerOpen: boolean;
  circuitBreakerOpenedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEmailProviderInput {
  name: string;
  type: EmailProviderType;
  config: EmailProviderConfig[EmailProviderType];
  priority?: number;
  isDefault?: boolean;
  dailyLimit?: number;
  hourlyLimit?: number;
}

export interface UpdateEmailProviderInput {
  name?: string;
  config?: EmailProviderConfig[EmailProviderType];
  priority?: number;
  isActive?: boolean;
  isDefault?: boolean;
  dailyLimit?: number;
  hourlyLimit?: number;
}

export type EmailEventType =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'unsubscribed';

export type BounceType = 'hard' | 'soft' | 'undetermined';

export interface EmailSend {
  id: string;
  organizationId: string;
  profileId: string;
  campaignId?: string;
  flowId?: string;
  flowNodeId?: string;
  providerId: string;
  providerMessageId?: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface EmailEvent {
  id: string;
  organizationId: string;
  emailSendId: string;
  profileId: string;
  type: EmailEventType;
  timestamp: Date;
  metadata: {
    url?: string;
    userAgent?: string;
    ipAddress?: string;
    bounceType?: BounceType;
    bounceMessage?: string;
    complaintFeedbackType?: string;
  };
  createdAt: Date;
}

export interface Suppression {
  id: string;
  organizationId: string;
  email: string;
  reason: 'bounce' | 'complaint' | 'unsubscribe' | 'manual';
  bounceType?: BounceType;
  source?: string;
  createdAt: Date;
}

export interface SendEmailInput {
  profileId: string;
  to: string;
  from: {
    email: string;
    name?: string;
  };
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  campaignId?: string;
  flowId?: string;
  flowNodeId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  providerId?: string;
  error?: string;
}

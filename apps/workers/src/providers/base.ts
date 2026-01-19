export interface EmailMessage {
  to: string;
  from: {
    email: string;
    name?: string;
  };
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

export interface ProviderStatus {
  healthy: boolean;
  error?: string;
  latency?: number;
}

export abstract class EmailProvider {
  abstract readonly name: string;
  abstract readonly type: string;

  abstract send(message: EmailMessage): Promise<SendResult>;
  abstract checkHealth(): Promise<ProviderStatus>;
}

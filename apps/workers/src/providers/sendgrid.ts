import sgMail from '@sendgrid/mail';
import { EmailProvider, EmailMessage, SendResult, ProviderStatus } from './base.js';

export interface SendGridConfig {
  apiKey: string;
}

export class SendGridProvider extends EmailProvider {
  readonly name = 'SendGrid';
  readonly type = 'sendgrid';

  constructor(config: SendGridConfig) {
    super();
    sgMail.setApiKey(config.apiKey);
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const [response] = await sgMail.send({
        to: message.to,
        from: {
          email: message.from.email,
          name: message.from.name,
        },
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
        customArgs: message.metadata,
        categories: message.tags,
      });

      // Extract message ID from headers
      const messageId = response.headers['x-message-id'] as string;

      return {
        success: true,
        messageId,
      };
    } catch (error) {
      const err = error as Error & { code?: number; response?: { body?: { errors?: Array<{ message: string }> } } };
      const errorMessage =
        err.response?.body?.errors?.[0]?.message || err.message;

      return {
        success: false,
        error: errorMessage,
        errorCode: err.code?.toString(),
      };
    }
  }

  async checkHealth(): Promise<ProviderStatus> {
    const start = Date.now();

    try {
      // SendGrid doesn't have a dedicated health check endpoint
      // We can try to validate the API key by making a simple request
      // For now, we just return healthy if the client is configured
      return {
        healthy: true,
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        healthy: false,
        error: (error as Error).message,
        latency: Date.now() - start,
      };
    }
  }
}

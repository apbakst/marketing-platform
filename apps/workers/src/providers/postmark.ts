import { EmailProvider, EmailMessage, SendResult, ProviderStatus } from './base.js';

export interface PostmarkConfig {
  serverToken: string;
  messageStream?: string;
}

interface PostmarkResponse {
  To: string;
  SubmittedAt: string;
  MessageID: string;
  ErrorCode: number;
  Message: string;
}

export class PostmarkProvider extends EmailProvider {
  readonly name = 'Postmark';
  readonly type = 'postmark';
  private serverToken: string;
  private messageStream: string;
  private baseUrl = 'https://api.postmarkapp.com';

  constructor(config: PostmarkConfig) {
    super();
    this.serverToken = config.serverToken;
    this.messageStream = config.messageStream || 'outbound';
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const response = await fetch(`${this.baseUrl}/email`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': this.serverToken,
        },
        body: JSON.stringify({
          From: message.from.name
            ? `${message.from.name} <${message.from.email}>`
            : message.from.email,
          To: message.to,
          ReplyTo: message.replyTo,
          Subject: message.subject,
          HtmlBody: message.html,
          TextBody: message.text,
          Tag: message.tags?.[0],
          MessageStream: this.messageStream,
          Metadata: message.metadata,
          TrackOpens: true,
          TrackLinks: 'HtmlAndText',
        }),
      });

      const data = (await response.json()) as PostmarkResponse;

      if (response.ok && data.MessageID) {
        return {
          success: true,
          messageId: data.MessageID,
        };
      }

      return {
        success: false,
        error: data.Message || 'Unknown error',
        errorCode: data.ErrorCode?.toString(),
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  async checkHealth(): Promise<ProviderStatus> {
    const start = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/server`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Postmark-Server-Token': this.serverToken,
        },
      });

      return {
        healthy: response.ok,
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

import {
  SESClient,
  SendEmailCommand,
  GetSendQuotaCommand,
} from '@aws-sdk/client-ses';
import { EmailProvider, EmailMessage, SendResult, ProviderStatus } from './base.js';

export interface SESConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  configurationSet?: string;
}

export class SESProvider extends EmailProvider {
  readonly name = 'AWS SES';
  readonly type = 'ses';

  private client: SESClient;
  private configurationSet?: string;

  constructor(config: SESConfig) {
    super();

    const clientConfig: { region: string; credentials?: { accessKeyId: string; secretAccessKey: string } } = {
      region: config.region,
    };

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    this.client = new SESClient(clientConfig);
    this.configurationSet = config.configurationSet;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const command = new SendEmailCommand({
        Source: message.from.name
          ? `${message.from.name} <${message.from.email}>`
          : message.from.email,
        Destination: {
          ToAddresses: [message.to],
        },
        Message: {
          Subject: {
            Data: message.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: message.html,
              Charset: 'UTF-8',
            },
            ...(message.text && {
              Text: {
                Data: message.text,
                Charset: 'UTF-8',
              },
            }),
          },
        },
        ...(message.replyTo && {
          ReplyToAddresses: [message.replyTo],
        }),
        ...(this.configurationSet && {
          ConfigurationSetName: this.configurationSet,
        }),
        Tags: [
          ...(message.tags || []).map((tag) => ({
            Name: 'tag',
            Value: tag,
          })),
          ...Object.entries(message.metadata || {}).map(([Name, Value]) => ({
            Name,
            Value,
          })),
        ],
      });

      const response = await this.client.send(command);

      return {
        success: true,
        messageId: response.MessageId,
      };
    } catch (error) {
      const err = error as Error & { name?: string; code?: string };
      return {
        success: false,
        error: err.message,
        errorCode: err.name || err.code,
      };
    }
  }

  async checkHealth(): Promise<ProviderStatus> {
    const start = Date.now();

    try {
      const command = new GetSendQuotaCommand({});
      const response = await this.client.send(command);

      const latency = Date.now() - start;

      // Check if we're close to the sending limit
      const quotaUsed = (response.SentLast24Hours || 0) / (response.Max24HourSend || 1);

      if (quotaUsed > 0.9) {
        return {
          healthy: false,
          error: 'Approaching 24-hour sending limit',
          latency,
        };
      }

      return {
        healthy: true,
        latency,
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

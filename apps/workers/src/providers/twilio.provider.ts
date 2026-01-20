import Twilio from 'twilio';
import { SmsMessage, SmsSendResult, SmsProviderConfig } from '@marketing-platform/shared';

type MessageCreateOptions = {
  to: string;
  body: string;
  from?: string;
  messagingServiceSid?: string;
  mediaUrl?: string[];
  statusCallback?: string;
};

export class TwilioProvider {
  private client: ReturnType<typeof Twilio>;
  private config: SmsProviderConfig;

  constructor(config: SmsProviderConfig) {
    this.config = config;
    this.client = Twilio(config.accountSid, config.authToken);
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    try {
      const messageParams: MessageCreateOptions = {
        to: message.to,
        body: message.body,
      };

      // Use messaging service if configured, otherwise use from number
      if (message.messagingServiceSid || this.config.messagingServiceSid) {
        messageParams.messagingServiceSid = message.messagingServiceSid || this.config.messagingServiceSid;
      } else {
        messageParams.from = this.config.fromNumber;
      }

      // Add media URL for MMS
      if (message.mediaUrl) {
        messageParams.mediaUrl = [message.mediaUrl];
      }

      // Add status callback if provided
      if (message.statusCallback) {
        messageParams.statusCallback = message.statusCallback;
      }

      const twilioMessage = await this.client.messages.create(messageParams);

      return {
        success: true,
        messageId: twilioMessage.sid,
        status: twilioMessage.status,
      };
    } catch (error) {
      const twilioError = error as any;
      return {
        success: false,
        error: twilioError.message || 'Unknown error',
        errorCode: twilioError.code?.toString(),
      };
    }
  }

  async checkHealth(): Promise<{ healthy: boolean; message?: string }> {
    try {
      // Try to fetch account info to verify credentials
      const account = await this.client.api.v2010.accounts(this.config.accountSid).fetch();

      if (account.status === 'active') {
        return { healthy: true };
      }

      return {
        healthy: false,
        message: `Account status: ${account.status}`,
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getMessageStatus(messageId: string): Promise<{
    status: string;
    errorCode?: string;
    errorMessage?: string;
  }> {
    try {
      const message = await this.client.messages(messageId).fetch();

      return {
        status: message.status,
        errorCode: message.errorCode?.toString(),
        errorMessage: message.errorMessage || undefined,
      };
    } catch (error) {
      throw new Error(`Failed to get message status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse incoming webhook from Twilio
   */
  static parseWebhook(payload: Record<string, string>): {
    messageId: string;
    status: string;
    from: string;
    to: string;
    body?: string;
    errorCode?: string;
    errorMessage?: string;
    isIncoming: boolean;
  } {
    const messageId = payload.MessageSid || payload.SmsSid;
    const status = payload.MessageStatus || payload.SmsStatus;
    const isIncoming = !status; // Incoming messages don't have a status field

    return {
      messageId,
      status: status || 'received',
      from: payload.From,
      to: payload.To,
      body: payload.Body,
      errorCode: payload.ErrorCode,
      errorMessage: payload.ErrorMessage,
      isIncoming,
    };
  }

  /**
   * Check if a number is opted out using Twilio's messaging service
   */
  async isOptedOut(phone: string): Promise<boolean> {
    // This would use Twilio's opt-out management API if using a messaging service
    // For now, we'll manage opt-outs in our database
    return false;
  }
}

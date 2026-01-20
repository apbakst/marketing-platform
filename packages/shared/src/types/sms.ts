export interface SendSmsInput {
  profileId?: string;
  phone?: string;
  externalId?: string;
  message: string;
  mediaUrl?: string;
  scheduledAt?: string;
  campaignId?: string;
  flowId?: string;
  flowNodeId?: string;
}

export interface SmsProviderConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  messagingServiceSid?: string;
}

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
  status?: string;
}

export interface SmsConsentStatus {
  profileId: string;
  phone: string;
  consentGiven: boolean;
  consentSource?: string;
  consentedAt?: Date;
  optedOutAt?: Date;
}

export interface SmsMessage {
  to: string;
  body: string;
  mediaUrl?: string;
  statusCallback?: string;
  messagingServiceSid?: string;
}

export interface SmsWebhookPayload {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body?: string;
  MessageStatus?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  SmsStatus?: string;
  NumMedia?: string;
}

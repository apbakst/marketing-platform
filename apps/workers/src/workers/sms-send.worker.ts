import { Worker, Job } from 'bullmq';
import { prisma } from '@marketing-platform/database';
import { QUEUE_NAMES, generateId } from '@marketing-platform/shared';
import { connection } from '../lib/redis.js';
import { config } from '../lib/config.js';
import { TwilioProvider } from '../providers/twilio.provider.js';

export interface SmsSendJobData {
  smsSendId: string;
  organizationId: string;
  profileId: string;
  to: string;
  body: string;
  mediaUrl?: string;
  campaignId?: string;
  flowId?: string;
  flowNodeId?: string;
  metadata?: Record<string, string>;
}

// Provider instance cache
const providerCache = new Map<string, TwilioProvider>();

async function getProvider(providerId: string): Promise<TwilioProvider | null> {
  if (providerCache.has(providerId)) {
    return providerCache.get(providerId)!;
  }

  const dbProvider = await prisma.smsProvider.findUnique({
    where: { id: providerId },
  });

  if (!dbProvider || !dbProvider.isActive) {
    return null;
  }

  const providerConfig = dbProvider.config as {
    accountSid: string;
    authToken: string;
  };

  const provider = new TwilioProvider({
    accountSid: providerConfig.accountSid,
    authToken: providerConfig.authToken,
    fromNumber: dbProvider.fromNumber,
    messagingServiceSid: dbProvider.messagingServiceSid || undefined,
  });

  providerCache.set(providerId, provider);
  return provider;
}

async function processSmsSend(job: Job<SmsSendJobData>): Promise<void> {
  const { data } = job;

  console.log(`Processing SMS send job ${job.id} for ${data.to}`);

  // Get the SMS send record
  const smsSend = await prisma.smsSend.findUnique({
    where: { id: data.smsSendId },
  });

  if (!smsSend) {
    console.error(`SMS send record not found: ${data.smsSendId}`);
    return;
  }

  // Check if SMS consent is given
  const consent = await prisma.smsConsent.findUnique({
    where: {
      organizationId_phone: {
        organizationId: data.organizationId,
        phone: data.to,
      },
    },
  });

  if (!consent || !consent.consentGiven || consent.optedOutAt) {
    console.log(`SMS to ${data.to} blocked: no consent or opted out`);
    await prisma.smsSend.update({
      where: { id: data.smsSendId },
      data: {
        status: 'failed',
        failedAt: new Date(),
        failureReason: consent?.optedOutAt
          ? 'Recipient has opted out of SMS'
          : 'No SMS consent on file',
      },
    });
    return;
  }

  // Get the provider
  const provider = await getProvider(smsSend.providerId);

  if (!provider) {
    console.error(`SMS provider not found or inactive: ${smsSend.providerId}`);
    await prisma.smsSend.update({
      where: { id: data.smsSendId },
      data: {
        status: 'failed',
        failedAt: new Date(),
        failureReason: 'SMS provider not available',
      },
    });
    return;
  }

  // Get webhook URL for status callbacks
  const organization = await prisma.organization.findUnique({
    where: { id: data.organizationId },
  });
  const settings = (organization?.settings as Record<string, unknown>) || {};
  const baseUrl = (settings.apiUrl as string) || process.env.API_URL || 'http://localhost:3001';
  const statusCallback = `${baseUrl}/webhooks/sms/twilio/status`;

  // Send the SMS
  const result = await provider.send({
    to: data.to,
    body: data.body,
    mediaUrl: data.mediaUrl,
    statusCallback,
  });

  if (result.success) {
    // Update SMS send record
    await prisma.smsSend.update({
      where: { id: data.smsSendId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        providerMessageId: result.messageId,
      },
    });

    // Create sent event
    await prisma.smsEvent.create({
      data: {
        id: generateId('se'),
        organizationId: data.organizationId,
        smsSendId: data.smsSendId,
        profileId: data.profileId,
        type: 'sent',
        timestamp: new Date(),
        metadata: { providerMessageId: result.messageId },
      },
    });

    // Update provider usage
    await prisma.smsProvider.update({
      where: { id: smsSend.providerId },
      data: {
        currentDailyUsage: { increment: 1 },
        currentHourlyUsage: { increment: 1 },
      },
    });

    console.log(`SMS sent successfully to ${data.to}, messageId: ${result.messageId}`);
  } else {
    // Update SMS send record with failure
    const retryCount = (smsSend.retryCount || 0) + 1;
    const isPermFailure = isPermamentFailure(result.errorCode);
    const shouldRetry = !isPermFailure && retryCount < config.workers.maxRetries;

    await prisma.smsSend.update({
      where: { id: data.smsSendId },
      data: {
        status: shouldRetry ? 'queued' : 'failed',
        retryCount,
        ...(!shouldRetry && {
          failedAt: new Date(),
          failureReason: result.error,
          errorCode: result.errorCode,
        }),
      },
    });

    if (!shouldRetry) {
      // Create failed event
      await prisma.smsEvent.create({
        data: {
          id: generateId('se'),
          organizationId: data.organizationId,
          smsSendId: data.smsSendId,
          profileId: data.profileId,
          type: 'failed',
          timestamp: new Date(),
          errorCode: result.errorCode,
          errorMessage: result.error,
        },
      });

      console.error(`SMS send failed permanently for ${data.to}: ${result.error}`);

      // Handle invalid numbers - mark consent as opted out
      if (isInvalidNumber(result.errorCode)) {
        await prisma.smsConsent.update({
          where: {
            organizationId_phone: {
              organizationId: data.organizationId,
              phone: data.to,
            },
          },
          data: {
            consentGiven: false,
            optedOutAt: new Date(),
            optOutSource: 'invalid_number',
          },
        });
      }
    } else {
      // Throw error to trigger retry
      throw new Error(result.error || 'SMS send failed');
    }
  }
}

function isPermamentFailure(errorCode?: string): boolean {
  if (!errorCode) return false;

  const permanentErrors = [
    '21211', // Invalid 'To' phone number
    '21614', // 'To' number is not a valid mobile number
    '21408', // Permission to send to this country denied
    '21610', // Attempt to send to unsubscribed recipient
    '21612', // 'To' phone number is not reachable
    '30003', // Unreachable destination handset
    '30005', // Unknown destination handset
    '30006', // Landline or unreachable carrier
  ];

  return permanentErrors.includes(errorCode);
}

function isInvalidNumber(errorCode?: string): boolean {
  if (!errorCode) return false;

  const invalidNumberErrors = [
    '21211', // Invalid 'To' phone number
    '21614', // 'To' number is not a valid mobile number
    '21612', // 'To' phone number is not reachable
    '30006', // Landline or unreachable carrier
  ];

  return invalidNumberErrors.includes(errorCode);
}

export function createSmsSendWorker(): Worker<SmsSendJobData> {
  const worker = new Worker(QUEUE_NAMES.SMS_SEND, processSmsSend, {
    connection,
    concurrency: config.workers.concurrency,
  });

  worker.on('completed', (job) => {
    console.log(`SMS send job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`SMS send job ${job?.id} failed:`, err);
  });

  return worker;
}

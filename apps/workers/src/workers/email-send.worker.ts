import { Worker, Job } from 'bullmq';
import { prisma } from '@marketing-platform/database';
import { QUEUE_NAMES, generateId } from '@marketing-platform/shared';
import { connection } from '../lib/redis.js';
import { config } from '../lib/config.js';
import { emailRouter } from '../lib/email-router.js';

export interface EmailSendJobData {
  emailSendId: string;
  organizationId: string;
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
  metadata?: Record<string, string>;
}

async function processEmailSend(job: Job<EmailSendJobData>): Promise<void> {
  const { data } = job;

  console.log(`Processing email send job ${job.id} for ${data.to}`);

  // Check if email is suppressed
  const suppression = await prisma.suppression.findUnique({
    where: {
      organizationId_email: {
        organizationId: data.organizationId,
        email: data.to,
      },
    },
  });

  if (suppression) {
    console.log(`Email ${data.to} is suppressed (${suppression.reason}), skipping`);
    await prisma.emailSend.update({
      where: { id: data.emailSendId },
      data: {
        status: 'failed',
        failedAt: new Date(),
        failureReason: `Suppressed: ${suppression.reason}`,
      },
    });
    return;
  }

  // Initialize router for this organization
  await emailRouter.initialize(data.organizationId);

  // Send the email
  const { providerId, result } = await emailRouter.send(data.organizationId, {
    to: data.to,
    from: data.from,
    replyTo: data.replyTo,
    subject: data.subject,
    html: data.html,
    text: data.text,
    tags: data.tags,
    metadata: {
      ...data.metadata,
      emailSendId: data.emailSendId,
      organizationId: data.organizationId,
      ...(data.campaignId && { campaignId: data.campaignId }),
      ...(data.flowId && { flowId: data.flowId }),
    },
  });

  if (result.success) {
    // Update email send record
    await prisma.emailSend.update({
      where: { id: data.emailSendId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        providerId,
        providerMessageId: result.messageId,
      },
    });

    // Create sent event
    await prisma.emailEvent.create({
      data: {
        id: generateId('ee'),
        organizationId: data.organizationId,
        emailSendId: data.emailSendId,
        profileId: data.profileId,
        type: 'sent',
        timestamp: new Date(),
        metadata: { providerId, providerMessageId: result.messageId },
      },
    });

    // Update campaign stats if applicable
    if (data.campaignId) {
      await prisma.campaign.update({
        where: { id: data.campaignId },
        data: {
          sentCount: { increment: 1 },
        },
      });
    }

    console.log(`Email sent successfully to ${data.to}, messageId: ${result.messageId}`);
  } else {
    // Update email send record with failure
    const emailSend = await prisma.emailSend.findUnique({
      where: { id: data.emailSendId },
    });

    const retryCount = (emailSend?.retryCount || 0) + 1;

    await prisma.emailSend.update({
      where: { id: data.emailSendId },
      data: {
        status: retryCount >= config.workers.maxRetries ? 'failed' : 'queued',
        retryCount,
        ...(retryCount >= config.workers.maxRetries && {
          failedAt: new Date(),
          failureReason: result.error,
        }),
      },
    });

    // If this is the final retry, create a failed event
    if (retryCount >= config.workers.maxRetries) {
      console.error(`Email send failed permanently for ${data.to}: ${result.error}`);

      // Check if this is a hard bounce
      if (result.errorCode && isHardBounce(result.errorCode)) {
        await prisma.suppression.upsert({
          where: {
            organizationId_email: {
              organizationId: data.organizationId,
              email: data.to,
            },
          },
          create: {
            id: generateId('sup'),
            organizationId: data.organizationId,
            email: data.to,
            reason: 'bounce',
            bounceType: 'hard',
            source: 'email_send_failure',
          },
          update: {},
        });
      }
    } else {
      // Throw error to trigger retry
      throw new Error(result.error || 'Email send failed');
    }
  }
}

function isHardBounce(errorCode: string): boolean {
  const hardBounceErrors = [
    'MessageRejected',
    'InvalidParameterValue',
    'MailFromDomainNotVerified',
    'AccountSendingPaused',
  ];
  return hardBounceErrors.includes(errorCode);
}

export function createEmailSendWorker(): Worker<EmailSendJobData> {
  const worker = new Worker(QUEUE_NAMES.EMAIL_SEND, processEmailSend, {
    connection,
    concurrency: config.workers.concurrency,
  });

  worker.on('completed', (job) => {
    console.log(`Email send job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Email send job ${job?.id} failed:`, err);
  });

  return worker;
}

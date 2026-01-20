import { FastifyInstance } from 'fastify';
import { prisma } from '@marketing-platform/database';
import { generateId } from '@marketing-platform/shared';
import crypto from 'crypto';

// AWS SES webhook payload types
interface SESNotification {
  Type: string;
  Message: string;
  MessageId?: string;
  TopicArn?: string;
  Timestamp?: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
  SubscribeURL?: string;
}

interface SESMessage {
  notificationType: 'Bounce' | 'Complaint' | 'Delivery';
  mail: {
    messageId: string;
    timestamp: string;
    source: string;
    destination: string[];
    headers?: Array<{ name: string; value: string }>;
    commonHeaders?: {
      from: string[];
      to: string[];
      subject: string;
    };
  };
  bounce?: {
    bounceType: 'Permanent' | 'Transient';
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      action?: string;
      status?: string;
      diagnosticCode?: string;
    }>;
    timestamp: string;
    feedbackId?: string;
  };
  complaint?: {
    complainedRecipients: Array<{ emailAddress: string }>;
    timestamp: string;
    feedbackId?: string;
    complaintFeedbackType?: string;
  };
  delivery?: {
    timestamp: string;
    processingTimeMillis: number;
    recipients: string[];
    smtpResponse?: string;
    reportingMTA?: string;
  };
}

// SendGrid webhook payload types
interface SendGridEvent {
  event: 'bounce' | 'dropped' | 'spamreport' | 'delivered' | 'open' | 'click' | 'unsubscribe';
  email: string;
  timestamp: number;
  sg_message_id: string;
  sg_event_id: string;
  reason?: string;
  type?: string;
  category?: string[];
  emailSendId?: string;
  organizationId?: string;
  campaignId?: string;
}

// Postmark webhook payload types
interface PostmarkWebhook {
  RecordType: 'Bounce' | 'SpamComplaint' | 'Delivery' | 'Open' | 'Click';
  MessageID: string;
  Email: string;
  From: string;
  BouncedAt?: string;
  Type?: string;
  TypeCode?: number;
  Description?: string;
  Details?: string;
  Tag?: string;
  Metadata?: Record<string, string>;
}

export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  // AWS SES webhook endpoint
  fastify.post('/webhooks/ses', {
    config: {
      rawBody: true,
    },
    handler: async (request, reply) => {
      const body = request.body as SESNotification;

      // Handle SNS subscription confirmation
      if (body.Type === 'SubscriptionConfirmation' && body.SubscribeURL) {
        // Auto-confirm subscription by visiting the URL
        await fetch(body.SubscribeURL);
        return reply.status(200).send({ confirmed: true });
      }

      if (body.Type !== 'Notification' || !body.Message) {
        return reply.status(200).send({ skipped: true });
      }

      try {
        const message = JSON.parse(body.Message) as SESMessage;

        // Find email send by provider message ID
        const emailSend = await prisma.emailSend.findFirst({
          where: { providerMessageId: message.mail.messageId },
        });

        if (!emailSend) {
          console.log(`No email send found for SES message ID: ${message.mail.messageId}`);
          return reply.status(200).send({ skipped: true, reason: 'no_match' });
        }

        switch (message.notificationType) {
          case 'Bounce':
            await handleSESBounce(message, emailSend.id, emailSend.organizationId);
            break;
          case 'Complaint':
            await handleSESComplaint(message, emailSend.id, emailSend.organizationId);
            break;
          case 'Delivery':
            await handleSESDelivery(message, emailSend.id, emailSend.organizationId);
            break;
        }

        return reply.status(200).send({ processed: true });
      } catch (error) {
        console.error('Error processing SES webhook:', error);
        return reply.status(200).send({ error: 'parse_error' });
      }
    },
  });

  // SendGrid webhook endpoint
  fastify.post('/webhooks/sendgrid', {
    handler: async (request, reply) => {
      const events = request.body as SendGridEvent[];

      if (!Array.isArray(events)) {
        return reply.status(400).send({ error: 'Invalid payload' });
      }

      for (const event of events) {
        try {
          // SendGrid includes custom metadata in events
          const emailSendId = event.emailSendId;
          const organizationId = event.organizationId;

          if (!emailSendId || !organizationId) {
            // Try to find by message ID
            const emailSend = await prisma.emailSend.findFirst({
              where: { providerMessageId: event.sg_message_id },
            });

            if (!emailSend) {
              continue;
            }

            await handleSendGridEvent(event, emailSend.id, emailSend.organizationId);
          } else {
            await handleSendGridEvent(event, emailSendId, organizationId);
          }
        } catch (error) {
          console.error('Error processing SendGrid event:', error);
        }
      }

      return reply.status(200).send({ processed: true });
    },
  });

  // Postmark webhook endpoint
  fastify.post('/webhooks/postmark', {
    handler: async (request, reply) => {
      const webhook = request.body as PostmarkWebhook;

      // Find email send by provider message ID
      const emailSend = await prisma.emailSend.findFirst({
        where: { providerMessageId: webhook.MessageID },
      });

      if (!emailSend) {
        // Try to find by metadata
        const emailSendId = webhook.Metadata?.emailSendId;
        if (emailSendId) {
          const foundSend = await prisma.emailSend.findUnique({
            where: { id: emailSendId },
          });
          if (foundSend) {
            await handlePostmarkEvent(webhook, foundSend.id, foundSend.organizationId);
            return reply.status(200).send({ processed: true });
          }
        }
        return reply.status(200).send({ skipped: true, reason: 'no_match' });
      }

      await handlePostmarkEvent(webhook, emailSend.id, emailSend.organizationId);
      return reply.status(200).send({ processed: true });
    },
  });
}

async function handleSESBounce(
  message: SESMessage,
  emailSendId: string,
  organizationId: string
): Promise<void> {
  const bounce = message.bounce!;
  const isHardBounce = bounce.bounceType === 'Permanent';

  // Update email send status
  await prisma.emailSend.update({
    where: { id: emailSendId },
    data: {
      status: 'bounced',
      failedAt: new Date(bounce.timestamp),
    },
  });

  // Create email event
  await prisma.emailEvent.create({
    data: {
      id: generateId('ee'),
      organizationId,
      emailSendId,
      profileId: (await prisma.emailSend.findUnique({ where: { id: emailSendId }, select: { profileId: true } }))?.profileId || '',
      type: 'bounced',
      timestamp: new Date(bounce.timestamp),
      metadata: {
        bounceType: bounce.bounceType,
        bounceSubType: bounce.bounceSubType,
      },
    },
  });

  // Update campaign stats
  const emailSend = await prisma.emailSend.findUnique({
    where: { id: emailSendId },
    select: { campaignId: true },
  });

  if (emailSend?.campaignId) {
    await prisma.campaign.update({
      where: { id: emailSend.campaignId },
      data: {
        bounceCount: { increment: 1 },
      },
    });
  }

  // Add to suppression list for hard bounces
  if (isHardBounce) {
    for (const recipient of bounce.bouncedRecipients) {
      await prisma.suppression.upsert({
        where: {
          organizationId_email: {
            organizationId,
            email: recipient.emailAddress,
          },
        },
        create: {
          id: generateId('sup'),
          organizationId,
          email: recipient.emailAddress,
          reason: 'bounce',
          bounceType: 'hard',
          source: 'ses_webhook',
        },
        update: {
          reason: 'bounce',
          bounceType: 'hard',
        },
      });
    }
  }
}

async function handleSESComplaint(
  message: SESMessage,
  emailSendId: string,
  organizationId: string
): Promise<void> {
  const complaint = message.complaint!;

  // Update email send status
  await prisma.emailSend.update({
    where: { id: emailSendId },
    data: {
      status: 'complained',
    },
  });

  // Create email event
  await prisma.emailEvent.create({
    data: {
      id: generateId('ee'),
      organizationId,
      emailSendId,
      profileId: (await prisma.emailSend.findUnique({ where: { id: emailSendId }, select: { profileId: true } }))?.profileId || '',
      type: 'complained',
      timestamp: new Date(complaint.timestamp),
      metadata: {
        feedbackType: complaint.complaintFeedbackType,
      },
    },
  });

  // Update campaign stats
  const emailSend = await prisma.emailSend.findUnique({
    where: { id: emailSendId },
    select: { campaignId: true },
  });

  if (emailSend?.campaignId) {
    await prisma.campaign.update({
      where: { id: emailSend.campaignId },
      data: {
        complaintCount: { increment: 1 },
      },
    });
  }

  // Add all complained recipients to suppression list
  for (const recipient of complaint.complainedRecipients) {
    await prisma.suppression.upsert({
      where: {
        organizationId_email: {
          organizationId,
          email: recipient.emailAddress,
        },
      },
      create: {
        id: generateId('sup'),
        organizationId,
        email: recipient.emailAddress,
        reason: 'complaint',
        source: 'ses_webhook',
      },
      update: {
        reason: 'complaint',
      },
    });
  }
}

async function handleSESDelivery(
  message: SESMessage,
  emailSendId: string,
  organizationId: string
): Promise<void> {
  const delivery = message.delivery!;

  // Update email send status
  await prisma.emailSend.update({
    where: { id: emailSendId },
    data: {
      status: 'delivered',
      deliveredAt: new Date(delivery.timestamp),
    },
  });

  // Create email event
  await prisma.emailEvent.create({
    data: {
      id: generateId('ee'),
      organizationId,
      emailSendId,
      profileId: (await prisma.emailSend.findUnique({ where: { id: emailSendId }, select: { profileId: true } }))?.profileId || '',
      type: 'delivered',
      timestamp: new Date(delivery.timestamp),
    },
  });

  // Update campaign stats
  const emailSend = await prisma.emailSend.findUnique({
    where: { id: emailSendId },
    select: { campaignId: true },
  });

  if (emailSend?.campaignId) {
    await prisma.campaign.update({
      where: { id: emailSend.campaignId },
      data: {
        deliveredCount: { increment: 1 },
      },
    });
  }
}

async function handleSendGridEvent(
  event: SendGridEvent,
  emailSendId: string,
  organizationId: string
): Promise<void> {
  const emailSend = await prisma.emailSend.findUnique({
    where: { id: emailSendId },
    select: { profileId: true, campaignId: true, toEmail: true },
  });

  if (!emailSend) return;

  switch (event.event) {
    case 'bounce':
    case 'dropped':
      await prisma.emailSend.update({
        where: { id: emailSendId },
        data: {
          status: 'bounced',
          failedAt: new Date(event.timestamp * 1000),
        },
      });

      await prisma.emailEvent.create({
        data: {
          id: generateId('ee'),
          organizationId,
          emailSendId,
          profileId: emailSend.profileId,
          type: 'bounced',
          timestamp: new Date(event.timestamp * 1000),
          metadata: { reason: event.reason, type: event.type },
        },
      });

      if (emailSend.campaignId) {
        await prisma.campaign.update({
          where: { id: emailSend.campaignId },
          data: { bounceCount: { increment: 1 } },
        });
      }

      // Add hard bounces to suppression list
      if (event.type === 'bounce' && event.reason?.toLowerCase().includes('invalid')) {
        await prisma.suppression.upsert({
          where: {
            organizationId_email: { organizationId, email: event.email },
          },
          create: {
            id: generateId('sup'),
            organizationId,
            email: event.email,
            reason: 'bounce',
            bounceType: 'hard',
            source: 'sendgrid_webhook',
          },
          update: {},
        });
      }
      break;

    case 'spamreport':
      await prisma.emailSend.update({
        where: { id: emailSendId },
        data: { status: 'complained' },
      });

      await prisma.emailEvent.create({
        data: {
          id: generateId('ee'),
          organizationId,
          emailSendId,
          profileId: emailSend.profileId,
          type: 'complained',
          timestamp: new Date(event.timestamp * 1000),
        },
      });

      if (emailSend.campaignId) {
        await prisma.campaign.update({
          where: { id: emailSend.campaignId },
          data: { complaintCount: { increment: 1 } },
        });
      }

      await prisma.suppression.upsert({
        where: {
          organizationId_email: { organizationId, email: event.email },
        },
        create: {
          id: generateId('sup'),
          organizationId,
          email: event.email,
          reason: 'complaint',
          source: 'sendgrid_webhook',
        },
        update: {},
      });
      break;

    case 'delivered':
      await prisma.emailSend.update({
        where: { id: emailSendId },
        data: {
          status: 'delivered',
          deliveredAt: new Date(event.timestamp * 1000),
        },
      });

      await prisma.emailEvent.create({
        data: {
          id: generateId('ee'),
          organizationId,
          emailSendId,
          profileId: emailSend.profileId,
          type: 'delivered',
          timestamp: new Date(event.timestamp * 1000),
        },
      });

      if (emailSend.campaignId) {
        await prisma.campaign.update({
          where: { id: emailSend.campaignId },
          data: { deliveredCount: { increment: 1 } },
        });
      }
      break;

    case 'unsubscribe':
      await prisma.emailEvent.create({
        data: {
          id: generateId('ee'),
          organizationId,
          emailSendId,
          profileId: emailSend.profileId,
          type: 'unsubscribed',
          timestamp: new Date(event.timestamp * 1000),
        },
      });

      if (emailSend.campaignId) {
        await prisma.campaign.update({
          where: { id: emailSend.campaignId },
          data: { unsubscribeCount: { increment: 1 } },
        });
      }

      await prisma.suppression.upsert({
        where: {
          organizationId_email: { organizationId, email: event.email },
        },
        create: {
          id: generateId('sup'),
          organizationId,
          email: event.email,
          reason: 'unsubscribe',
          source: 'sendgrid_webhook',
        },
        update: {},
      });
      break;
  }
}

async function handlePostmarkEvent(
  webhook: PostmarkWebhook,
  emailSendId: string,
  organizationId: string
): Promise<void> {
  const emailSend = await prisma.emailSend.findUnique({
    where: { id: emailSendId },
    select: { profileId: true, campaignId: true },
  });

  if (!emailSend) return;

  switch (webhook.RecordType) {
    case 'Bounce':
      const isHardBounce = webhook.TypeCode && [1, 2, 512].includes(webhook.TypeCode);

      await prisma.emailSend.update({
        where: { id: emailSendId },
        data: {
          status: 'bounced',
          failedAt: webhook.BouncedAt ? new Date(webhook.BouncedAt) : new Date(),
        },
      });

      await prisma.emailEvent.create({
        data: {
          id: generateId('ee'),
          organizationId,
          emailSendId,
          profileId: emailSend.profileId,
          type: 'bounced',
          timestamp: webhook.BouncedAt ? new Date(webhook.BouncedAt) : new Date(),
          metadata: {
            type: webhook.Type,
            description: webhook.Description,
          },
        },
      });

      if (emailSend.campaignId) {
        await prisma.campaign.update({
          where: { id: emailSend.campaignId },
          data: { bounceCount: { increment: 1 } },
        });
      }

      if (isHardBounce) {
        await prisma.suppression.upsert({
          where: {
            organizationId_email: { organizationId, email: webhook.Email },
          },
          create: {
            id: generateId('sup'),
            organizationId,
            email: webhook.Email,
            reason: 'bounce',
            bounceType: 'hard',
            source: 'postmark_webhook',
          },
          update: {},
        });
      }
      break;

    case 'SpamComplaint':
      await prisma.emailSend.update({
        where: { id: emailSendId },
        data: { status: 'complained' },
      });

      await prisma.emailEvent.create({
        data: {
          id: generateId('ee'),
          organizationId,
          emailSendId,
          profileId: emailSend.profileId,
          type: 'complained',
          timestamp: new Date(),
        },
      });

      if (emailSend.campaignId) {
        await prisma.campaign.update({
          where: { id: emailSend.campaignId },
          data: { complaintCount: { increment: 1 } },
        });
      }

      await prisma.suppression.upsert({
        where: {
          organizationId_email: { organizationId, email: webhook.Email },
        },
        create: {
          id: generateId('sup'),
          organizationId,
          email: webhook.Email,
          reason: 'complaint',
          source: 'postmark_webhook',
        },
        update: {},
      });
      break;

    case 'Delivery':
      await prisma.emailSend.update({
        where: { id: emailSendId },
        data: {
          status: 'delivered',
          deliveredAt: new Date(),
        },
      });

      await prisma.emailEvent.create({
        data: {
          id: generateId('ee'),
          organizationId,
          emailSendId,
          profileId: emailSend.profileId,
          type: 'delivered',
          timestamp: new Date(),
        },
      });

      if (emailSend.campaignId) {
        await prisma.campaign.update({
          where: { id: emailSend.campaignId },
          data: { deliveredCount: { increment: 1 } },
        });
      }
      break;
  }
}

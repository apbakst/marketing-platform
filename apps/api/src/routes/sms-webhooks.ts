import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@marketing-platform/database';
import { generateId } from '@marketing-platform/shared';
import { smsService } from '../services/sms.service.js';

interface TwilioStatusPayload {
  MessageSid: string;
  MessageStatus: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  AccountSid: string;
  From: string;
  To: string;
  Body?: string;
}

const OPT_OUT_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];

export async function smsWebhookRoutes(fastify: FastifyInstance): Promise<void> {
  // Twilio status callback webhook
  fastify.post(
    '/webhooks/sms/twilio/status',
    {
      schema: {
        summary: 'Twilio SMS status webhook',
        description: 'Receives SMS delivery status updates from Twilio',
        tags: ['Webhooks'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.body as TwilioStatusPayload;

      console.log(`Received SMS status webhook: ${payload.MessageSid} - ${payload.MessageStatus}`);

      // Find the SMS send record by provider message ID
      const smsSend = await prisma.smsSend.findFirst({
        where: { providerMessageId: payload.MessageSid },
      });

      if (!smsSend) {
        console.warn(`SMS send not found for message ID: ${payload.MessageSid}`);
        return reply.status(200).send({ received: true });
      }

      // Map Twilio status to our status
      const statusMap: Record<string, string> = {
        queued: 'queued',
        sent: 'sent',
        delivered: 'delivered',
        undelivered: 'undelivered',
        failed: 'failed',
      };

      const status = statusMap[payload.MessageStatus] || payload.MessageStatus;
      const now = new Date();

      // Update SMS send record
      const updateData: Record<string, unknown> = {};

      if (status === 'delivered') {
        updateData.status = 'delivered';
        updateData.deliveredAt = now;
      } else if (status === 'failed' || status === 'undelivered') {
        updateData.status = status;
        updateData.failedAt = now;
        updateData.failureReason = payload.ErrorMessage || `Status: ${status}`;
        updateData.errorCode = payload.ErrorCode;
      } else if (status === 'sent') {
        updateData.status = 'sent';
        if (!smsSend.sentAt) {
          updateData.sentAt = now;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.smsSend.update({
          where: { id: smsSend.id },
          data: updateData,
        });
      }

      // Create SMS event
      await prisma.smsEvent.create({
        data: {
          id: generateId('se'),
          organizationId: smsSend.organizationId,
          smsSendId: smsSend.id,
          profileId: smsSend.profileId,
          type: status,
          timestamp: now,
          errorCode: payload.ErrorCode,
          errorMessage: payload.ErrorMessage,
          metadata: {
            twilioStatus: payload.MessageStatus,
          },
        },
      });

      return reply.status(200).send({ received: true });
    }
  );

  // Twilio incoming message webhook (for opt-outs)
  fastify.post(
    '/webhooks/sms/twilio/incoming',
    {
      schema: {
        summary: 'Twilio incoming SMS webhook',
        description: 'Receives incoming SMS messages from Twilio',
        tags: ['Webhooks'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.body as TwilioStatusPayload;

      console.log(`Received incoming SMS from ${payload.From}: ${payload.Body}`);

      const body = (payload.Body || '').trim().toUpperCase();

      // Check if this is an opt-out message
      if (OPT_OUT_KEYWORDS.includes(body)) {
        // Find SMS providers using this To number
        const providers = await prisma.smsProvider.findMany({
          where: { fromNumber: payload.To },
        });

        // Process opt-out for all organizations using this number
        for (const provider of providers) {
          await smsService.handleOptOut(
            provider.organizationId,
            payload.From,
            'sms_reply'
          );

          console.log(
            `Processed SMS opt-out for ${payload.From} in org ${provider.organizationId}`
          );
        }

        // Send confirmation response (Twilio TwiML)
        return reply
          .type('text/xml')
          .send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You have been unsubscribed and will no longer receive SMS messages.</Message>
</Response>`);
      }

      // For other incoming messages, just acknowledge
      return reply.status(200).send({ received: true });
    }
  );
}

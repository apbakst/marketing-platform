import { prisma, Prisma } from '@marketing-platform/database';
import {
  SendSmsInput,
  generateId,
  QUEUE_NAMES,
} from '@marketing-platform/shared';
import { redis } from '../lib/redis.js';
import { Queue } from 'bullmq';
import { profileService } from './profile.service.js';

const smsSendQueue = new Queue(QUEUE_NAMES.SMS_SEND, {
  connection: redis as any,
});

// Infer types from Prisma
type SmsSend = Prisma.SmsSendGetPayload<{}>;
type SmsConsent = Prisma.SmsConsentGetPayload<{}>;

export class SmsService {
  /**
   * Send an SMS message
   */
  async send(
    organizationId: string,
    input: SendSmsInput
  ): Promise<SmsSend> {
    // Resolve profile and phone number
    const { profileId, phone } = await this.resolveProfileAndPhone(organizationId, input);

    if (!profileId || !phone) {
      throw new Error('Could not resolve profile or phone number');
    }

    // Check SMS consent
    const consent = await this.getConsent(organizationId, phone);
    if (!consent || !consent.consentGiven || consent.optedOutAt) {
      throw new Error('No SMS consent for this phone number or recipient has opted out');
    }

    // Get active SMS provider
    const provider = await prisma.smsProvider.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { priority: 'asc' },
    });

    if (!provider) {
      throw new Error('No active SMS provider configured');
    }

    // Create SMS send record
    const smsSend = await prisma.smsSend.create({
      data: {
        id: generateId('sms'),
        organizationId,
        profileId,
        providerId: provider.id,
        fromNumber: provider.fromNumber,
        toNumber: phone,
        body: input.message,
        mediaUrl: input.mediaUrl,
        campaignId: input.campaignId,
        flowId: input.flowId,
        flowNodeId: input.flowNodeId,
        status: 'queued',
      },
    });

    // Queue the SMS for sending
    const delay = input.scheduledAt
      ? new Date(input.scheduledAt).getTime() - Date.now()
      : 0;

    await smsSendQueue.add(
      `sms-${smsSend.id}`,
      {
        smsSendId: smsSend.id,
        organizationId,
        profileId,
        to: phone,
        body: input.message,
        mediaUrl: input.mediaUrl,
        campaignId: input.campaignId,
        flowId: input.flowId,
        flowNodeId: input.flowNodeId,
      },
      delay > 0 ? { delay } : undefined
    );

    return smsSend;
  }

  /**
   * Send SMS to multiple recipients
   */
  async sendBatch(
    organizationId: string,
    recipients: Array<{ profileId?: string; phone?: string; externalId?: string }>,
    message: string,
    options?: {
      mediaUrl?: string;
      campaignId?: string;
      flowId?: string;
    }
  ): Promise<{ queued: number; errors: Array<{ index: number; error: string }> }> {
    const results = {
      queued: 0,
      errors: [] as Array<{ index: number; error: string }>,
    };

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      try {
        await this.send(organizationId, {
          profileId: recipient.profileId,
          phone: recipient.phone,
          externalId: recipient.externalId,
          message,
          mediaUrl: options?.mediaUrl,
          campaignId: options?.campaignId,
          flowId: options?.flowId,
        });
        results.queued++;
      } catch (error) {
        results.errors.push({
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get SMS consent for a phone number
   */
  async getConsent(organizationId: string, phone: string): Promise<SmsConsent | null> {
    return prisma.smsConsent.findUnique({
      where: {
        organizationId_phone: {
          organizationId,
          phone: this.normalizePhone(phone),
        },
      },
    });
  }

  /**
   * Set SMS consent for a profile
   */
  async setConsent(
    organizationId: string,
    profileId: string,
    phone: string,
    consent: boolean,
    source: string
  ): Promise<SmsConsent> {
    const normalizedPhone = this.normalizePhone(phone);

    return prisma.smsConsent.upsert({
      where: {
        organizationId_phone: {
          organizationId,
          phone: normalizedPhone,
        },
      },
      create: {
        id: generateId('sc'),
        organizationId,
        profileId,
        phone: normalizedPhone,
        consentGiven: consent,
        consentSource: source,
        consentedAt: consent ? new Date() : null,
      },
      update: {
        consentGiven: consent,
        consentSource: source,
        ...(consent
          ? {
              consentedAt: new Date(),
              optedOutAt: null,
              optOutSource: null,
            }
          : {
              optedOutAt: new Date(),
              optOutSource: source,
            }),
      },
    });
  }

  /**
   * Handle opt-out from SMS (e.g., STOP reply)
   */
  async handleOptOut(
    organizationId: string,
    phone: string,
    source: string = 'sms_reply'
  ): Promise<void> {
    const normalizedPhone = this.normalizePhone(phone);

    await prisma.smsConsent.updateMany({
      where: {
        organizationId,
        phone: normalizedPhone,
        consentGiven: true,
      },
      data: {
        consentGiven: false,
        optedOutAt: new Date(),
        optOutSource: source,
      },
    });
  }

  /**
   * Get SMS send by ID
   */
  async getById(organizationId: string, smsSendId: string) {
    return prisma.smsSend.findFirst({
      where: { id: smsSendId, organizationId },
      include: {
        profile: true,
        events: true,
      },
    });
  }

  /**
   * Get SMS sends for a profile
   */
  async getByProfile(
    organizationId: string,
    profileId: string,
    options: {
      limit?: number;
      cursor?: string;
    } = {}
  ) {
    const limit = Math.min(options.limit || 50, 200);

    const sends = await prisma.smsSend.findMany({
      where: { organizationId, profileId },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { events: true },
    });

    let nextCursor: string | undefined;
    if (sends.length > limit) {
      const next = sends.pop();
      nextCursor = next?.id;
    }

    return { sends, nextCursor };
  }

  /**
   * Get SMS statistics for an organization
   */
  async getStats(
    organizationId: string,
    options: { after?: Date; before?: Date } = {}
  ): Promise<{
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    pending: number;
  }> {
    const where: Prisma.SmsSendWhereInput = {
      organizationId,
      ...(options.after && { createdAt: { gte: options.after } }),
      ...(options.before && { createdAt: { lte: options.before } }),
    };

    const [total, sent, delivered, failed, pending] = await Promise.all([
      prisma.smsSend.count({ where }),
      prisma.smsSend.count({ where: { ...where, status: 'sent' } }),
      prisma.smsSend.count({ where: { ...where, status: 'delivered' } }),
      prisma.smsSend.count({ where: { ...where, status: 'failed' } }),
      prisma.smsSend.count({ where: { ...where, status: 'queued' } }),
    ]);

    return { total, sent, delivered, failed, pending };
  }

  /**
   * Resolve profile ID and phone number from input
   */
  private async resolveProfileAndPhone(
    organizationId: string,
    input: SendSmsInput
  ): Promise<{ profileId: string | null; phone: string | null }> {
    let profileId: string | null = null;
    let phone: string | null = input.phone ? this.normalizePhone(input.phone) : null;

    // If profile ID provided, get profile
    if (input.profileId) {
      const profile = await profileService.getById(organizationId, input.profileId);
      if (profile) {
        profileId = profile.id;
        if (!phone && profile.phone) {
          phone = this.normalizePhone(profile.phone);
        }
      }
    }

    // If external ID provided, look up profile
    if (!profileId && input.externalId) {
      const profile = await profileService.getByExternalId(organizationId, input.externalId);
      if (profile) {
        profileId = profile.id;
        if (!phone && profile.phone) {
          phone = this.normalizePhone(profile.phone);
        }
      }
    }

    // If phone provided but no profile, try to find profile by phone
    if (!profileId && phone) {
      const profile = await prisma.profile.findFirst({
        where: { organizationId, phone },
      });
      if (profile) {
        profileId = profile.id;
      }
    }

    return { profileId, phone };
  }

  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhone(phone: string): string {
    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, '');

    // Ensure it starts with +
    if (!normalized.startsWith('+')) {
      // Assume US number if no country code
      if (normalized.length === 10) {
        normalized = '+1' + normalized;
      } else if (normalized.length === 11 && normalized.startsWith('1')) {
        normalized = '+' + normalized;
      } else {
        normalized = '+' + normalized;
      }
    }

    return normalized;
  }
}

export const smsService = new SmsService();

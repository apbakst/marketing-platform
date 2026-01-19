import { prisma, Campaign, Prisma } from '@marketing-platform/database';
import {
  CreateCampaignInput,
  UpdateCampaignInput,
  CampaignStatus,
  generateId,
  CACHE_KEYS,
  CACHE_TTL,
} from '@marketing-platform/shared';
import { redis } from '../lib/redis.js';

export class CampaignService {
  async create(
    organizationId: string,
    input: CreateCampaignInput
  ): Promise<Campaign> {
    const campaign = await prisma.campaign.create({
      data: {
        id: generateId('camp'),
        organizationId,
        name: input.name,
        subject: input.subject,
        previewText: input.previewText,
        fromName: input.fromName,
        fromEmail: input.fromEmail,
        replyTo: input.replyTo,
        templateId: input.templateId,
        htmlContent: input.htmlContent,
        textContent: input.textContent,
        type: input.type || 'regular',
        abTestConfig: input.abTestConfig as Prisma.JsonValue,
        segments: input.segmentIds
          ? {
              create: [
                ...input.segmentIds.map((segmentId) => ({
                  id: generateId('cs'),
                  segmentId,
                  isExcluded: false,
                })),
                ...(input.excludeSegmentIds || []).map((segmentId) => ({
                  id: generateId('cs'),
                  segmentId,
                  isExcluded: true,
                })),
              ],
            }
          : undefined,
      },
      include: {
        segments: {
          include: { segment: true },
        },
      },
    });

    return campaign;
  }

  async update(
    organizationId: string,
    campaignId: string,
    input: UpdateCampaignInput
  ): Promise<Campaign> {
    // First verify the campaign exists and is in draft status
    const existing = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
    });

    if (!existing) {
      throw new Error('Campaign not found');
    }

    if (existing.status !== 'draft') {
      throw new Error('Can only update campaigns in draft status');
    }

    const campaign = await prisma.campaign.update({
      where: {
        id: campaignId,
        organizationId,
      },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.subject !== undefined && { subject: input.subject }),
        ...(input.previewText !== undefined && { previewText: input.previewText }),
        ...(input.fromName !== undefined && { fromName: input.fromName }),
        ...(input.fromEmail !== undefined && { fromEmail: input.fromEmail }),
        ...(input.replyTo !== undefined && { replyTo: input.replyTo }),
        ...(input.templateId !== undefined && { templateId: input.templateId }),
        ...(input.htmlContent !== undefined && { htmlContent: input.htmlContent }),
        ...(input.textContent !== undefined && { textContent: input.textContent }),
        ...(input.abTestConfig !== undefined && {
          abTestConfig: input.abTestConfig as Prisma.JsonValue,
        }),
      },
      include: {
        segments: {
          include: { segment: true },
        },
      },
    });

    await redis.del(CACHE_KEYS.CAMPAIGN(campaignId));
    return campaign;
  }

  async getById(
    organizationId: string,
    campaignId: string
  ): Promise<Campaign | null> {
    const cacheKey = CACHE_KEYS.CAMPAIGN(campaignId);
    const cached = await redis.get(cacheKey);

    if (cached) {
      const campaign = JSON.parse(cached);
      if (campaign.organizationId === organizationId) {
        return campaign;
      }
    }

    const campaign = await prisma.campaign.findUnique({
      where: {
        id: campaignId,
        organizationId,
      },
      include: {
        segments: {
          include: { segment: true },
        },
      },
    });

    if (campaign) {
      await redis.setex(cacheKey, CACHE_TTL.CAMPAIGN, JSON.stringify(campaign));
    }

    return campaign;
  }

  async list(
    organizationId: string,
    options: {
      status?: CampaignStatus;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{ campaigns: Campaign[]; nextCursor?: string }> {
    const limit = Math.min(options.limit || 50, 200);

    const campaigns = await prisma.campaign.findMany({
      where: {
        organizationId,
        ...(options.status && { status: options.status }),
      },
      include: {
        segments: {
          include: { segment: true },
        },
      },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    let nextCursor: string | undefined;
    if (campaigns.length > limit) {
      const next = campaigns.pop();
      nextCursor = next?.id;
    }

    return { campaigns, nextCursor };
  }

  async delete(organizationId: string, campaignId: string): Promise<void> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status === 'sending' || campaign.status === 'sent') {
      throw new Error('Cannot delete a campaign that has been sent');
    }

    await prisma.campaign.delete({
      where: {
        id: campaignId,
        organizationId,
      },
    });

    await redis.del(CACHE_KEYS.CAMPAIGN(campaignId));
  }

  async schedule(
    organizationId: string,
    campaignId: string,
    scheduledAt: Date
  ): Promise<Campaign> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'draft') {
      throw new Error('Can only schedule campaigns in draft status');
    }

    if (scheduledAt <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'scheduled',
        scheduledAt,
      },
      include: {
        segments: {
          include: { segment: true },
        },
      },
    });

    await redis.del(CACHE_KEYS.CAMPAIGN(campaignId));
    return updated;
  }

  async cancel(organizationId: string, campaignId: string): Promise<Campaign> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'scheduled') {
      throw new Error('Can only cancel scheduled campaigns');
    }

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'cancelled',
        scheduledAt: null,
      },
      include: {
        segments: {
          include: { segment: true },
        },
      },
    });

    await redis.del(CACHE_KEYS.CAMPAIGN(campaignId));
    return updated;
  }

  async sendNow(organizationId: string, campaignId: string): Promise<Campaign> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      include: {
        segments: true,
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new Error('Can only send campaigns in draft or scheduled status');
    }

    // Update status to sending
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'sending',
        scheduledAt: null,
      },
      include: {
        segments: {
          include: { segment: true },
        },
      },
    });

    // TODO: Queue the actual email sending job
    // await emailQueue.add('send-campaign', { campaignId });

    await redis.del(CACHE_KEYS.CAMPAIGN(campaignId));
    return updated;
  }

  async getStats(
    organizationId: string,
    campaignId: string
  ): Promise<{
    totalRecipients: number;
    sent: number;
    delivered: number;
    opens: number;
    uniqueOpens: number;
    clicks: number;
    uniqueClicks: number;
    bounces: number;
    complaints: number;
    unsubscribes: number;
  }> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      select: {
        totalRecipients: true,
        sentCount: true,
        deliveredCount: true,
        openCount: true,
        clickCount: true,
        bounceCount: true,
        complaintCount: true,
        unsubscribeCount: true,
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get unique opens and clicks
    const [uniqueOpens, uniqueClicks] = await Promise.all([
      prisma.emailEvent.groupBy({
        by: ['profileId'],
        where: {
          emailSend: { campaignId },
          type: 'opened',
        },
        _count: true,
      }),
      prisma.emailEvent.groupBy({
        by: ['profileId'],
        where: {
          emailSend: { campaignId },
          type: 'clicked',
        },
        _count: true,
      }),
    ]);

    return {
      totalRecipients: campaign.totalRecipients,
      sent: campaign.sentCount,
      delivered: campaign.deliveredCount,
      opens: campaign.openCount,
      uniqueOpens: uniqueOpens.length,
      clicks: campaign.clickCount,
      uniqueClicks: uniqueClicks.length,
      bounces: campaign.bounceCount,
      complaints: campaign.complaintCount,
      unsubscribes: campaign.unsubscribeCount,
    };
  }
}

export const campaignService = new CampaignService();

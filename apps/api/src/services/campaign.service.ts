import { prisma, Campaign, Prisma } from '@marketing-platform/database';
import {
  CreateCampaignInput,
  UpdateCampaignInput,
  CampaignStatus,
  generateId,
  CACHE_KEYS,
  CACHE_TTL,
  QUEUE_NAMES,
} from '@marketing-platform/shared';
import { redis } from '../lib/redis.js';
import { Queue } from 'bullmq';
import { renderTemplate } from './template.service.js';
import { addEmailTracking, generateUnsubscribeUrl } from './email-tracking.service.js';
import { sendTimeOptimizationService } from './send-time-optimization.service.js';
import { checkEmailRateLimit } from '../middleware/rate-limit.js';

const emailSendQueue = new Queue(QUEUE_NAMES.EMAIL_SEND, {
  connection: redis as any,
});

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
        abTestConfig: input.abTestConfig as unknown as Prisma.InputJsonValue,
        sendTimeConfig: input.sendTimeOptimization as unknown as Prisma.InputJsonValue,
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

    const updateData: Prisma.CampaignUpdateInput = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.subject !== undefined) updateData.subject = input.subject;
    if (input.previewText !== undefined) updateData.previewText = input.previewText;
    if (input.fromName !== undefined) updateData.fromName = input.fromName;
    if (input.fromEmail !== undefined) updateData.fromEmail = input.fromEmail;
    if (input.replyTo !== undefined) updateData.replyTo = input.replyTo;
    if (input.templateId !== undefined) updateData.template = { connect: { id: input.templateId } };
    if (input.htmlContent !== undefined) updateData.htmlContent = input.htmlContent;
    if (input.textContent !== undefined) updateData.textContent = input.textContent;
    if (input.abTestConfig !== undefined) {
      updateData.abTestConfig = input.abTestConfig as unknown as Prisma.InputJsonValue;
    }
    if (input.sendTimeOptimization !== undefined) {
      updateData.sendTimeConfig = input.sendTimeOptimization as unknown as Prisma.InputJsonValue;
    }

    const campaign = await prisma.campaign.update({
      where: {
        id: campaignId,
        organizationId,
      },
      data: updateData,
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
        template: true,
        segments: {
          include: {
            segment: {
              include: {
                memberships: {
                  where: { exitedAt: null },
                  include: { profile: true },
                },
              },
            },
          },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new Error('Can only send campaigns in draft or scheduled status');
    }

    // Get template content
    const htmlContent = campaign.htmlContent || campaign.template?.htmlContent;
    const textContent = campaign.textContent || campaign.template?.textContent;

    if (!htmlContent) {
      throw new Error('Campaign has no email content');
    }

    // Get organization settings
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    const settings = (organization?.settings as Record<string, unknown>) || {};
    const baseUrl = (settings.trackingDomain as string) || process.env.API_URL || 'http://localhost:3001';

    // Collect unique recipients from all segments
    const profileMap = new Map<string, {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      properties: Record<string, unknown>;
    }>();

    for (const cs of campaign.segments) {
      if (cs.isExcluded) continue;
      for (const membership of cs.segment.memberships) {
        const profile = membership.profile;
        if (profile.email && !profileMap.has(profile.id)) {
          profileMap.set(profile.id, {
            id: profile.id,
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            properties: profile.properties as Record<string, unknown>,
          });
        }
      }
    }

    // Remove excluded segment members
    for (const cs of campaign.segments) {
      if (!cs.isExcluded) continue;
      for (const membership of cs.segment.memberships) {
        profileMap.delete(membership.profile.id);
      }
    }

    const recipients = Array.from(profileMap.values());

    if (recipients.length === 0) {
      throw new Error('No recipients found for campaign');
    }

    // Get suppression list
    const suppressions = await prisma.suppression.findMany({
      where: {
        organizationId,
        email: { in: recipients.map((r) => r.email) },
      },
      select: { email: true },
    });
    const suppressedEmails = new Set(suppressions.map((s) => s.email));

    // Filter out suppressed recipients
    const eligibleRecipients = recipients.filter(r => !suppressedEmails.has(r.email));

    // Check rate limits before sending
    const rateLimitCheck = await checkEmailRateLimit(organizationId, eligibleRecipients.length);
    if (!rateLimitCheck.allowed) {
      throw new Error(`Rate limit exceeded: ${rateLimitCheck.message}`);
    }

    // Handle A/B testing
    const isABTest = campaign.type === 'ab_test' && campaign.abTestConfig;
    const abConfig = campaign.abTestConfig as {
      variants: Array<{ id: string; name: string; subject?: string; previewText?: string; templateId?: string; weight: number }>;
      testSize: number;
      winnerCriteria: string;
      testDuration: number;
    } | null;

    let testRecipients: typeof eligibleRecipients = [];
    let holdoutRecipients: typeof eligibleRecipients = [];

    if (isABTest && abConfig) {
      // Split recipients into test and holdout groups
      const testCount = Math.ceil(eligibleRecipients.length * (abConfig.testSize / 100));
      const shuffled = [...eligibleRecipients].sort(() => Math.random() - 0.5);
      testRecipients = shuffled.slice(0, testCount);
      holdoutRecipients = shuffled.slice(testCount);
    }

    // Handle send time optimization
    const sendTimeConfig = campaign.sendTimeConfig as {
      enabled: boolean;
      maxDelayHours?: number;
      fallbackHour?: number;
    } | null;

    const useSendTimeOptimization = sendTimeConfig?.enabled ?? false;
    let sendTimesByProfile: Map<string, { optimalHour: number; confidence: number }> = new Map();
    let orgOptimalHour = sendTimeConfig?.fallbackHour ?? 10;

    if (useSendTimeOptimization) {
      // Get organization-wide optimal time as fallback
      const orgSendTime = await sendTimeOptimizationService.getOrganizationOptimalSendTime(organizationId);
      orgOptimalHour = sendTimeConfig?.fallbackHour ?? orgSendTime.hour;

      // Get optimal send times for all recipients
      const recipientIds = eligibleRecipients.map(r => r.id);
      const sendTimes = await sendTimeOptimizationService.getOptimalSendTimesBatch(recipientIds);

      for (const [profileId, data] of sendTimes) {
        sendTimesByProfile.set(profileId, {
          optimalHour: data.optimalHour,
          confidence: data.confidence,
        });
      }
    }

    // Helper function to calculate delay for send time optimization
    const calculateSendDelay = (profileId: string): number => {
      if (!useSendTimeOptimization) return 0;

      const maxDelayHours = sendTimeConfig?.maxDelayHours ?? 24;
      const profileSendTime = sendTimesByProfile.get(profileId);
      const optimalHour = profileSendTime?.optimalHour ?? orgOptimalHour;

      const now = new Date();
      const currentHour = now.getHours();

      let hoursUntilOptimal = optimalHour - currentHour;
      if (hoursUntilOptimal < 0) {
        hoursUntilOptimal += 24;
      }

      // Cap the delay at maxDelayHours
      if (hoursUntilOptimal > maxDelayHours) {
        hoursUntilOptimal = 0; // Send immediately if optimal time is too far away
      }

      // Convert to milliseconds and add some jitter (0-10 minutes) to spread load
      const jitterMs = Math.floor(Math.random() * 10 * 60 * 1000);
      return hoursUntilOptimal * 60 * 60 * 1000 + jitterMs;
    };

    // Update campaign status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'sending',
        scheduledAt: null,
        totalRecipients: eligibleRecipients.length,
      },
    });

    // Queue emails for each recipient
    const jobs: Array<{ name: string; data: Record<string, unknown>; opts?: { delay?: number } }> = [];
    const fromEmail = campaign.fromEmail || (settings.defaultFromEmail as string) || 'noreply@example.com';
    const fromName = campaign.fromName || (settings.defaultFromName as string) || organization?.name || '';

    // Get default provider first
    const defaultProvider = await prisma.emailProvider.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { priority: 'asc' },
    });

    if (!defaultProvider) {
      throw new Error('No active email provider configured');
    }

    // Helper function to select variant for A/B test
    type ABVariant = { id: string; name: string; subject?: string; previewText?: string; templateId?: string; weight: number };
    const selectVariant = (variants: ABVariant[]): ABVariant => {
      const totalWeight = variants.reduce((sum: number, v: ABVariant) => sum + v.weight, 0);
      let random = Math.random() * totalWeight;
      for (const variant of variants) {
        random -= variant.weight;
        if (random <= 0) return variant;
      }
      return variants[0];
    };

    // Determine which recipients to process
    const recipientsToProcess = isABTest && abConfig ? testRecipients : eligibleRecipients;

    for (const recipient of recipientsToProcess) {
      // Select variant for A/B test
      let variantId: string | null = null;
      let subjectToUse = campaign.subject;
      let previewTextToUse = campaign.previewText;
      let htmlToUse = htmlContent;
      let textToUse = textContent;

      if (isABTest && abConfig) {
        const variant = selectVariant(abConfig.variants);
        variantId = variant.id;

        if (variant.subject) subjectToUse = variant.subject;
        if (variant.previewText) previewTextToUse = variant.previewText;

        // Load variant template if specified
        if (variant.templateId) {
          const variantTemplate = await prisma.emailTemplate.findUnique({
            where: { id: variant.templateId },
          });
          if (variantTemplate) {
            htmlToUse = variantTemplate.htmlContent || htmlContent;
            textToUse = variantTemplate.textContent || textContent;
          }
        }
      }

      const templateVars = {
        profile: {
          email: recipient.email,
          firstName: recipient.firstName || '',
          lastName: recipient.lastName || '',
          ...recipient.properties,
        },
        campaign: {
          id: campaign.id,
          name: campaign.name,
        },
        organization: {
          name: organization?.name || '',
        },
      };

      const renderedSubject = renderTemplate(subjectToUse, templateVars);
      const renderedHtml = renderTemplate(htmlToUse, templateVars);
      const renderedText = textToUse ? renderTemplate(textToUse, templateVars) : undefined;

      const emailSendId = generateId('es');

      const trackingData = {
        emailSendId,
        profileId: recipient.id,
        organizationId,
        campaignId: campaign.id,
      };

      const { html: trackedHtml } = addEmailTracking(
        renderedHtml,
        renderedText,
        trackingData,
        baseUrl
      );

      const unsubscribeUrl = generateUnsubscribeUrl(trackingData, baseUrl);
      const finalHtml = trackedHtml.replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, unsubscribeUrl);

      await prisma.emailSend.create({
        data: {
          id: emailSendId,
          organizationId,
          profileId: recipient.id,
          campaignId: campaign.id,
          providerId: defaultProvider.id,
          toEmail: recipient.email,
          fromEmail: fromEmail,
          fromName: fromName,
          subject: renderedSubject,
          status: 'queued',
          metadata: variantId ? { variantId } as unknown as Prisma.InputJsonValue : undefined,
        },
      });

      // Calculate delay for send time optimization
      const delay = calculateSendDelay(recipient.id);

      jobs.push({
        name: `campaign-${campaignId}-${recipient.id}`,
        data: {
          emailSendId,
          organizationId,
          profileId: recipient.id,
          to: recipient.email,
          from: { email: fromEmail, name: fromName },
          replyTo: campaign.replyTo,
          subject: renderedSubject,
          html: finalHtml,
          text: renderedText,
          campaignId: campaign.id,
          variantId,
          tags: ['campaign', campaign.name],
        },
        ...(delay > 0 && { opts: { delay } }),
      });
    }

    // For A/B tests, store holdout recipients in abTestConfig for later winner send
    if (isABTest && abConfig && holdoutRecipients.length > 0) {
      const updatedAbConfig = {
        ...abConfig,
        holdoutRecipients: holdoutRecipients.map(r => r.id),
        testStartedAt: new Date().toISOString(),
      };
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          abTestConfig: updatedAbConfig as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Bulk add jobs to queue
    if (jobs.length > 0) {
      await emailSendQueue.addBulk(jobs);
    }

    const updated = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        segments: { include: { segment: true } },
      },
    });

    await redis.del(CACHE_KEYS.CAMPAIGN(campaignId));
    return updated!;
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
  async getABTestStats(
    organizationId: string,
    campaignId: string
  ): Promise<{
    variants: Array<{
      id: string;
      name: string;
      sent: number;
      delivered: number;
      opens: number;
      uniqueOpens: number;
      clicks: number;
      uniqueClicks: number;
      openRate: number;
      clickRate: number;
    }>;
    winner: string | null;
    testComplete: boolean;
    holdoutCount: number;
  }> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.type !== 'ab_test') {
      throw new Error('Campaign is not an A/B test');
    }

    const abConfig = campaign.abTestConfig as {
      variants: Array<{ id: string; name: string; weight: number }>;
      testSize: number;
      winnerCriteria: string;
      testDuration: number;
      holdoutRecipients?: string[];
      testStartedAt?: string;
      winnerId?: string;
    };

    const testStartedAt = abConfig.testStartedAt ? new Date(abConfig.testStartedAt) : null;
    const testDurationMs = abConfig.testDuration * 60 * 60 * 1000; // hours to ms
    const testComplete = testStartedAt ? Date.now() - testStartedAt.getTime() > testDurationMs : false;

    // Get stats for each variant
    const variantStats = await Promise.all(
      abConfig.variants.map(async (variant) => {
        const emailSends = await prisma.emailSend.findMany({
          where: {
            campaignId,
            metadata: { path: ['variantId'], equals: variant.id },
          },
          select: { id: true, status: true, profileId: true },
        });

        const emailSendIds = emailSends.map((e) => e.id);
        const sent = emailSends.length;
        const delivered = emailSends.filter((e) => e.status === 'delivered').length;

        const [opens, clicks, uniqueOpenProfiles, uniqueClickProfiles] = await Promise.all([
          prisma.emailEvent.count({
            where: { emailSendId: { in: emailSendIds }, type: 'opened' },
          }),
          prisma.emailEvent.count({
            where: { emailSendId: { in: emailSendIds }, type: 'clicked' },
          }),
          prisma.emailEvent.groupBy({
            by: ['profileId'],
            where: { emailSendId: { in: emailSendIds }, type: 'opened' },
          }),
          prisma.emailEvent.groupBy({
            by: ['profileId'],
            where: { emailSendId: { in: emailSendIds }, type: 'clicked' },
          }),
        ]);

        const uniqueOpens = uniqueOpenProfiles.length;
        const uniqueClicks = uniqueClickProfiles.length;
        const openRate = delivered > 0 ? (uniqueOpens / delivered) * 100 : 0;
        const clickRate = delivered > 0 ? (uniqueClicks / delivered) * 100 : 0;

        return {
          id: variant.id,
          name: variant.name,
          sent,
          delivered,
          opens,
          uniqueOpens,
          clicks,
          uniqueClicks,
          openRate,
          clickRate,
        };
      })
    );

    // Determine winner based on criteria
    let winner: string | null = abConfig.winnerId || null;
    if (!winner && testComplete && variantStats.some((v) => v.sent > 0)) {
      const metric = abConfig.winnerCriteria === 'click_rate' ? 'clickRate' : 'openRate';
      const sorted = [...variantStats].sort((a, b) => b[metric] - a[metric]);
      winner = sorted[0].id;
    }

    return {
      variants: variantStats,
      winner,
      testComplete,
      holdoutCount: abConfig.holdoutRecipients?.length || 0,
    };
  }

  async selectABTestWinner(
    organizationId: string,
    campaignId: string,
    winnerId: string
  ): Promise<Campaign> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, organizationId },
      include: {
        template: true,
        segments: {
          include: {
            segment: {
              include: {
                memberships: {
                  where: { exitedAt: null },
                  include: { profile: true },
                },
              },
            },
          },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.type !== 'ab_test') {
      throw new Error('Campaign is not an A/B test');
    }

    const abConfig = campaign.abTestConfig as {
      variants: Array<{ id: string; name: string; subject?: string; previewText?: string; templateId?: string; weight: number }>;
      testSize: number;
      winnerCriteria: string;
      testDuration: number;
      holdoutRecipients?: string[];
      testStartedAt?: string;
      winnerId?: string;
    } | null;

    if (!abConfig) {
      throw new Error('A/B test configuration not found');
    }

    const winnerVariant = abConfig.variants.find((v) => v.id === winnerId);
    if (!winnerVariant) {
      throw new Error('Invalid winner variant ID');
    }

    const holdoutProfileIds = abConfig.holdoutRecipients || [];

    if (holdoutProfileIds.length === 0) {
      // No holdout recipients, just mark the winner
      return prisma.campaign.update({
        where: { id: campaignId },
        data: {
          abTestConfig: {
            ...abConfig,
            winnerId,
            winnerSelectedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
        },
        include: { segments: { include: { segment: true } } },
      });
    }

    // Get holdout profiles
    const holdoutProfiles = await prisma.profile.findMany({
      where: { id: { in: holdoutProfileIds } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        properties: true,
      },
    });

    // Check rate limits before sending to holdout recipients
    const rateLimitCheck = await checkEmailRateLimit(organizationId, holdoutProfiles.length);
    if (!rateLimitCheck.allowed) {
      throw new Error(`Rate limit exceeded: ${rateLimitCheck.message}`);
    }

    // Get organization settings
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    const settings = (organization?.settings as Record<string, unknown>) || {};
    const baseUrl = (settings.trackingDomain as string) || process.env.API_URL || 'http://localhost:3001';

    // Get winner template content
    let htmlContent = campaign.htmlContent || campaign.template?.htmlContent || '';
    let textContent = campaign.textContent || campaign.template?.textContent;

    if (winnerVariant.templateId) {
      const variantTemplate = await prisma.emailTemplate.findUnique({
        where: { id: winnerVariant.templateId },
      });
      if (variantTemplate && variantTemplate.htmlContent) {
        htmlContent = variantTemplate.htmlContent;
        textContent = variantTemplate.textContent;
      }
    }

    const subjectToUse = winnerVariant.subject || campaign.subject;
    const fromEmail = campaign.fromEmail || (settings.defaultFromEmail as string) || 'noreply@example.com';
    const fromName = campaign.fromName || (settings.defaultFromName as string) || organization?.name || '';

    const defaultProvider = await prisma.emailProvider.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { priority: 'asc' },
    });

    if (!defaultProvider) {
      throw new Error('No active email provider configured');
    }

    const jobs: Array<{ name: string; data: Record<string, unknown> }> = [];

    for (const profile of holdoutProfiles) {
      if (!profile.email) continue;

      const templateVars = {
        profile: {
          email: profile.email,
          firstName: profile.firstName || '',
          lastName: profile.lastName || '',
          ...(profile.properties as Record<string, unknown>),
        },
        campaign: {
          id: campaign.id,
          name: campaign.name,
        },
        organization: {
          name: organization?.name || '',
        },
      };

      const renderedSubject = renderTemplate(subjectToUse, templateVars);
      const renderedHtml = renderTemplate(htmlContent, templateVars);
      const renderedText = textContent ? renderTemplate(textContent, templateVars) : undefined;

      const emailSendId = generateId('es');

      const trackingData = {
        emailSendId,
        profileId: profile.id,
        organizationId,
        campaignId: campaign.id,
      };

      const { html: trackedHtml } = addEmailTracking(
        renderedHtml,
        renderedText,
        trackingData,
        baseUrl
      );

      const unsubscribeUrl = generateUnsubscribeUrl(trackingData, baseUrl);
      const finalHtml = trackedHtml.replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, unsubscribeUrl);

      await prisma.emailSend.create({
        data: {
          id: emailSendId,
          organizationId,
          profileId: profile.id,
          campaignId: campaign.id,
          providerId: defaultProvider.id,
          toEmail: profile.email,
          fromEmail: fromEmail,
          fromName: fromName,
          subject: renderedSubject,
          status: 'queued',
          metadata: { variantId: winnerId, isWinnerSend: true } as unknown as Prisma.InputJsonValue,
        },
      });

      jobs.push({
        name: `campaign-${campaignId}-winner-${profile.id}`,
        data: {
          emailSendId,
          organizationId,
          profileId: profile.id,
          to: profile.email,
          from: { email: fromEmail, name: fromName },
          replyTo: campaign.replyTo,
          subject: renderedSubject,
          html: finalHtml,
          text: renderedText,
          campaignId: campaign.id,
          variantId: winnerId,
          tags: ['campaign', campaign.name, 'winner'],
        },
      });
    }

    if (jobs.length > 0) {
      await emailSendQueue.addBulk(jobs);
    }

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        abTestConfig: {
          ...abConfig,
          winnerId,
          winnerSelectedAt: new Date().toISOString(),
          winnerSentCount: jobs.length,
        } as unknown as Prisma.InputJsonValue,
      },
      include: { segments: { include: { segment: true } } },
    });

    await redis.del(CACHE_KEYS.CAMPAIGN(campaignId));
    return updated;
  }
}

export const campaignService = new CampaignService();

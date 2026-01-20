import { prisma, Prisma } from '@marketing-platform/database';
import { QUEUE_NAMES, generateId } from '@marketing-platform/shared';
import { Queue } from 'bullmq';
import { connection } from '../lib/redis.js';

const emailSendQueue = new Queue(QUEUE_NAMES.EMAIL_SEND, {
  connection: connection as any,
});

interface TemplateVars {
  profile: {
    email: string;
    firstName: string;
    lastName: string;
    [key: string]: unknown;
  };
  campaign: {
    id: string;
    name: string;
  };
  organization: {
    name: string;
  };
  [key: string]: unknown;
}

function renderTemplate(template: string, vars: TemplateVars): string {
  if (!template) return '';

  let result = template;

  // Simple variable replacement: {{ variable }} or {{variable}}
  const varPattern = /\{\{\s*([^#/}][^}]*?)\s*\}\}/g;

  result = result.replace(varPattern, (_, path) => {
    const value = getNestedValue(vars, path.trim());
    if (value === null || value === undefined) return '';
    return String(value);
  });

  return result;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

function encodeTrackingToken(data: Record<string, string>): string {
  // Simple base64 encoding - in production use encryption
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function addEmailTracking(
  html: string,
  trackingData: Record<string, string>,
  baseUrl: string
): string {
  const token = encodeTrackingToken(trackingData);

  // Add open tracking pixel
  const trackingPixel = `<img src="${baseUrl}/t/o/${token}" width="1" height="1" alt="" style="display:none;" />`;

  // Insert pixel before closing body tag
  let result = html;
  if (result.includes('</body>')) {
    result = result.replace('</body>', `${trackingPixel}</body>`);
  } else {
    result += trackingPixel;
  }

  // Wrap links for click tracking
  const linkPattern = /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi;
  result = result.replace(linkPattern, (match, before, url, after) => {
    // Skip mailto, tel, and tracking links
    if (url.startsWith('mailto:') || url.startsWith('tel:') || url.includes('/t/c/')) {
      return match;
    }
    const encodedUrl = encodeURIComponent(url);
    const trackedUrl = `${baseUrl}/t/c/${token}?url=${encodedUrl}`;
    return `<a ${before}href="${trackedUrl}"${after}>`;
  });

  return result;
}

function generateUnsubscribeUrl(trackingData: Record<string, string>, baseUrl: string): string {
  const token = encodeTrackingToken(trackingData);
  return `${baseUrl}/unsubscribe/${token}`;
}

export async function sendCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      organization: true,
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
    throw new Error(`Campaign ${campaignId} not found`);
  }

  const organizationId = campaign.organizationId;

  // Get template content
  const htmlContent = campaign.htmlContent || campaign.template?.htmlContent;
  const textContent = campaign.textContent || campaign.template?.textContent;

  if (!htmlContent) {
    throw new Error('Campaign has no email content');
  }

  // Get organization settings
  const settings = (campaign.organization?.settings as Record<string, unknown>) || {};
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
    console.log(`Campaign ${campaignId} has no recipients, marking as sent`);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        totalRecipients: 0,
      },
    });
    return;
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

  // Update campaign with recipient count
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      totalRecipients: recipients.length,
    },
  });

  // Get default email provider
  const defaultProvider = await prisma.emailProvider.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { priority: 'asc' },
  });

  if (!defaultProvider) {
    throw new Error('No active email provider configured');
  }

  // Queue emails for each recipient
  const jobs: Array<{ name: string; data: Record<string, unknown> }> = [];
  const fromEmail = campaign.fromEmail || (settings.defaultFromEmail as string) || 'noreply@example.com';
  const fromName = campaign.fromName || (settings.defaultFromName as string) || campaign.organization?.name || '';

  for (const recipient of recipients) {
    if (suppressedEmails.has(recipient.email)) {
      continue;
    }

    const templateVars: TemplateVars = {
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
        name: campaign.organization?.name || '',
      },
    };

    const renderedSubject = renderTemplate(campaign.subject, templateVars);
    const renderedHtml = renderTemplate(htmlContent, templateVars);
    const renderedText = textContent ? renderTemplate(textContent, templateVars) : undefined;

    const emailSendId = generateId('es');

    const trackingData = {
      emailSendId,
      profileId: recipient.id,
      organizationId,
      campaignId: campaign.id,
    };

    const trackedHtml = addEmailTracking(renderedHtml, trackingData, baseUrl);
    const unsubscribeUrl = generateUnsubscribeUrl(trackingData, baseUrl);
    const finalHtml = trackedHtml.replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, unsubscribeUrl);

    // Create email send record
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
      },
    });

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
        tags: ['campaign', campaign.name],
      },
    });
  }

  // Bulk add jobs to queue
  if (jobs.length > 0) {
    await emailSendQueue.addBulk(jobs);
    console.log(`Queued ${jobs.length} emails for campaign ${campaignId}`);
  }

  // Update campaign status to sent (individual email tracking will update stats)
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'sent',
      sentAt: new Date(),
    },
  });

  console.log(`Campaign ${campaignId} sent to ${jobs.length} recipients`);
}

export async function closeEmailSendQueue(): Promise<void> {
  await emailSendQueue.close();
}

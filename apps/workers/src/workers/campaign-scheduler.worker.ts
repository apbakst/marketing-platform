import { prisma } from '@marketing-platform/database';
import { sendCampaign } from '../services/campaign-sender.js';

// This worker polls for scheduled campaigns and triggers sending them

const POLL_INTERVAL = 60000; // 1 minute

let isRunning = false;
let pollTimer: NodeJS.Timeout | null = null;

async function processScheduledCampaigns(): Promise<void> {
  const now = new Date();

  // Find campaigns that are scheduled and due
  const dueCampaigns = await prisma.campaign.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: {
        lte: now,
      },
    },
  });

  if (dueCampaigns.length === 0) {
    return;
  }

  console.log(`Found ${dueCampaigns.length} campaigns due for sending`);

  for (const campaign of dueCampaigns) {
    try {
      console.log(`Processing scheduled campaign: ${campaign.id} (${campaign.name})`);

      // Update status to 'sending' to prevent duplicate processing
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'sending' },
      });

      // Send the campaign
      await sendCampaign(campaign.id);

      console.log(`Campaign ${campaign.id} sent successfully`);
    } catch (error) {
      console.error(`Error processing campaign ${campaign.id}:`, error);

      // Reset to scheduled status so it can be retried
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'scheduled' },
      });
    }
  }
}

async function pollLoop(): Promise<void> {
  if (!isRunning) return;

  try {
    await processScheduledCampaigns();
  } catch (error) {
    console.error('Error in scheduler poll loop:', error);
  }

  // Schedule next poll
  if (isRunning) {
    pollTimer = setTimeout(pollLoop, POLL_INTERVAL);
  }
}

export function startCampaignScheduler(): void {
  if (isRunning) {
    console.warn('Campaign scheduler is already running');
    return;
  }

  isRunning = true;
  console.log('Campaign scheduler started');
  console.log(`Polling interval: ${POLL_INTERVAL / 1000} seconds`);

  // Start polling immediately
  pollLoop();
}

export function stopCampaignScheduler(): void {
  isRunning = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  console.log('Campaign scheduler stopped');
}

export async function closeCampaignScheduler(): Promise<void> {
  stopCampaignScheduler();
}

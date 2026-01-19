export { prisma, PrismaClient } from './client.js';
export type { Prisma } from './client.js';

// Re-export generated types for convenience
export type {
  Organization,
  ApiKey,
  Profile,
  Event,
  Segment,
  SegmentMembership,
  EmailTemplate,
  Campaign,
  CampaignSegment,
  Flow,
  FlowEnrollment,
  EmailProvider,
  EmailSend,
  EmailEvent,
  Suppression,
} from '@prisma/client';

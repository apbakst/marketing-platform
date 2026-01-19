export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
export type CampaignType = 'regular' | 'ab_test';

export interface ABTestVariant {
  id: string;
  name: string;
  subject?: string;
  previewText?: string;
  templateId?: string;
  weight: number;
}

export interface ABTestConfig {
  variants: ABTestVariant[];
  testSize: number;
  winnerCriteria: 'open_rate' | 'click_rate' | 'conversion_rate';
  testDuration: number;
}

export interface Campaign {
  id: string;
  organizationId: string;
  name: string;
  subject: string;
  previewText?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  templateId?: string;
  htmlContent?: string;
  textContent?: string;
  segmentIds: string[];
  excludeSegmentIds: string[];
  status: CampaignStatus;
  type: CampaignType;
  abTestConfig?: ABTestConfig;
  scheduledAt?: Date;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCampaignInput {
  name: string;
  subject: string;
  previewText?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  templateId?: string;
  htmlContent?: string;
  textContent?: string;
  segmentIds?: string[];
  excludeSegmentIds?: string[];
  type?: CampaignType;
  abTestConfig?: ABTestConfig;
}

export interface UpdateCampaignInput {
  name?: string;
  subject?: string;
  previewText?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  templateId?: string;
  htmlContent?: string;
  textContent?: string;
  segmentIds?: string[];
  excludeSegmentIds?: string[];
  abTestConfig?: ABTestConfig;
}

export interface CampaignStats {
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
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

export interface Event {
  id: string;
  organizationId: string;
  profileId: string;
  name: string;
  properties: Record<string, unknown>;
  timestamp: Date;
  source: string;
  createdAt: Date;
}

export interface TrackEventInput {
  profileId?: string;
  email?: string;
  externalId?: string;
  name: string;
  properties?: Record<string, unknown>;
  timestamp?: string | Date;
}

export interface BatchTrackInput {
  events: TrackEventInput[];
}

export interface IdentifyInput {
  profileId?: string;
  email?: string;
  externalId?: string;
  properties?: Record<string, unknown>;
  traits?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    [key: string]: unknown;
  };
}

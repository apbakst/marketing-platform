export interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: OrganizationSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationSettings {
  timezone: string;
  defaultFromName?: string;
  defaultFromEmail?: string;
  defaultReplyTo?: string;
  trackingDomain?: string;
  unsubscribeUrl?: string;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  settings?: Partial<OrganizationSettings>;
}

export interface UpdateOrganizationInput {
  name?: string;
  settings?: Partial<OrganizationSettings>;
}

export type ApiKeyType = 'public' | 'secret';

export interface ApiKey {
  id: string;
  organizationId: string;
  name: string;
  type: ApiKeyType;
  keyPrefix: string;
  keyHash: string;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export interface CreateApiKeyInput {
  name: string;
  type: ApiKeyType;
  expiresAt?: Date;
}

export interface ApiKeyWithSecret extends ApiKey {
  key: string;
}

export interface Profile {
  id: string;
  organizationId: string;
  externalId?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  properties: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProfileInput {
  externalId?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  properties?: Record<string, unknown>;
}

export interface UpdateProfileInput {
  externalId?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  properties?: Record<string, unknown>;
}

export interface ProfileSearchParams {
  email?: string;
  externalId?: string;
  phone?: string;
  limit?: number;
  cursor?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

class ApiClient {
  private baseUrl: string;
  private apiKey: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;

    let url = `${this.baseUrl}${endpoint}`;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: 'An error occurred',
      }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Profiles
  async getProfiles(params?: { email?: string; limit?: number; cursor?: string }) {
    return this.request<{
      profiles: any[];
      nextCursor?: string;
    }>('/api/v1/profiles', { params });
  }

  async getProfile(id: string) {
    return this.request<{ profile: any }>(`/api/v1/profiles/${id}`);
  }

  async createProfile(data: {
    email?: string;
    externalId?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    properties?: Record<string, unknown>;
  }) {
    return this.request<{ profile: any }>('/api/v1/profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProfile(
    id: string,
    data: {
      email?: string;
      externalId?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      properties?: Record<string, unknown>;
    }
  ) {
    return this.request<{ profile: any }>(`/api/v1/profiles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProfile(id: string) {
    return this.request<void>(`/api/v1/profiles/${id}`, {
      method: 'DELETE',
    });
  }

  // Segments
  async getSegments(params?: { isActive?: boolean; limit?: number; cursor?: string }) {
    return this.request<{
      segments: any[];
      nextCursor?: string;
    }>('/api/v1/segments', { params });
  }

  async getSegment(id: string) {
    return this.request<{ segment: any }>(`/api/v1/segments/${id}`);
  }

  async createSegment(data: {
    name: string;
    description?: string;
    conditions: any;
  }) {
    return this.request<{ segment: any }>('/api/v1/segments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSegment(
    id: string,
    data: {
      name?: string;
      description?: string;
      conditions?: any;
      isActive?: boolean;
    }
  ) {
    return this.request<{ segment: any }>(`/api/v1/segments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSegment(id: string) {
    return this.request<void>(`/api/v1/segments/${id}`, {
      method: 'DELETE',
    });
  }

  async getSegmentMembers(id: string, params?: { limit?: number; cursor?: string }) {
    return this.request<{
      profiles: any[];
      nextCursor?: string;
    }>(`/api/v1/segments/${id}/members`, { params });
  }

  // Campaigns
  async getCampaigns(params?: { status?: string; limit?: number; cursor?: string }) {
    return this.request<{
      campaigns: any[];
      nextCursor?: string;
    }>('/api/v1/campaigns', { params });
  }

  async getCampaign(id: string) {
    return this.request<{ campaign: any }>(`/api/v1/campaigns/${id}`);
  }

  async createCampaign(data: {
    name: string;
    subject: string;
    previewText?: string;
    fromName: string;
    fromEmail: string;
    replyTo?: string;
    htmlContent?: string;
    textContent?: string;
    segmentIds?: string[];
    excludeSegmentIds?: string[];
  }) {
    return this.request<{ campaign: any }>('/api/v1/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCampaign(id: string, data: Record<string, unknown>) {
    return this.request<{ campaign: any }>(`/api/v1/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCampaign(id: string) {
    return this.request<void>(`/api/v1/campaigns/${id}`, {
      method: 'DELETE',
    });
  }

  async scheduleCampaign(id: string, scheduledAt: string) {
    return this.request<{ campaign: any }>(`/api/v1/campaigns/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ scheduledAt }),
    });
  }

  async sendCampaign(id: string) {
    return this.request<{ campaign: any }>(`/api/v1/campaigns/${id}/send`, {
      method: 'POST',
    });
  }

  async cancelCampaign(id: string) {
    return this.request<{ campaign: any }>(`/api/v1/campaigns/${id}/cancel`, {
      method: 'POST',
    });
  }

  async getCampaignStats(id: string) {
    return this.request<{ stats: any }>(`/api/v1/campaigns/${id}/stats`);
  }

  // Tracking
  async track(data: {
    email?: string;
    externalId?: string;
    profileId?: string;
    name: string;
    properties?: Record<string, unknown>;
    timestamp?: string;
  }) {
    return this.request<{ success: boolean; eventId: string }>('/api/v1/track', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async identify(data: {
    email?: string;
    externalId?: string;
    profileId?: string;
    properties?: Record<string, unknown>;
    traits?: Record<string, unknown>;
  }) {
    return this.request<{ success: boolean; profileId: string; created: boolean }>(
      '/api/v1/identify',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }
}

export const api = new ApiClient(API_BASE_URL);

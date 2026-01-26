/**
 * Klaviyo Email Provider
 * 
 * Integrates with Klaviyo's API for sending transactional and marketing emails,
 * managing profiles, lists, campaigns, and flows.
 */

import { EmailProvider, EmailMessage, SendResult, ProviderStatus } from './base.js';

export interface KlaviyoConfig {
  apiKey: string;
  revision?: string;
  baseUrl?: string;
}

interface KlaviyoAPIResponse<T> {
  data: T;
}

interface KlaviyoAPIError {
  errors: Array<{
    id: string;
    status: number;
    code: string;
    title: string;
    detail: string;
  }>;
}

interface KlaviyoProfile {
  type: 'profile';
  id?: string;
  attributes: {
    email?: string;
    phone_number?: string;
    external_id?: string;
    first_name?: string;
    last_name?: string;
    properties?: Record<string, unknown>;
    location?: {
      city?: string;
      region?: string;
      country?: string;
      zip?: string;
    };
  };
}

interface KlaviyoEvent {
  data: {
    type: 'event';
    attributes: {
      metric: {
        data: {
          type: 'metric';
          attributes: {
            name: string;
          };
        };
      };
      profile: {
        data: {
          type: 'profile';
          attributes: {
            email?: string;
            phone_number?: string;
            external_id?: string;
          };
        };
      };
      properties?: Record<string, unknown>;
      value?: number;
      unique_id?: string;
      time?: string;
    };
  };
}

interface KlaviyoList {
  type: 'list';
  id: string;
  attributes: {
    name: string;
  };
}

export class KlaviyoProvider extends EmailProvider {
  readonly name = 'Klaviyo';
  readonly type = 'klaviyo';

  private readonly apiKey: string;
  private readonly revision: string;
  private readonly baseUrl: string;

  constructor(config: KlaviyoConfig) {
    super();
    this.apiKey = config.apiKey;
    this.revision = config.revision || '2024-02-15';
    this.baseUrl = config.baseUrl || 'https://a.klaviyo.com';
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Klaviyo-API-Key ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'revision': this.revision,
    };
  }

  /**
   * Send a transactional email via Klaviyo
   * Note: Klaviyo primarily uses templates, so we create/use a template approach
   */
  async send(message: EmailMessage): Promise<SendResult> {
    try {
      // For transactional emails, we use Klaviyo's event-based approach
      // which triggers a flow or uses their template system
      const response = await this.createEvent({
        eventName: 'Transactional Email',
        email: message.to,
        properties: {
          subject: message.subject,
          html_content: message.html,
          text_content: message.text,
          from_email: message.from.email,
          from_name: message.from.name,
          reply_to: message.replyTo,
          tags: message.tags,
          ...message.metadata,
        },
      });

      if (response.success) {
        return {
          success: true,
          messageId: response.eventId,
        };
      }

      return {
        success: false,
        error: response.error || 'Failed to send email via Klaviyo',
        errorCode: response.errorCode,
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
        errorCode: 'KLAVIYO_ERROR',
      };
    }
  }

  /**
   * Check the health of the Klaviyo API connection
   */
  async checkHealth(): Promise<ProviderStatus> {
    const start = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/api/metrics/`, {
        method: 'GET',
        headers: this.headers,
      });

      if (response.ok) {
        return {
          healthy: true,
          latency: Date.now() - start,
        };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        healthy: false,
        error: errorData.errors?.[0]?.detail || 'API check failed',
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        healthy: false,
        error: (error as Error).message,
        latency: Date.now() - start,
      };
    }
  }

  // ========================================
  // Profile Management
  // ========================================

  /**
   * Create or update a profile in Klaviyo
   */
  async upsertProfile(profile: {
    email?: string;
    phoneNumber?: string;
    externalId?: string;
    firstName?: string;
    lastName?: string;
    properties?: Record<string, unknown>;
    location?: {
      city?: string;
      region?: string;
      country?: string;
      zip?: string;
    };
  }): Promise<{ success: boolean; profileId?: string; error?: string }> {
    try {
      const payload = {
        data: {
          type: 'profile',
          attributes: {
            email: profile.email,
            phone_number: profile.phoneNumber,
            external_id: profile.externalId,
            first_name: profile.firstName,
            last_name: profile.lastName,
            properties: profile.properties,
            location: profile.location ? {
              city: profile.location.city,
              region: profile.location.region,
              country: profile.location.country,
              zip: profile.location.zip,
            } : undefined,
          },
        },
      };

      const response = await fetch(`${this.baseUrl}/api/profiles/`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (response.status === 201 || response.status === 200) {
        const data = await response.json() as KlaviyoAPIResponse<KlaviyoProfile>;
        return {
          success: true,
          profileId: data.data.id,
        };
      }

      // Handle duplicate - try to merge
      if (response.status === 409) {
        // Profile exists, try to get and merge
        const existingProfile = await this.getProfileByEmail(profile.email!);
        if (existingProfile) {
          return await this.updateProfile(existingProfile.id!, profile);
        }
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to create profile',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get a profile by email address
   */
  async getProfileByEmail(email: string): Promise<KlaviyoProfile | null> {
    try {
      const filter = encodeURIComponent(`equals(email,"${email}")`);
      const response = await fetch(
        `${this.baseUrl}/api/profiles/?filter=${filter}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      if (response.ok) {
        const data = await response.json() as { data: KlaviyoProfile[] };
        return data.data[0] || null;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Update an existing profile
   */
  async updateProfile(
    profileId: string,
    updates: Partial<{
      email: string;
      phoneNumber: string;
      firstName: string;
      lastName: string;
      properties: Record<string, unknown>;
      location: {
        city?: string;
        region?: string;
        country?: string;
        zip?: string;
      };
    }>
  ): Promise<{ success: boolean; profileId?: string; error?: string }> {
    try {
      const payload = {
        data: {
          type: 'profile',
          id: profileId,
          attributes: {
            email: updates.email,
            phone_number: updates.phoneNumber,
            first_name: updates.firstName,
            last_name: updates.lastName,
            properties: updates.properties,
            location: updates.location,
          },
        },
      };

      const response = await fetch(`${this.baseUrl}/api/profiles/${profileId}/`, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json() as KlaviyoAPIResponse<KlaviyoProfile>;
        return {
          success: true,
          profileId: data.data.id,
        };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to update profile',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // ========================================
  // List Management
  // ========================================

  /**
   * Get all lists
   */
  async getLists(): Promise<{ success: boolean; lists?: KlaviyoList[]; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/lists/`, {
        method: 'GET',
        headers: this.headers,
      });

      if (response.ok) {
        const data = await response.json() as { data: KlaviyoList[] };
        return {
          success: true,
          lists: data.data,
        };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to get lists',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Create a new list
   */
  async createList(name: string): Promise<{ success: boolean; listId?: string; error?: string }> {
    try {
      const payload = {
        data: {
          type: 'list',
          attributes: {
            name,
          },
        },
      };

      const response = await fetch(`${this.baseUrl}/api/lists/`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (response.status === 201) {
        const data = await response.json() as KlaviyoAPIResponse<KlaviyoList>;
        return {
          success: true,
          listId: data.data.id,
        };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to create list',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Add profiles to a list
   */
  async addToList(
    listId: string,
    profiles: Array<{ email?: string; phoneNumber?: string; externalId?: string }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = {
        data: profiles.map(profile => ({
          type: 'profile',
          attributes: {
            email: profile.email,
            phone_number: profile.phoneNumber,
            external_id: profile.externalId,
          },
        })),
      };

      const response = await fetch(
        `${this.baseUrl}/api/lists/${listId}/relationships/profiles/`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(payload),
        }
      );

      if (response.status === 204 || response.status === 202) {
        return { success: true };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to add profiles to list',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Remove profiles from a list
   */
  async removeFromList(
    listId: string,
    profileIds: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = {
        data: profileIds.map(id => ({
          type: 'profile',
          id,
        })),
      };

      const response = await fetch(
        `${this.baseUrl}/api/lists/${listId}/relationships/profiles/`,
        {
          method: 'DELETE',
          headers: this.headers,
          body: JSON.stringify(payload),
        }
      );

      if (response.status === 204) {
        return { success: true };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to remove profiles from list',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // ========================================
  // Event Tracking
  // ========================================

  /**
   * Create an event (used for triggering flows)
   */
  async createEvent(options: {
    eventName: string;
    email?: string;
    phoneNumber?: string;
    externalId?: string;
    properties?: Record<string, unknown>;
    value?: number;
    uniqueId?: string;
    time?: string;
  }): Promise<{ success: boolean; eventId?: string; error?: string; errorCode?: string }> {
    try {
      const payload: KlaviyoEvent = {
        data: {
          type: 'event',
          attributes: {
            metric: {
              data: {
                type: 'metric',
                attributes: {
                  name: options.eventName,
                },
              },
            },
            profile: {
              data: {
                type: 'profile',
                attributes: {
                  email: options.email,
                  phone_number: options.phoneNumber,
                  external_id: options.externalId,
                },
              },
            },
            properties: options.properties,
            value: options.value,
            unique_id: options.uniqueId,
            time: options.time || new Date().toISOString(),
          },
        },
      };

      const response = await fetch(`${this.baseUrl}/api/events/`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (response.status === 202 || response.status === 201) {
        return {
          success: true,
          eventId: `klaviyo_event_${Date.now()}`,
        };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      const firstError = errorData.errors?.[0];
      return {
        success: false,
        error: firstError?.detail || 'Failed to create event',
        errorCode: firstError?.code,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        errorCode: 'KLAVIYO_NETWORK_ERROR',
      };
    }
  }

  // ========================================
  // Campaign Management
  // ========================================

  /**
   * Create a campaign
   */
  async createCampaign(options: {
    name: string;
    listIds: string[];
    excludeListIds?: string[];
    subject: string;
    previewText?: string;
    fromEmail: string;
    fromName: string;
    replyToEmail?: string;
    templateId?: string;
    htmlContent?: string;
    trackOpens?: boolean;
    trackClicks?: boolean;
    useSmartSending?: boolean;
  }): Promise<{ success: boolean; campaignId?: string; error?: string }> {
    try {
      // Step 1: Create the campaign
      const campaignPayload = {
        data: {
          type: 'campaign',
          attributes: {
            name: options.name,
            audiences: {
              included: options.listIds,
              excluded: options.excludeListIds || [],
            },
            send_options: {
              use_smart_sending: options.useSmartSending ?? true,
            },
            tracking_options: {
              is_tracking_opens: options.trackOpens ?? true,
              is_tracking_clicks: options.trackClicks ?? true,
            },
          },
        },
      };

      const campaignResponse = await fetch(`${this.baseUrl}/api/campaigns/`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(campaignPayload),
      });

      if (campaignResponse.status !== 201) {
        const errorData = await campaignResponse.json() as KlaviyoAPIError;
        return {
          success: false,
          error: errorData.errors?.[0]?.detail || 'Failed to create campaign',
        };
      }

      const campaignData = await campaignResponse.json() as KlaviyoAPIResponse<{ type: string; id: string }>;
      const campaignId = campaignData.data.id;

      // Step 2: Create the campaign message
      const messagePayload = {
        data: {
          type: 'campaign-message',
          attributes: {
            channel: 'email',
            label: 'Primary Message',
            content: {
              subject: options.subject,
              preview_text: options.previewText,
              from_email: options.fromEmail,
              from_label: options.fromName,
              reply_to_email: options.replyToEmail,
            },
          },
          relationships: options.templateId ? {
            template: {
              data: {
                type: 'template',
                id: options.templateId,
              },
            },
          } : undefined,
        },
      };

      const messageResponse = await fetch(
        `${this.baseUrl}/api/campaign-messages/`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            ...messagePayload,
            data: {
              ...messagePayload.data,
              relationships: {
                ...messagePayload.data.relationships,
                campaign: {
                  data: {
                    type: 'campaign',
                    id: campaignId,
                  },
                },
              },
            },
          }),
        }
      );

      if (messageResponse.status !== 201) {
        // Campaign created but message failed - still return campaign ID
        console.error('Failed to create campaign message');
      }

      return {
        success: true,
        campaignId,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Schedule a campaign to send
   */
  async scheduleCampaign(
    campaignId: string,
    sendAt: Date,
    options?: { isLocal?: boolean; useSmartSendTime?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = {
        data: {
          type: 'campaign-send-job',
          attributes: {
            send_strategy: options?.useSmartSendTime
              ? { method: 'smart_send_time' }
              : {
                  method: 'static',
                  options_static: {
                    datetime: sendAt.toISOString(),
                    is_local: options?.isLocal ?? false,
                    send_past_recipients_immediately: false,
                  },
                },
          },
          relationships: {
            campaign: {
              data: {
                type: 'campaign',
                id: campaignId,
              },
            },
          },
        },
      };

      const response = await fetch(`${this.baseUrl}/api/campaign-send-jobs/`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (response.status === 202 || response.status === 201) {
        return { success: true };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to schedule campaign',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Send a campaign immediately
   */
  async sendCampaignNow(campaignId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = {
        data: {
          type: 'campaign-send-job',
          attributes: {
            send_strategy: {
              method: 'immediate',
            },
          },
          relationships: {
            campaign: {
              data: {
                type: 'campaign',
                id: campaignId,
              },
            },
          },
        },
      };

      const response = await fetch(`${this.baseUrl}/api/campaign-send-jobs/`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (response.status === 202 || response.status === 201) {
        return { success: true };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to send campaign',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // ========================================
  // Flow Management
  // ========================================

  /**
   * Get all flows
   */
  async getFlows(): Promise<{
    success: boolean;
    flows?: Array<{ id: string; name: string; status: string }>;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/flows/`, {
        method: 'GET',
        headers: this.headers,
      });

      if (response.ok) {
        const data = await response.json() as {
          data: Array<{
            type: string;
            id: string;
            attributes: { name: string; status: string };
          }>;
        };
        return {
          success: true,
          flows: data.data.map(flow => ({
            id: flow.id,
            name: flow.attributes.name,
            status: flow.attributes.status,
          })),
        };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to get flows',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Update flow status (activate/deactivate)
   */
  async updateFlowStatus(
    flowId: string,
    status: 'draft' | 'manual' | 'live'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = {
        data: {
          type: 'flow',
          id: flowId,
          attributes: {
            status,
          },
        },
      };

      const response = await fetch(`${this.baseUrl}/api/flows/${flowId}/`, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return { success: true };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to update flow status',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // ========================================
  // Template Management
  // ========================================

  /**
   * Create an email template
   */
  async createTemplate(options: {
    name: string;
    html: string;
    text?: string;
  }): Promise<{ success: boolean; templateId?: string; error?: string }> {
    try {
      const payload = {
        data: {
          type: 'template',
          attributes: {
            name: options.name,
            editor_type: 'CODE',
            html: options.html,
            text: options.text,
          },
        },
      };

      const response = await fetch(`${this.baseUrl}/api/templates/`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (response.status === 201) {
        const data = await response.json() as KlaviyoAPIResponse<{ type: string; id: string }>;
        return {
          success: true,
          templateId: data.data.id,
        };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to create template',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get all templates
   */
  async getTemplates(): Promise<{
    success: boolean;
    templates?: Array<{ id: string; name: string }>;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/templates/`, {
        method: 'GET',
        headers: this.headers,
      });

      if (response.ok) {
        const data = await response.json() as {
          data: Array<{
            type: string;
            id: string;
            attributes: { name: string };
          }>;
        };
        return {
          success: true,
          templates: data.data.map(t => ({
            id: t.id,
            name: t.attributes.name,
          })),
        };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to get templates',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // ========================================
  // Suppression Management
  // ========================================

  /**
   * Suppress a profile (unsubscribe)
   */
  async suppressProfile(options: {
    email?: string;
    phoneNumber?: string;
    listId?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = {
        data: {
          type: 'profile-suppression-bulk-create-job',
          attributes: {
            profiles: {
              data: [
                {
                  type: 'profile',
                  attributes: {
                    email: options.email,
                    phone_number: options.phoneNumber,
                  },
                },
              ],
            },
          },
          relationships: options.listId
            ? {
                list: {
                  data: {
                    type: 'list',
                    id: options.listId,
                  },
                },
              }
            : undefined,
        },
      };

      const response = await fetch(
        `${this.baseUrl}/api/profile-suppression-bulk-create-jobs/`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(payload),
        }
      );

      if (response.status === 202 || response.status === 201) {
        return { success: true };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to suppress profile',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Unsuppress a profile (re-subscribe)
   */
  async unsuppressProfile(options: {
    email?: string;
    phoneNumber?: string;
    listId?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = {
        data: {
          type: 'profile-unsuppression-bulk-create-job',
          attributes: {
            profiles: {
              data: [
                {
                  type: 'profile',
                  attributes: {
                    email: options.email,
                    phone_number: options.phoneNumber,
                  },
                },
              ],
            },
          },
          relationships: options.listId
            ? {
                list: {
                  data: {
                    type: 'list',
                    id: options.listId,
                  },
                },
              }
            : undefined,
        },
      };

      const response = await fetch(
        `${this.baseUrl}/api/profile-unsuppression-bulk-create-jobs/`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(payload),
        }
      );

      if (response.status === 202 || response.status === 201) {
        return { success: true };
      }

      const errorData = await response.json() as KlaviyoAPIError;
      return {
        success: false,
        error: errorData.errors?.[0]?.detail || 'Failed to unsuppress profile',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

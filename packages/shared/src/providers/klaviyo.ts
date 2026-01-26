/**
 * Klaviyo Provider Types and Interfaces
 * 
 * Klaviyo is a marketing automation platform specializing in
 * email, SMS, and customer data platform features.
 */

// API Configuration
export interface KlaviyoConfig {
  apiKey: string;
  revision?: string; // API version, defaults to '2024-02-15'
  baseUrl?: string;
}

// Profile Types
export interface KlaviyoProfile {
  type: 'profile';
  id?: string;
  attributes: {
    email?: string;
    phone_number?: string;
    external_id?: string;
    first_name?: string;
    last_name?: string;
    organization?: string;
    title?: string;
    image?: string;
    location?: {
      address1?: string;
      address2?: string;
      city?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
      region?: string;
      zip?: string;
      timezone?: string;
    };
    properties?: Record<string, unknown>;
  };
}

export interface KlaviyoProfileIdentifier {
  email?: string;
  phone_number?: string;
  external_id?: string;
}

// List Types
export interface KlaviyoList {
  type: 'list';
  id: string;
  attributes: {
    name: string;
    created: string;
    updated: string;
    opt_in_process?: string;
  };
}

export interface KlaviyoListMember {
  type: 'profile';
  id: string;
}

// Campaign Types
export interface KlaviyoCampaign {
  type: 'campaign';
  id?: string;
  attributes: {
    name: string;
    status?: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
    archived?: boolean;
    audiences: {
      included: string[]; // List IDs
      excluded?: string[];
    };
    send_options?: {
      use_smart_sending?: boolean;
    };
    tracking_options?: {
      is_tracking_opens?: boolean;
      is_tracking_clicks?: boolean;
    };
    send_strategy?: {
      method: 'immediate' | 'static' | 'throttled' | 'smart_send_time';
      options_static?: {
        datetime: string;
        is_local?: boolean;
        send_past_recipients_immediately?: boolean;
      };
      options_throttled?: {
        datetime: string;
        throttle_percentage: number;
      };
    };
    created_at?: string;
    scheduled_at?: string;
    updated_at?: string;
    send_time?: string;
  };
}

export interface KlaviyoCampaignMessage {
  type: 'campaign-message';
  id?: string;
  attributes: {
    channel: 'email' | 'sms';
    label?: string;
    content?: {
      subject?: string;
      preview_text?: string;
      from_email?: string;
      from_label?: string;
      reply_to_email?: string;
      cc_email?: string;
      bcc_email?: string;
    };
    render_options?: {
      shorten_links?: boolean;
      add_org_prefix?: boolean;
      add_info_link?: boolean;
      add_opt_out_language?: boolean;
    };
  };
  relationships?: {
    template?: {
      data: {
        type: 'template';
        id: string;
      };
    };
  };
}

// Flow Types
export interface KlaviyoFlow {
  type: 'flow';
  id?: string;
  attributes: {
    name: string;
    status: 'draft' | 'manual' | 'live';
    archived?: boolean;
    trigger_type?: string;
    created?: string;
    updated?: string;
  };
}

export interface KlaviyoFlowAction {
  type: 'flow-action';
  id?: string;
  attributes: {
    action_type: 'EMAIL' | 'SMS' | 'WEBHOOK' | 'PROFILE_PROPERTY_UPDATE';
    status: 'draft' | 'manual' | 'live';
    settings?: Record<string, unknown>;
  };
}

// Event Types
export interface KlaviyoEvent {
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
        attributes: KlaviyoProfile['attributes'];
      };
    };
    properties?: Record<string, unknown>;
    value?: number;
    value_currency?: string;
    unique_id?: string;
    time?: string;
  };
}

// Metric Types
export interface KlaviyoMetric {
  type: 'metric';
  id: string;
  attributes: {
    name: string;
    created: string;
    updated: string;
    integration?: {
      id: string;
      name: string;
      category: string;
    };
  };
}

// Template Types
export interface KlaviyoTemplate {
  type: 'template';
  id?: string;
  attributes: {
    name: string;
    editor_type: 'CODE' | 'USER_DRAGGABLE' | 'SIMPLE';
    html?: string;
    text?: string;
    created?: string;
    updated?: string;
  };
}

// API Response Types
export interface KlaviyoAPIResponse<T> {
  data: T;
  links?: {
    self: string;
    next?: string;
    prev?: string;
  };
}

export interface KlaviyoAPIListResponse<T> {
  data: T[];
  links?: {
    self: string;
    next?: string;
    prev?: string;
  };
}

export interface KlaviyoAPIError {
  id: string;
  status: number;
  code: string;
  title: string;
  detail: string;
  source?: {
    pointer?: string;
    parameter?: string;
  };
}

export interface KlaviyoAPIErrorResponse {
  errors: KlaviyoAPIError[];
}

// Webhook Types (for receiving Klaviyo webhooks)
export interface KlaviyoWebhookPayload {
  type: string;
  id: string;
  attributes: {
    topic: string;
    created_at: string;
    data: {
      type: string;
      id: string;
      attributes: Record<string, unknown>;
    };
  };
}

// Send Options
export interface KlaviyoSendOptions {
  useSmartSending?: boolean;
  trackOpens?: boolean;
  trackClicks?: boolean;
  skipOptInCheck?: boolean;
}

// Subscription Types
export interface KlaviyoSubscription {
  type: 'list-subscription';
  id: string;
  attributes: {
    subscribed: boolean;
    email?: string;
    phone_number?: string;
    consent_timestamp?: string;
    consent_method?: string;
  };
}

export interface MarketingSDKConfig {
  apiKey: string;
  apiUrl?: string;
  autoTrack?: boolean;
  debug?: boolean;
}

export interface TrackEventOptions {
  name: string;
  properties?: Record<string, unknown>;
  timestamp?: Date | string;
}

export interface IdentifyOptions {
  email?: string;
  externalId?: string;
  traits?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    [key: string]: unknown;
  };
  properties?: Record<string, unknown>;
}

export interface MarketingSDK {
  init(config: MarketingSDKConfig): void;
  identify(options: IdentifyOptions): Promise<void>;
  track(event: string | TrackEventOptions, properties?: Record<string, unknown>): Promise<void>;
  page(name?: string, properties?: Record<string, unknown>): Promise<void>;
  reset(): void;
}

class MarketingSDKImpl implements MarketingSDK {
  private config: MarketingSDKConfig | null = null;
  private userId: string | null = null;
  private email: string | null = null;
  private queue: Array<() => Promise<void>> = [];
  private initialized = false;

  init(config: MarketingSDKConfig): void {
    this.config = {
      apiUrl: 'http://localhost:3002',
      autoTrack: true,
      debug: false,
      ...config,
    };
    this.initialized = true;

    // Load persisted identity
    this.loadIdentity();

    // Process queued events
    this.processQueue();

    // Set up auto-tracking
    if (this.config.autoTrack && typeof window !== 'undefined') {
      this.setupAutoTracking();
    }

    this.log('SDK initialized');
  }

  async identify(options: IdentifyOptions): Promise<void> {
    if (!this.initialized) {
      this.queue.push(() => this.identify(options));
      return;
    }

    this.log('Identify', options);

    if (options.email) {
      this.email = options.email;
    }

    const response = await this.request('/identify', {
      email: options.email,
      externalId: options.externalId,
      traits: options.traits,
      properties: options.properties,
    });

    if (response.profileId) {
      this.userId = response.profileId;
      this.persistIdentity();
    }
  }

  async track(
    event: string | TrackEventOptions,
    properties?: Record<string, unknown>
  ): Promise<void> {
    if (!this.initialized) {
      this.queue.push(() => this.track(event, properties));
      return;
    }

    const eventData =
      typeof event === 'string' ? { name: event, properties } : event;

    this.log('Track', eventData);

    await this.request('/track', {
      profileId: this.userId,
      email: this.email,
      name: eventData.name,
      properties: eventData.properties,
      timestamp: eventData.timestamp
        ? typeof eventData.timestamp === 'string'
          ? eventData.timestamp
          : eventData.timestamp.toISOString()
        : undefined,
    });
  }

  async page(name?: string, properties?: Record<string, unknown>): Promise<void> {
    const pageName = name || (typeof document !== 'undefined' ? document.title : 'Page View');
    const pageProperties: Record<string, unknown> = {
      ...properties,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      title: typeof document !== 'undefined' ? document.title : undefined,
    };

    await this.track({
      name: '$page_view',
      properties: {
        page_name: pageName,
        ...pageProperties,
      },
    });
  }

  reset(): void {
    this.userId = null;
    this.email = null;
    this.clearIdentity();
    this.log('Identity reset');
  }

  private async request(
    endpoint: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.config) {
      throw new Error('SDK not initialized');
    }

    const response = await fetch(`${this.config.apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  private loadIdentity(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const stored = localStorage.getItem('mp_identity');
      if (stored) {
        const identity = JSON.parse(stored);
        this.userId = identity.userId;
        this.email = identity.email;
      }
    } catch {
      // Ignore errors
    }
  }

  private persistIdentity(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      localStorage.setItem(
        'mp_identity',
        JSON.stringify({
          userId: this.userId,
          email: this.email,
        })
      );
    } catch {
      // Ignore errors
    }
  }

  private clearIdentity(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      localStorage.removeItem('mp_identity');
    } catch {
      // Ignore errors
    }
  }

  private async processQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const fn = this.queue.shift();
      if (fn) {
        try {
          await fn();
        } catch (error) {
          this.log('Queue error', error);
        }
      }
    }
  }

  private setupAutoTracking(): void {
    // Track page views
    this.page();

    // Track navigation
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', () => {
        this.page();
      });

      // Intercept pushState and replaceState
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      history.pushState = (...args) => {
        originalPushState.apply(history, args);
        setTimeout(() => this.page(), 0);
      };

      history.replaceState = (...args) => {
        originalReplaceState.apply(history, args);
        setTimeout(() => this.page(), 0);
      };
    }
  }

  private log(...args: unknown[]): void {
    if (this.config?.debug) {
      console.log('[MarketingSDK]', ...args);
    }
  }
}

// Export singleton instance
export const marketing: MarketingSDK = new MarketingSDKImpl();

// Export for CDN usage
if (typeof window !== 'undefined') {
  (window as unknown as { marketing: MarketingSDK }).marketing = marketing;
}

export default marketing;

/**
 * Klaviyo Provider Integration Tests
 * 
 * These tests verify the Klaviyo provider implementation.
 * For real integration testing, set KLAVIYO_API_KEY environment variable.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { KlaviyoProvider } from '../providers/klaviyo.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('KlaviyoProvider', () => {
  let provider: KlaviyoProvider;

  beforeEach(() => {
    provider = new KlaviyoProvider({
      apiKey: 'pk_test_12345',
      revision: '2024-02-15',
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(provider.name).toBe('Klaviyo');
      expect(provider.type).toBe('klaviyo');
    });

    it('should use default values when not provided', () => {
      const defaultProvider = new KlaviyoProvider({
        apiKey: 'pk_test_12345',
      });
      expect(defaultProvider.name).toBe('Klaviyo');
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status on successful API call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const status = await provider.checkHealth();

      expect(status.healthy).toBe(true);
      expect(status.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          errors: [{ detail: 'Invalid API key' }],
        }),
      });

      const status = await provider.checkHealth();

      expect(status.healthy).toBe(false);
      expect(status.error).toBe('Invalid API key');
    });

    it('should return unhealthy status on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const status = await provider.checkHealth();

      expect(status.healthy).toBe(false);
      expect(status.error).toBe('Network error');
    });
  });

  describe('send', () => {
    it('should send email via event creation', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 202,
        ok: true,
      });

      const result = await provider.send({
        to: 'test@example.com',
        from: { email: 'sender@example.com', name: 'Sender' },
        subject: 'Test Subject',
        html: '<p>Test content</p>',
        text: 'Test content',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toContain('klaviyo_event_');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://a.klaviyo.com/api/events/',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Klaviyo-API-Key pk_test_12345',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle send failure', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 400,
        ok: false,
        json: async () => ({
          errors: [{ detail: 'Invalid email', code: 'INVALID_EMAIL' }],
        }),
      });

      const result = await provider.send({
        to: 'invalid',
        from: { email: 'sender@example.com' },
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email');
      expect(result.errorCode).toBe('INVALID_EMAIL');
    });
  });

  describe('upsertProfile', () => {
    it('should create a new profile', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 201,
        ok: true,
        json: async () => ({
          data: {
            type: 'profile',
            id: 'profile_123',
            attributes: { email: 'test@example.com' },
          },
        }),
      });

      const result = await provider.upsertProfile({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        properties: { custom_field: 'value' },
      });

      expect(result.success).toBe(true);
      expect(result.profileId).toBe('profile_123');
    });

    it('should handle duplicate profile by updating', async () => {
      // First call returns 409 (conflict)
      mockFetch.mockResolvedValueOnce({
        status: 409,
        ok: false,
      });

      // Second call - find existing profile
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              type: 'profile',
              id: 'existing_123',
              attributes: { email: 'test@example.com' },
            },
          ],
        }),
      });

      // Third call - update profile
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            type: 'profile',
            id: 'existing_123',
            attributes: { email: 'test@example.com' },
          },
        }),
      });

      const result = await provider.upsertProfile({
        email: 'test@example.com',
        firstName: 'John',
      });

      expect(result.success).toBe(true);
      expect(result.profileId).toBe('existing_123');
    });
  });

  describe('getProfileByEmail', () => {
    it('should find profile by email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              type: 'profile',
              id: 'profile_123',
              attributes: { email: 'test@example.com', first_name: 'John' },
            },
          ],
        }),
      });

      const profile = await provider.getProfileByEmail('test@example.com');

      expect(profile).not.toBeNull();
      expect(profile?.id).toBe('profile_123');
    });

    it('should return null when profile not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const profile = await provider.getProfileByEmail('notfound@example.com');

      expect(profile).toBeNull();
    });
  });

  describe('createList', () => {
    it('should create a new list', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          data: {
            type: 'list',
            id: 'list_123',
            attributes: { name: 'Newsletter' },
          },
        }),
      });

      const result = await provider.createList('Newsletter');

      expect(result.success).toBe(true);
      expect(result.listId).toBe('list_123');
    });
  });

  describe('getLists', () => {
    it('should return all lists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { type: 'list', id: 'list_1', attributes: { name: 'Newsletter' } },
            { type: 'list', id: 'list_2', attributes: { name: 'VIP' } },
          ],
        }),
      });

      const result = await provider.getLists();

      expect(result.success).toBe(true);
      expect(result.lists).toHaveLength(2);
    });
  });

  describe('addToList', () => {
    it('should add profiles to list', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 204,
      });

      const result = await provider.addToList('list_123', [
        { email: 'user1@example.com' },
        { email: 'user2@example.com' },
      ]);

      expect(result.success).toBe(true);
    });
  });

  describe('removeFromList', () => {
    it('should remove profiles from list', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 204,
      });

      const result = await provider.removeFromList('list_123', ['profile_1', 'profile_2']);

      expect(result.success).toBe(true);
    });
  });

  describe('createEvent', () => {
    it('should create an event', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 202,
      });

      const result = await provider.createEvent({
        eventName: 'Order Placed',
        email: 'customer@example.com',
        properties: {
          order_id: 'ORD-123',
          total: 99.99,
        },
        value: 99.99,
      });

      expect(result.success).toBe(true);
      expect(result.eventId).toContain('klaviyo_event_');
    });

    it('should handle event creation failure', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 400,
        json: async () => ({
          errors: [{ detail: 'Invalid event data', code: 'INVALID_DATA' }],
        }),
      });

      const result = await provider.createEvent({
        eventName: 'Test Event',
        email: 'test@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid event data');
    });
  });

  describe('createCampaign', () => {
    it('should create a campaign with message', async () => {
      // First call - create campaign
      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          data: { type: 'campaign', id: 'campaign_123' },
        }),
      });

      // Second call - create campaign message
      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          data: { type: 'campaign-message', id: 'message_123' },
        }),
      });

      const result = await provider.createCampaign({
        name: 'Summer Sale',
        listIds: ['list_123'],
        subject: 'Summer Sale is Here!',
        fromEmail: 'marketing@example.com',
        fromName: 'Marketing Team',
        trackOpens: true,
        trackClicks: true,
      });

      expect(result.success).toBe(true);
      expect(result.campaignId).toBe('campaign_123');
    });
  });

  describe('scheduleCampaign', () => {
    it('should schedule a campaign', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 202,
      });

      const sendAt = new Date('2024-12-25T10:00:00Z');
      const result = await provider.scheduleCampaign('campaign_123', sendAt);

      expect(result.success).toBe(true);
    });

    it('should schedule with smart send time', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 202,
      });

      const sendAt = new Date('2024-12-25T10:00:00Z');
      const result = await provider.scheduleCampaign('campaign_123', sendAt, {
        useSmartSendTime: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('sendCampaignNow', () => {
    it('should send campaign immediately', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 202,
      });

      const result = await provider.sendCampaignNow('campaign_123');

      expect(result.success).toBe(true);
    });
  });

  describe('getFlows', () => {
    it('should return all flows', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { type: 'flow', id: 'flow_1', attributes: { name: 'Welcome', status: 'live' } },
            { type: 'flow', id: 'flow_2', attributes: { name: 'Abandoned Cart', status: 'draft' } },
          ],
        }),
      });

      const result = await provider.getFlows();

      expect(result.success).toBe(true);
      expect(result.flows).toHaveLength(2);
      expect(result.flows?.[0].name).toBe('Welcome');
    });
  });

  describe('updateFlowStatus', () => {
    it('should update flow status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { type: 'flow', id: 'flow_123', attributes: { status: 'live' } },
        }),
      });

      const result = await provider.updateFlowStatus('flow_123', 'live');

      expect(result.success).toBe(true);
    });
  });

  describe('createTemplate', () => {
    it('should create an email template', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          data: { type: 'template', id: 'template_123' },
        }),
      });

      const result = await provider.createTemplate({
        name: 'Welcome Email',
        html: '<html><body>Welcome!</body></html>',
        text: 'Welcome!',
      });

      expect(result.success).toBe(true);
      expect(result.templateId).toBe('template_123');
    });
  });

  describe('getTemplates', () => {
    it('should return all templates', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { type: 'template', id: 'tpl_1', attributes: { name: 'Welcome' } },
            { type: 'template', id: 'tpl_2', attributes: { name: 'Newsletter' } },
          ],
        }),
      });

      const result = await provider.getTemplates();

      expect(result.success).toBe(true);
      expect(result.templates).toHaveLength(2);
    });
  });

  describe('suppressProfile', () => {
    it('should suppress a profile', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 202,
      });

      const result = await provider.suppressProfile({
        email: 'unsubscribe@example.com',
      });

      expect(result.success).toBe(true);
    });

    it('should suppress from specific list', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 202,
      });

      const result = await provider.suppressProfile({
        email: 'unsubscribe@example.com',
        listId: 'list_123',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('unsuppressProfile', () => {
    it('should unsuppress a profile', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 202,
      });

      const result = await provider.unsuppressProfile({
        email: 'resubscribe@example.com',
      });

      expect(result.success).toBe(true);
    });
  });
});

describe('KlaviyoProvider - API Headers', () => {
  it('should include correct headers in requests', async () => {
    const provider = new KlaviyoProvider({
      apiKey: 'pk_my_api_key',
      revision: '2024-06-15',
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await provider.checkHealth();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://a.klaviyo.com/api/metrics/',
      expect.objectContaining({
        headers: {
          'Authorization': 'Klaviyo-API-Key pk_my_api_key',
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'revision': '2024-06-15',
        },
      })
    );
  });

  it('should use custom base URL when provided', async () => {
    const provider = new KlaviyoProvider({
      apiKey: 'pk_test',
      baseUrl: 'https://custom-proxy.example.com',
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await provider.checkHealth();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://custom-proxy.example.com/api/metrics/',
      expect.any(Object)
    );
  });
});

describe('KlaviyoProvider - Error Handling', () => {
  let provider: KlaviyoProvider;

  beforeEach(() => {
    provider = new KlaviyoProvider({ apiKey: 'pk_test' });
    mockFetch.mockReset();
  });

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await provider.upsertProfile({ email: 'test@example.com' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('should handle JSON parse errors', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 500,
      ok: false,
      json: async () => { throw new Error('Invalid JSON'); },
    });

    const result = await provider.createEvent({
      eventName: 'Test',
      email: 'test@example.com',
    });

    expect(result.success).toBe(false);
  });

  it('should handle timeout errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Timeout'));

    const status = await provider.checkHealth();

    expect(status.healthy).toBe(false);
    expect(status.error).toBe('Timeout');
  });
});

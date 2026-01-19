import { prisma, EmailProvider as DBEmailProvider } from '@marketing-platform/database';
import {
  EmailProvider,
  SESProvider,
  SendGridProvider,
  EmailMessage,
  SendResult,
} from '../providers/index.js';
import { config } from './config.js';

interface CircuitBreakerState {
  failures: number;
  lastFailure: Date | null;
  isOpen: boolean;
  openedAt: Date | null;
}

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

export class EmailRouter {
  private providers: Map<string, EmailProvider> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  async initialize(organizationId: string): Promise<void> {
    const dbProviders = await prisma.emailProvider.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      orderBy: { priority: 'asc' },
    });

    for (const dbProvider of dbProviders) {
      const provider = this.createProvider(dbProvider);
      if (provider) {
        this.providers.set(dbProvider.id, provider);
        this.circuitBreakers.set(dbProvider.id, {
          failures: dbProvider.consecutiveFailures,
          lastFailure: null,
          isOpen: dbProvider.circuitBreakerOpen,
          openedAt: dbProvider.circuitBreakerOpenedAt,
        });
      }
    }
  }

  private createProvider(dbProvider: DBEmailProvider): EmailProvider | null {
    const providerConfig = dbProvider.config as Record<string, unknown>;

    switch (dbProvider.type) {
      case 'ses':
        return new SESProvider({
          region: (providerConfig.region as string) || config.email.ses.region,
          accessKeyId: (providerConfig.accessKeyId as string) || config.email.ses.accessKeyId,
          secretAccessKey: (providerConfig.secretAccessKey as string) || config.email.ses.secretAccessKey,
          configurationSet: (providerConfig.configurationSet as string) || config.email.ses.configurationSet,
        });

      case 'sendgrid':
        return new SendGridProvider({
          apiKey: (providerConfig.apiKey as string) || config.email.sendgrid.apiKey || '',
        });

      default:
        console.warn(`Unknown provider type: ${dbProvider.type}`);
        return null;
    }
  }

  async send(
    organizationId: string,
    message: EmailMessage
  ): Promise<{ providerId: string; result: SendResult }> {
    // Get providers sorted by priority
    const dbProviders = await prisma.emailProvider.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      orderBy: { priority: 'asc' },
    });

    for (const dbProvider of dbProviders) {
      // Check if provider is available
      if (!this.isProviderAvailable(dbProvider)) {
        continue;
      }

      const provider = this.providers.get(dbProvider.id);
      if (!provider) {
        // Try to create the provider if it doesn't exist
        const newProvider = this.createProvider(dbProvider);
        if (!newProvider) continue;
        this.providers.set(dbProvider.id, newProvider);
      }

      try {
        const result = await this.providers.get(dbProvider.id)!.send(message);

        if (result.success) {
          // Reset circuit breaker on success
          await this.recordSuccess(dbProvider.id);
          return { providerId: dbProvider.id, result };
        }

        // Record failure
        await this.recordFailure(dbProvider.id);

        // Check if this is a permanent error (don't try other providers)
        if (this.isPermanentError(result.errorCode)) {
          return { providerId: dbProvider.id, result };
        }
      } catch (error) {
        await this.recordFailure(dbProvider.id);
        console.error(`Provider ${dbProvider.name} error:`, error);
      }
    }

    return {
      providerId: '',
      result: {
        success: false,
        error: 'All email providers failed or unavailable',
      },
    };
  }

  private isProviderAvailable(dbProvider: DBEmailProvider): boolean {
    const circuitBreaker = this.circuitBreakers.get(dbProvider.id);

    // Check circuit breaker
    if (circuitBreaker?.isOpen) {
      // Check if timeout has passed
      if (
        circuitBreaker.openedAt &&
        Date.now() - circuitBreaker.openedAt.getTime() > CIRCUIT_BREAKER_TIMEOUT
      ) {
        // Half-open state - allow one request through
        circuitBreaker.isOpen = false;
      } else {
        return false;
      }
    }

    // Check rate limits
    if (dbProvider.dailyLimit && dbProvider.currentDailyUsage >= dbProvider.dailyLimit) {
      return false;
    }

    if (dbProvider.hourlyLimit && dbProvider.currentHourlyUsage >= dbProvider.hourlyLimit) {
      return false;
    }

    return true;
  }

  private async recordSuccess(providerId: string): Promise<void> {
    const circuitBreaker = this.circuitBreakers.get(providerId);
    if (circuitBreaker) {
      circuitBreaker.failures = 0;
      circuitBreaker.isOpen = false;
      circuitBreaker.openedAt = null;
    }

    await prisma.emailProvider.update({
      where: { id: providerId },
      data: {
        consecutiveFailures: 0,
        circuitBreakerOpen: false,
        circuitBreakerOpenedAt: null,
        healthStatus: 'healthy',
        lastHealthCheck: new Date(),
        currentDailyUsage: { increment: 1 },
        currentHourlyUsage: { increment: 1 },
      },
    });
  }

  private async recordFailure(providerId: string): Promise<void> {
    const circuitBreaker = this.circuitBreakers.get(providerId);
    if (!circuitBreaker) {
      this.circuitBreakers.set(providerId, {
        failures: 1,
        lastFailure: new Date(),
        isOpen: false,
        openedAt: null,
      });
      return;
    }

    circuitBreaker.failures++;
    circuitBreaker.lastFailure = new Date();

    if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitBreaker.isOpen = true;
      circuitBreaker.openedAt = new Date();
    }

    await prisma.emailProvider.update({
      where: { id: providerId },
      data: {
        consecutiveFailures: circuitBreaker.failures,
        circuitBreakerOpen: circuitBreaker.isOpen,
        circuitBreakerOpenedAt: circuitBreaker.openedAt,
        healthStatus: circuitBreaker.isOpen ? 'unhealthy' : 'degraded',
        lastHealthCheck: new Date(),
      },
    });
  }

  private isPermanentError(errorCode?: string): boolean {
    // These are errors that won't be fixed by retrying with a different provider
    const permanentErrors = [
      'InvalidParameterValue',
      'MessageRejected',
      'MailFromDomainNotVerified',
      'ConfigurationSetDoesNotExist',
    ];

    return errorCode ? permanentErrors.includes(errorCode) : false;
  }

  async checkAllProviders(organizationId: string): Promise<void> {
    const dbProviders = await prisma.emailProvider.findMany({
      where: {
        organizationId,
        isActive: true,
      },
    });

    for (const dbProvider of dbProviders) {
      const provider = this.providers.get(dbProvider.id);
      if (!provider) continue;

      try {
        const status = await provider.checkHealth();

        await prisma.emailProvider.update({
          where: { id: dbProvider.id },
          data: {
            healthStatus: status.healthy ? 'healthy' : 'degraded',
            lastHealthCheck: new Date(),
          },
        });
      } catch (error) {
        console.error(`Health check failed for ${dbProvider.name}:`, error);
      }
    }
  }
}

export const emailRouter = new EmailRouter();

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@marketing-platform/database';

const dateRangeSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  days: z.coerce.number().min(1).max(90).optional(),
});

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  // Get organization ID from auth (simplified for MVP)
  const getOrganizationId = (request: any): string => {
    return request.headers['x-organization-id'] as string || 'org_default';
  };

  // Deliverability overview
  fastify.get('/deliverability', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const query = dateRangeSchema.parse(request.query);

      const days = query.days || 30;
      const endDate = query.end ? new Date(query.end) : new Date();
      const startDate = query.start
        ? new Date(query.start)
        : new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Get email send stats
      const [totalSent, delivered, bounced, complained, failed] = await Promise.all([
        prisma.emailSend.count({
          where: {
            organizationId,
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
        prisma.emailSend.count({
          where: {
            organizationId,
            status: 'delivered',
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
        prisma.emailSend.count({
          where: {
            organizationId,
            status: 'bounced',
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
        prisma.emailSend.count({
          where: {
            organizationId,
            status: 'complained',
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
        prisma.emailSend.count({
          where: {
            organizationId,
            status: 'failed',
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
      ]);

      // Get email events for opens and clicks
      const [opens, uniqueOpens, clicks, uniqueClicks] = await Promise.all([
        prisma.emailEvent.count({
          where: {
            organizationId,
            type: 'opened',
            timestamp: { gte: startDate, lte: endDate },
          },
        }),
        prisma.emailEvent.groupBy({
          by: ['profileId'],
          where: {
            organizationId,
            type: 'opened',
            timestamp: { gte: startDate, lte: endDate },
          },
        }).then(r => r.length),
        prisma.emailEvent.count({
          where: {
            organizationId,
            type: 'clicked',
            timestamp: { gte: startDate, lte: endDate },
          },
        }),
        prisma.emailEvent.groupBy({
          by: ['profileId'],
          where: {
            organizationId,
            type: 'clicked',
            timestamp: { gte: startDate, lte: endDate },
          },
        }).then(r => r.length),
      ]);

      // Get suppression stats
      const suppressionStats = await prisma.suppression.groupBy({
        by: ['reason'],
        where: { organizationId },
        _count: true,
      });

      // Get provider health
      const providers = await prisma.emailProvider.findMany({
        where: { organizationId, isActive: true },
        select: {
          id: true,
          name: true,
          type: true,
          healthStatus: true,
          consecutiveFailures: true,
          circuitBreakerOpen: true,
          currentDailyUsage: true,
          dailyLimit: true,
        },
      });

      return {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days,
        },
        sends: {
          total: totalSent,
          delivered,
          bounced,
          complained,
          failed,
        },
        rates: {
          deliveryRate: totalSent > 0 ? (delivered / totalSent) * 100 : 0,
          bounceRate: totalSent > 0 ? (bounced / totalSent) * 100 : 0,
          complaintRate: totalSent > 0 ? (complained / totalSent) * 100 : 0,
          openRate: delivered > 0 ? (uniqueOpens / delivered) * 100 : 0,
          clickRate: delivered > 0 ? (uniqueClicks / delivered) * 100 : 0,
        },
        engagement: {
          totalOpens: opens,
          uniqueOpens,
          totalClicks: clicks,
          uniqueClicks,
        },
        suppressions: suppressionStats.reduce((acc, item) => {
          acc[item.reason] = item._count;
          return acc;
        }, {} as Record<string, number>),
        providers: providers.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          status: p.healthStatus,
          circuitBreakerOpen: p.circuitBreakerOpen,
          consecutiveFailures: p.consecutiveFailures,
          usage: {
            daily: p.currentDailyUsage,
            dailyLimit: p.dailyLimit,
          },
        })),
      };
    },
  });

  // Daily send stats for charts
  fastify.get('/sends/daily', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const query = dateRangeSchema.parse(request.query);

      const days = query.days || 7;
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Group by day
      const dailyStats = await prisma.$queryRaw<Array<{
        date: Date;
        sent: bigint;
        delivered: bigint;
        bounced: bigint;
      }>>`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as sent,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
          COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced
        FROM email_sends
        WHERE organization_id = ${organizationId}
          AND created_at >= ${startDate}
          AND created_at <= ${endDate}
        GROUP BY DATE(created_at)
        ORDER BY date
      `;

      return dailyStats.map(day => ({
        date: day.date,
        sent: Number(day.sent),
        delivered: Number(day.delivered),
        bounced: Number(day.bounced),
      }));
    },
  });

  // Campaign performance
  fastify.get('/campaigns/performance', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const query = z.object({
        limit: z.coerce.number().min(1).max(50).optional(),
      }).parse(request.query);

      const limit = query.limit || 10;

      const campaigns = await prisma.campaign.findMany({
        where: {
          organizationId,
          status: 'sent',
        },
        select: {
          id: true,
          name: true,
          sentAt: true,
          totalRecipients: true,
          sentCount: true,
          deliveredCount: true,
          openCount: true,
          clickCount: true,
          bounceCount: true,
          complaintCount: true,
          unsubscribeCount: true,
        },
        orderBy: { sentAt: 'desc' },
        take: limit,
      });

      return campaigns.map(c => ({
        id: c.id,
        name: c.name,
        sentAt: c.sentAt,
        totalRecipients: c.totalRecipients,
        sent: c.sentCount,
        delivered: c.deliveredCount,
        opens: c.openCount,
        clicks: c.clickCount,
        bounces: c.bounceCount,
        complaints: c.complaintCount,
        unsubscribes: c.unsubscribeCount,
        rates: {
          delivery: c.sentCount > 0 ? (c.deliveredCount / c.sentCount) * 100 : 0,
          open: c.deliveredCount > 0 ? (c.openCount / c.deliveredCount) * 100 : 0,
          click: c.deliveredCount > 0 ? (c.clickCount / c.deliveredCount) * 100 : 0,
          bounce: c.sentCount > 0 ? (c.bounceCount / c.sentCount) * 100 : 0,
        },
      }));
    },
  });

  // Provider performance
  fastify.get('/providers/performance', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const query = dateRangeSchema.parse(request.query);

      const days = query.days || 30;
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      const providers = await prisma.emailProvider.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          type: true,
        },
      });

      const providerStats = await Promise.all(
        providers.map(async (provider) => {
          const [sent, delivered, failed] = await Promise.all([
            prisma.emailSend.count({
              where: {
                providerId: provider.id,
                createdAt: { gte: startDate, lte: endDate },
              },
            }),
            prisma.emailSend.count({
              where: {
                providerId: provider.id,
                status: 'delivered',
                createdAt: { gte: startDate, lte: endDate },
              },
            }),
            prisma.emailSend.count({
              where: {
                providerId: provider.id,
                status: 'failed',
                createdAt: { gte: startDate, lte: endDate },
              },
            }),
          ]);

          return {
            id: provider.id,
            name: provider.name,
            type: provider.type,
            sent,
            delivered,
            failed,
            successRate: sent > 0 ? (delivered / sent) * 100 : 0,
          };
        })
      );

      return providerStats;
    },
  });

  // Hourly engagement breakdown
  fastify.get('/engagement/hourly', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const query = dateRangeSchema.parse(request.query);

      const days = query.days || 30;
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      const hourlyStats = await prisma.$queryRaw<Array<{
        hour: number;
        opens: bigint;
        clicks: bigint;
      }>>`
        SELECT
          EXTRACT(HOUR FROM timestamp) as hour,
          COUNT(CASE WHEN type = 'opened' THEN 1 END) as opens,
          COUNT(CASE WHEN type = 'clicked' THEN 1 END) as clicks
        FROM email_events
        WHERE organization_id = ${organizationId}
          AND timestamp >= ${startDate}
          AND timestamp <= ${endDate}
          AND type IN ('opened', 'clicked')
        GROUP BY EXTRACT(HOUR FROM timestamp)
        ORDER BY hour
      `;

      // Fill in missing hours with zeros
      const result = Array.from({ length: 24 }, (_, hour) => {
        const stat = hourlyStats.find(s => Number(s.hour) === hour);
        return {
          hour,
          opens: stat ? Number(stat.opens) : 0,
          clicks: stat ? Number(stat.clicks) : 0,
        };
      });

      return result;
    },
  });

  // Flow performance analytics
  fastify.get('/flows/performance', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);

      const flows = await prisma.flow.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          status: true,
          totalEnrolled: true,
          activeCount: true,
          completedCount: true,
          emailSends: {
            select: {
              id: true,
              status: true,
              _count: true,
            },
          },
        },
      });

      const flowStats = await Promise.all(
        flows.map(async (flow) => {
          const emailSendIds = flow.emailSends.map(e => e.id);

          const [opens, clicks] = await Promise.all([
            emailSendIds.length > 0 ? prisma.emailEvent.count({
              where: {
                emailSendId: { in: emailSendIds },
                type: 'opened',
              },
            }) : 0,
            emailSendIds.length > 0 ? prisma.emailEvent.count({
              where: {
                emailSendId: { in: emailSendIds },
                type: 'clicked',
              },
            }) : 0,
          ]);

          const delivered = flow.emailSends.filter(e => e.status === 'delivered').length;

          return {
            id: flow.id,
            name: flow.name,
            status: flow.status,
            enrolled: flow.totalEnrolled,
            active: flow.activeCount,
            completed: flow.completedCount,
            emailsSent: flow.emailSends.length,
            delivered,
            opens,
            clicks,
            rates: {
              completion: flow.totalEnrolled > 0 ? (flow.completedCount / flow.totalEnrolled) * 100 : 0,
              open: delivered > 0 ? (opens / delivered) * 100 : 0,
              click: delivered > 0 ? (clicks / delivered) * 100 : 0,
            },
          };
        })
      );

      return flowStats;
    },
  });

  // Segment engagement analytics
  fastify.get('/segments/engagement', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const query = dateRangeSchema.parse(request.query);

      const days = query.days || 30;
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      const segments = await prisma.segment.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          memberCount: true,
          memberships: {
            where: { exitedAt: null },
            select: { profileId: true },
          },
        },
      });

      const segmentStats = await Promise.all(
        segments.map(async (segment) => {
          const profileIds = segment.memberships.map(m => m.profileId);

          if (profileIds.length === 0) {
            return {
              id: segment.id,
              name: segment.name,
              memberCount: segment.memberCount,
              emailsSent: 0,
              opens: 0,
              clicks: 0,
              rates: { open: 0, click: 0 },
            };
          }

          const [emailsSent, opens, clicks] = await Promise.all([
            prisma.emailSend.count({
              where: {
                profileId: { in: profileIds },
                createdAt: { gte: startDate, lte: endDate },
              },
            }),
            prisma.emailEvent.count({
              where: {
                profileId: { in: profileIds },
                type: 'opened',
                timestamp: { gte: startDate, lte: endDate },
              },
            }),
            prisma.emailEvent.count({
              where: {
                profileId: { in: profileIds },
                type: 'clicked',
                timestamp: { gte: startDate, lte: endDate },
              },
            }),
          ]);

          return {
            id: segment.id,
            name: segment.name,
            memberCount: segment.memberCount,
            emailsSent,
            opens,
            clicks,
            rates: {
              open: emailsSent > 0 ? (opens / emailsSent) * 100 : 0,
              click: emailsSent > 0 ? (clicks / emailsSent) * 100 : 0,
            },
          };
        })
      );

      return segmentStats;
    },
  });

  // Dashboard overview
  fastify.get('/overview', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const query = dateRangeSchema.parse(request.query);

      const days = query.days || 30;
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Previous period for comparison
      const prevStartDate = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);
      const prevEndDate = startDate;

      // Current period stats
      const [currentSent, currentDelivered, currentOpens, currentClicks, currentBounces] = await Promise.all([
        prisma.emailSend.count({
          where: { organizationId, createdAt: { gte: startDate, lte: endDate } },
        }),
        prisma.emailSend.count({
          where: { organizationId, status: 'delivered', createdAt: { gte: startDate, lte: endDate } },
        }),
        prisma.emailEvent.groupBy({
          by: ['profileId'],
          where: { organizationId, type: 'opened', timestamp: { gte: startDate, lte: endDate } },
        }).then(r => r.length),
        prisma.emailEvent.groupBy({
          by: ['profileId'],
          where: { organizationId, type: 'clicked', timestamp: { gte: startDate, lte: endDate } },
        }).then(r => r.length),
        prisma.emailSend.count({
          where: { organizationId, status: 'bounced', createdAt: { gte: startDate, lte: endDate } },
        }),
      ]);

      // Previous period stats
      const [prevSent, prevDelivered, prevOpens, prevClicks, prevBounces] = await Promise.all([
        prisma.emailSend.count({
          where: { organizationId, createdAt: { gte: prevStartDate, lte: prevEndDate } },
        }),
        prisma.emailSend.count({
          where: { organizationId, status: 'delivered', createdAt: { gte: prevStartDate, lte: prevEndDate } },
        }),
        prisma.emailEvent.groupBy({
          by: ['profileId'],
          where: { organizationId, type: 'opened', timestamp: { gte: prevStartDate, lte: prevEndDate } },
        }).then(r => r.length),
        prisma.emailEvent.groupBy({
          by: ['profileId'],
          where: { organizationId, type: 'clicked', timestamp: { gte: prevStartDate, lte: prevEndDate } },
        }).then(r => r.length),
        prisma.emailSend.count({
          where: { organizationId, status: 'bounced', createdAt: { gte: prevStartDate, lte: prevEndDate } },
        }),
      ]);

      const calculateChange = (current: number, previous: number): number => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      const currentOpenRate = currentDelivered > 0 ? (currentOpens / currentDelivered) * 100 : 0;
      const prevOpenRate = prevDelivered > 0 ? (prevOpens / prevDelivered) * 100 : 0;

      const currentClickRate = currentDelivered > 0 ? (currentClicks / currentDelivered) * 100 : 0;
      const prevClickRate = prevDelivered > 0 ? (prevClicks / prevDelivered) * 100 : 0;

      const currentBounceRate = currentSent > 0 ? (currentBounces / currentSent) * 100 : 0;
      const prevBounceRate = prevSent > 0 ? (prevBounces / prevSent) * 100 : 0;

      return {
        period: { start: startDate.toISOString(), end: endDate.toISOString(), days },
        metrics: {
          emailsSent: {
            value: currentSent,
            change: calculateChange(currentSent, prevSent),
          },
          openRate: {
            value: currentOpenRate,
            change: currentOpenRate - prevOpenRate,
          },
          clickRate: {
            value: currentClickRate,
            change: currentClickRate - prevClickRate,
          },
          bounceRate: {
            value: currentBounceRate,
            change: currentBounceRate - prevBounceRate,
          },
        },
      };
    },
  });
}

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@marketing-platform/database';
import { generateId, EVENT_NAMES } from '@marketing-platform/shared';
import { decodeTrackingToken } from '../services/email-tracking.service.js';

// 1x1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export const trackingEventsRoutes: FastifyPluginAsync = async (fastify) => {
  // Open tracking (pixel)
  fastify.get<{
    Params: { token: string };
  }>('/t/o/:token', {
    handler: async (request, reply) => {
      const { token } = request.params;

      try {
        const data = decodeTrackingToken(token);

        if (data) {
          // Record open event asynchronously
          setImmediate(async () => {
            try {
              // Check if this is the first open
              const existingOpen = await prisma.emailEvent.findFirst({
                where: {
                  emailSendId: data.emailSendId,
                  type: 'opened',
                },
              });

              // Create open event
              await prisma.emailEvent.create({
                data: {
                  id: generateId('ee'),
                  organizationId: data.organizationId,
                  emailSendId: data.emailSendId,
                  profileId: data.profileId,
                  type: 'opened',
                  timestamp: new Date(),
                  metadata: {
                    userAgent: request.headers['user-agent'] || '',
                    ip: request.ip,
                    isFirstOpen: !existingOpen,
                  },
                },
              });

              // Update campaign stats
              if (data.campaignId) {
                await prisma.campaign.update({
                  where: { id: data.campaignId },
                  data: {
                    openCount: { increment: 1 },
                  },
                });
              }

              // Track as profile event
              await prisma.event.create({
                data: {
                  id: generateId('evt'),
                  organizationId: data.organizationId,
                  profileId: data.profileId,
                  name: EVENT_NAMES.EMAIL_OPENED,
                  properties: {
                    emailSendId: data.emailSendId,
                    campaignId: data.campaignId,
                  },
                  source: 'email_tracking',
                  timestamp: new Date(),
                },
              });
            } catch (err) {
              console.error('Failed to record open event:', err);
            }
          });
        }
      } catch (err) {
        // Silently ignore decoding errors
      }

      // Always return tracking pixel
      return reply
        .header('Content-Type', 'image/gif')
        .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .send(TRACKING_PIXEL);
    },
  });

  // Click tracking (redirect)
  fastify.get<{
    Params: { token: string };
    Querystring: { url: string; lid?: string };
  }>('/t/c/:token', {
    handler: async (request, reply) => {
      const { token } = request.params;
      const { url, lid } = request.query;

      if (!url) {
        return reply.status(400).send({ error: 'Missing URL parameter' });
      }

      const decodedUrl = decodeURIComponent(url);

      try {
        const data = decodeTrackingToken(token);

        if (data) {
          // Record click event asynchronously
          setImmediate(async () => {
            try {
              // Check if this is the first click
              const existingClick = await prisma.emailEvent.findFirst({
                where: {
                  emailSendId: data.emailSendId,
                  type: 'clicked',
                },
              });

              // Create click event
              await prisma.emailEvent.create({
                data: {
                  id: generateId('ee'),
                  organizationId: data.organizationId,
                  emailSendId: data.emailSendId,
                  profileId: data.profileId,
                  type: 'clicked',
                  timestamp: new Date(),
                  metadata: {
                    url: decodedUrl,
                    linkId: lid || '',
                    userAgent: request.headers['user-agent'] || '',
                    ip: request.ip,
                    isFirstClick: !existingClick,
                  },
                },
              });

              // Update campaign stats
              if (data.campaignId) {
                await prisma.campaign.update({
                  where: { id: data.campaignId },
                  data: {
                    clickCount: { increment: 1 },
                  },
                });
              }

              // Track as profile event
              await prisma.event.create({
                data: {
                  id: generateId('evt'),
                  organizationId: data.organizationId,
                  profileId: data.profileId,
                  name: EVENT_NAMES.EMAIL_CLICKED,
                  properties: {
                    emailSendId: data.emailSendId,
                    campaignId: data.campaignId,
                    url: decodedUrl,
                    linkId: lid,
                  },
                  source: 'email_tracking',
                  timestamp: new Date(),
                },
              });
            } catch (err) {
              console.error('Failed to record click event:', err);
            }
          });
        }
      } catch (err) {
        // Silently ignore decoding errors
      }

      // Redirect to original URL
      return reply.redirect(302, decodedUrl);
    },
  });

  // Unsubscribe page
  fastify.get<{
    Params: { token: string };
  }>('/unsubscribe/:token', {
    handler: async (request, reply) => {
      const { token } = request.params;

      try {
        const data = decodeTrackingToken(token);

        if (!data) {
          return reply.status(400).send({ error: 'Invalid unsubscribe link' });
        }

        // Get profile info
        const profile = await prisma.profile.findUnique({
          where: { id: data.profileId },
          select: { email: true },
        });

        // Return simple HTML page
        const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Unsubscribe</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
    .btn { background: #dc3545; color: white; border: none; padding: 12px 24px; cursor: pointer; border-radius: 4px; font-size: 16px; }
    .btn:hover { background: #c82333; }
    .success { color: #28a745; }
  </style>
</head>
<body>
  <h1>Unsubscribe</h1>
  <div id="content">
    <p>Click the button below to unsubscribe <strong>${profile?.email || 'this email'}</strong> from our mailing list.</p>
    <form method="POST" action="/unsubscribe/${token}">
      <button type="submit" class="btn">Unsubscribe</button>
    </form>
  </div>
</body>
</html>
        `;

        return reply.type('text/html').send(html);
      } catch (err) {
        return reply.status(400).send({ error: 'Invalid unsubscribe link' });
      }
    },
  });

  // Process unsubscribe
  fastify.post<{
    Params: { token: string };
  }>('/unsubscribe/:token', {
    handler: async (request, reply) => {
      const { token } = request.params;

      try {
        const data = decodeTrackingToken(token);

        if (!data) {
          return reply.status(400).send({ error: 'Invalid unsubscribe link' });
        }

        const profile = await prisma.profile.findUnique({
          where: { id: data.profileId },
          select: { email: true },
        });

        if (profile?.email) {
          // Add to suppression list
          await prisma.suppression.upsert({
            where: {
              organizationId_email: {
                organizationId: data.organizationId,
                email: profile.email,
              },
            },
            create: {
              id: generateId('sup'),
              organizationId: data.organizationId,
              email: profile.email,
              reason: 'unsubscribe',
              source: 'one_click_unsubscribe',
            },
            update: {
              reason: 'unsubscribe',
              source: 'one_click_unsubscribe',
            },
          });

          // Record unsubscribe event
          if (data.emailSendId) {
            await prisma.emailEvent.create({
              data: {
                id: generateId('ee'),
                organizationId: data.organizationId,
                emailSendId: data.emailSendId,
                profileId: data.profileId,
                type: 'unsubscribed',
                timestamp: new Date(),
              },
            });

            // Update campaign stats
            if (data.campaignId) {
              await prisma.campaign.update({
                where: { id: data.campaignId },
                data: {
                  unsubscribeCount: { increment: 1 },
                },
              });
            }
          }

          // Track as profile event
          await prisma.event.create({
            data: {
              id: generateId('evt'),
              organizationId: data.organizationId,
              profileId: data.profileId,
              name: EVENT_NAMES.EMAIL_UNSUBSCRIBED,
              properties: {
                emailSendId: data.emailSendId,
                campaignId: data.campaignId,
              },
              source: 'email_tracking',
              timestamp: new Date(),
            },
          });
        }

        // Return success page
        const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Unsubscribed</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
    .success { color: #28a745; }
  </style>
</head>
<body>
  <h1 class="success">Successfully Unsubscribed</h1>
  <p>You have been unsubscribed from our mailing list and will no longer receive emails from us.</p>
</body>
</html>
        `;

        return reply.type('text/html').send(html);
      } catch (err) {
        return reply.status(400).send({ error: 'Failed to process unsubscribe' });
      }
    },
  });
};

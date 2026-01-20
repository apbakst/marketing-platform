import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@marketing-platform/database';
import { generateId } from '@marketing-platform/shared';
import { requireSecretKey } from '../middleware/auth.js';

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().max(255).optional(),
  htmlContent: z.string().optional(),
  textContent: z.string().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().max(255).optional(),
  htmlContent: z.string().optional(),
  textContent: z.string().optional(),
});

export const templateRoutes: FastifyPluginAsync = async (fastify) => {
  // List templates
  fastify.get('/', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const templates = await prisma.emailTemplate.findMany({
        where: { organizationId: request.auth.organizationId },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ templates });
    },
  });

  // Get template by ID
  fastify.get<{
    Params: { id: string };
  }>('/:id', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const { id } = request.params;

      const template = await prisma.emailTemplate.findFirst({
        where: {
          id,
          organizationId: request.auth.organizationId,
        },
      });

      if (!template) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Template not found',
        });
      }

      return reply.send({ template });
    },
  });

  // Create template
  fastify.post('/', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const body = createTemplateSchema.parse(request.body);

      const template = await prisma.emailTemplate.create({
        data: {
          id: generateId('tmpl'),
          organizationId: request.auth.organizationId,
          name: body.name,
          subject: body.subject || '',
          htmlContent: body.htmlContent,
          textContent: body.textContent,
        },
      });

      return reply.status(201).send({ template });
    },
  });

  // Update template
  fastify.patch<{
    Params: { id: string };
  }>('/:id', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const { id } = request.params;
      const body = updateTemplateSchema.parse(request.body);

      const existing = await prisma.emailTemplate.findFirst({
        where: {
          id,
          organizationId: request.auth.organizationId,
        },
      });

      if (!existing) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Template not found',
        });
      }

      const template = await prisma.emailTemplate.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.subject !== undefined && { subject: body.subject }),
          ...(body.htmlContent !== undefined && { htmlContent: body.htmlContent }),
          ...(body.textContent !== undefined && { textContent: body.textContent }),
        },
      });

      return reply.send({ template });
    },
  });

  // Delete template
  fastify.delete<{
    Params: { id: string };
  }>('/:id', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const { id } = request.params;

      const existing = await prisma.emailTemplate.findFirst({
        where: {
          id,
          organizationId: request.auth.organizationId,
        },
      });

      if (!existing) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Template not found',
        });
      }

      await prisma.emailTemplate.delete({
        where: { id },
      });

      return reply.status(204).send();
    },
  });

  // Preview template
  fastify.post<{
    Params: { id: string };
  }>('/:id/preview', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const { id } = request.params;
      const { profileId } = request.body as { profileId?: string };

      const template = await prisma.emailTemplate.findFirst({
        where: {
          id,
          organizationId: request.auth.organizationId,
        },
      });

      if (!template) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Template not found',
        });
      }

      // Get profile for preview data
      let profileData = {
        email: 'preview@example.com',
        firstName: 'Preview',
        lastName: 'User',
      };

      if (profileId) {
        const profile = await prisma.profile.findFirst({
          where: {
            id: profileId,
            organizationId: request.auth.organizationId,
          },
        });
        if (profile) {
          profileData = {
            email: profile.email || profileData.email,
            firstName: profile.firstName || profileData.firstName,
            lastName: profile.lastName || profileData.lastName,
          };
        }
      }

      // Get organization for preview data
      const organization = await prisma.organization.findUnique({
        where: { id: request.auth.organizationId },
      });

      // Simple variable replacement for preview
      let html = template.htmlContent || '';
      let subject = template.subject || '';

      const replacements: Record<string, string> = {
        '{{ profile.email }}': profileData.email,
        '{{ profile.firstName }}': profileData.firstName,
        '{{ profile.lastName }}': profileData.lastName,
        '{{ organization.name }}': organization?.name || 'Your Organization',
        '{{ unsubscribe_url }}': '#',
      };

      for (const [key, value] of Object.entries(replacements)) {
        html = html.split(key).join(value);
        subject = subject.split(key).join(value);
      }

      return reply.send({
        subject,
        html,
        text: template.textContent,
      });
    },
  });
};

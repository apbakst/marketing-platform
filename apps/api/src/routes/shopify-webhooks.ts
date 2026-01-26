import { FastifyInstance } from 'fastify';
import { prisma } from '@marketing-platform/database';
import { generateId } from '@marketing-platform/shared';
import crypto from 'crypto';

// Shopify webhook payload types
interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  verified_email: boolean;
  accepts_marketing: boolean;
  accepts_marketing_updated_at?: string;
  marketing_opt_in_level?: string;
  tags?: string;
  currency?: string;
  created_at: string;
  updated_at: string;
  default_address?: {
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
    phone?: string;
  };
  total_spent?: string;
  orders_count?: number;
  note?: string;
}

interface ShopifyLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  title: string;
  quantity: number;
  price: string;
  sku?: string;
  variant_title?: string;
  vendor?: string;
  fulfillment_service?: string;
  properties?: Array<{ name: string; value: string }>;
}

interface ShopifyOrder {
  id: number;
  email: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  number: number;
  order_number: number;
  note?: string;
  token: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  currency: string;
  financial_status: string;
  fulfillment_status?: string;
  customer?: ShopifyCustomer;
  line_items: ShopifyLineItem[];
  shipping_lines?: Array<{
    title: string;
    price: string;
    code: string;
  }>;
  billing_address?: {
    first_name: string;
    last_name: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
    phone?: string;
  };
  shipping_address?: {
    first_name: string;
    last_name: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
    phone?: string;
  };
  discount_codes?: Array<{
    code: string;
    amount: string;
    type: string;
  }>;
  tags?: string;
  source_name?: string;
  referring_site?: string;
  landing_site?: string;
}

interface ShopifyCheckout {
  id: number;
  token: string;
  cart_token?: string;
  email?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  abandoned_checkout_url: string;
  currency: string;
  subtotal_price: string;
  total_price: string;
  total_tax: string;
  total_discounts: string;
  total_line_items_price: string;
  line_items: ShopifyLineItem[];
  customer?: ShopifyCustomer;
  shipping_address?: {
    first_name: string;
    last_name: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
    phone?: string;
  };
  discount_codes?: Array<{
    code: string;
    amount: string;
    type: string;
  }>;
}

// Verify Shopify webhook HMAC signature
function verifyShopifyWebhook(
  body: string,
  hmacHeader: string,
  secret: string
): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
}

export async function shopifyWebhookRoutes(fastify: FastifyInstance): Promise<void> {
  // Add raw body parsing for HMAC verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      try {
        const json = JSON.parse(body as string);
        // Store raw body for HMAC verification
        (req as FastifyRequestWithRawBody).rawBody = body as string;
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  /**
   * Shopify Customer Created Webhook
   * POST /webhooks/shopify/customer/created
   * 
   * Syncs new customers to the CDP
   */
  fastify.post('/webhooks/shopify/customer/created', {
    handler: async (request, reply) => {
      const organizationId = await getOrganizationFromShopifyHeaders(request);
      if (!organizationId) {
        return reply.status(401).send({ error: 'Invalid shop' });
      }

      // Verify HMAC signature
      const hmacHeader = request.headers['x-shopify-hmac-sha256'] as string;
      const shopifySecret = await getShopifySecret(organizationId);
      
      if (shopifySecret && hmacHeader) {
        const rawBody = (request as FastifyRequestWithRawBody).rawBody;
        if (!verifyShopifyWebhook(rawBody, hmacHeader, shopifySecret)) {
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      }

      const customer = request.body as ShopifyCustomer;

      try {
        // Create or update profile in CDP
        const profile = await prisma.profile.upsert({
          where: {
            organizationId_email: {
              organizationId,
              email: customer.email.toLowerCase(),
            },
          },
          create: {
            id: generateId('prf'),
            organizationId,
            email: customer.email.toLowerCase(),
            externalId: customer.id.toString(),
            firstName: customer.first_name,
            lastName: customer.last_name,
            phone: customer.phone,
            subscriptionStatus: customer.accepts_marketing ? 'subscribed' : 'unsubscribed',
            properties: {
              shopify_customer_id: customer.id,
              shopify_verified_email: customer.verified_email,
              shopify_accepts_marketing: customer.accepts_marketing,
              shopify_marketing_opt_in_level: customer.marketing_opt_in_level,
              shopify_tags: customer.tags,
              shopify_currency: customer.currency,
              shopify_created_at: customer.created_at,
              total_spent: parseFloat(customer.total_spent || '0'),
              orders_count: customer.orders_count || 0,
            },
            address: customer.default_address
              ? {
                  street: [
                    customer.default_address.address1,
                    customer.default_address.address2,
                  ]
                    .filter(Boolean)
                    .join(', '),
                  city: customer.default_address.city,
                  state: customer.default_address.province,
                  country: customer.default_address.country,
                  postalCode: customer.default_address.zip,
                }
              : undefined,
          },
          update: {
            externalId: customer.id.toString(),
            firstName: customer.first_name,
            lastName: customer.last_name,
            phone: customer.phone,
            subscriptionStatus: customer.accepts_marketing ? 'subscribed' : 'unsubscribed',
            properties: {
              shopify_customer_id: customer.id,
              shopify_verified_email: customer.verified_email,
              shopify_accepts_marketing: customer.accepts_marketing,
              shopify_marketing_opt_in_level: customer.marketing_opt_in_level,
              shopify_tags: customer.tags,
              shopify_currency: customer.currency,
              shopify_updated_at: customer.updated_at,
              total_spent: parseFloat(customer.total_spent || '0'),
              orders_count: customer.orders_count || 0,
            },
          },
        });

        // Track the customer creation event
        await prisma.event.create({
          data: {
            id: generateId('evt'),
            organizationId,
            profileId: profile.id,
            name: 'Customer Created',
            properties: {
              source: 'shopify',
              shopify_customer_id: customer.id,
              accepts_marketing: customer.accepts_marketing,
            },
            timestamp: new Date(customer.created_at),
          },
        });

        // Trigger flow if customer accepts marketing
        if (customer.accepts_marketing) {
          await prisma.event.create({
            data: {
              id: generateId('evt'),
              organizationId,
              profileId: profile.id,
              name: 'Subscribed to List',
              properties: {
                source: 'shopify',
                list_name: 'Newsletter',
                method: 'shopify_checkout',
              },
              timestamp: new Date(customer.created_at),
            },
          });
        }

        console.log(`Synced Shopify customer ${customer.id} to profile ${profile.id}`);

        return reply.status(200).send({
          success: true,
          profileId: profile.id,
        });
      } catch (error) {
        console.error('Error processing Shopify customer webhook:', error);
        return reply.status(500).send({
          error: 'Internal server error',
        });
      }
    },
  });

  /**
   * Shopify Order Created Webhook
   * POST /webhooks/shopify/orders/created
   * 
   * Tracks purchase events in the CDP
   */
  fastify.post('/webhooks/shopify/orders/created', {
    handler: async (request, reply) => {
      const organizationId = await getOrganizationFromShopifyHeaders(request);
      if (!organizationId) {
        return reply.status(401).send({ error: 'Invalid shop' });
      }

      // Verify HMAC signature
      const hmacHeader = request.headers['x-shopify-hmac-sha256'] as string;
      const shopifySecret = await getShopifySecret(organizationId);
      
      if (shopifySecret && hmacHeader) {
        const rawBody = (request as FastifyRequestWithRawBody).rawBody;
        if (!verifyShopifyWebhook(rawBody, hmacHeader, shopifySecret)) {
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      }

      const order = request.body as ShopifyOrder;

      try {
        // Find or create profile
        let profile = await prisma.profile.findUnique({
          where: {
            organizationId_email: {
              organizationId,
              email: order.email.toLowerCase(),
            },
          },
        });

        if (!profile) {
          profile = await prisma.profile.create({
            data: {
              id: generateId('prf'),
              organizationId,
              email: order.email.toLowerCase(),
              externalId: order.customer?.id?.toString(),
              firstName: order.customer?.first_name || order.billing_address?.first_name,
              lastName: order.customer?.last_name || order.billing_address?.last_name,
              phone: order.customer?.phone,
              subscriptionStatus: order.customer?.accepts_marketing ? 'subscribed' : 'unsubscribed',
              properties: {
                shopify_customer_id: order.customer?.id,
              },
            },
          });
        }

        // Prepare line items for event properties
        const lineItems = order.line_items.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          sku: item.sku,
          title: item.title,
          variant_title: item.variant_title,
          quantity: item.quantity,
          price: parseFloat(item.price),
          vendor: item.vendor,
        }));

        // Track Order Placed event
        await prisma.event.create({
          data: {
            id: generateId('evt'),
            organizationId,
            profileId: profile.id,
            name: 'Order Placed',
            properties: {
              source: 'shopify',
              order_id: order.id,
              order_number: order.order_number,
              total_price: parseFloat(order.total_price),
              subtotal_price: parseFloat(order.subtotal_price),
              total_tax: parseFloat(order.total_tax),
              total_discounts: parseFloat(order.total_discounts),
              currency: order.currency,
              financial_status: order.financial_status,
              fulfillment_status: order.fulfillment_status,
              item_count: order.line_items.reduce((sum, item) => sum + item.quantity, 0),
              items: lineItems,
              discount_codes: order.discount_codes?.map((d) => d.code),
              source_name: order.source_name,
              referring_site: order.referring_site,
              tags: order.tags,
            },
            timestamp: new Date(order.created_at),
          },
        });

        // Track individual product purchases for better analytics
        for (const item of order.line_items) {
          await prisma.event.create({
            data: {
              id: generateId('evt'),
              organizationId,
              profileId: profile.id,
              name: 'Product Purchased',
              properties: {
                source: 'shopify',
                order_id: order.id,
                product_id: item.product_id,
                variant_id: item.variant_id,
                sku: item.sku,
                title: item.title,
                variant_title: item.variant_title,
                quantity: item.quantity,
                price: parseFloat(item.price),
                total: parseFloat(item.price) * item.quantity,
                vendor: item.vendor,
              },
              timestamp: new Date(order.created_at),
            },
          });
        }

        // Update profile with purchase metrics
        const totalSpent = parseFloat(order.total_price);
        await prisma.profile.update({
          where: { id: profile.id },
          data: {
            properties: {
              ...((profile.properties as Record<string, unknown>) || {}),
              last_order_id: order.id,
              last_order_date: order.created_at,
              last_order_value: totalSpent,
              lifetime_value:
                (((profile.properties as Record<string, unknown>)?.lifetime_value as number) || 0) +
                totalSpent,
              total_orders:
                (((profile.properties as Record<string, unknown>)?.total_orders as number) || 0) + 1,
            },
          },
        });

        console.log(`Tracked order ${order.id} for profile ${profile.id}`);

        return reply.status(200).send({
          success: true,
          profileId: profile.id,
          orderId: order.id,
        });
      } catch (error) {
        console.error('Error processing Shopify order webhook:', error);
        return reply.status(500).send({
          error: 'Internal server error',
        });
      }
    },
  });

  /**
   * Shopify Checkout Abandoned Webhook
   * POST /webhooks/shopify/checkouts/abandoned
   * 
   * Triggers abandoned cart flow
   */
  fastify.post('/webhooks/shopify/checkouts/abandoned', {
    handler: async (request, reply) => {
      const organizationId = await getOrganizationFromShopifyHeaders(request);
      if (!organizationId) {
        return reply.status(401).send({ error: 'Invalid shop' });
      }

      // Verify HMAC signature
      const hmacHeader = request.headers['x-shopify-hmac-sha256'] as string;
      const shopifySecret = await getShopifySecret(organizationId);
      
      if (shopifySecret && hmacHeader) {
        const rawBody = (request as FastifyRequestWithRawBody).rawBody;
        if (!verifyShopifyWebhook(rawBody, hmacHeader, shopifySecret)) {
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      }

      const checkout = request.body as ShopifyCheckout;

      // Skip if no email
      if (!checkout.email) {
        return reply.status(200).send({ skipped: true, reason: 'no_email' });
      }

      try {
        // Find or create profile
        let profile = await prisma.profile.findUnique({
          where: {
            organizationId_email: {
              organizationId,
              email: checkout.email.toLowerCase(),
            },
          },
        });

        if (!profile) {
          profile = await prisma.profile.create({
            data: {
              id: generateId('prf'),
              organizationId,
              email: checkout.email.toLowerCase(),
              externalId: checkout.customer?.id?.toString(),
              firstName:
                checkout.customer?.first_name || checkout.shipping_address?.first_name,
              lastName:
                checkout.customer?.last_name || checkout.shipping_address?.last_name,
              phone: checkout.customer?.phone,
              subscriptionStatus: checkout.customer?.accepts_marketing
                ? 'subscribed'
                : 'unsubscribed',
              properties: {
                shopify_customer_id: checkout.customer?.id,
              },
            },
          });
        }

        // Prepare cart items for event properties
        const cartItems = checkout.line_items.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          sku: item.sku,
          title: item.title,
          variant_title: item.variant_title,
          quantity: item.quantity,
          price: parseFloat(item.price),
        }));

        // Track Checkout Abandoned event
        await prisma.event.create({
          data: {
            id: generateId('evt'),
            organizationId,
            profileId: profile.id,
            name: 'Checkout Abandoned',
            properties: {
              source: 'shopify',
              checkout_id: checkout.id,
              checkout_token: checkout.token,
              cart_token: checkout.cart_token,
              abandoned_checkout_url: checkout.abandoned_checkout_url,
              cart_value: parseFloat(checkout.total_price),
              subtotal: parseFloat(checkout.subtotal_price),
              total_tax: parseFloat(checkout.total_tax),
              total_discounts: parseFloat(checkout.total_discounts),
              currency: checkout.currency,
              item_count: checkout.line_items.reduce((sum, item) => sum + item.quantity, 0),
              cart_items: cartItems,
              discount_codes: checkout.discount_codes?.map((d) => d.code),
            },
            timestamp: new Date(checkout.updated_at),
          },
        });

        // Update profile with abandoned cart info
        await prisma.profile.update({
          where: { id: profile.id },
          data: {
            properties: {
              ...((profile.properties as Record<string, unknown>) || {}),
              last_abandoned_checkout_id: checkout.id,
              last_abandoned_checkout_url: checkout.abandoned_checkout_url,
              last_abandoned_checkout_value: parseFloat(checkout.total_price),
              last_abandoned_checkout_date: checkout.updated_at,
              abandoned_checkouts_count:
                (((profile.properties as Record<string, unknown>)?.abandoned_checkouts_count as number) || 0) + 1,
            },
          },
        });

        console.log(`Tracked abandoned checkout ${checkout.id} for profile ${profile.id}`);

        return reply.status(200).send({
          success: true,
          profileId: profile.id,
          checkoutId: checkout.id,
        });
      } catch (error) {
        console.error('Error processing Shopify checkout abandoned webhook:', error);
        return reply.status(500).send({
          error: 'Internal server error',
        });
      }
    },
  });

  /**
   * Shopify Customer Updated Webhook
   * POST /webhooks/shopify/customer/updated
   * 
   * Updates customer data in CDP
   */
  fastify.post('/webhooks/shopify/customer/updated', {
    handler: async (request, reply) => {
      const organizationId = await getOrganizationFromShopifyHeaders(request);
      if (!organizationId) {
        return reply.status(401).send({ error: 'Invalid shop' });
      }

      const customer = request.body as ShopifyCustomer;

      try {
        const profile = await prisma.profile.findUnique({
          where: {
            organizationId_email: {
              organizationId,
              email: customer.email.toLowerCase(),
            },
          },
        });

        if (!profile) {
          return reply.status(200).send({ skipped: true, reason: 'profile_not_found' });
        }

        // Check if marketing preference changed
        const previousAcceptsMarketing = (profile.properties as Record<string, unknown>)
          ?.shopify_accepts_marketing as boolean | undefined;

        await prisma.profile.update({
          where: { id: profile.id },
          data: {
            firstName: customer.first_name,
            lastName: customer.last_name,
            phone: customer.phone,
            subscriptionStatus: customer.accepts_marketing ? 'subscribed' : 'unsubscribed',
            properties: {
              ...((profile.properties as Record<string, unknown>) || {}),
              shopify_verified_email: customer.verified_email,
              shopify_accepts_marketing: customer.accepts_marketing,
              shopify_marketing_opt_in_level: customer.marketing_opt_in_level,
              shopify_tags: customer.tags,
              shopify_updated_at: customer.updated_at,
              total_spent: parseFloat(customer.total_spent || '0'),
              orders_count: customer.orders_count || 0,
            },
            address: customer.default_address
              ? {
                  street: [
                    customer.default_address.address1,
                    customer.default_address.address2,
                  ]
                    .filter(Boolean)
                    .join(', '),
                  city: customer.default_address.city,
                  state: customer.default_address.province,
                  country: customer.default_address.country,
                  postalCode: customer.default_address.zip,
                }
              : undefined,
          },
        });

        // Track marketing preference change
        if (previousAcceptsMarketing !== undefined && previousAcceptsMarketing !== customer.accepts_marketing) {
          await prisma.event.create({
            data: {
              id: generateId('evt'),
              organizationId,
              profileId: profile.id,
              name: customer.accepts_marketing ? 'Subscribed to List' : 'Unsubscribed from List',
              properties: {
                source: 'shopify',
                list_name: 'Newsletter',
                method: 'shopify_preference_update',
              },
              timestamp: new Date(customer.updated_at),
            },
          });
        }

        return reply.status(200).send({
          success: true,
          profileId: profile.id,
        });
      } catch (error) {
        console.error('Error processing Shopify customer update webhook:', error);
        return reply.status(500).send({
          error: 'Internal server error',
        });
      }
    },
  });
}

// Helper type for raw body access
interface FastifyRequestWithRawBody {
  rawBody: string;
}

/**
 * Extract organization ID from Shopify webhook headers
 */
async function getOrganizationFromShopifyHeaders(
  request: { headers: Record<string, string | string[] | undefined> }
): Promise<string | null> {
  const shopDomain = request.headers['x-shopify-shop-domain'] as string;
  
  if (!shopDomain) {
    return null;
  }

  // Look up organization by Shopify shop domain
  const integration = await prisma.integration.findFirst({
    where: {
      type: 'shopify',
      config: {
        path: ['shop_domain'],
        equals: shopDomain,
      },
    },
    select: {
      organizationId: true,
    },
  });

  return integration?.organizationId || null;
}

/**
 * Get Shopify webhook secret for HMAC verification
 */
async function getShopifySecret(organizationId: string): Promise<string | null> {
  const integration = await prisma.integration.findFirst({
    where: {
      organizationId,
      type: 'shopify',
    },
    select: {
      config: true,
    },
  });

  return (integration?.config as Record<string, unknown>)?.webhook_secret as string || null;
}

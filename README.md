# Marketing Platform

A complete marketing automation platform with Customer Data Platform, Segmentation Engine, Email Marketing (multi-provider), Automation Flows, and Analytics Dashboard.

## Tech Stack

- **Backend**: Node.js/TypeScript with Fastify
- **Database**: PostgreSQL (with partitioning for events)
- **Queue**: BullMQ + Redis
- **Email Providers**: AWS SES, SendGrid, MixMax (with smart routing & failover)
- **Frontend**: Next.js 14+ (App Router) with React

## Project Structure

```
marketing-platform/
├── apps/
│   ├── api/                    # Main API server (Fastify)
│   ├── tracking/               # High-throughput tracking API
│   ├── workers/                # Background job workers
│   └── web/                    # Next.js Dashboard
├── packages/
│   ├── database/               # Prisma schema & migrations
│   ├── shared/                 # Shared types & utilities
│   ├── sdk/                    # JavaScript SDK for storefronts
│   └── email-templates/        # Base email templates
└── infrastructure/             # Docker, Terraform, K8s
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- npm 10+

### 1. Start Infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL and Redis.

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 4. Initialize Database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:push

# Seed with demo data
cd packages/database && npm run db:seed
```

### 5. Start Development Servers

```bash
npm run dev
```

This starts all services in development mode:
- API Server: http://localhost:3001
- Tracking API: http://localhost:3002
- Web Dashboard: http://localhost:3000
- API Docs: http://localhost:3001/docs

## Architecture

### Modular Monolith

```
┌─────────────────────────────────────────────────────────────────┐
│                     LOAD BALANCER                                │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  WEB DASHBOARD  │  │   API GATEWAY   │  │  TRACKING API   │
│   (Next.js)     │  │   (Fastify)     │  │ (High-throughput)│
└─────────────────┘  └─────────────────┘  └─────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│              MODULAR MONOLITH (Node.js/TypeScript)              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │   CDP   │ │ Segment │ │Campaign │ │  Flow   │ │Analytics│   │
│  │ Module  │ │ Module  │ │ Module  │ │ Module  │ │ Module  │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   PostgreSQL    │  │     Redis       │  │ Email Providers │
│   (Primary DB)  │  │ (Cache+Queues)  │  │ SES/SG/MixMax   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## API Reference

### Authentication

All API requests require authentication via Bearer token:

```
Authorization: Bearer <api_key>
```

- **Public keys** (`pk_*`): For tracking and identify endpoints
- **Secret keys** (`sk_*`): For management endpoints

### Tracking API (Public Key)

```bash
# Track event
POST /track
{
  "email": "user@example.com",
  "name": "Page Viewed",
  "properties": { "page": "/pricing" }
}

# Identify profile
POST /identify
{
  "email": "user@example.com",
  "traits": { "firstName": "John", "lastName": "Doe" }
}

# Batch track
POST /track/batch
{
  "events": [
    { "email": "user@example.com", "name": "Event1" },
    { "email": "user@example.com", "name": "Event2" }
  ]
}
```

### Management API (Secret Key)

```bash
# Profiles
GET    /api/v1/profiles
POST   /api/v1/profiles
GET    /api/v1/profiles/:id
PATCH  /api/v1/profiles/:id
DELETE /api/v1/profiles/:id

# Segments
GET    /api/v1/segments
POST   /api/v1/segments
GET    /api/v1/segments/:id
PATCH  /api/v1/segments/:id
DELETE /api/v1/segments/:id
GET    /api/v1/segments/:id/members
POST   /api/v1/segments/estimate
POST   /api/v1/segments/:id/recalculate

# Campaigns
GET    /api/v1/campaigns
POST   /api/v1/campaigns
GET    /api/v1/campaigns/:id
PATCH  /api/v1/campaigns/:id
DELETE /api/v1/campaigns/:id
POST   /api/v1/campaigns/:id/schedule
POST   /api/v1/campaigns/:id/send
POST   /api/v1/campaigns/:id/cancel
GET    /api/v1/campaigns/:id/stats
```

## JavaScript SDK

### Installation

```bash
npm install @marketing-platform/sdk
```

### Usage

```javascript
import { marketing } from '@marketing-platform/sdk';

// Initialize
marketing.init({
  apiKey: 'pk_your_public_key',
  apiUrl: 'https://tracking.yoursite.com',
  debug: true,
});

// Identify user
await marketing.identify({
  email: 'user@example.com',
  traits: {
    firstName: 'John',
    lastName: 'Doe',
  },
});

// Track events
await marketing.track('Product Viewed', {
  productId: '123',
  productName: 'Widget',
  price: 29.99,
});

// Track page views
await marketing.page('Pricing Page');
```

## Email Providers

The platform supports multiple email providers with automatic failover:

1. **AWS SES** - Primary provider
2. **SendGrid** - Backup provider
3. **Postmark** - Additional provider
4. **Klaviyo** - Marketing automation provider

### Smart Routing

- Priority-based provider selection
- Automatic failover on errors
- Circuit breaker pattern for unhealthy providers
- Rate limiting per provider

### Klaviyo Integration

Klaviyo provides advanced marketing automation capabilities including profiles, lists, campaigns, and flows.

#### Setup

1. Create a Klaviyo account at [klaviyo.com](https://www.klaviyo.com)
2. Generate a Private API Key from Settings → API Keys
3. Add the API key to your environment:

```bash
KLAVIYO_API_KEY=pk_your_private_api_key
KLAVIYO_API_REVISION=2024-02-15  # Optional, defaults to 2024-02-15
```

4. Configure Klaviyo as an email provider in your organization settings:

```json
{
  "type": "klaviyo",
  "name": "Klaviyo",
  "priority": 2,
  "config": {
    "apiKey": "pk_your_private_api_key"
  }
}
```

#### Features

- **Profile Management**: Create, update, and sync customer profiles
- **List Management**: Create lists and manage subscriptions
- **Event Tracking**: Track custom events to trigger flows
- **Campaigns**: Create and schedule email campaigns
- **Flows**: Manage automation flows programmatically
- **Templates**: Create and manage email templates

#### API Examples

```typescript
import { KlaviyoProvider } from './providers/klaviyo';

const klaviyo = new KlaviyoProvider({
  apiKey: process.env.KLAVIYO_API_KEY,
});

// Create/update a profile
await klaviyo.upsertProfile({
  email: 'customer@example.com',
  firstName: 'John',
  lastName: 'Doe',
  properties: {
    lifetime_value: 500,
    favorite_category: 'Electronics',
  },
});

// Track an event (triggers flows)
await klaviyo.createEvent({
  eventName: 'Order Placed',
  email: 'customer@example.com',
  properties: {
    order_id: 'ORD-123',
    items: [{ name: 'Widget', price: 29.99 }],
  },
  value: 29.99,
});

// Add to a list
await klaviyo.addToList('LIST_ID', [
  { email: 'subscriber@example.com' },
]);
```

#### Webhooks

Configure Klaviyo webhooks to receive real-time updates:

- Endpoint: `POST /webhooks/klaviyo`
- Events: Subscribed, Unsubscribed, Bounced, Complained

## Development

### Available Scripts

```bash
# Start all services in dev mode
npm run dev

# Build all packages
npm run build

# Run linting
npm run lint

# Run tests
npm run test

# Database operations
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run migrations
npm run db:push      # Push schema to database
```

### Project Scripts

Each app/package has its own scripts:

```bash
# API Server
cd apps/api && npm run dev

# Web Dashboard
cd apps/web && npm run dev

# Workers
cd apps/workers && npm run dev

# Tracking API
cd apps/tracking && npm run dev
```

## Shopify Integration

The platform includes native Shopify webhook receivers for syncing customer data and tracking e-commerce events.

### Webhook Endpoints

| Webhook | Endpoint | Description |
|---------|----------|-------------|
| `customers/create` | `/webhooks/shopify/customer/created` | Syncs new customers to CDP |
| `customers/update` | `/webhooks/shopify/customer/updated` | Updates customer data |
| `orders/create` | `/webhooks/shopify/orders/created` | Tracks purchase events |
| `checkouts/abandoned` | `/webhooks/shopify/checkouts/abandoned` | Triggers abandoned cart flows |

### Setup

1. In Shopify Admin, go to Settings → Notifications → Webhooks
2. Add webhooks for each endpoint listed above
3. Store the webhook secret in your integration config:

```json
{
  "type": "shopify",
  "config": {
    "shop_domain": "your-store.myshopify.com",
    "webhook_secret": "your_webhook_secret"
  }
}
```

### Events Tracked

- **Customer Created**: New customer registration
- **Subscribed to List**: When customer opts into marketing
- **Order Placed**: Purchase completion with line items
- **Product Purchased**: Individual product tracking
- **Checkout Abandoned**: Cart abandonment for recovery flows

### Sample Automation Flows

The platform includes pre-built automation flows in `packages/database/seed/flows/`:

1. **Welcome Series** (`welcome-series.json`)
   - 3-email sequence over 7 days
   - Engagement-based branching
   - Profile tagging on completion

2. **Abandoned Cart Recovery** (`abandoned-cart.json`)
   - Multi-step reminder sequence
   - Cart value-based incentives (15% off for high-value, free shipping for standard)
   - Exit on conversion

3. **Re-engagement Campaign** (`re-engagement.json`)
   - Targets 30+ day inactive subscribers
   - VIP vs standard customer paths
   - Sunset sequence for non-responders

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `PORT` | API server port | `3001` |
| `TRACKING_PORT` | Tracking API port | `3002` |
| `AWS_SES_REGION` | AWS SES region | `us-east-1` |
| `SENDGRID_API_KEY` | SendGrid API key | - |
| `KLAVIYO_API_KEY` | Klaviyo Private API key | - |
| `KLAVIYO_API_REVISION` | Klaviyo API version | `2024-02-15` |

## License

MIT

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
3. **MixMax** - Additional provider

### Smart Routing

- Priority-based provider selection
- Automatic failover on errors
- Circuit breaker pattern for unhealthy providers
- Rate limiting per provider

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

## License

MIT

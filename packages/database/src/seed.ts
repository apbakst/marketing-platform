import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

function generateApiKey(type: 'public' | 'secret'): { key: string; prefix: string; hash: string } {
  const prefix = type === 'public' ? 'pk' : 'sk';
  const secret = randomBytes(32).toString('base64url');
  const key = `${prefix}_${secret}`;
  const keyPrefix = `${prefix}_${secret.substring(0, 8)}`;
  const keyHash = createHash('sha256').update(key).digest('hex');
  return { key, prefix: keyPrefix, hash: keyHash };
}

async function main() {
  console.log('Seeding database...');

  // Create demo organization
  const org = await prisma.organization.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Organization',
      slug: 'demo',
      settings: {
        timezone: 'America/New_York',
        defaultFromName: 'Demo Team',
        defaultFromEmail: 'hello@demo.example.com',
      },
    },
  });

  console.log(`Created organization: ${org.name} (${org.id})`);

  // Create API keys
  const publicKey = generateApiKey('public');
  const secretKey = generateApiKey('secret');

  await prisma.apiKey.upsert({
    where: { keyHash: publicKey.hash },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Default Public Key',
      type: 'public',
      keyPrefix: publicKey.prefix,
      keyHash: publicKey.hash,
    },
  });

  await prisma.apiKey.upsert({
    where: { keyHash: secretKey.hash },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Default Secret Key',
      type: 'secret',
      keyPrefix: secretKey.prefix,
      keyHash: secretKey.hash,
    },
  });

  console.log('\nAPI Keys (save these, they will not be shown again):');
  console.log(`Public Key: ${publicKey.key}`);
  console.log(`Secret Key: ${secretKey.key}`);

  // Create sample profiles
  const profiles = await Promise.all([
    prisma.profile.upsert({
      where: { organizationId_email: { organizationId: org.id, email: 'john@example.com' } },
      update: {},
      create: {
        organizationId: org.id,
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        properties: {
          plan: 'premium',
          signupSource: 'website',
        },
      },
    }),
    prisma.profile.upsert({
      where: { organizationId_email: { organizationId: org.id, email: 'jane@example.com' } },
      update: {},
      create: {
        organizationId: org.id,
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        properties: {
          plan: 'free',
          signupSource: 'referral',
        },
      },
    }),
  ]);

  console.log(`\nCreated ${profiles.length} sample profiles`);

  // Create sample segment
  const segment = await prisma.segment.upsert({
    where: { id: 'demo-premium-users' },
    update: {},
    create: {
      id: 'demo-premium-users',
      organizationId: org.id,
      name: 'Premium Users',
      description: 'Users on the premium plan',
      conditions: {
        operator: 'and',
        conditions: [
          {
            type: 'property',
            field: 'properties.plan',
            operator: 'equals',
            value: 'premium',
          },
        ],
      },
      memberCount: 1,
    },
  });

  console.log(`Created segment: ${segment.name}`);

  console.log('\nSeeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

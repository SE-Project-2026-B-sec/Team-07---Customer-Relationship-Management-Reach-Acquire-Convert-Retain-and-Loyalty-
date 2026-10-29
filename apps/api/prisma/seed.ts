/**
 * Demo data for local development and tests (Test Plan section 6).
 * Run with: npm run seed --workspace apps/api
 * Every demo account uses SEED_PASSWORD (default Password@123). Local/dev only.
 */
import 'dotenv/config';
import {
  DealStage,
  LeadStatus,
  PrismaClient,
  Role,
  TicketPriority,
  TierName,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const CITIES = ['Bengaluru', 'Mumbai', 'Chennai', 'Hyderabad', 'Pune', 'Delhi'];
const FIRST = [
  'Aarav',
  'Ananya',
  'Rohan',
  'Priya',
  'Karthik',
  'Sneha',
  'Vikram',
  'Meera',
  'Arjun',
  'Kavya',
];
const LAST = [
  'Sharma',
  'Iyer',
  'Reddy',
  'Nair',
  'Gupta',
  'Rao',
  'Menon',
  'Patel',
  'Kumar',
  'Joshi',
];
const INDUSTRIES = ['Retail', 'Education', 'Healthcare', 'Software', 'Hospitality'];
const STAGES: DealStage[] = ['PROSPECTING', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];
const SOURCES = ['WEB', 'MANUAL', 'IMPORT', 'REFERRAL', 'CAMPAIGN'];

// Simple deterministic pseudo-random so every teammate gets the same data.
let state = 42;
const rand = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function main() {
  const password = process.env.SEED_PASSWORD ?? 'Password@123';
  const passwordHash = await bcrypt.hash(password, 10);

  console.log('Clearing existing data...');
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.redemption.deleteMany(),
    prisma.referral.deleteMany(),
    prisma.pointsLedger.deleteMany(),
    prisma.order.deleteMany(),
    prisma.reward.deleteMany(),
    prisma.tier.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.deal.deleteMany(),
    prisma.campaignEvent.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.segment.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.account.deleteMany(),
    prisma.leadScoreRule.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log('Creating users (one per role)...');
  const users: Record<string, { id: string }> = {};
  const userDefs: [string, string, Role][] = [
    ['admin@crm.test', 'Admin User', 'ADMIN'],
    ['marketing@crm.test', 'Marketing Executive', 'MARKETING'],
    ['manager@crm.test', 'Sales Manager', 'SALES_MANAGER'],
    ['rep@crm.test', 'Sales Rep One', 'SALES_REP'],
    ['rep2@crm.test', 'Sales Rep Two', 'SALES_REP'],
    ['support@crm.test', 'Support Agent', 'SUPPORT'],
  ];
  for (const [email, name, role] of userDefs) {
    users[email] = await prisma.user.create({ data: { email, name, role, passwordHash } });
  }
  const reps = [users['rep@crm.test'].id, users['rep2@crm.test'].id];

  console.log('Creating tiers, rewards and scoring rules...');
  await prisma.tier.createMany({
    data: [
      { name: TierName.BRONZE, minPoints: 0 },
      { name: TierName.SILVER, minPoints: 500 },
      { name: TierName.GOLD, minPoints: 1500 },
      { name: TierName.PLATINUM, minPoints: 4000 },
    ],
  });
  await prisma.reward.createMany({
    data: [
      { name: 'Rs 100 voucher', pointsCost: 200, stock: 100 },
      { name: 'Free delivery for a month', pointsCost: 350, stock: 50 },
      { name: 'Rs 500 voucher', pointsCost: 900, stock: 20 },
      { name: 'Priority support for a year', pointsCost: 1500, stock: 10 },
    ],
  });
  await prisma.leadScoreRule.createMany({
    data: [
      { field: 'source', matchJson: { equals: 'REFERRAL' }, points: 30 },
      { field: 'source', matchJson: { equals: 'WEB' }, points: 15 },
      { field: 'phone', matchJson: { present: true }, points: 10 },
      { field: 'company', matchJson: { present: true }, points: 15 },
    ],
  });

  console.log('Creating accounts and contacts...');
  const accounts = [];
  for (let i = 0; i < 20; i++) {
    accounts.push(
      await prisma.account.create({
        data: {
          name: `${pick(LAST)} ${pick(['Traders', 'Enterprises', 'Solutions', 'Foods', 'Labs'])} ${i + 1}`,
          industry: pick(INDUSTRIES),
          city: pick(CITIES),
        },
      }),
    );
  }
  const contacts = [];
  for (let i = 0; i < 200; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    contacts.push(
      await prisma.contact.create({
        data: {
          name: `${first} ${last}`,
          email: `${first}.${last}.${i}@example.com`.toLowerCase(),
          phone: `+91 9${String(100000000 + i * 7919).slice(0, 9)}`,
          city: pick(CITIES),
          tags: rand() > 0.8 ? ['vip'] : [],
          marketingConsent: rand() > 0.3,
          referralCode: `REF${String(i + 1).padStart(4, '0')}`,
          accountId: rand() > 0.3 ? pick(accounts).id : null,
          ownerId: pick(reps),
          createdAt: daysAgo(Math.floor(rand() * 180)),
        },
      }),
    );
  }

  console.log('Creating segment, campaign and leads...');
  const segment = await prisma.segment.create({
    data: { name: 'Bengaluru customers', filterJson: { city: 'Bengaluru' } },
  });
  const campaign = await prisma.campaign.create({
    data: {
      name: 'Diwali Offer 2026',
      channel: 'EMAIL',
      budget: 20000,
      status: 'COMPLETED',
      startDate: daysAgo(20),
      endDate: daysAgo(5),
      segmentId: segment.id,
    },
  });
  for (let i = 0; i < 50; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    await prisma.lead.create({
      data: {
        name: `${first} ${last}`,
        email: `lead.${first}.${i}@example.com`.toLowerCase(),
        phone: rand() > 0.4 ? `+91 8${String(200000000 + i * 104729).slice(0, 9)}` : null,
        company: rand() > 0.5 ? `${last} Co` : null,
        source: pick(SOURCES),
        status: pick<LeadStatus>(['NEW', 'NEW', 'CONTACTED', 'QUALIFIED', 'LOST']),
        score: Math.floor(rand() * 100),
        ownerId: rand() > 0.2 ? pick(reps) : null,
        campaignId: rand() > 0.6 ? campaign.id : null,
        createdAt: daysAgo(Math.floor(rand() * 60)),
      },
    });
  }

  console.log('Creating deals, orders, points, tickets...');
  for (let i = 0; i < 30; i++) {
    const contact = pick(contacts);
    const stage = pick(STAGES);
    await prisma.deal.create({
      data: {
        title: `${pick(['Annual plan', 'Bulk order', 'Pilot', 'Renewal'])} - ${contact.name}`,
        value: Math.round(10000 + rand() * 190000),
        stage,
        expectedClose: daysAgo(-Math.floor(rand() * 60)),
        wonAt: stage === 'WON' ? daysAgo(Math.floor(rand() * 30)) : null,
        contactId: contact.id,
        accountId: contact.accountId,
        ownerId: contact.ownerId ?? reps[0],
      },
    });
  }

  // Orders earn 1 point per Rs 100 into an append-only ledger.
  let orderNo = 1;
  for (const contact of contacts.slice(0, 80)) {
    let balance = 0;
    const count = 1 + Math.floor(rand() * 4);
    for (let k = 0; k < count; k++) {
      const amount = Math.round(500 + rand() * 20000);
      const order = await prisma.order.create({
        data: {
          orderNo: `ORD-${String(orderNo++).padStart(5, '0')}`,
          amount,
          contactId: contact.id,
          orderedAt: daysAgo(Math.floor(rand() * 150)),
        },
      });
      const points = Math.floor(amount / 100);
      balance += points;
      await prisma.pointsLedger.create({
        data: {
          contactId: contact.id,
          delta: points,
          reason: 'EARN',
          balanceAfter: balance,
          orderId: order.id,
        },
      });
    }
    const tier: TierName =
      balance >= 4000
        ? 'PLATINUM'
        : balance >= 1500
          ? 'GOLD'
          : balance >= 500
            ? 'SILVER'
            : 'BRONZE';
    await prisma.contact.update({ where: { id: contact.id }, data: { tier } });
  }

  const SLA_HOURS: Record<TicketPriority, number> = { LOW: 72, MEDIUM: 48, HIGH: 24, URGENT: 4 };
  for (let i = 0; i < 25; i++) {
    const priority = pick<TicketPriority>(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
    const createdAt = daysAgo(Math.floor(rand() * 10));
    await prisma.ticket.create({
      data: {
        subject: pick([
          'Order not delivered',
          'Points not credited',
          'Wrong invoice',
          'Login issue',
          'Refund request',
        ]),
        description: 'Customer reported this issue through the support line.',
        priority,
        status: pick(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
        slaDueAt: new Date(createdAt.getTime() + SLA_HOURS[priority] * 3_600_000),
        contactId: pick(contacts).id,
        assigneeId: users['support@crm.test'].id,
        createdAt,
      },
    });
  }

  console.log(`Done. Log in with any @crm.test account using password "${password}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

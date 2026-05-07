/**
 * Demo seed. Creates a deterministic test user with a populated network so the
 * UI is exercisable without going through OAuth. ONLY for local dev.
 *
 * Usage: pnpm db:seed
 *
 * The seed user has id 00000000-0000-0000-0000-000000000001. To sign in as
 * this user in dev, manually issue a Supabase JWT or wire the test harness.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (!m) continue;
    const [, key, value] = m;
    if (process.env[key] === undefined) {
      process.env[key] = value.replace(/^['"]|['"]$/g, "");
    }
  }
}

import { adminDb } from "./client";
import {
  users,
  contacts,
  clusters,
  contactClusters,
  touchpoints,
  goals,
} from "./schema";
import { ensureUserProvisioned } from "@/lib/auth/provision";
import { recomputePulseForContact } from "@/lib/pulse/persist";
import { eq } from "drizzle-orm";

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";

const DEMO_CONTACTS: Array<{
  firstName: string;
  lastName: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  role: string;
  company: string;
  cluster: string;
  tier: 1 | 2;
  daysAgoLastTouchpoint: number;
}> = [
  { firstName: "Maya", lastName: "Patel", city: "New York", country: "US", lat: 40.7128, lng: -74.006, role: "VP Engineering", company: "Acme", cluster: "Workplace", tier: 1, daysAgoLastTouchpoint: 3 },
  { firstName: "Tomas", lastName: "Garcia", city: "Mexico City", country: "MX", lat: 19.4326, lng: -99.1332, role: "Founder", company: "Sello", cluster: "Workplace", tier: 1, daysAgoLastTouchpoint: 12 },
  { firstName: "Aiko", lastName: "Tanaka", city: "Tokyo", country: "JP", lat: 35.6762, lng: 139.6503, role: "Director, ML", company: "Hikari", cluster: "Workplace", tier: 1, daysAgoLastTouchpoint: 28 },
  { firstName: "Reuben", lastName: "Cole", city: "Atlanta", country: "US", lat: 33.749, lng: -84.388, role: "Pastor", company: "First Light Fellowship", cluster: "Faith", tier: 1, daysAgoLastTouchpoint: 9 },
  { firstName: "Lena", lastName: "Voss", city: "Berlin", country: "DE", lat: 52.52, lng: 13.405, role: "Designer", company: "Studio Voss", cluster: "Social Network", tier: 1, daysAgoLastTouchpoint: 60 },
  { firstName: "Marcus", lastName: "Kim", city: "Seoul", country: "KR", lat: 37.5665, lng: 126.978, role: "Operating Partner", company: "Aurum Capital", cluster: "Workplace", tier: 2, daysAgoLastTouchpoint: 45 },
  { firstName: "Zara", lastName: "Mensah", city: "Accra", country: "GH", lat: 5.6037, lng: -0.187, role: "Public Health Advisor", company: "MoH", cluster: "Civic", tier: 1, daysAgoLastTouchpoint: 200 },
  { firstName: "Hannah", lastName: "Park", city: "Toronto", country: "CA", lat: 43.6532, lng: -79.3832, role: "Counsel", company: "Northwood LLP", cluster: "Education", tier: 1, daysAgoLastTouchpoint: 130 },
];

async function run() {
  console.log("seeding demo data into user", SEED_USER_ID);

  // Provision base records (idempotent).
  const user = await ensureUserProvisioned({
    authUserId: SEED_USER_ID,
    email: "demo@networkmap.local",
    displayName: "Kerron Duncan",
    timezone: "America/New_York",
  });

  // Wipe demo contacts (but leave the self contact and clusters).
  await adminDb.delete(contacts).where(eq(contacts.userId, SEED_USER_ID));
  // Re-insert self contact since the cascade may have removed it.
  const [self] = await adminDb
    .insert(contacts)
    .values({
      userId: SEED_USER_ID,
      tier: 0,
      firstName: "Kerron",
      lastName: "Duncan",
      relationshipType: "self",
      tieStrength: 100,
      pulseBand: "Healthy",
      city: "New York",
      country: "US",
      latitude: 40.7128,
      longitude: -74.006,
    })
    .returning();
  await adminDb.update(users).set({ selfContactId: self.id }).where(eq(users.id, SEED_USER_ID));

  // Map cluster name -> id for the seeded clusters.
  const clusterRows = await adminDb.select().from(clusters).where(eq(clusters.userId, SEED_USER_ID));
  const clusterByName = new Map(clusterRows.map((c) => [c.name, c.id]));

  // Insert demo contacts.
  const tier1ByName = new Map<string, string>();
  for (const c of DEMO_CONTACTS.filter((c) => c.tier === 1)) {
    const [row] = await adminDb
      .insert(contacts)
      .values({
        userId: SEED_USER_ID,
        tier: 1,
        firstName: c.firstName,
        lastName: c.lastName,
        city: c.city,
        country: c.country,
        latitude: c.lat,
        longitude: c.lng,
        roleTitle: c.role,
        company: c.company,
      })
      .returning();
    tier1ByName.set(`${c.firstName}-${c.lastName}`, row.id);
    const cid = clusterByName.get(c.cluster);
    if (cid) {
      await adminDb.insert(contactClusters).values({
        contactId: row.id,
        clusterId: cid,
        userId: SEED_USER_ID,
      });
    }
    await seedTouchpoint(row.id, c.daysAgoLastTouchpoint);
    await recomputePulseForContact(row.id);
  }

  // Tier 2 contacts (need a bridge).
  const bridge = tier1ByName.get("Maya-Patel");
  if (bridge) {
    for (const c of DEMO_CONTACTS.filter((c) => c.tier === 2)) {
      const [row] = await adminDb
        .insert(contacts)
        .values({
          userId: SEED_USER_ID,
          tier: 2,
          knownThroughContactId: bridge,
          firstName: c.firstName,
          lastName: c.lastName,
          city: c.city,
          country: c.country,
          latitude: c.lat,
          longitude: c.lng,
          roleTitle: c.role,
          company: c.company,
        })
        .returning();
      const cid = clusterByName.get(c.cluster);
      if (cid) {
        await adminDb.insert(contactClusters).values({
          contactId: row.id,
          clusterId: cid,
          userId: SEED_USER_ID,
        });
      }
    }
  }

  // Seed a goal.
  await adminDb.delete(goals).where(eq(goals.userId, SEED_USER_ID));
  await adminDb.insert(goals).values({
    userId: SEED_USER_ID,
    title: "Move into a CTO role at a Series B",
    category: "career_move",
    horizon: "y1",
    priority: "high",
    status: "active",
    whyThisMatters:
      "Want to lead an engineering org at scale. Most useful introductions are to operators who have done this transition.",
  });

  console.log("demo seed complete:", DEMO_CONTACTS.length, "contacts +", 1, "goal");
  console.log("user displayName:", user.displayName);
}

async function seedTouchpoint(contactId: string, daysAgo: number) {
  await adminDb.insert(touchpoints).values({
    userId: SEED_USER_ID,
    contactId,
    occurredAt: new Date(Date.now() - daysAgo * 86400_000),
    channel: daysAgo < 14 ? "phone" : daysAgo < 60 ? "video" : "email",
    direction: "outbound",
    durationBucket: "normal",
    note: "Seeded demo touchpoint.",
  });
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

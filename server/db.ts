import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { dailyLogs, InsertUser, memorizationPlans, users } from "../drizzle/schema";
import { rescheduleAfterMiss } from "../shared/reschedule";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getCurrentPlan(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(memorizationPlans).where(and(eq(memorizationPlans.userId, userId), eq(memorizationPlans.status, "active"))).limit(1);
  return result[0];
}

export async function createPlan(userId: number, input: {
  startType: string;
  startReference?: string;
  pagesPerDay: number;
  activeDays: string;
  goalDate?: Date;
  privacy: "private" | "group";
}) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(memorizationPlans).values({ userId, ...input }).$returningId();
  return result[0];
}

export async function getRecentLogs(userId: number, limit = 14) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dailyLogs).where(eq(dailyLogs.userId, userId)).orderBy(desc(dailyLogs.logDate)).limit(limit);
}

export async function recordDailyLog(userId: number, input: {
  planId: number;
  logDate: Date;
  portionLabel: string;
  pages: number;
  status: "completed" | "missed";
  mastery: "strong" | "average" | "review" | "not_memorized";
}) {
  const db = await getDb();
  if (!db) return undefined;
  await db.insert(dailyLogs).values({ userId, ...input });
  if (input.status === "completed") {
    await db.update(memorizationPlans).set({ completedPages: input.pages, updatedAt: new Date() }).where(and(eq(memorizationPlans.id, input.planId), eq(memorizationPlans.userId, userId)));
  } else {
    const plan = await db.select().from(memorizationPlans).where(and(eq(memorizationPlans.id, input.planId), eq(memorizationPlans.userId, userId))).limit(1);
    if (plan[0]) {
      const rescheduled = rescheduleAfterMiss({ remainingPages: plan[0].totalPages - plan[0].completedPages, pagesPerDay: plan[0].pagesPerDay, missedDays: 1 });
      await db.update(memorizationPlans).set({ updatedAt: new Date(), goalDate: plan[0].goalDate ? new Date(plan[0].goalDate.getTime() + rescheduled.extensionDays * 86400000) : null }).where(eq(memorizationPlans.id, input.planId));
    }
  }
  return { ok: true };
}

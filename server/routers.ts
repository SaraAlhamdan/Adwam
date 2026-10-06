import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createPlan, getCurrentPlan, getRecentLogs, recordDailyLog } from "./db";

const planInput = z.object({
  startType: z.enum(["beginning", "specific", "review"]),
  startReference: z.string().max(160).optional(),
  pagesPerDay: z.number().int().min(1).max(20),
  activeDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  goalDate: z.coerce.date().optional(),
  privacy: z.enum(["private", "group"]).default("private"),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  plan: router({
    current: protectedProcedure.query(({ ctx }) => getCurrentPlan(ctx.user.id)),
    recentLogs: protectedProcedure.query(({ ctx }) => getRecentLogs(ctx.user.id)),
    create: protectedProcedure.input(planInput).mutation(({ ctx, input }) => createPlan(ctx.user.id, {
      ...input,
      activeDays: input.activeDays.join(","),
    })),
    logDay: protectedProcedure.input(z.object({
      planId: z.number().int().positive(),
      logDate: z.coerce.date(),
      portionLabel: z.string().max(255),
      pages: z.number().int().min(1).max(20),
      status: z.enum(["completed", "missed"]),
      mastery: z.enum(["strong", "average", "review", "not_memorized"]),
    })).mutation(({ ctx, input }) => recordDailyLog(ctx.user.id, input)),
  }),
});

export type AppRouter = typeof appRouter;

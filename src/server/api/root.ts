import { createTRPCRouter } from "~/server/api/trpc";
import { skusRouter } from "~/server/api/routers/skus";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  skus: skusRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

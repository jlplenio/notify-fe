import { createTRPCRouter } from "~/server/api/trpc";
import { skusRouter } from "~/server/api/routers/skus";

/**
 * DEPRECATED: This router is no longer used.
 * All API functionality has been migrated to direct axios calls.
 * This file is kept for type compatibility only.
 */
export const appRouter = createTRPCRouter({
  // skus: skusRouter, // Deactivated - now fetching directly
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * DEPRECATED: This file used to be the entrypoint for tRPC API.
 * All API functionality has been migrated to direct axios calls.
 * This file is kept for type compatibility only.
 */
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "~/server/api/root";

// Dummy mock API object that does nothing but preserves types
// No actual tRPC calls will be made when using this API
export const api = {
  // Empty objects to maintain types without functionality
  skus: {
    getSkus_1337: {
      useQuery: () => ({
        data: null,
        error: new Error(
          "tRPC API has been deactivated. Use direct API calls instead.",
        ),
        isLoading: false,
      }),
    },
  },
};

/**
 * Inference helper for inputs.
 * Kept for type compatibility with existing code.
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 * Kept for type compatibility with existing code.
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

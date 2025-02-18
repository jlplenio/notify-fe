import axios from "axios";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

// Define the type for a single SKU detail
const skuDetailSchema = z.object({
  sku: z.string(),
  old_sku: z.string(),
  last_change: z.string(),
});

// Define the type for a locale's SKU data
const skuLocaleSchema = z.object({
  "5070": skuDetailSchema.optional(),
  "5070T": skuDetailSchema.optional(),
  "5080": skuDetailSchema.optional(),
  "5090": skuDetailSchema.optional(),
});

// Define the overall SKU data as a record by locale
const skuDataSchema = z.record(skuLocaleSchema);

export type SkuDetail = z.infer<typeof skuDetailSchema>;
export type SkuLocaleData = z.infer<typeof skuLocaleSchema>;
export type SkuData = z.infer<typeof skuDataSchema>;

const SKUS_URL = process.env.SKUS_URL!;

export const skusRouter = createTRPCRouter({
  getSkus: publicProcedure.query(async () => {
    // Fetch from the remote URL without caching
    const response = await axios.get(SKUS_URL);
    // Validate and parse using zod
    const parsedData = skuDataSchema.parse(response.data);
    return parsedData;
  }),
});

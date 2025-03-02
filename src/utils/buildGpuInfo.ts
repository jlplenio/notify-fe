// Import your JSON data.
import skuPatterns from "../data/sku_patterns.json";
import localeInfo from "../data/locale_info.json";
import type { GpuCard } from "~/components/types/gpuInterface";
import type { SkuData, SkuLocaleData } from "~/server/api/routers/skus";

// Define the order of GPU models
const gpuDisplayOrder = [
  "5090",
  "5080",
  "5070",
  "4090",
  "4080S",
  "4070S",
] as const;

// Define default SKUs using the same order
const defaultSkus: Record<(typeof gpuDisplayOrder)[number], string> = {
  "5090": "NVGFT590",
  "5080": "NVGFT580",
  "5070": "NVGFT570",
  "4090": "NVGFT490",
  "4080S": "NVGFT480S",
  "4070S": "NVGFT470S",
};

// Define a constant list for GPUs to be included by default
const defaultIncludedGpus: string[] = ["5080", "5090"];

type SkuPatterns = {
  [K in keyof typeof defaultSkus]?: Record<string, [string, string | null]>;
};

const baseApiUrl = "https://api.store.nvidia.com/partner/v1/feinventory?skus=";

export function buildCompleteGpuInfo(
  dynamicSkus?: SkuData,
): GpuCard[] | Record<string, GpuCard[]> {
  const locales: string[] = Object.values(localeInfo as Record<string, string>);
  const grouped: Record<string, GpuCard[]> = {};

  locales.forEach((locale) => {
    grouped[locale] = gpuDisplayOrder.map((gpuName) => {
      // Check if we have dynamic SKU data for this GPU and locale
      const dynamicSku =
        dynamicSkus?.[locale]?.[gpuName as keyof SkuLocaleData]?.sku;

      // Get last_change from dynamic data if available
      const lastChange =
        dynamicSkus?.[locale]?.[gpuName as keyof SkuLocaleData]?.last_change;

      // Use dynamic SKU if available, otherwise fall back to patterns or defaults
      const customSku =
        dynamicSku ??
        (skuPatterns as unknown as SkuPatterns)[gpuName]?.[locale]?.[0] ??
        defaultSkus[gpuName];

      return {
        name: gpuName,
        api_url: `${baseApiUrl}${customSku}`,
        sku: customSku,
        available: false,
        product_url: null,
        locale,
        last_seen: null,
        api_reachable: false,
        included: defaultIncludedGpus.includes(gpuName),
        api_error: false,
        last_change: lastChange,
      };
    });
  });

  return grouped;
}

export { gpuDisplayOrder };

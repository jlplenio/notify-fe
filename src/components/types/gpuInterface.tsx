export interface GpuCard {
  name: string;
  api_url: string;
  sku: string;
  product_url: string | null;
  available: boolean;
  last_seen: string | null;
  locale: string;
  api_reachable: boolean;
  included: boolean;
  api_error: boolean;
  last_change?: string; // ISO formatted timestamp of the last change
}

export interface GpuCard {
  name: string;
  api_url: string;
  api_url_us?: string;
  api_url_de?: string;
  product_url: string | null;
  available: boolean;
  last_seen: string | null;
  locale: string;
  api_reachable: boolean;
  included: boolean;
  api_error: boolean;
}

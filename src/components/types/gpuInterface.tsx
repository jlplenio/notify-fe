interface GpuCard {
  name: string;
  product_url: string | null;
  api_url: string;
  api_url_us: string;
  available: boolean;
  last_seen: string | null;
  locale: string;
}

export type { GpuCard };
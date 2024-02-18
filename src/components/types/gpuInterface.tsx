interface GpuCard {
  name: string;
  product_url: string | null;
  api_url: string;
  available: boolean;
  last_seen: string | null;
  locale: string;
}

export type { GpuCard };
export const MODELS = ["5070", "5080", "5090"] as const;
export type Model = (typeof MODELS)[number];
export const DISPLAY_MODELS: Model[] = ["5090", "5080", "5070"];
export const LOCALES = [
  "de-de",
  "en-gb",
  "de-at",
  "da-dk",
  "es-es",
  "fr-fr",
  "it-it",
  "nl-nl",
  "nb-no",
  "pl-pl",
  "fi-fi",
  "sv-se",
  "en-us",
] as const;
export type Locale = (typeof LOCALES)[number];
export const COUNTRIES: Record<Locale, { name: string; code: string }> = {
  "de-de": { name: "Germany", code: "DE" },
  "en-gb": { name: "United Kingdom", code: "GB" },
  "de-at": { name: "Austria", code: "AT" },
  "da-dk": { name: "Denmark", code: "DK" },
  "es-es": { name: "Spain", code: "ES" },
  "fr-fr": { name: "France", code: "FR" },
  "it-it": { name: "Italy", code: "IT" },
  "nl-nl": { name: "Netherlands", code: "NL" },
  "nb-no": { name: "Norway", code: "NO" },
  "pl-pl": { name: "Poland", code: "PL" },
  "fi-fi": { name: "Finland", code: "FI" },
  "sv-se": { name: "Sweden", code: "SE" },
  "en-us": { name: "United States", code: "US" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}

/** Only retain safe destinations for links from the old redirect flow. */
export function legacyRedirectTarget(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname === "nvidia.com" || url.hostname.endsWith(".nvidia.com"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function storeUrl(locale: Locale, value?: string | null): string {
  if (value) {
    try {
      const url = new URL(value);
      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        value.length <= 2048
      )
        return url.toString();
    } catch {
      /* Fall back to the known store, never an executable URL. */
    }
  }
  return `https://marketplace.nvidia.com/${locale}/consumer/graphics-cards/?locale=${locale}&manufacturer=NVIDIA`;
}

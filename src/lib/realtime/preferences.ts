import { z } from "zod";
import {
  LOCALES,
  MODELS,
  isLocale,
  type Locale,
  type Model,
} from "./catalog.ts";

export const PREFERENCES_KEY = "notify-fe.preferences.v2";
const schema = z.object({
  version: z.literal(1),
  locale: z.enum(LOCALES),
  models: z
    .array(z.enum(MODELS))
    .max(3)
    .refine((v) => new Set(v).size === v.length),
  soundEnabled: z.boolean(),
  autoOpen: z.boolean().optional().default(false),
  volume: z.number().finite().min(0).max(1),
});
export type Preferences = z.infer<typeof schema>;

export function readPreferences(
  raw: string | null,
  region?: unknown,
  language?: string,
): Preferences {
  let saved: Preferences | undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(raw ?? "null") as unknown);
    if (parsed.success) saved = parsed.data;
  } catch {
    /* Corrupt or unavailable storage must not break the listener. */
  }
  const detected = language?.toLowerCase();
  const locale: Locale = isLocale(region)
    ? region
    : saved?.locale ?? (isLocale(detected) ? detected : "en-gb");
  return saved
    ? { ...saved, locale }
    : {
        version: 1,
        locale,
        models: [...MODELS],
        soundEnabled: true,
        autoOpen: false,
        volume: 0.5,
      };
}

export function toggleModel(models: Model[], model: Model): Model[] {
  return MODELS.filter((m) =>
    m === model ? !models.includes(m) : models.includes(m),
  );
}

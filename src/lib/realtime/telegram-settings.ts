import { z } from "zod";

export const TELEGRAM_KEY = "notify-fe.telegram.v1";
export const LEGACY_TELEGRAM_KEY = "telegramApiUrl";
export const TELEGRAM_RECEIPTS_KEY = "notify-fe.telegram.receipts.v1";

const token = z
  .string()
  .trim()
  .regex(/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/);
const chatId = z
  .string()
  .trim()
  .regex(/^(?:-?[1-9]\d{0,19}|@[A-Za-z][A-Za-z0-9_]{4,31})$/);
const topicId = z
  .string()
  .trim()
  .regex(/^(?:|[1-9]\d{0,9})$/);
const settingsSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  token,
  chatId,
  topicId,
});
export type TelegramSettings = z.infer<typeof settingsSchema>;
export const EMPTY_TELEGRAM: TelegramSettings = {
  version: 1,
  enabled: false,
  token: "",
  chatId: "",
  topicId: "",
};
export type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function validateTelegram(
  input: TelegramSettings,
):
  | { settings: TelegramSettings; error?: never }
  | { settings?: never; error: string } {
  if (!token.safeParse(input.token).success)
    return { error: "Enter the bot token from BotFather, not a URL." };
  if (!chatId.safeParse(input.chatId).success)
    return {
      error:
        "Enter a numeric chat ID or a channel username such as @my_channel.",
    };
  if (!topicId.safeParse(input.topicId).success)
    return { error: "Topic ID must be a positive number, or left empty." };
  const parsed = settingsSchema.safeParse(input);
  return parsed.success
    ? { settings: parsed.data }
    : { error: "Check your Telegram settings." };
}

export function browserStorage(
  kind: "localStorage" | "sessionStorage",
): StorageAccess | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function read(storage: StorageAccess | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function restoreTelegram(
  session: StorageAccess | null,
  local: StorageAccess | null,
) {
  for (const [storage, remember] of [
    [session, false],
    [local, true],
  ] as const) {
    try {
      const parsed = settingsSchema.safeParse(
        JSON.parse(read(storage, TELEGRAM_KEY) ?? "null") as unknown,
      );
      if (parsed.success) return { settings: parsed.data, remember };
    } catch {
      /* Malformed storage must not break stock alerts. */
    }
  }
  return { settings: { ...EMPTY_TELEGRAM }, remember: false };
}

/** Only extract known fields; never use an imported URL as a fetch destination. */
export function importLegacyTelegram(
  raw: string | null,
): TelegramSettings | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (
      url.origin !== "https://api.telegram.org" ||
      url.username ||
      url.password ||
      url.hash
    )
      return null;
    const match = /^\/bot([^/]+)\/sendMessage$/.exec(url.pathname);
    if (
      !match?.[1] ||
      url.searchParams.getAll("chat_id").length !== 1 ||
      url.searchParams.getAll("message_thread_id").length > 1
    )
      return null;
    return (
      validateTelegram({
        version: 1,
        enabled: false,
        token: match[1],
        chatId: url.searchParams.get("chat_id") ?? "",
        topicId: url.searchParams.get("message_thread_id") ?? "",
      }).settings ?? null
    );
  } catch {
    return null;
  }
}

export function legacyTelegram(local: StorageAccess | null) {
  return importLegacyTelegram(read(local, LEGACY_TELEGRAM_KEY));
}

export function persistTelegram(
  settings: TelegramSettings,
  remember: boolean,
  session: StorageAccess | null,
  local: StorageAccess | null,
): string | null {
  let removed = true;
  try {
    // Remove persistent secrets before saving a tab-only choice.
    if (!remember && !local) removed = false;
    (remember ? session : local)?.removeItem(TELEGRAM_KEY);
    local?.removeItem(LEGACY_TELEGRAM_KEY);
  } catch {
    removed = false;
  }
  try {
    const target = remember ? local : session;
    if (!target) throw new Error("Storage unavailable");
    target.setItem(TELEGRAM_KEY, JSON.stringify(settings));
  } catch {
    return "Telegram works for this visit, but your settings could not be saved. Clear this site's saved data if credentials were stored before.";
  }
  return removed
    ? null
    : "The new settings are saved, but older saved credentials could not be cleared. Clear this site's saved data when finished.";
}

export function forgetTelegram(
  session: StorageAccess | null,
  local: StorageAccess | null,
): boolean {
  let cleared = true;
  for (const storage of [session, local]) {
    if (!storage) {
      cleared = false;
      continue;
    }
    for (const key of [
      TELEGRAM_KEY,
      LEGACY_TELEGRAM_KEY,
      TELEGRAM_RECEIPTS_KEY,
    ]) {
      try {
        storage.removeItem(key);
      } catch {
        cleared = false;
      }
    }
  }
  return cleared;
}

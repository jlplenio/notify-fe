import { useEffect, useRef, useState } from "react";
import { TelegramNotifier, type TelegramResult } from "~/lib/realtime/telegram";
import {
  EMPTY_TELEGRAM,
  TELEGRAM_KEY,
  browserStorage,
  forgetTelegram,
  legacyTelegram,
  persistTelegram,
  restoreTelegram,
  validateTelegram,
  type TelegramSettings,
} from "~/lib/realtime/telegram-settings";
import type { Model } from "~/lib/realtime/catalog";
import type { Packet } from "~/lib/realtime/protocol";

export function useTelegram() {
  const [settings, setSettings] = useState({ ...EMPTY_TELEGRAM });
  const current = useRef(settings);
  const [remember, setRemember] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [legacy, setLegacy] = useState<TelegramSettings | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<TelegramResult | null>(null);
  const [testing, setTesting] = useState(false);
  const notifier = useRef<TelegramNotifier | null>(null);
  const controller = useRef(new AbortController());

  useEffect(() => {
    const session = browserStorage("sessionStorage");
    const local = browserStorage("localStorage");
    const saved = restoreTelegram(session, local);
    current.current = saved.settings;
    setSettings(saved.settings);
    setRemember(saved.remember);
    setLegacy(legacyTelegram(local));
    controller.current = new AbortController();
    notifier.current = new TelegramNotifier({
      storage: local,
      lock: navigator.locks
        ? (work, signal) =>
            navigator.locks.request("notify-fe.telegram.send", { signal }, work)
        : undefined,
    });
    setLoaded(true);
    // Removing remembered credentials in another tab also disables this tab.
    const onStorage = (event: StorageEvent) => {
      if (
        (event.key === TELEGRAM_KEY || event.key === null) &&
        event.newValue === null
      ) {
        controller.current.abort();
        controller.current = new AbortController();
        current.current = { ...EMPTY_TELEGRAM };
        setSettings(current.current);
        setRemember(false);
        setTesting(false);
        setDelivery(null);
        try {
          session?.removeItem(TELEGRAM_KEY);
        } catch {
          /* Keep disabled in memory. */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      controller.current.abort();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const resetPending = () => {
    controller.current.abort();
    controller.current = new AbortController();
    setTesting(false);
    setDelivery(null);
  };

  const save = (input: TelegramSettings, keep: boolean): string | null => {
    const checked = validateTelegram(input);
    if (!checked.settings) return checked.error;
    resetPending();
    current.current = checked.settings;
    setSettings(checked.settings);
    setRemember(keep);
    setWarning(
      persistTelegram(
        checked.settings,
        keep,
        browserStorage("sessionStorage"),
        browserStorage("localStorage"),
      ),
    );
    setLegacy(null);
    return null;
  };

  const forget = () => {
    resetPending();
    current.current = { ...EMPTY_TELEGRAM };
    setSettings(current.current);
    setRemember(false);
    setLegacy(null);
    const cleared = forgetTelegram(
      browserStorage("sessionStorage"),
      browserStorage("localStorage"),
    );
    setWarning(
      cleared
        ? null
        : "Telegram is off in this tab. Saved credentials could not all be cleared; clear this site's saved data in your browser.",
    );
  };

  const send = async (
    input: TelegramSettings,
    packet: Packet | null,
    models: readonly Model[],
  ) => {
    const active = controller.current;
    try {
      const result = await notifier.current?.send(
        input,
        packet,
        models,
        active.signal,
      );
      if (!active.signal.aborted && result && result.kind !== "skipped")
        setDelivery(result);
    } catch {
      if (!active.signal.aborted)
        setDelivery({
          kind: "error",
          message:
            "Telegram is unavailable in this browser. Check your connection and settings.",
        });
    }
  };

  const test = async (input: TelegramSettings) => {
    if (testing) return;
    const active = controller.current;
    setDelivery(null);
    setTesting(true);
    await send(input, null, []);
    if (!active.signal.aborted) setTesting(false);
  };

  const notify = (packet: Packet, models: Model[], demo: boolean) => {
    if (loaded && current.current.enabled && !demo)
      void send(current.current, packet, models);
  };

  return {
    settings,
    remember,
    loaded,
    legacy,
    warning,
    delivery,
    testing,
    save,
    forget,
    test,
    notify,
  };
}

export type TelegramControls = ReturnType<typeof useTelegram>;

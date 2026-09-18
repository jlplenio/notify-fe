import { useState } from "react";
import { Send, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import type { TelegramControls } from "~/hooks/useTelegram";
import {
  EMPTY_TELEGRAM,
  validateTelegram,
} from "~/lib/realtime/telegram-settings";
import styles from "~/styles/telegram.module.css";

export function TelegramSettings({
  telegram,
  className,
}: {
  telegram: TelegramControls;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_TELEGRAM });
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changeOpen = (value: boolean) => {
    if (value) {
      setDraft(telegram.settings);
      setRemember(telegram.remember);
      setError(null);
      setSaved(false);
    }
    setOpen(value);
  };
  const issue = telegram.delivery?.kind === "error";
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${className ?? ""} ${styles.trigger}`}
          data-enabled={telegram.settings.enabled}
          data-error={issue || undefined}
          disabled={!telegram.loaded}
          aria-label="Telegram settings"
          title={
            issue
              ? "Check your Telegram settings"
              : `Telegram alerts ${telegram.settings.enabled ? "on" : "off"}`
          }
        >
          <Send size={17} aria-hidden="true" /> Telegram{" "}
          {issue ? "!" : telegram.settings.enabled ? "on" : "off"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={styles.panel}
        align="end"
        collisionPadding={10}
        aria-labelledby="telegram-title"
      >
        <div className={styles.heading}>
          <h2 id="telegram-title">Telegram alerts</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close Telegram settings"
          >
            <X size={18} />
          </button>
        </div>
        <p className={styles.help}>
          Send selected card alerts through your own bot. Keep this tab open and
          your device awake.
        </p>
        {telegram.legacy && !draft.token && (
          <button
            type="button"
            className={styles.importButton}
            onClick={() => {
              setDraft({ ...telegram.legacy!, enabled: false });
              setRemember(false);
              setSaved(false);
            }}
          >
            Import old saved settings
          </button>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const problem = telegram.save(draft, remember);
            setError(problem);
            setSaved(!problem);
          }}
          onChange={() => {
            setError(null);
            setSaved(false);
          }}
        >
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                setDraft({ ...draft, enabled: event.target.checked })
              }
            />
            Send Telegram alerts
          </label>
          <label className={styles.field} htmlFor="telegram-token">
            Bot token
            <input
              id="telegram-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              maxLength={121}
              value={draft.token}
              onChange={(event) =>
                setDraft({ ...draft, token: event.target.value })
              }
              placeholder="Token from BotFather"
            />
          </label>
          <label className={styles.field} htmlFor="telegram-chat">
            Chat ID or channel
            <input
              id="telegram-chat"
              type="text"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              maxLength={40}
              value={draft.chatId}
              onChange={(event) =>
                setDraft({ ...draft, chatId: event.target.value })
              }
              placeholder="123456789 or @my_channel"
            />
          </label>
          <details
            className={styles.topic}
            open={draft.topicId ? true : undefined}
          >
            <summary>Forum topic (optional)</summary>
            <label className={styles.field} htmlFor="telegram-topic">
              Topic ID
              <input
                id="telegram-topic"
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={draft.topicId}
                onChange={(event) =>
                  setDraft({ ...draft, topicId: event.target.value })
                }
              />
            </label>
          </details>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Remember on this device
          </label>
          <p className={styles.help}>
            Otherwise saved for this tab only. Browser storage is readable by
            this website’s scripts. Use a dedicated alert bot and never share
            its token.
          </p>
          <div className={styles.actions}>
            <button type="submit" className={styles.save}>
              Save
            </button>
            <button
              type="button"
              disabled={telegram.testing}
              onClick={() => {
                const checked = validateTelegram(draft);
                setError(checked.error ?? null);
                if (checked.settings) void telegram.test(checked.settings);
              }}
            >
              {telegram.testing ? "Sending…" : "Test message"}
            </button>
            <button
              type="button"
              onClick={() => {
                telegram.forget();
                setDraft({ ...EMPTY_TELEGRAM });
                setRemember(false);
                setError(null);
                setSaved(false);
              }}
            >
              Forget
            </button>
          </div>
        </form>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {telegram.warning && (
          <p className={styles.error} role="status">
            {telegram.warning}
          </p>
        )}
        {saved && (
          <p className={styles.status} role="status">
            {draft.enabled
              ? "Telegram alerts enabled."
              : "Settings saved. Telegram alerts are off."}
          </p>
        )}
        {telegram.delivery && (
          <p
            className={
              telegram.delivery.kind === "error" ? styles.error : styles.status
            }
            role="status"
          >
            {telegram.delivery.message}
          </p>
        )}
        <p className={styles.help}>
          Start your bot in a private chat, or add it to your group/channel with
          permission to post.{" "}
          <a
            href="https://core.telegram.org/bots/tutorial#obtain-your-bot-token"
            target="_blank"
            rel="noopener noreferrer"
          >
            Create a bot
          </a>
        </p>
      </PopoverContent>
    </Popover>
  );
}

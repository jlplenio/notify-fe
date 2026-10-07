import { useId, useRef, useState } from "react";
import { Copy, Mail, MessageCircle, Share2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import type { Locale } from "~/lib/realtime/catalog";
import styles from "~/styles/share.module.css";

export function ShareButton({ locale }: { locale: Locale }) {
  // Only share the selected country, never other URL parameters or credentials.
  const shareData = {
    title: "Notify-FE",
    text: "NVIDIA Founders Edition stock alerts",
    url: `https://notify-fe.plen.io/?region=${locale}`,
  };
  const message = `${shareData.text}\n${shareData.url}`;
  const titleId = useId();
  const linkId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  const share = async () => {
    if (sharing) return;
    setCopyStatus("");
    try {
      if (
        typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" ||
          navigator.canShare(shareData))
      ) {
        setSharing(true);
        // Call directly from the click: native sharing requires user activation.
        await navigator.share(shareData);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Unsupported or blocked native sharing still has useful alternatives.
    } finally {
      setSharing(false);
    }
    setOpen(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareData.url);
      setCopyStatus("Link copied");
    } catch {
      input.current?.focus();
      input.current?.select();
      setCopyStatus("Select and copy the link above.");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={styles.trigger}
          aria-label="Share Notify-FE"
          aria-disabled={sharing}
          onClick={(event) => {
            event.preventDefault();
            if (open) setOpen(false);
            else void share();
          }}
        >
          <Share2 size={14} aria-hidden="true" /> Share
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={styles.panel}
        align="center"
        side="top"
        collisionPadding={12}
        aria-labelledby={titleId}
      >
        <div className={styles.heading}>
          <h2 id={titleId}>Share Notify-FE</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close sharing"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.actions}>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={18} aria-hidden="true" /> WhatsApp
          </a>
          <a
            href={`mailto:?subject=${encodeURIComponent(shareData.title)}&body=${encodeURIComponent(message)}`}
          >
            <Mail size={18} aria-hidden="true" /> Email
          </a>
          <button type="button" onClick={() => void copy()}>
            <Copy size={18} aria-hidden="true" /> Copy link
          </button>
        </div>
        <label className={styles.label} htmlFor={linkId}>
          Website link
        </label>
        <input
          ref={input}
          id={linkId}
          className={styles.link}
          value={shareData.url}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
        <p className={styles.status} role="status">
          {copyStatus}
        </p>
      </PopoverContent>
    </Popover>
  );
}

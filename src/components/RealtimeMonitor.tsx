import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import {
  ArrowUpRight,
  Bell,
  BellOff,
  Check,
  ChevronDown,
  Clock3,
  Cpu,
  Github,
  Heart,
  Radio,
  RefreshCw,
  ExternalLink,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { ModeToggle } from "./ThemeToggle";
import { env } from "~/env";
import { useMonitor, type MonitorView } from "~/hooks/useMonitor";
import { useAlertSound } from "~/hooks/useAlertSound";
import {
  COUNTRIES,
  DISPLAY_MODELS,
  LOCALES,
  isLocale,
  storeUrl,
  type Locale,
  type Model,
} from "~/lib/realtime/catalog";
import {
  PREFERENCES_KEY,
  readPreferences,
  toggleModel,
  type Preferences,
} from "~/lib/realtime/preferences";
import {
  relativeTime,
  type CardState,
  type Packet,
} from "~/lib/realtime/protocol";
import { autoOpenStores } from "~/lib/realtime/actions";
import styles from "~/styles/monitor.module.css";

function healthCopy(view: MonitorView, preview: boolean) {
  if (view.connection === "unconfigured")
    return {
      title: "Monitoring not connected",
      detail: view.issue ?? "Waiting for a monitoring endpoint.",
      tone: "muted",
    };
  if (view.connection === "browser_offline")
    return {
      title: "You’re offline",
      detail: "We’ll reconnect when your internet connection returns.",
      tone: "warning",
    };
  if (view.connection !== "connected")
    return {
      title:
        view.connection === "reconnecting"
          ? "Reconnecting…"
          : "Connecting to the monitor…",
      detail: view.issue ?? "Getting a fresh snapshot for your region.",
      tone: "muted",
    };
  if (view.health === "healthy")
    return {
      title: preview ? "Preview monitor is healthy" : "Monitoring is healthy",
      detail:
        "Stock-check target: every 10s. Alerts pushed as soon as detected.",
      tone: "healthy",
    };
  if (view.health === "offline")
    return {
      title: "The monitor is offline",
      detail:
        "The source has stopped reporting. Availability is unconfirmed until it recovers.",
      tone: "warning",
    };
  if (view.health === "transport_silent")
    return {
      title: "Waiting for a fresh heartbeat",
      detail: "The connection is open, but monitoring updates are delayed.",
      tone: "warning",
    };
  return {
    title: "Some checks are delayed",
    detail:
      "The monitor is connected, but some source checks are not healthy yet.",
    tone: "warning",
  };
}

function StockCard({
  model,
  card,
  selected,
  monitor,
  onToggle,
}: {
  model: Model;
  card?: CardState;
  selected: boolean;
  monitor: MonitorView;
  onToggle: () => void;
}) {
  const now = monitor.serverNow ?? Date.now();
  const fresh =
    monitor.connection === "connected" &&
    monitor.health !== "offline" &&
    monitor.health !== "transport_silent" &&
    card?.status === "healthy" &&
    card.observedAt !== null &&
    now - card.observedAt >= 0 &&
    now - card.observedAt < (monitor.packet?.staleAfterMs ?? 60_000);
  const available = fresh && card?.available === true;
  const known = fresh && card?.available !== null;
  const stamp = card?.lastAvailableAt;
  const date = stamp != null ? new Date(stamp) : null;
  return (
    <article
      className={`${styles.stockCard} ${selected ? styles.selected : ""} ${available ? styles.available : ""}`}
      data-testid={`card-${model}`}
    >
      <div className={styles.cardIdentity}>
        <span className={styles.chipIcon} aria-hidden="true">
          <Cpu size={25} strokeWidth={1.4} />
        </span>
        <div>
          <h3 className={styles.model}>
            RTX <span>{model}</span>
          </h3>
          <p className={styles.edition}>Founders Edition</p>
        </div>
      </div>
      <div className={styles.cardAvailability}>
        <span
          className={`${styles.stockBadge} ${available ? styles.inStock : ""}`}
          data-testid={`stock-${model}`}
        >
          <span className={styles.statusDot} />
          {available
            ? "In stock"
            : known
              ? "Out of stock"
              : card
                ? "Unconfirmed"
                : "Awaiting data"}
        </span>
        {available && monitor.packet && (
          <a
            className={styles.shopLink}
            href={storeUrl(monitor.packet.locale, card?.productUrl)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Shop RTX {model} <ArrowUpRight size={13} />
          </a>
        )}
      </div>
      <div className={styles.lastSeen}>
        <div className={styles.smallLabel}>
          <Clock3 size={12} aria-hidden="true" /> Last seen in stock
        </div>
        <p className={styles.lastSeenTime} data-testid={`last-seen-${model}`}>
          {relativeTime(stamp, now)}
        </p>
        {date ? (
          <time
            dateTime={date.toISOString()}
            title={date.toLocaleString(undefined, { timeZoneName: "short" })}
            className={styles.exactTime}
          >
            {date.toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        ) : (
          <p className={styles.exactTime}>No sighting recorded</p>
        )}
      </div>
      <div className={styles.cardBottom}>
        <label className={styles.notifyLabel} htmlFor={`notify-${model}`}>
          {selected ? <Bell size={14} /> : <BellOff size={14} />} Notify me
        </label>
        <button
          id={`notify-${model}`}
          type="button"
          role="switch"
          aria-checked={selected}
          aria-label={`Notify me about RTX ${model}`}
          onClick={onToggle}
          className={styles.toggle}
        >
          <span />
        </button>
      </div>
    </article>
  );
}

export default function RealtimeMonitor() {
  const router = useRouter();
  const [preferences, setPreferences] = useState<Preferences>(() =>
    readPreferences(null),
  );
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const preferencesLoaded = useRef(false);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [lastAlert, setLastAlert] = useState<{
    models: Model[];
    at: number;
    synthetic: boolean;
    url: string;
    autoOpenAttempted: boolean;
  } | null>(null);
  const demo =
    env.NEXT_PUBLIC_ENABLE_DEMO === "true" && router.query.demo === "1";
  const sound = useAlertSound(preferences.volume);

  useEffect(() => {
    if (!router.isReady) return;
    let raw: string | null = null;
    if (!preferencesLoaded.current) {
      try {
        raw = localStorage.getItem(PREFERENCES_KEY);
      } catch {
        setStorageAvailable(false);
      }
    } else {
      // Keep this visit's choices even when browser storage is unavailable.
      raw = JSON.stringify(preferencesRef.current);
    }
    const initial = readPreferences(
      raw,
      router.query.region,
      navigator.language,
    );
    if (initial.locale !== preferencesRef.current.locale) setLastAlert(null);
    preferencesLoaded.current = true;
    preferencesRef.current = initial;
    setPreferences(initial);
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(initial));
    } catch {
      setStorageAvailable(false);
    }
    setReady(true);
  }, [router.isReady, router.query.region]);

  const update = (changes: Partial<Preferences>) => {
    const next = { ...preferencesRef.current, ...changes };
    preferencesRef.current = next;
    setPreferences(next);
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  };
  const onAlerts = (packet: Packet, models: Model[]) => {
    const selected = models.filter((model) =>
      preferences.models.includes(model),
    );
    if (!selected.length) return;
    setLastAlert({
      models: selected,
      at: packet.serverTime,
      synthetic: packet.synthetic,
      autoOpenAttempted:
        autoOpenStores(
          packet,
          selected,
          preferences.autoOpen,
          (url, target, features) => window.open(url, target, features),
        ) > 0,
      url: storeUrl(
        packet.locale,
        packet.cards.find((c) => c.model === selected[0])?.productUrl,
      ),
    });
    if (preferences.soundEnabled) void sound.play();
  };
  const monitor = useMonitor({
    locale: preferences.locale,
    ready,
    demo,
    endpoint: env.NEXT_PUBLIC_WEBSOCKET_URL,
    allowSynthetic: env.NEXT_PUBLIC_ALLOW_SYNTHETIC === "true",
    onAlerts,
  });
  const packet = monitor.packet;
  const simulated = demo || packet?.synthetic === true;
  const health = healthCopy(monitor, simulated);
  const now = monitor.serverNow ?? Date.now();
  const country = COUNTRIES[preferences.locale];

  useEffect(() => {
    if (!lastAlert) return;
    const timer = setTimeout(() => setLastAlert(null), 20_000);
    return () => clearTimeout(timer);
  }, [lastAlert]);

  const changeLocale = (locale: Locale) => {
    update({ locale });
    setLastAlert(null);
    void router.replace(
      {
        pathname: "/",
        query: { region: locale, ...(demo ? { demo: "1" } : {}) },
      },
      undefined,
      { shallow: true, scroll: false },
    );
  };
  const changeSound = () => {
    const enabled = !preferences.soundEnabled;
    update({ soundEnabled: enabled });
    if (enabled) void sound.enable();
    else sound.mute();
  };
  const toggleDemo = () => {
    setLastAlert(null);
    void router.replace(
      {
        pathname: "/",
        query: { region: preferences.locale, ...(!demo ? { demo: "1" } : {}) },
      },
      undefined,
      { shallow: true, scroll: false },
    );
  };

  return (
    <div className={styles.page}>
      <Head>
        <title>
          {lastAlert
            ? `${lastAlert.synthetic ? "TEST · " : ""}RTX ${lastAlert.models.join(" / ")} spotted · Notify-FE`
            : "Notify-FE · Founders Edition stock alerts"}
        </title>
      </Head>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label="Notify-FE home">
            <Image
              src="/favicon-192x192.png"
              width={34}
              height={34}
              alt=""
              priority
            />
            <span>
              Notify<span className={styles.brandSuffix}>-FE</span>
            </span>
          </Link>
          <div className={styles.headerRight}>
            <span className={styles.headerNote}>For people. Not scalpers.</span>
            <ModeToggle />
          </div>
        </header>
        <main>
          <div className={styles.intro}>
            <p className={styles.eyebrow}>
              <span /> THE NEXT DROP, WITHOUT THE REFRESH.
            </p>
            <h1>Your next Founders Edition.</h1>
            <p>
              Pick your region. Choose your cards. We’ll keep an eye on the
              stock.
            </p>
          </div>
          {simulated && (
            <div
              className={styles.demoBanner}
              role="status"
              data-testid="demo-banner"
            >
              <span>
                <strong>{demo ? "Preview mode" : "Staging test data"}</strong> ·
                Availability, history and statistics are simulated.
              </span>
              {demo && (
                <button
                  type="button"
                  onClick={monitor.simulateDrop}
                  disabled={packet?.cards.some((c) => c.available === true)}
                >
                  Simulate a drop <ArrowUpRight size={13} />
                </button>
              )}
            </div>
          )}
          <section
            className={styles.watchlist}
            aria-labelledby="watchlist-title"
          >
            <div className={styles.toolbar}>
              <div>
                <label htmlFor="locale" className={styles.fieldLabel}>
                  YOUR REGION
                </label>
                <div
                  className={styles.localeField}
                  data-testid="region-selector"
                >
                  <span className={styles.countryCode} aria-hidden="true">
                    {country.code}
                  </span>
                  <select
                    id="locale"
                    value={preferences.locale}
                    disabled={!ready}
                    onChange={(event) => {
                      if (isLocale(event.target.value))
                        changeLocale(event.target.value);
                    }}
                  >
                    {LOCALES.map((locale) => (
                      <option key={locale} value={locale}>
                        {COUNTRIES[locale].name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" />
                </div>
              </div>
              <div className={styles.alertControls}>
                <div className={styles.controlButtons}>
                  <button
                    type="button"
                    onClick={changeSound}
                    aria-pressed={preferences.soundEnabled}
                    className={`${styles.soundButton} ${preferences.soundEnabled ? styles.soundEnabled : ""}`}
                    disabled={!ready}
                  >
                    {preferences.soundEnabled ? (
                      <Volume2 size={17} />
                    ) : (
                      <VolumeX size={17} />
                    )}
                    {preferences.soundEnabled ? "Sound on" : "Sound off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => update({ autoOpen: !preferences.autoOpen })}
                    aria-pressed={preferences.autoOpen}
                    title="Open shop tabs for new alerts on selected cards. Your browser must allow popups."
                    className={`${styles.soundButton} ${preferences.autoOpen ? styles.soundEnabled : ""}`}
                    disabled={!ready}
                  >
                    <ExternalLink size={15} />
                    {preferences.autoOpen ? "Auto-open on" : "Auto-open off"}
                  </button>
                </div>
                <div className={styles.soundHint}>
                  <span>
                    {!preferences.soundEnabled
                      ? "Alerts are muted"
                      : sound.blocked
                        ? "Browser blocked audio — test to retry"
                        : sound.ready
                          ? "Audio ready in this tab"
                          : "Sound enabled · browser may need a click"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void sound.enable();
                    }}
                  >
                    Test sound
                  </button>
                </div>
              </div>
            </div>
            <div className={styles.monitorOverview}>
              <div
                className={`${styles.healthPanel} ${health.tone === "healthy" ? styles.healthHealthy : health.tone === "warning" ? styles.healthWarning : ""}`}
                data-testid="monitor-health"
              >
                <div className={styles.healthMain}>
                  <span className={styles.healthBeacon} aria-hidden="true">
                    <Radio size={19} />
                  </span>
                  <div>
                    <p className={styles.healthTitle} role="status">
                      {health.title}
                    </p>
                    <p className={styles.healthDetail}>{health.detail}</p>
                  </div>
                  {health.tone === "warning" &&
                    monitor.connection !== "browser_offline" && (
                      <button
                        type="button"
                        className={styles.retry}
                        onClick={monitor.reconnect}
                        aria-label="Reconnect to monitor"
                      >
                        <RefreshCw size={16} />
                      </button>
                    )}
                </div>
                <p
                  className={styles.healthReport}
                  title="The monitor sends a health report about every 30 seconds, separately from its 10-second stock-check target."
                >
                  {packet?.lastPublisherAt != null
                    ? `Health report · ${relativeTime(packet.lastPublisherAt, now).toLowerCase()} · every ~30s`
                    : "Waiting for the first health report"}
                </p>
              </div>
              <div
                className={styles.audience}
                data-testid="connection-counts"
                aria-label="Connected tabs at the latest server update"
                title="Connections at the latest server update; tabs, not unique people."
              >
                <div>
                  <span className={styles.audienceNumber}>
                    {packet ? packet.clients.total.toLocaleString() : "—"}
                  </span>
                  <span>
                    <Users size={13} /> Connected tabs
                  </span>
                </div>
                <div className={styles.audienceLocal}>
                  <span className={styles.audienceNumber}>
                    {packet ? packet.clients.locale.toLocaleString() : "—"}
                  </span>
                  <span>In {country.name}</span>
                </div>
              </div>
            </div>
            <div className={styles.sectionHeading}>
              <h2 id="watchlist-title">
                Your watchlist <span>RTX 50 SERIES</span>
              </h2>
              <span className={styles.selectionCount}>
                {preferences.models.length === 0
                  ? "Notifications paused"
                  : `${preferences.models.length} of 3 alerts on`}
              </span>
            </div>
            <div className={styles.cardGrid}>
              {DISPLAY_MODELS.map((model) => (
                <StockCard
                  key={model}
                  model={model}
                  card={packet?.cards.find((card) => card.model === model)}
                  selected={preferences.models.includes(model)}
                  monitor={monitor}
                  onToggle={() =>
                    update({ models: toggleModel(preferences.models, model) })
                  }
                />
              ))}
            </div>
            <div className={styles.watchlistFooter}>
              <span>
                <Check size={14} />
                {storageAvailable
                  ? "Your region and alert choices are saved on this device."
                  : "Settings can’t be saved in this browser. They’ll reset next visit."}
              </span>
              <a
                href={storeUrl(preferences.locale)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit NVIDIA store <ArrowUpRight size={14} />
              </a>
            </div>
          </section>
          <details className={styles.about}>
            <summary>
              Good to know <ChevronDown size={14} />
            </summary>
            <div className={styles.aboutContent}>
              <p>
                Sound is on by default; your saved mute choice is respected.
                Browsers may require a click before playing an alert, so test
                the sound before waiting. Keep this tab open. Sleeping devices
                or suspended background tabs can delay alerts.
              </p>
              <p>
                The first snapshot and reconnects are quiet: only new, verified
                updates for your selected cards trigger an alert. “Last seen in
                stock” is the latest confirmed sighting, not a promise that a
                card is still available. Exact times use your device’s time
                zone.
              </p>
              <p>
                The shared monitor targets a stock check every 10 seconds per
                card. Health reports arrive separately, about every 30 seconds;
                they are not the stock-check interval. Availability changes are
                pushed as soon as detected. Delays or source failures are shown
                in the health panel. Connection counts represent tabs, not
                people.
              </p>
              <p>
                Auto-open is optional and saved on this device. It opens shop
                tabs only for new, selected alerts, never on a first snapshot or
                reconnect. Allow popups for this site if you use it. If no tab
                opens, use the alert’s store link. Preview and staging test
                alerts never auto-open a real shop.
              </p>
              <label className={styles.volumeLabel} htmlFor="volume">
                Alert volume{" "}
                <input
                  id="volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={preferences.volume}
                  onChange={(event) =>
                    update({ volume: Number(event.target.value) })
                  }
                />
                <span>{Math.round(preferences.volume * 100)}%</span>
              </label>
            </div>
          </details>
        </main>
        <footer className={styles.footer}>
          <div>
            <span className={styles.footerBrand}>Notify-FE</span>
            <p>Independent. Community-built. Not affiliated with NVIDIA.</p>
          </div>
          <nav aria-label="Project links">
            {env.NEXT_PUBLIC_ENABLE_DEMO === "true" && (
              <button type="button" onClick={toggleDemo}>
                {demo ? "Exit preview" : "Preview sample data"}
              </button>
            )}
            <a
              href="https://github.com/jlplenio/notify-fe"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github size={15} />
              Source
            </a>
            <a
              href="https://ko-fi.com/timesaved"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Heart size={15} />
              Support
            </a>
          </nav>
        </footer>
      </div>
      {lastAlert && (
        <div
          className={styles.alertToast}
          role="alert"
          data-testid="availability-alert"
        >
          <span className={styles.toastIcon}>
            <Bell size={20} />
          </span>
          <div>
            <strong>
              {lastAlert.synthetic ? "Test alert · " : ""}RTX{" "}
              {lastAlert.models.join(" / ")} spotted in stock
            </strong>
            <p>
              {country.name} · {relativeTime(lastAlert.at, now).toLowerCase()} ·
              Check the store for current availability.
            </p>
            {lastAlert.autoOpenAttempted && (
              <p className={styles.popupHint}>
                No shop tab? Allow popups for this site or open the store below.
              </p>
            )}
            {lastAlert.synthetic && preferences.autoOpen && (
              <p className={styles.popupHint}>
                Auto-open is skipped for test alerts.
              </p>
            )}
            <a href={lastAlert.url} target="_blank" rel="noopener noreferrer">
              Open store <ArrowUpRight size={14} />
            </a>
          </div>
          <button
            type="button"
            onClick={() => setLastAlert(null)}
            aria-label="Dismiss availability alert"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

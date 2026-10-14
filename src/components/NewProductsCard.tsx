import { useEffect, useRef } from "react";
import { Info, ScanSearch } from "lucide-react";
import type { MonitorView } from "~/hooks/useMonitor";
import { ProductStoreLinks } from "./ProductStoreLinks";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import styles from "~/styles/monitor.module.css";
import groupStyles from "~/styles/new-products.module.css";

const relativeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "always",
});

function RelativeTimestamp({
  stamp,
  now,
}: {
  stamp: number | null;
  now: number;
}) {
  if (stamp === null) return <>Not recorded yet</>;
  const seconds = Math.max(0, Math.floor((now - stamp) / 1000));
  const [unit, divisor] =
    seconds >= 86400
      ? (["day", 86400] as const)
      : seconds >= 3600
        ? (["hour", 3600] as const)
        : seconds >= 60
          ? (["minute", 60] as const)
          : (["second", 1] as const);
  const date = new Date(stamp);
  return (
    <time
      dateTime={date.toISOString()}
      title={date.toLocaleString(undefined, { timeZoneName: "short" })}
    >
      {seconds < 5
        ? "Just now"
        : relativeFormatter.format(-Math.floor(seconds / divisor), unit)}
    </time>
  );
}

export function NewProductsCard({
  monitor,
  selected,
  ready,
  onToggle,
}: {
  monitor: MonitorView;
  selected: boolean;
  ready: boolean;
  onToggle: () => void;
}) {
  const packet = monitor.packet;
  const group = packet?.discoveries;
  const listRef = useRef<HTMLUListElement>(null);
  const productIds =
    group?.products.map((product) => product.id).join(",") ?? "";
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const visibleRows = Array.from(list.children).slice(0, 3);
    const resize = () => {
      const height = visibleRows.reduce(
        (sum, row) => sum + row.getBoundingClientRect().height,
        0,
      );
      list.style.maxHeight = `${height}px`;
    };
    const observer = new ResizeObserver(resize);
    visibleRows.forEach((row) => observer.observe(row));
    resize();
    return () => observer.disconnect();
  }, [productIds]);
  const now = monitor.serverNow ?? Date.now();
  const connected =
    monitor.connection === "connected" &&
    monitor.health !== "offline" &&
    monitor.health !== "transport_silent";
  const current =
    connected &&
    group?.status === "healthy" &&
    group.checkedAt !== null &&
    now - group.checkedAt >= 0 &&
    now - group.checkedAt < (packet?.catalogStaleAfterMs ?? 75_000);
  const summary = !group
    ? "Monitoring not available yet"
    : !connected
      ? "Updates paused"
      : !current
        ? "Catalog check delayed"
        : group.products.length
          ? `${group.products.length} ${group.products.length === 1 ? "listing" : "listings"} in this country`
          : "Watching for new products";
  return (
    <article
      className={groupStyles.group}
      data-testid="card-new-products"
      aria-labelledby="new-products-title"
    >
      <div
        className={`${styles.stockCard} ${groupStyles.heading} ${selected ? styles.selected : ""}`}
      >
        <div className={groupStyles.headingIdentity}>
          <h3 id="new-products-title">
            <ScanSearch size={20} aria-hidden="true" />
            New NVIDIA releases
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={styles.catalogInfoButton}
                  aria-label="About new NVIDIA releases"
                >
                  <Info size={15} aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className={styles.catalogPopover}
                side="bottom"
                align="start"
                collisionPadding={12}
                aria-label="About new NVIDIA releases"
              >
                <p className={styles.catalogPopoverTitle}>
                  Watching for new cards
                </p>
                <p>
                  Tracks new NVIDIA Founders Edition cards and memory variants
                  appearing in your country’s catalog. With alerts on, you’re
                  notified when a new listing appears and when it becomes
                  available.
                </p>
                <p className={groupStyles.infoNote}>
                  Rumored products are shown only after we detect a listing in
                  NVIDIA’s catalog. A listing alone does not confirm a launch.
                </p>
              </PopoverContent>
            </Popover>
          </h3>
          <p data-testid="new-products-status">{summary}</p>
        </div>
        <div className={styles.cardBottom}>
          <button
            id="notify-new-products"
            type="button"
            role="switch"
            aria-checked={selected}
            aria-label="Notify me about new NVIDIA listings and availability"
            disabled={!ready}
            onClick={onToggle}
            className={styles.toggle}
          >
            <span />
          </button>
        </div>
      </div>
      {!!group?.products.length && (
        <ul
          ref={listRef}
          className={groupStyles.products}
          aria-label="New NVIDIA products"
          tabIndex={group.products.length > 3 ? 0 : undefined}
        >
          {group.products.map((product) => {
            const fresh =
              current &&
              product.status === "healthy" &&
              product.observedAt !== null &&
              now - product.observedAt >= 0 &&
              now - product.observedAt < (packet?.staleAfterMs ?? 60_000);
            const available = fresh && product.available === true;
            const detail = !connected
              ? "Updates paused"
              : !current
                ? "Catalog check delayed"
                : fresh
                  ? null
                  : product.status === "queued"
                    ? "Waiting for availability check"
                    : product.status === "healthy" || product.status === "stale"
                      ? "Status out of date"
                      : "Availability check delayed";
            const stamp =
              product.lastAvailableAt ??
              (product.available === true ? product.observedAt : null);
            return (
              <li
                key={product.id}
                data-testid="new-product"
                className={`${styles.stockCard} ${groupStyles.product} ${selected ? styles.selected : ""} ${available ? styles.available : ""}`}
              >
                <div className={styles.cardIdentity}>
                  <div className={groupStyles.identity}>
                    <strong>{product.name}</strong>
                  </div>
                </div>
                <div className={styles.cardAvailability}>
                  <span
                    className={`${styles.stockBadge} ${groupStyles.badge} ${available ? styles.inStock : ""}`}
                  >
                    <span className={styles.statusDot} />
                    {available
                      ? "In stock"
                      : fresh
                        ? "Out of stock"
                        : product.status === "queued"
                          ? "Awaiting data"
                          : "Status unavailable"}
                  </span>
                  {detail && (
                    <span
                      className={`${styles.exactTime} ${groupStyles.detail}`}
                    >
                      {detail}
                    </span>
                  )}
                  {available && packet && (
                    <ProductStoreLinks
                      locale={packet.locale}
                      name={product.name}
                      productUrl={product.productUrl}
                      synthetic={packet.synthetic}
                    />
                  )}
                </div>
                <div className={groupStyles.history}>
                  <dl>
                    <dt>Last in stock</dt>
                    <dd>
                      <RelativeTimestamp stamp={stamp} now={now} />
                    </dd>
                  </dl>
                  <dl>
                    <dt>First seen</dt>
                    <dd>
                      <RelativeTimestamp
                        stamp={product.firstSeenAt}
                        now={now}
                      />
                    </dd>
                  </dl>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {group?.overflow && (
        <p className={groupStyles.notice}>
          Monitoring is limited. Additional listings are pending review.
        </p>
      )}
    </article>
  );
}

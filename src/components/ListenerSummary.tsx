import { useId, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { COUNTRIES, LOCALES, type Locale } from "~/lib/realtime/catalog";
import type { Packet } from "~/lib/realtime/protocol";
import { CountryFlag } from "./CountryFlag";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import styles from "~/styles/listeners.module.css";

const number = (value: number | undefined) =>
  value === undefined ? "—" : value.toLocaleString();
const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function ListenerSummary({
  packet,
  locale,
}: {
  packet: Packet | null;
  locale: Locale;
}) {
  const clients = packet?.clients;
  const countriesId = useId();
  const clientDetailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const selectedCount =
    clients?.byLocale?.[locale] ??
    (packet?.locale === locale ? clients?.locale : undefined);
  return (
    <section
      className={styles.summary}
      data-testid="connection-counts"
      aria-label="Live listener counts"
    >
      <div className={styles.overview}>
        <div className={styles.heading}>
          <div className={styles.total}>
            <strong data-testid="listener-total">
              {number(clients?.total)}
            </strong>
            <span>Total listeners</span>
          </div>
          <button
            type="button"
            className={styles.countryToggle}
            aria-expanded={expanded}
            aria-controls={`${countriesId} ${clientDetailsId}`}
            aria-label={`${COUNTRIES[locale].name}: ${selectedCount === undefined ? "count unavailable" : `${number(selectedCount)} listeners`}. ${expanded ? "Hide" : "Show"} listener details`}
            onClick={() => setExpanded(!expanded)}
            data-testid="listener-regions-toggle"
          >
            <CountryFlag locale={locale} className={styles.flag} />
            <strong>{number(selectedCount)}</strong>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </div>
        <div
          id={clientDetailsId}
          className={styles.meta}
          data-expanded={expanded}
        >
          {clients?.byClient && (
            <div className={styles.clientCounts}>
              <span
                className={styles.clientCount}
                title="Connections labelled as website clients"
              >
                <strong>{number(clients.byClient.website)}</strong> Website
              </span>
              <span
                className={styles.clientCount}
                title="Unclassified connections; may include scripts or older website tabs"
                data-testid="other-listeners"
              >
                <strong>{number(clients.byClient.unclassified)}</strong> Other
              </span>
            </div>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={styles.info}
                aria-label="About listener counts"
              >
                <Info size={14} aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className={styles.popover}
              align="end"
              sideOffset={8}
            >
              <strong>Following the drop</strong>
              <p>
                Flags show which regions people are following. Your selected
                region is highlighted. Counts are connections, so multiple tabs
                count separately.
              </p>
              <p>
                Other connections are unclassified and may include scripts or
                older website tabs. They are not a verified bot count. A dash
                means the count is not available.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <ul
        id={countriesId}
        className={styles.countries}
        aria-label="Listeners by region"
        data-expanded={expanded}
      >
        {LOCALES.map((region) => {
          const count =
            clients?.byLocale?.[region] ??
            (packet?.locale === region ? clients?.locale : undefined);
          const selected = locale === region;
          const label = `${COUNTRIES[region].name}: ${count === undefined ? "count unavailable" : `${number(count)} listeners`}${selected ? ", selected region" : ""}`;
          return (
            <li
              key={region}
              className={styles.country}
              data-selected={selected}
              data-testid={`listeners-${region}`}
              aria-label={label}
              aria-current={selected ? "true" : undefined}
              title={label}
            >
              <CountryFlag locale={region} className={styles.flag} />
              <span>{count === undefined ? "—" : compact.format(count)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

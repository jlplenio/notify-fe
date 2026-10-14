import { ArrowUpRight } from "lucide-react";
import {
  nvidiaStoreUrl,
  safeShopUrl,
  storeUrl,
  type Locale,
  type Model,
} from "~/lib/realtime/catalog";
import styles from "~/styles/monitor.module.css";

/** Row actions remain available independently of the temporary alert. */
export function ProductStoreLinks({
  locale,
  name,
  model,
  productUrl,
  synthetic,
}: {
  locale: Locale;
  name: string;
  model?: Model;
  productUrl?: string | null;
  synthetic: boolean;
}) {
  const nvidiaUrl = nvidiaStoreUrl(locale, model);
  const shopUrl = synthetic ? null : safeShopUrl(productUrl);
  return (
    <div className={styles.storeLinks}>
      {shopUrl && shopUrl !== nvidiaUrl && (
        <a
          className={styles.shopLink}
          href={storeUrl(locale, shopUrl)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Shop ${name}`}
          title="Open the purchase page provided by NVIDIA"
        >
          Shop <ArrowUpRight size={12} aria-hidden="true" />
        </a>
      )}
      <a
        className={styles.shopLink}
        href={nvidiaUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View ${name} on NVIDIA`}
        title={
          model
            ? `NVIDIA store filtered to RTX ${model}`
            : "NVIDIA store for this country"
        }
      >
        NVIDIA <ArrowUpRight size={12} aria-hidden="true" />
      </a>
    </div>
  );
}

import type { GetStaticProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ExternalLink } from "lucide-react";
import { env } from "~/env";
import { COUNTRIES, DISPLAY_MODELS, isLocale } from "~/lib/realtime/catalog";
import styles from "~/styles/monitor.module.css";

// The test destination is unavailable in a normal production build.
export const getStaticProps: GetStaticProps = async () =>
  env.NEXT_PUBLIC_ENABLE_DEMO === "true" ? { props: {} } : { notFound: true };

export default function AutoOpenPreview() {
  const { query, isReady } = useRouter();
  const locale = isReady && isLocale(query.region) ? query.region : null;
  const model = isReady
    ? DISPLAY_MODELS.find((value) => value === query.model)
    : undefined;
  return (
    <div className={`${styles.page} ${styles.previewPage}`}>
      <Head>
        <title>Demo shop · Notify-FE auto-open test</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className={styles.previewShop}>
        <span className={styles.previewBadge}>
          <ExternalLink size={16} /> Auto-open test
        </span>
        <h1>Demo shop</h1>
        <p className={styles.previewProduct}>
          {model ? `RTX ${model}` : "Test card"}
          {locale ? ` · ${COUNTRIES[locale].name}` : ""}
        </p>
        <p>
          This is a safe test destination. No real store was contacted and no
          purchase was made.
        </p>
        <p>You can close this tab and return to your watchlist.</p>
        <Link
          href={{
            pathname: "/",
            query: { demo: "1", ...(locale ? { region: locale } : {}) },
          }}
          prefetch={false}
        >
          Open preview watchlist
        </Link>
      </main>
    </div>
  );
}

import { ThemeProvider } from "next-themes";
import { type AppType } from "next/app";
import Head from "next/head";

import "~/styles/globals.css";

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <Head>
        {/* Basic SEO */}
        <title>Notify-FE - NVIDIA GPU Stock Notifier</title>
        <meta
          name="description"
          content="Get instant notifications when NVIDIA Founders Edition GPUs are in stock. Real-time alerts for RTX 5090, 5080, 5070Ti, 5070, 4090, 4080 SUPER and 4070 SUPER FE across all regions."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#000000" />

        {/* Meta Robots */}
        <meta name="robots" content="index,follow" />

        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Notify-FE",
              url: "https://notify-fe.plen.io/",
              logo: "https://notify-fe.plen.io/favicon-192x192.png",
              sameAs: [
                "https://twitter.com/YourTwitterHandle",
                "https://www.facebook.com/YourFacebookPage",
              ],
            }),
          }}
        />

        {/* Open Graph / Facebook */}
        <meta
          property="og:title"
          content="Notify-FE - NVIDIA GPU Stock Notifier"
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:description"
          content="Get instant stock alerts for NVIDIA Founders Edition GPUs. Monitors RTX 5090, 5080, 5070Ti, 5070, 4090, 4080 SUPER and 4070 SUPER FE availability."
        />
        <meta
          property="og:image"
          content="https://notify-fe.plen.io/favicon-192x192.png"
        />
        <meta property="og:url" content="https://notify-fe.plen.io/" />
        <meta property="og:site_name" content="Notify-FE" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Notify-FE - NVIDIA GPU Stock Notifier"
        />
        <meta
          name="twitter:description"
          content="Get instant stock alerts for NVIDIA Founders Edition GPUs. Monitors RTX 5090, 5080, 5070Ti, 5070, 4090, 4080 SUPER and 4070 SUPER FE availability."
        />
        <meta
          name="twitter:image"
          content="https://notify-fe.plen.io/favicon-192x192.png"
        />

        {/* Canonical */}
        <link rel="canonical" href="https://notify-fe.plen.io/" />
      </Head>
      <Component {...pageProps} />
    </ThemeProvider>
  );
};

export default MyApp;

import { ThemeProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/react";
import { type AppType } from "next/app";
import Head from "next/head";
import "~/styles/globals.css";

const description =
  "NVIDIA Founders Edition stock alerts for RTX 5090, 5080 and 5070. Choose your region, follow the latest sightings, and listen for the next drop.";

const MyApp: AppType = ({ Component, pageProps }) => (
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    disableTransitionOnChange
  >
    <Head>
      <title>Notify-FE · Founders Edition stock alerts</title>
      <meta name="description" content={description} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta charSet="utf-8" />
      <meta name="theme-color" content="#f7f8fa" />
      <meta name="robots" content="index,follow" />
      <meta
        property="og:title"
        content="Notify-FE · Founders Edition stock alerts"
      />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta
        property="og:image"
        content="https://notify-fe.plen.io/favicon-192x192.png"
      />
      <meta property="og:url" content="https://notify-fe.plen.io/" />
      <meta name="twitter:card" content="summary" />
      <meta
        name="twitter:title"
        content="Notify-FE · Founders Edition stock alerts"
      />
      <meta name="twitter:description" content={description} />
      <link rel="canonical" href="https://notify-fe.plen.io/" />
    </Head>
    <Component {...pageProps} />
    <Analytics />
  </ThemeProvider>
);

export default MyApp;

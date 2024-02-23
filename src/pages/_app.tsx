import { ThemeProvider } from "next-themes";
import { type AppType } from "next/app";
import Head from 'next/head';

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
        <title>Notify-FE</title>
        <meta name="description" content="Instantly monitor and track Nvidia Shop's Founders Edition GPU stock.
         Get alerts for NVIDIA GeForce RTX 4090 FE, 4080 SUPER FE, and 4070 SUPER FE across all regions."></meta>
        <meta property="og:title" content="Notify-FE" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://notify-fe.vercel.app/favicon-192x192.png" />
        <meta property="og:url" content="https://notify-fe.vercel.app/" />
      </Head>
      <Component {...pageProps} />
    </ThemeProvider>
  );
};

export default MyApp;

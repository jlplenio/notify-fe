import { ThemeProvider } from "next-themes";
import { type AppType } from "next/app";

import "~/styles/globals.css";

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <Component {...pageProps} />
    </ThemeProvider>
  );
};

export default MyApp;

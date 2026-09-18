import { Html, Head, Main, NextScript } from "next/document";
import { credentialCleanupScript } from "~/lib/realtime/credential-url";

export default function Document() {
  return (
    <Html>
      <Head>
        <meta name="referrer" content="no-referrer" />
        <script dangerouslySetInnerHTML={{ __html: credentialCleanupScript }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

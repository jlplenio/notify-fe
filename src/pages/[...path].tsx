import React, { useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const DynamicRedirect: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    if (router.isReady) {
      const path = router.asPath;
      if (path.startsWith("/marketplace.nvidia.comm")) {
        const targetUrl = router.query.target as string;
        setTimeout(() => {
          window.location.href = targetUrl;
        }, 50);
      }
    }
  }, [router.isReady]);

  return (
    <Head>
      <meta name="referrer" content="unsafe-url" />
    </Head>
  );
};

export default DynamicRedirect;

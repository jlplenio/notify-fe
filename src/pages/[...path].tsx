import type { GetServerSideProps } from "next";
import { legacyRedirectTarget } from "~/lib/realtime/catalog";

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const path = Array.isArray(query.path) ? "/" + query.path.join("/") : "";
  const destination = legacyRedirectTarget(query.target);
  if (!path.startsWith("/marketplace.nvidia.comm") || !destination)
    return { notFound: true };
  return { redirect: { destination, permanent: false } };
};

export default function LegacyRedirect() {
  return null;
}

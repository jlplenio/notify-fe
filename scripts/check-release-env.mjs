import { pathToFileURL } from "node:url";

/** Public release settings only: never log environment values or credentials. */
export function checkReleaseEnv(environment) {
  if (environment.VERCEL_ENV !== "production") return;
  for (const name of [
    "NEXT_PUBLIC_ALLOW_SYNTHETIC",
    "NEXT_PUBLIC_ENABLE_DEMO",
  ]) {
    if (environment[name] !== "false")
      throw new Error(`${name} must explicitly be false for production`);
  }
  let endpoint;
  try {
    endpoint = new URL(environment.NEXT_PUBLIC_WEBSOCKET_URL);
  } catch {
    throw new Error("Configure NEXT_PUBLIC_WEBSOCKET_URL before production");
  }
  if (
    endpoint.protocol !== "wss:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/v1/ws" ||
    ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
  )
    throw new Error(
      "Production requires a credential-free public wss:// endpoint at /v1/ws",
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    checkReleaseEnv(process.env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

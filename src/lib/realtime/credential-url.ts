const credentialKeys = [
  "telegramapiurl",
  "telegramtoken",
  "bottoken",
  "bot_token",
];

/** Also used at the analytics boundary; never send legacy credential links. */
export function stripTelegramCredentials(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()])
      if (credentialKeys.includes(key.toLowerCase()))
        url.searchParams.delete(key);
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (
      [...fragment.keys()].some((key) =>
        credentialKeys.includes(key.toLowerCase()),
      )
    )
      url.hash = "";
    return url.href;
  } catch {
    return "https://notify-fe.plen.io/";
  }
}

// Runs before hydration or analytics. No URL values are interpolated into code.
// The original HTTP request may already have reached the host; we never import it.
export const credentialCleanupScript = `(()=>{try{const u=new URL(location.href),keys=${JSON.stringify(credentialKeys)};for(const k of [...u.searchParams.keys()])if(keys.includes(k.toLowerCase()))u.searchParams.delete(k);if([...new URLSearchParams(u.hash.slice(1)).keys()].some(k=>keys.includes(k.toLowerCase())))u.hash='';if(u.href!==location.href)history.replaceState(history.state,'',u.pathname+u.search+u.hash)}catch{}})();`;

/**
 * Loads the Umami analytics script only when both an endpoint and a
 * website id are actually configured. Previously this lived as a raw
 * %VITE_ANALYTICS_ENDPOINT% / %VITE_ANALYTICS_WEBSITE_ID% placeholder
 * pair in index.html — Vite's HTML env substitution leaves an undefined
 * %VITE_X% token unreplaced rather than stripping it, so the browser
 * ended up requesting the literal string "%VITE_ANALYTICS_ENDPOINT%/umami"
 * as a script src, which isn't a valid URI and crashed local preview
 * whenever the vars weren't set (i.e. always, in local dev).
 */
export function loadAnalytics() {
  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
  if (!endpoint || !websiteId) return;

  const script = document.createElement("script");
  script.defer = true;
  script.src = `${endpoint}/umami`;
  script.dataset.websiteId = websiteId;
  document.head.appendChild(script);
}

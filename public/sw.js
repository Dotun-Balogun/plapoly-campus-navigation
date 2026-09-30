// PLAPOLYNAV service worker.
//
// This is intentionally minimal: its only job is to satisfy the browser's
// installability checks (Chrome/Android require an active service worker
// with a fetch handler before it will offer the "Install app" prompt).
// It does not cache anything or work offline yet — that's a reasonable
// next step, but a bigger one, so it's left out for now rather than risk
// serving stale campus data.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: let every request go to the network as normal.
});

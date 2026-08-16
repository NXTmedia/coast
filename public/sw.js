const VERSION = "coastline-v11";
const SHELL_CACHE = `${VERSION}-shell`;
const SHELL = ["/", "/manifest.webmanifest", "/data/swcp-route.json"];

async function cacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const results = await Promise.allSettled(SHELL.map(async (url) => {
    const response = await fetch(new Request(url, { cache: "reload" }));
    if (!response.ok) throw new Error(`Could not cache ${url}`);
    await cache.put(url, response);
  }));
  return results.every((result) => result.status === "fulfilled");
}

self.addEventListener("install", (event) => {
  // A partial precache must not prevent the worker from activating. The app
  // retries this preparation and only reports ready after it succeeds.
  event.waitUntil(cacheShell().catch(() => false).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("coastline-") && !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "PREPARE_OFFLINE") return;
  event.waitUntil(cacheShell().then((ready) => event.ports[0]?.postMessage({ ready })).catch(() => event.ports[0]?.postMessage({ ready: false })));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Offline resource unavailable", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function navigationResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put("/", response.clone());
    return response;
  } catch {
    return (await cache.match(request))
      ?? (await cache.match("/"))
      ?? new Response("Coastline is not available offline yet. Reconnect once and wait for ‘Offline ready’.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  const cacheableAsset = request.destination === "script"
    || request.destination === "style"
    || request.destination === "font"
    || request.destination === "image"
    || url.pathname === "/manifest.webmanifest"
    || url.pathname === "/data/swcp-route.json";
  if (cacheableAsset) event.respondWith(cacheFirst(request, SHELL_CACHE));
});

const VERSION = "coastline-v39";
const SHELL_CACHE = `${VERSION}-shell`;
const SHELL = ["/", "/manifest.json"];
const READY_MARKER = "/__coastline_offline_ready__";

function shellAssetsFromHtml(html) {
  const assets = new Set(SHELL.slice(1));
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    try {
      const url = new URL(match[1], self.location.origin);
      if (url.origin === self.location.origin) assets.add(`${url.pathname}${url.search}`);
    } catch {
      // Ignore malformed or unsupported references in the document.
    }
  }
  return [...assets];
}

function importedAssetsFromText(text, baseUrl) {
  const assets = new Set();
  const source = text
    .replace(/\/\/# sourceMappingURL=.*$/gm, "")
    .replace(/\/\*# sourceMappingURL=.*?\*\//gs, "");
  const patterns = [
    /(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g,
    /(?:url|new URL)\(\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const reference = match[1];
      if (!(reference.startsWith("/") || reference.startsWith("./") || reference.startsWith("../"))) continue;
      try {
        const url = new URL(reference, baseUrl);
        if (url.origin === self.location.origin) assets.add(`${url.pathname}${url.search}`);
      } catch {
        // Ignore malformed module and stylesheet references.
      }
    }
  }
  return [...assets];
}

function hasExpectedContentType(asset, contentType) {
  const pathname = new URL(asset, self.location.origin).pathname;
  if (/\.m?js$/.test(pathname)) return contentType.includes("javascript");
  if (pathname.endsWith(".css")) return contentType.includes("css");
  if (pathname.endsWith("manifest.json")) return contentType.includes("manifest") || contentType.includes("json");
  return true;
}

async function cacheAssetGraph(cache, initialAssets) {
  const queue = [...initialAssets];
  const required = new Set(initialAssets);
  const visited = new Set();
  while (queue.length) {
    const asset = queue.shift();
    if (!asset || visited.has(asset)) continue;
    if (visited.size >= 600) return false;
    visited.add(asset);
    const response = await fetch(new Request(asset, { cache: "reload" }));
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !hasExpectedContentType(asset, contentType)) {
      // Regex-based dependency discovery can see import examples inside a
      // library's source text. Direct HTML assets are mandatory; an unfetchable
      // transitive candidate is ignored because the running online app cannot
      // actually depend on a missing URL.
      if (required.has(asset)) return false;
      continue;
    }
    if (contentType.includes("javascript") || contentType.includes("css")) {
      const text = await response.clone().text();
      const baseUrl = new URL(asset, self.location.origin);
      for (const dependency of importedAssetsFromText(text, baseUrl)) {
        if (!visited.has(dependency)) queue.push(dependency);
      }
    }
    await cache.put(asset, response);
  }
  return true;
}

async function hasCachedShell() {
  const cache = await caches.open(SHELL_CACHE);
  return Boolean(await cache.match(READY_MARKER));
}

async function cacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.delete(READY_MARKER);
  const rootResponse = await fetch(new Request("/", { cache: "reload" }));
  if (!rootResponse.ok) return false;
  const html = await rootResponse.clone().text();
  await cache.put("/", rootResponse);
  const ready = await cacheAssetGraph(cache, shellAssetsFromHtml(html));
  if (ready) await cache.put(READY_MARKER, new Response(VERSION));
  return ready;
}

self.addEventListener("install", (event) => {
  // Do not replace a working offline version with a partial cache. Safari can
  // retry installation when the app next opens with connectivity.
  event.waitUntil(cacheShell().then((ready) => {
    if (!ready) throw new Error("The complete app shell could not be cached");
    return self.skipWaiting();
  }));
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
  event.waitUntil(
    hasCachedShell()
      .then((ready) => ready || cacheShell())
      .then((ready) => event.ports[0]?.postMessage({ ready }))
      .catch(() => event.ports[0]?.postMessage({ ready: false })),
  );
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
    || url.pathname === "/manifest.json";
  if (cacheableAsset) event.respondWith(cacheFirst(request, SHELL_CACHE));
});

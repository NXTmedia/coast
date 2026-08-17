import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const origin = "https://coastline.test";
const serviceWorkerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const serviceWorkerVersion = serviceWorkerSource.match(/const VERSION = "([^"]+)"/)?.[1];
const shellCacheName = `${serviceWorkerVersion}-shell`;

class TestRequest {
  constructor(input, options = {}) {
    this.url = new URL(typeof input === "string" ? input : input.url, origin).href;
    this.cache = options.cache;
    this.method = options.method ?? input?.method ?? "GET";
    this.mode = options.mode ?? input?.mode ?? "same-origin";
    this.destination = options.destination ?? input?.destination ?? "";
  }
}

function requestKey(input) {
  const url = new URL(typeof input === "string" ? input : input.url, origin);
  return `${url.pathname}${url.search}`;
}

class MemoryCache {
  entries = new Map();

  async match(input) {
    return this.entries.get(requestKey(input))?.clone();
  }

  async put(input, response) {
    this.entries.set(requestKey(input), response.clone());
  }

  async delete(input) {
    return this.entries.delete(requestKey(input));
  }
}

class MemoryCaches {
  stores = new Map();

  async open(name) {
    if (!this.stores.has(name)) this.stores.set(name, new MemoryCache());
    return this.stores.get(name);
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name) {
    return this.stores.delete(name);
  }
}

function response(body, contentType, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": contentType } });
}

function completeNetwork() {
  return new Map([
    ["/", response('<!doctype html><link rel="stylesheet" href="/styles.css"><script type="module" src="/entry.js"></script>', "text/html")],
    ["/manifest.webmanifest", response("{}", "application/manifest+json")],
    ["/styles.css", response('@import "./theme.css"; body { background: url("/coast.png"); }', "text/css")],
    ["/theme.css", response("body { color: green; }", "text/css")],
    ["/coast.png", response("image", "image/png")],
    ["/entry.js", response('import "./chunk.js"; window.appStarted = true;', "text/javascript")],
    ["/chunk.js", response("export const ready = true;", "text/javascript")],
  ]);
}

function createWorkerHarness(network = completeNetwork()) {
  const caches = new MemoryCaches();
  const listeners = new Map();
  const fetches = [];
  let online = true;
  let skippedWaiting = false;

  const worker = {
    location: { origin },
    clients: { claim: async () => undefined },
    addEventListener(type, listener) { listeners.set(type, listener); },
    skipWaiting: async () => { skippedWaiting = true; },
  };
  const context = vm.createContext({
    self: worker,
    caches,
    Request: TestRequest,
    Response,
    URL,
    console,
    fetch: async (input) => {
      const key = requestKey(input);
      fetches.push(key);
      if (!online) throw new TypeError("Network unavailable");
      return (network.get(key) ?? response("Missing", "text/plain", 404)).clone();
    },
  });
  new vm.Script(serviceWorkerSource, { filename: "public/sw.js" }).runInContext(context);

  return {
    caches,
    context,
    fetches,
    listeners,
    setOnline(value) { online = value; },
    get skippedWaiting() { return skippedWaiting; },
  };
}

async function dispatchMessage(harness) {
  let message;
  let task;
  harness.listeners.get("message")({
    data: { type: "PREPARE_OFFLINE" },
    ports: [{ postMessage(value) { message = value; } }],
    waitUntil(promise) { task = promise; },
  });
  await task;
  return message;
}

test("offline preparation caches the page, route and transitive app assets before marking ready", async () => {
  const harness = createWorkerHarness();
  assert.equal(await harness.context.cacheShell(), true);

  const cache = await harness.caches.open(shellCacheName);
  for (const asset of ["/", "/manifest.webmanifest", "/styles.css", "/theme.css", "/coast.png", "/entry.js", "/chunk.js"]) {
    assert.ok(await cache.match(asset), `${asset} should be available offline`);
  }
  assert.ok(await cache.match("/__coastline_offline_ready__"));
});

test("an installed app relaunches with cached navigation and scripts while the network is off", async () => {
  const harness = createWorkerHarness();
  await harness.context.cacheShell();
  harness.setOnline(false);
  const fetchCountBeforeRelaunch = harness.fetches.length;

  const page = await harness.context.navigationResponse(new TestRequest("/", { mode: "navigate" }));
  const script = await harness.context.cacheFirst(new TestRequest("/entry.js", { destination: "script" }), shellCacheName);
  const readiness = await dispatchMessage(harness);

  assert.match(await page.text(), /entry\.js/);
  assert.match(await script.text(), /appStarted/);
  assert.equal(readiness.ready, true);
  assert.equal(harness.fetches.length, fetchCountBeforeRelaunch + 1, "only the navigation network attempt should occur");
});

test("an incomplete update never receives a readiness marker or replaces the working worker", async () => {
  const network = completeNetwork();
  network.set("/entry.js", response("<!doctype html><title>SPA fallback</title>", "text/html"));
  const harness = createWorkerHarness(network);
  await harness.caches.open("coastline-prior-shell");
  let installTask;

  harness.listeners.get("install")({ waitUntil(promise) { installTask = promise; } });
  await assert.rejects(installTask, /complete app shell could not be cached/);

  const newCache = await harness.caches.open(shellCacheName);
  assert.equal(await newCache.match("/__coastline_offline_ready__"), undefined);
  assert.equal(harness.skippedWaiting, false);
  assert.deepEqual(await harness.caches.keys(), ["coastline-prior-shell", shellCacheName]);
});

test("offline preparation reports failure without a cache and succeeds when connectivity returns", async () => {
  const harness = createWorkerHarness();
  harness.setOnline(false);
  assert.equal((await dispatchMessage(harness)).ready, false);

  harness.setOnline(true);
  assert.equal((await dispatchMessage(harness)).ready, true);
  const cache = await harness.caches.open(shellCacheName);
  assert.ok(await cache.match("/__coastline_offline_ready__"));
});

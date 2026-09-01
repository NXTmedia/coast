import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("documentation covers the current navigation, GPS, offline and GPX workflows", async () => {
  const [readme, architecture, guide] = await Promise.all([
    readFile(new URL("README.md", root), "utf8"),
    readFile(new URL("docs/ARCHITECTURE.md", root), "utf8"),
    readFile(new URL("docs/USER_GUIDE.md", root), "utf8"),
  ]);

  assert.match(readme, /docs\/USER_GUIDE\.md/);
  assert.match(readme, /Confirmed GPX import/);
  assert.match(readme, /Offline-persisted points of interest/);
  assert.match(readme, /Netlify/);
  assert.match(readme, /publish directory is `dist`/);
  assert.match(architecture, /Track, Plan and Locations/);
  assert.match(architecture, /real-GPS coordinate check/);
  assert.match(architecture, /separate Total walk panel/);
  assert.match(architecture, /database's version 2 migration/);
  assert.match(architecture, /committed in one IndexedDB transaction/);
  assert.match(architecture, /OS Maps with `zoom=13\.0000`, `style=Leisure` and `type=2d`/);
  assert.doesNotMatch(architecture, /Edit-screen verification links/);
  assert.match(guide, /Wait for \*\*Offline ready\*\*/);
  assert.match(guide, /5 km of the new route/);
  assert.match(guide, /Restore bundled Land's End–Falmouth route/);
  assert.match(guide, /Add → Point of interest/);
  assert.match(guide, /percentage of ascent left/);
  assert.match(guide, /There is no account, cloud sync, plan export or cross-device backup/);
  assert.match(guide, /new website address has its own IndexedDB storage/);
});

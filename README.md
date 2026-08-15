# Coastline — South West Coast Path tracker

An offline-first, mobile-first PWA for planning walking days and tracking progress along the South West Coast Path.

## What works

- Interactive MapLibre map with the full SWCP route and selected day highlighted
- Three sample walking days, plus create/edit/delete planning tools
- One-tap “start where the previous day ended” planning
- Start and end entry by named checkpoint, distance slider, or latitude/longitude with nearest-path matching
- Elevation profile for each selected day
- High-accuracy iPhone browser location via `watchPosition`
- Nearest-point map matching and progress for the selected day and whole trail
- Device-local persistence in IndexedDB (Dexie)
- GPX import, including elevation values where the GPX contains them
- Installable PWA and service worker
- Offline route, elevation, plans, chart and GPS calculations
- Runtime caching of map tiles that have already been viewed

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address printed in the terminal (normally <http://localhost:3000>).

For a production check:

```bash
npm run build
npm test
```

Browser location only works in a secure context. `localhost` is treated as secure for development; a hosted copy must use HTTPS. On iPhone, open the site in Safari, allow location access, then use **Share → Add to Home Screen**.

## Offline behaviour

On the first successful visit, the app shell and bundled route are cached. Route data and walking plans are also stored in IndexedDB. Open each planned day’s map while online before setting out: OpenStreetMap tiles are cached as they are viewed, but this prototype does not yet offer bulk offline tile downloads.

## Trail data

The bundled geometry was generated from the OpenStreetMap South West Coast Path super-relation (`2376086`), licensed under the ODbL. It contains roughly 5,000 simplified points and named checkpoints. The bundled elevation values are illustrative because the public elevation service rate-limited the build; import a GPX containing elevation for a real profile.

The loader is isolated in `app/lib/route.ts`. A GPX can be imported from the app’s **Route** screen. To regenerate the bundled geometry from an Overpass JSON export:

```bash
npm run route:data -- path/to/swcp-overpass.json public/data/swcp-route.json
```

Cloud sync is intentionally not included. IndexedDB remains the source of truth for this version, leaving accounts and shared sync as a later extension.

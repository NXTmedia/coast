# Coastline — South West Coast Path tracker

An offline-first, mobile-first PWA for planning walking days and tracking progress along the South West Coast Path.

## What works

- A Mousehole-to-Falmouth starter day, plus create/edit/delete planning tools
- One-tap “start where the previous day ended” planning
- Start and end entry by named checkpoint or latitude/longitude with nearest-path matching
- Custom names for every start and end location, used throughout the app
- Editable saved-location list with coordinate-to-GPX matching
- Dedicated Locations screen for place editing, Google Maps verification, GPS simulation and advanced GPX tools
- Elevation profile for each selected day
- Elevation profile positioned first beneath the Track screen top bar, titled with the selected start and end points and labelled with its day and date
- Automatic phone-landscape profile mode that fills the available screen and restores the normal interface in portrait
- Live GPS position marker on the selected day's elevation profile
- High-accuracy iPhone browser location via `watchPosition`
- GPS simulation about 3 km beyond Lizard Point for testing without sharing device location
- Nearest-point matching and progress for the selected day and total planned sections
- Start and end location links that open their exact coordinates in Google Maps
- Previous/next day controls and automatic selection of today's dated walk
- One itinerary start date with automatically calculated stage dates
- Touch-friendly drag-and-drop stage reordering with automatic renumbering and rescheduling
- Optional break days between stages that shift every later date
- Save and change confirmations that dismiss automatically after four seconds
- Start/end verification links to the nearest matched path coordinates while editing
- Device-local persistence in IndexedDB (Dexie)
- GPX import, including elevation values where the GPX contains them
- Installable PWA and service worker
- Offline route, elevation, plans, chart and GPS calculations

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

The bundled route is compiled into the app, so startup never waits for a route download. On the first successful visit, the app shell is also cached and walking plans are stored in IndexedDB. Wait until the header says **Offline ready** before closing the first session.

## Trail data

The bundled route is extracted from the supplied `uploads-2026-04-South_West_Coast_Path_Elev.gpx`. Only the forward Mousehole-to-Falmouth section is retained. Exact consecutive duplicates and the repeated second copy of the whole GPX are removed, leaving 4,685 points over approximately 105.5 km with the supplied elevation values. Mousehole to Penzance accounts for approximately 5.5 km of this route.

The seven default planning locations are Mousehole, Penzance, Porthleven, Lizard Point, Coverack, Helford and Falmouth. Their place coordinates were resolved with OpenStreetMap/Nominatim and then snapped to the closest GPX point. The resulting matched coordinates are stored in the bundled route. Users can add, edit and remove saved locations on the dedicated **Locations** screen; those changes are stored locally in IndexedDB.

The loader is isolated in `app/lib/route.ts`. A GPX can be imported from the expandable **Route data & GPX** area on the **Locations** screen. To regenerate the bundled segment from the supplied full-route GPX:

```bash
npm run route:segment -- path/to/full-route.gpx public/data/swcp-route.json
```

Cloud sync is intentionally not included. IndexedDB remains the source of truth for this version, leaving accounts and shared sync as a later extension.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the feature behaviour, data flow, offline design, storage model and test coverage.

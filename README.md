# Coastline — South West Coast Path tracker

An offline-first, mobile-first PWA for planning walking days and tracking progress along the South West Coast Path.

## What works

- The complete Minehead-to-South Haven Point main path, with a lightweight Minehead-to-Porlock Weir starter stage
- One-tap “start where the previous day ended” planning
- Walking-stage start and end selection from the saved Locations list
- One Plan **Add** menu for stages, saved-location points of interest and break days
- Offline-persisted points of interest positioned inside their walking stage, with distance to the next stop on Track
- Custom named locations with coordinate-to-path matching on the Locations screen
- Editable saved-location list with coordinate-to-GPX matching
- Protection against deleting locations that are still used by planned stages
- Dedicated Locations screen for place editing, OS Maps links, GPS simulation and advanced GPX tools
- Elevation profile for each selected day
- Elevation profile positioned first beneath the Track screen top bar, titled with the selected start and end points and labelled with its day and date
- Automatic phone-landscape profile mode that fills the available screen and restores the normal interface in portrait
- Live GPS position marker on the selected day's elevation profile
- Interactive coloured POI markers on the profile, with a single name label revealed by hover, keyboard focus or tap
- High-accuracy iPhone browser location via `watchPosition`
- GPS simulation about 3 km beyond The Lizard for testing without sharing device location
- Optional live GPS check on the Locations screen showing the phone's latitude, longitude and reported accuracy
- Separate Track panels for day distance, day ascent, the next point of interest and the total walk
- Elapsed and remaining daily distance, plus percentage of the day's ascent left
- Nearest-point matching and progress for the selected day and total planned sections
- Remaining ascent against total ascent for the selected day and the whole plan
- Start and end location links that open their exact coordinates in OS Maps with Leisure mapping at zoom level 13
- Previous/next day controls and automatic selection of today's dated walk
- One itinerary start date with automatically calculated stage dates
- Touch-friendly drag-and-drop stage reordering with automatic renumbering and rescheduling
- Inline confirmation before deleting a walking stage or saved location
- Optional break days between stages that shift every later date
- Save and change notices that dismiss automatically after four seconds
- Device-local persistence in IndexedDB (Dexie)
- Confirmed GPX import, including elevation values, with impact counts and automatic rematching of saved locations and stages
- Installable PWA and service worker
- Complete versioned app-shell caching before the app reports that it is ready offline
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

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for installation, planning, GPS, offline and GPX-import instructions.

## Offline behaviour

The bundled route is compiled into the app, so startup never waits for a route download. On the first successful visit, the app shell is also cached and walking stages, break days and points of interest are stored in IndexedDB. Imported GPX routes are also retained in IndexedDB on that device. Wait until the header says **Offline ready** before closing the first session or testing an offline relaunch.

The automated offline regression suite runs the service worker inside a simulated browser cache. It verifies complete first-time preparation, an iPhone Home Screen-style relaunch with the network disabled, cached navigation and scripts, recovery when connectivity returns, and rejection of incomplete updates before they can replace a working cache. It runs as part of `npm test`.

## Trail data

The bundled route is generated from the supplied `uploads-2026-04-South_West_Coast_Path_Elev.gpx`. It contains the complete main South West Coast Path from Minehead to South Haven Point: Parts 1–11, 38,409 route points, 10 deliberate track breaks and approximately 1,025.5 km with the supplied elevation values. The source repeats every coordinate three times and contains a second copy of its tracks; those duplicates are removed. Named loop and spur tracks are excluded from the single linear progress axis so they cannot inflate or reverse distance.

The 53 default planning locations come from `swcp_itinerary_stops_with_coords.csv`. Each CSV coordinate is projected to the nearest position on the GPX route, then the locations are sorted by matched route distance. Most are close to the line; the supplied River Yealm coordinate is about 8 km away and consequently matches just after Wembury. The matched coordinates are stored in the bundled route. Users can add, edit and remove saved locations on the dedicated **Locations** screen; those changes are stored locally in IndexedDB.

The loader is isolated in `app/lib/route.ts`. A GPX can be imported from the expandable **Route data & GPX** area on the **Locations** screen. To regenerate the bundled route and default locations from the two supplied source files:

```bash
npm run route:data -- path/to/full-route.gpx path/to/swcp_itinerary_stops_with_coords.csv app/data/swcp-route.json
```

This full-route build command is the single supported route-generation path. The earlier segment extractor and illustrative OpenStreetMap generator have been removed.

Before an import is saved, the app reports how many current locations and stages can be rematched within five kilometres of the new route. Cancelling leaves the device unchanged. Confirming stores the new route and rematched plan together while retaining the itinerary start date. Items outside the tolerance are removed. If no stage can be preserved, the app creates one default stage across the imported route. **Restore bundled full South West Coast Path route** uses the same confirmation and rematching safeguards while also restoring the 53 default planning locations.

Cloud sync is intentionally not included. IndexedDB remains the source of truth for this version, leaving accounts and shared sync as a later extension.

## Deploy to Netlify

The application is a static Vite site. `npm run build` creates the complete deployable site in `dist`; it does not require a server runtime, Cloudflare Worker or environment variables. The checked-in `netlify.toml` sets the build command, confirms the publish directory is `dist`, supplies the single-page-app fallback and prevents stale service-worker responses.

Push the repository to GitHub, then in Netlify choose **Add new site → Import an existing project** and select the repository. Netlify will read the build settings automatically. After the first deployment, open the Netlify URL on the iPhone, wait for **Offline ready**, and add that URL to the Home Screen.

IndexedDB is tied to the website address. A plan saved under the previous hosted address will not automatically appear at the new Netlify address, so the plan must currently be recreated there.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the feature behaviour, data flow, offline design, storage model and test coverage.

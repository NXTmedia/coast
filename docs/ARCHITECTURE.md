# Coastline architecture

## Product behaviour

Coastline is a mobile-first, offline-first planner and progress tracker for walks on the South West Coast Path. A user creates ordered walking stages, selects start and end positions along a master route, assigns one itinerary start date and custom location names, and can then view distance and elevation for each stage.

On startup, the app selects the walking day dated today. If no day matches today's local date, it selects the first planned day. The Track screen leads with the selected day's elevation profile immediately below the top bar. The profile title is the walk's start and end locations, with the day number and date above it. A compact selector inside the elevation card provides previous/next itinerary controls without repeating the route title or date. Highest elevation sits beside ascent and descent in the same header. POIs whose route distance lies inside the selected stage are projected onto the profile elevation and rendered as distinct purple SVG markers. Hover/focus shows a temporary name-only label; tap/keyboard activation pins or unpins it. While a POI is active the standard elevation tooltip is suppressed, preventing overlapping pop-ups.

Track progress is split into focused mobile panels. Day distance and Day ascent use the same information hierarchy and typography: elapsed value, completion percentage, progress bar, remaining value and day total. A point-of-interest panel resolves the next planned saved Location ahead of the live matched route distance (or the selected stage start before GPS is active). A separate Total walk panel shows distance and ascent across the planned sections, plus trail-match accuracy only while GPS is active. Ascent is integrated over positive elevation change in each planned GPX section; when the matched GPS point falls partway up a climb, only the completed fraction is counted as elapsed. A final compact action row retains the useful start/end OS Maps links and Edit action without repeating distance or elevation statistics.

The Locations screen also provides a deliberately separate real-GPS check. Enabling `Track GPS` reveals the raw latitude, longitude and browser-reported accuracy received after the user taps the top-bar location button. Enabling this check disables simulation so simulated coordinates cannot be mistaken for a real device reading; the panel shows acquisition and permission-error states beside the check. Switching the top-bar button off clears the active reading.

The Plan screen owns one itinerary start date and one **Add** menu. The menu creates a walking stage, a point of interest selected from saved Locations, or a break day at an eligible position. This replaces the former coffee-cup action on each stage. Every walking stage consumes one calendar day and its date is derived from its current order. Stages can be reordered with pointer, touch or keyboard drag-and-drop; the app immediately renumbers them and recalculates every date. A break appears as a distinct rest-day row and adds one day to every later stage. The point-of-interest selector includes only Locations inside at least one planned GPX section. Each point is assigned to the first itinerary stage whose distance range contains it, then displayed directly beneath that stage in route-distance order with its distance from the day's start. Editing or deleting stages transactionally removes POIs that are no longer contained by the itinerary, and startup also repairs older orphaned records. Track and Plan therefore always use the same planned POI set. The stage editor contains only start and end selectors populated from the saved Locations list, plus the previous-end shortcut and planned distance. Dates, coordinate matching and naming are deliberately absent from this editor so each concern has one source of truth.

Stage and location delete buttons open compact confirmations directly beneath the affected row. Cancel closes the prompt without changing data; Delete performs the existing IndexedDB update. Location constraints are checked after confirmation, so a protected location remains in place and explains which stages must change.

On the Track screen, a phone-sized landscape viewport (landscape orientation with no more than 500 CSS pixels of height) activates profile-only mode. The web-app manifest permits any orientation so the installed PWA can enter this mode. The top bar, day picker, progress information, summary and bottom navigation are hidden while the elevation card fills the available dynamic viewport with iPhone safe-area padding. Rotating back to portrait restores the normal layout without changing application state. Larger landscape devices retain the standard interface.

The root viewport uses the device width at a fixed scale of one and disables user scaling. This prevents accidental pinch-zooming in Safari and in the installed iPhone app while preserving the portrait and landscape layouts.

## Application structure

- `index.html` supplies the static document, mobile/PWA metadata and React mount point.
- `src/main.tsx` mounts the client-only React application.
- `app/components/CoastPathApp.tsx` owns the main React interface and coordinates loading, editing, GPS, simulation and navigation.
- `app/lib/db.ts` defines IndexedDB storage and loads the bundled route without requiring a network request.
- `app/lib/days.ts` keeps itinerary order contiguous after additions, deletions and drag-and-drop moves while retaining break positions.
- `app/lib/planning.ts` contains planned-distance, progress, point-of-interest resolution and automatic stage/break-date rules.
- `app/lib/route.ts` contains route slicing, elevation totals, GPX import, coordinate matching, route migration, simulation and OS Maps link generation.
- `scripts/build-full-route.mjs` reproducibly builds the bundled full-path route and snaps the supplied CSV locations to it.
- `public/sw.js` caches the generated application shell for offline startup.
- `netlify.toml` defines the static build, publish directory, SPA fallback and service-worker cache headers.
- `tests/` contains automated tests for the important planning, route, GPS, persistence and PWA behaviours.

## Route and elevation data

The bundled route is stored in `app/data/swcp-route.json` and compiled into the application at build time. It is generated from the user-supplied whole-path elevation GPX. The linear route keeps the first copy of main-path Parts 1–11, from Minehead to South Haven Point. Named loops and spurs are deliberately excluded because inserting them into one distance axis would inflate the total and make progress run backwards. The source file contains all tracks twice and repeats each coordinate three times; generation keeps the first main-path copy and removes exact consecutive duplicates.

The full-route GPX/CSV builder is the only maintained route-generation script. The segment extractor, superseded illustrative OpenStreetMap generator and its conversion dependency have been removed so the repository has one authoritative data path.

The resulting route contains 38,409 points, approximately 1,025.5 km of path, 10 deliberate boundaries between its 11 parts and the supplied elevation values. Boundaries remain as `null` breaks so route matching does not invent connecting lines. Importing another GPX from the Locations screen's advanced route-data area replaces both geometry and elevation locally.

The 53 default planning locations come from the supplied itinerary CSV. Its `No`, `Stop`, `Latitude` and `Longitude` columns are validated, each coordinate is projected to the closest position on the GPX line, and the results are sorted by route distance. This makes the route itself authoritative for location order. The largest offset is River Yealm at approximately 8 km from the main line; its snapped position sorts after Wembury. The generated JSON contains the complete matched list, from Minehead at 0 km to South Haven Point at approximately 1,025.2 km.

The bottom navigation contains Track, Plan and Locations. Plan owns walking-day scheduling, break placement and the selection of saved Locations as points of interest. Locations edits the active route's checkpoint list and also contains GPS simulation, the separate real-GPS coordinate check, and an expandable advanced section for GPX import, bundled-route restoration and route facts. New or edited place coordinates are projected to the nearest point on the active GPX route before being saved. At least two locations are retained so a walking day can always have a start and end. A location referenced by any planned stage or point of interest cannot be deleted until those plan items are changed, preventing names and route boundaries from becoming inconsistent.

## Location pipeline

Real location readings come from `navigator.geolocation.watchPosition()` with high accuracy requested. Simulation creates an iPhone-shaped reading approximately 3 km after The Lizard, including latitude, longitude, accuracy, altitude, heading and speed. Both sources feed the same pipeline:

1. Receive a GPS coordinate.
2. Find the nearest projected point on the route line.
3. Calculate metres between the reading and the trail (the Trail match value).
4. Convert the matched point to distance along the master route.
5. Calculate progress within the selected day and across all planned sections.
6. Place a live marker at the corresponding distance and elevation on the selected day's profile.

The live chart marker appears only when the matched position falls within the selected day's start and end boundaries. Enabling simulation automatically selects a planned day containing the simulated position when one exists.

## Endpoint and location links

Track-screen endpoint links use the selected saved locations' matched route coordinates. The Locations list links use the same stored matched coordinates. Every link opens OS Maps with `zoom=13.0000`, `style=Leisure` and `type=2d`. The simplified stage editor contains no coordinate fields or external-map links; coordinates and names are managed only on the Locations screen.

## Persistence and offline operation

Dexie stores the active route (including its editable saved locations), walking stages, points of interest, the itinerary start date and other settings in the browser's IndexedDB database named `coastline-swcp`. Walking stages use stable IDs, a numeric order and an optional break-after marker. Points of interest use stable IDs and a saved-location name; their coordinates and route distance are resolved from the active route, so location data is not duplicated. The database's version 2 migration adds this collection without replacing existing plans. Order and dates are repaired on every load and after changes. Missing or duplicate POI references are cleaned up on load. When any earlier bundled route is detected, compatible walking stages and existing locations are rematched by coordinate. The 53 new CSV locations are merged by case-insensitive name so distinct custom locations remain available. A new device gets one Minehead-to-Porlock Weir starter stage; an existing compatible plan is preserved. The repaired list is written back as a full replacement so obsolete records cannot reappear later.

Before an imported GPX replaces the active route, the app parses its line geometry and elevation, calculates cumulative distance, then determines how many saved locations and planned stages can be rematched within five kilometres. Those counts and any removals are presented for confirmation. Cancelling performs no writes. On confirmation, the new route and all successfully rematched stages are committed in one IndexedDB transaction; the itinerary start-date setting is retained. New GPX endpoints are added only when no preserved location already represents them. If no existing stage survives, normal loading creates one stage between the first and last available locations. Restoring the bundled route follows the same confirmed, transactional rematching flow and merges the 53 bundled locations with compatible current locations.

The supplied route is embedded in the generated JavaScript, so it never requires a separate startup request. The service worker fetches the static application page, discovers its same-origin JavaScript and stylesheet references, and caches those assets alongside the manifest. It validates the expected JavaScript, stylesheet and manifest content types so Netlify's HTML fallback cannot be mistaken for a missing application asset. It writes a versioned readiness marker only after the complete shell is stored; an incomplete new version is not allowed to replace the previous working cache. On iOS, an already-controlled offline launch is recognised immediately, registration waits are bounded, and the app retries preparation when connectivity returns. Planning, elevation, GPS matching and simulation do not require a network connection after preparation. Opening OS Maps and importing a remotely stored GPX may require connectivity depending on the device and file location.

## Build and hosting

The application is a client-only React 19 app built by Vite into static files in `dist`. Netlify serves those files directly. Its configuration rewrites unknown navigation requests to `index.html`, while keeping the service worker and manifest revalidating so updates are discovered promptly. No server-side rendering, Cloudflare Worker, runtime database or hosting-specific environment variable is required.

## Tests

Run `npm test` for the automated suite and `npm run build` for the production compilation check. Tests cover:

- offline assets and full-route bundling, including GPX deduplication and CSV-derived locations;
- complete service-worker preparation and transitive asset caching;
- offline relaunch with cached navigation and application scripts;
- failed-update protection and recovery when connectivity returns;
- day renumbering;
- planned distance and progress across gaps;
- custom location names and previous-day carry-over;
- automatic date selection;
- coordinate-to-route matching;
- elevation slicing, ascent and descent;
- GPS simulation;
- live GPS coordinate display and acquisition guidance;
- confirmed GPX replacement and plan rematching;
- protection against deleting locations referenced by stages;
- confirmed bundled-route restoration with plan rematching;
- landscape orientation support in the installed manifest;
- terminal GPS permission-error cleanup;
- OS Maps coordinate links with fixed Leisure, 2D and zoom settings;
- presence of the main requested interface capabilities.
- static Vite entry points and Netlify deployment configuration.

## Current boundaries

- Data is device-local; there is no account or cloud sync.
- Clearing Safari website data, changing browser profiles or using another device does not carry the saved plan across; there is currently no plan export or backup.
- Supplied GPX elevation is more useful than the former illustrative profile but remains subject to the source file's elevation accuracy and sampling noise.
- GPS tracking in an iPhone web app depends on Safari permission and iOS background-execution limits.
- OS Maps links are external and are not available offline unless the device already has suitable offline map data.
- Browser data is origin-specific. Moving from another hosted address to a Netlify address does not transfer its IndexedDB plan.

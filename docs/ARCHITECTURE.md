# Coastline architecture

## Product behaviour

Coastline is a mobile-first, offline-first planner and progress tracker for walks on the South West Coast Path. A user creates ordered walking days, selects start and end positions along a master route, optionally assigns dates and custom location names, and can then view distance and elevation for each day.

On startup, the app selects the walking day dated today. If no day matches today's local date, it selects the first planned day. The Track screen also provides previous and next controls for moving through the itinerary.

## Application structure

- `app/components/CoastPathApp.tsx` owns the main React interface and coordinates loading, editing, GPS, simulation and navigation.
- `app/lib/db.ts` defines IndexedDB storage and loads the bundled route without requiring a network request.
- `app/lib/days.ts` keeps itinerary order contiguous after additions and deletions.
- `app/lib/planning.ts` contains planned-distance, progress, naming and date-selection rules.
- `app/lib/route.ts` contains route slicing, elevation totals, GPX import, coordinate matching, route migration, simulation and Google Maps link generation.
- `scripts/extract-gpx-segment.mjs` reproducibly extracts and cleans the bundled Penzance-to-Falmouth GPX section.
- `public/sw.js` caches the application shell and bundled route for offline startup.
- `tests/` contains automated tests for the important planning, route, GPS, persistence and PWA behaviours.

## Route and elevation data

The bundled route is stored in `public/data/swcp-route.json` and compiled into the application at build time. It is extracted from the user-supplied whole-path elevation GPX. Only Penzance to Falmouth is retained. The source file contains the main tracks twice and repeats each coordinate three times; the extraction step keeps the first copy and removes exact consecutive duplicates.

The resulting route contains 4,508 points, approximately 100.1 km of path and the supplied elevation values. A track boundary near Helford remains a deliberate break so route matching does not invent a line across the gap. Importing another GPX on the Route screen replaces both geometry and elevation locally.

The six default planning locations were geocoded with OpenStreetMap/Nominatim and snapped to the nearest supplied GPX point:

| Location | Matched latitude | Matched longitude | Distance along route |
|---|---:|---:|---:|
| Penzance | 50.119316 | -5.533253 | 0.0 km |
| Porthleven | 50.085023 | -5.316053 | 22.6 km |
| Lizard Point | 49.959480 | -5.206519 | 45.2 km |
| Coverack | 50.023079 | -5.096928 | 62.3 km |
| Helford | 50.093298 | -5.135753 | 83.6 km |
| Falmouth | 50.155225 | -5.068876 | 100.1 km |

The Plan screen edits the active route's checkpoint list. New or edited place coordinates are projected to the nearest GPX point before being saved. At least two locations are retained so a walking day can always have a start and end.

## Location pipeline

Real location readings come from `navigator.geolocation.watchPosition()` with high accuracy requested. Simulation creates an iPhone-shaped reading approximately 3 km after Lizard Point, including latitude, longitude, accuracy, altitude, heading and speed. Both sources feed the same pipeline:

1. Receive a GPS coordinate.
2. Find the nearest projected point on the route line.
3. Calculate metres between the reading and the trail (the Trail match value).
4. Convert the matched point to distance along the master route.
5. Calculate progress within the selected day and across all planned sections.
6. Place a live marker at the corresponding distance and elevation on the selected day's profile.

The live chart marker appears only when the matched position falls within the selected day's start and end boundaries. Enabling simulation automatically selects a planned day containing the simulated position when one exists.

## Endpoint links

Track-screen endpoint links use the user's entered coordinate when one exists; otherwise they interpolate the point at the stored route distance. Edit-screen verification links deliberately use the nearest matched point on the route, allowing the user to verify the actual boundary used for distance and elevation calculations.

## Persistence and offline operation

Dexie stores the active route (including its editable saved locations), walking days and settings in the browser's IndexedDB database named `coastline-swcp`. Walking days use stable IDs and a numeric order that is repaired on every load and after changes. When the old bundled full-path route is detected, compatible Penzance-to-Falmouth days are rematched by their endpoint coordinates; the former Minehead-to-Combe-Martin starter days are removed and replaced by the new segment default when necessary. The repaired list is written back as a full replacement so obsolete records cannot reappear later.

The service worker caches the application shell, manifest and bundled route. Planning, elevation, GPS matching and simulation do not require a network connection after preparation. Opening Google Maps and importing a remotely stored GPX may require connectivity depending on the device and file location.

## Tests

Run `npm test` for the automated suite and `npm run build` for the production compilation check. Tests cover:

- offline assets and route bundling;
- day renumbering;
- planned distance and progress across gaps;
- custom location names and previous-day carry-over;
- automatic date selection;
- coordinate-to-route matching;
- elevation slicing, ascent and descent;
- GPS simulation;
- Google Maps coordinate links;
- presence of the main requested interface capabilities.

## Current boundaries

- Data is device-local; there is no account or cloud sync.
- Supplied GPX elevation is more useful than the former illustrative profile but remains subject to the source file's elevation accuracy and sampling noise.
- GPS tracking in an iPhone web app depends on Safari permission and iOS background-execution limits.
- Google Maps links are external and are not available offline unless the device already has suitable offline map data.

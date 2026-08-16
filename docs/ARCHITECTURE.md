# Coastline architecture

## Product behaviour

Coastline is a mobile-first, offline-first planner and progress tracker for walks on the South West Coast Path. A user creates ordered walking stages, selects start and end positions along a master route, assigns one itinerary start date and custom location names, and can then view distance and elevation for each stage.

On startup, the app selects the walking day dated today. If no day matches today's local date, it selects the first planned day. The Track screen leads with the selected day's elevation profile immediately below the top bar. The profile title is the walk's start and end locations, with the day number and date above it. A compact selector inside the elevation card provides previous/next itinerary controls without repeating the route title or date. Highest elevation sits beside ascent and descent in the same header.

The Track progress card combines daily progress, total-plan progress and—only while GPS is active—trail-match accuracy. The former repeated Today metric and inactive trail-match card are omitted. A final compact action row retains the useful start/end OS Maps links and Edit action without repeating distance or elevation statistics.

The Locations screen also provides a deliberately separate real-GPS check. Enabling `Track GPS` reveals the raw latitude, longitude and browser-reported accuracy received after the user taps the top-bar location button. Enabling this check disables simulation so simulated coordinates cannot be mistaken for a real device reading; permission failures are shown beside the check.

The Plan screen owns one itinerary start date. Every walking stage consumes one calendar day and its date is derived from its current order. Stages can be reordered with pointer, touch or keyboard drag-and-drop; the app immediately renumbers them and recalculates every date. A break can be inserted after any non-final stage. It appears as a distinct rest-day row and adds one day to every later stage. The stage editor contains only start and end selectors populated from the saved Locations list, plus the previous-end shortcut and planned distance. Dates, coordinate matching and naming are deliberately absent from this editor so each concern has one source of truth.

On the Track screen, a phone-sized landscape viewport (landscape orientation with no more than 500 CSS pixels of height) activates profile-only mode. The top bar, day picker, progress information, summary and bottom navigation are hidden while the elevation card fills the available dynamic viewport with iPhone safe-area padding. Rotating back to portrait restores the normal layout without changing application state. Larger landscape devices retain the standard interface.

## Application structure

- `app/components/CoastPathApp.tsx` owns the main React interface and coordinates loading, editing, GPS, simulation and navigation.
- `app/lib/db.ts` defines IndexedDB storage and loads the bundled route without requiring a network request.
- `app/lib/days.ts` keeps itinerary order contiguous after additions, deletions and drag-and-drop moves while retaining break positions.
- `app/lib/planning.ts` contains planned-distance, progress, naming and automatic stage/break-date rules.
- `app/lib/route.ts` contains route slicing, elevation totals, GPX import, coordinate matching, route migration, simulation and OS Maps link generation.
- `scripts/extract-gpx-segment.mjs` reproducibly extracts and cleans the bundled Mousehole-to-Falmouth GPX section.
- `public/sw.js` caches the application shell and bundled route for offline startup.
- `tests/` contains automated tests for the important planning, route, GPS, persistence and PWA behaviours.

## Route and elevation data

The bundled route is stored in `public/data/swcp-route.json` and compiled into the application at build time. It is extracted from the user-supplied whole-path elevation GPX. Only Mousehole to Falmouth is retained. The source file contains the main tracks twice and repeats each coordinate three times; the extraction step keeps the first copy and removes exact consecutive duplicates.

The resulting route contains 4,685 points, approximately 105.5 km of path and the supplied elevation values. The added Mousehole-to-Penzance section is approximately 5.5 km. A track boundary near Helford remains a deliberate break so route matching does not invent a line across the gap. Importing another GPX from the Locations screen's advanced route-data area replaces both geometry and elevation locally.

The seven default planning locations were geocoded with OpenStreetMap/Nominatim and snapped to the nearest supplied GPX point:

| Location | Matched latitude | Matched longitude | Distance along route |
|---|---:|---:|---:|
| Mousehole | 50.083671 | -5.538764 | 0.0 km |
| Penzance | 50.119316 | -5.533253 | 5.5 km |
| Porthleven | 50.085023 | -5.316053 | 28.1 km |
| Lizard Point | 49.959480 | -5.206519 | 50.7 km |
| Coverack | 50.023079 | -5.096928 | 67.8 km |
| Helford | 50.093298 | -5.135753 | 89.1 km |
| Falmouth | 50.155225 | -5.068876 | 105.5 km |

The bottom navigation contains Track, Plan and Locations. Plan is limited to walking-day scheduling. Locations edits the active route's checkpoint list and also contains GPS simulation plus an expandable advanced section for GPX import, bundled-route restoration and route facts. New or edited place coordinates are projected to the nearest GPX point before being saved. At least two locations are retained so a walking day can always have a start and end.

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

Dexie stores the active route (including its editable saved locations), walking stages, the itinerary start date and other settings in the browser's IndexedDB database named `coastline-swcp`. Walking stages use stable IDs, a numeric order and an optional break-after marker. Order and dates are repaired on every load and after changes. When an older bundled route is detected, compatible walking stages are rematched by their endpoint coordinates. Upgrading from the Penzance-to-Falmouth bundle also rematches custom saved locations and inserts Mousehole, rather than discarding device-local planning changes. The former Minehead-to-Combe-Martin starter days are removed and replaced by the new segment default when necessary. The repaired list is written back as a full replacement so obsolete records cannot reappear later.

Before an imported GPX replaces the active route, the app calculates how many saved locations and planned stages can be rematched within five kilometres and presents those counts for confirmation. Cancelling performs no writes. On confirmation, the new route and all successfully rematched stages are committed in one IndexedDB transaction; the itinerary start-date setting is retained. New GPX endpoints are added only when no preserved location already represents them.

The service worker fetches the application page, discovers its same-origin JavaScript and stylesheet references, and caches those assets alongside the manifest and bundled route. It writes a versioned readiness marker only after the complete shell is stored; an incomplete new version is not allowed to replace the previous working cache. On iOS, an already-controlled offline launch is recognised immediately, registration waits are bounded, and the app retries preparation when connectivity returns. Planning, elevation, GPS matching and simulation do not require a network connection after preparation. Opening OS Maps and importing a remotely stored GPX may require connectivity depending on the device and file location.

## Tests

Run `npm test` for the automated suite and `npm run build` for the production compilation check. Tests cover:

- offline assets and route bundling;
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
- OS Maps coordinate links with fixed Leisure, 2D and zoom settings;
- presence of the main requested interface capabilities.

## Current boundaries

- Data is device-local; there is no account or cloud sync.
- Supplied GPX elevation is more useful than the former illustrative profile but remains subject to the source file's elevation accuracy and sampling noise.
- GPS tracking in an iPhone web app depends on Safari permission and iOS background-execution limits.
- OS Maps links are external and are not available offline unless the device already has suitable offline map data.

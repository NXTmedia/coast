# Coastline user guide

## Install and prepare for offline use

1. Open the hosted app in Safari on the iPhone while connected to the internet.
2. Wait for **Offline ready** in the header.
3. Use Safari's **Share → Add to Home Screen** action.
4. Open the installed app once more while online and wait for **Offline ready** before relying on it without a connection.

The interface, bundled Mousehole-to-Falmouth route, elevation profile and saved plan then work without mobile data. OS Maps links remain external and may need connectivity or map data already available in the OS Maps app.

## Plan the walk

The **Plan** screen has one walk start date. Each stage occupies one walking day. Later dates are calculated automatically from the stage order.

- Add or edit a stage by selecting its start and end from the saved Locations list.
- Use **Start where the previous day ended** to join consecutive stages.
- Drag stages to reorder them; numbering and dates update automatically.
- Add a break after a stage with its break-day button. Every later date moves forward by one day.
- Remove a break to close the date gap again.

Stage names and coordinates are not edited here. Manage them on **Locations**.

## Manage locations

The **Locations** screen contains the named points available to the stage editor. Add a name, latitude and longitude; Coastline stores the closest projected point on the active GPX route. Locations are sorted by distance along the route.

The external-link button beside a location opens its matched coordinate in OS Maps using Leisure style, 2D view and zoom level 13. At least two saved locations must remain.

## Track progress with real GPS

Tap the location button at the top right and allow location access when Safari asks. Coastline requests high accuracy, matches the reading to the nearest point on the route and updates:

- the marker on the selected day's elevation profile;
- progress through the selected stage;
- progress across all planned sections;
- distance from the trail and the phone's reported accuracy.

The profile marker appears only when the matched position lies inside the selected stage. Tap the top-right location button again to stop the active reading.

To inspect location services directly, open **Locations**, enable **Track GPS**, then tap the top-right location button. The panel shows acquisition status, latitude, longitude, accuracy or a permission error. Enabling this check turns off simulated GPS.

## Use simulated GPS

On **Locations**, enable **Simulate GPS** to create an iPhone-like reading approximately 3 km after Lizard Point. It follows the same route-matching and progress pipeline as a real reading. If that point belongs to a planned stage, the app selects it automatically. Simulation and the real-GPS coordinate check are kept separate.

## Import a GPX route

Open **Locations → Route data & GPX → Choose GPX file**. Coastline accepts GPX tracks or routes, reads their elevation when present and calculates distance along the imported geometry.

Before changing the device, the confirmation shows:

- how many saved locations can be rematched within 5 km of the new route;
- how many planned stages can be rematched;
- how many items would be removed.

Cancel to leave all local data unchanged. Confirm to save the imported route and preserved plan together. The itinerary start date remains unchanged. If no stage can be preserved, one default stage is created across the imported route.

**Restore bundled Mousehole–Falmouth route** is a reset action: it restores the supplied route and locations, clears the current stages and creates the default Mousehole-to-Falmouth stage.

## Device-local data and limitations

Routes, locations, stages and settings are stored in IndexedDB on the current device and browser. There is no account, cloud sync, plan export or cross-device backup. Clearing Safari website data can remove the saved plan.

An iPhone web app can receive location updates while it is active, but iOS may suspend browser activity in the background or when the screen is locked. Keep the app open while using live progress.

The current hosted Sites address requires an authorised sign-in. A genuinely public deployment needs a public hosting target and a compatible build configuration.

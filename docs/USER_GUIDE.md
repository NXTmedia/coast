# Coastline user guide

## Install and prepare for offline use

1. Open the hosted app in Safari on the iPhone while connected to the internet.
2. Wait for **Offline ready** in the header.
3. Use Safari's **Share → Add to Home Screen** action.
4. Open the installed app once more while online and wait for **Offline ready** before relying on it without a connection.

The interface, complete bundled Minehead-to-South Haven Point route, elevation profile and saved plan then work without mobile data. OS Maps links remain external and may need connectivity or map data already available in the OS Maps app.

## Plan the walk

The **Plan** screen has one walk start date. Each stage occupies one walking day. Later dates are calculated automatically from the stage order. The main **Add** button opens a menu for a stage, point of interest or break day.

- Choose **Add → Stage** to create a stage, then select its start and end from the saved Locations list.
- Use **Start where the previous day ended** to join consecutive stages.
- Drag stages to reorder them; numbering and dates update automatically.
- Choose **Add → Break day**, then select the stage after which to take a day off. Every later date moves forward by one day. The former coffee-cup button on every stage has been removed.
- Remove a break with the close button on its break-day row to close the date gap again.
- Choose **Add → Point of interest**, then choose a saved Location inside one of the planned stages. The point is automatically placed beneath the stage containing its GPX distance, where it shows its distance from that day's start. Multiple points follow route order and can be removed from their itinerary rows. Editing or deleting stages automatically removes a point of interest that is no longer contained by the plan.
- Tap a stage's delete icon, then use the inline **Delete stage?** confirmation. **Cancel** leaves it unchanged.

Stage names and coordinates are not edited here. Manage them on **Locations**.

## Manage locations

The **Locations** screen contains the named points available to the stage editor and point-of-interest selector. Add a name, latitude and longitude; Coastline stores the closest projected point on the active GPX route. Locations are sorted by distance along the route. A location used by a planned stage or point of interest cannot be deleted until that plan item is changed or removed. Renaming a location also updates its planned point of interest.

The external-link button beside a location opens its matched coordinate in OS Maps using Leisure style, 2D view and zoom level 13. At least two saved locations must remain.

Deleting a saved location also requires the inline **Delete location?** confirmation. A location used by a planned stage remains protected even after confirmation; change those stages first.

## Track progress with real GPS

Tap the location button at the top right and allow location access when Safari asks. Coastline requests high accuracy, matches the reading to the nearest point on the route and updates:

- the marker on the selected day's elevation profile;
- elapsed and remaining distance through the selected stage;
- the amount and percentage of ascent left on the selected stage;
- distance to the next planned point of interest ahead;
- distance and ascent across all planned sections in a separate **Total walk** panel;
- distance from the trail and the phone's reported accuracy.

The profile marker appears only when the matched position lies inside the selected stage. Tap the top-right location button again to stop the active reading.

Planned points of interest inside the selected stage appear as purple dots on the elevation profile. Hover over a dot with a pointer, focus it with a keyboard, or tap it on the phone to show one label containing only the place name. The normal elevation tooltip is suppressed while that label is active. Tap the same dot again to dismiss the pinned label; tapping another dot switches the label.

To inspect location services directly, open **Locations**, enable **Track GPS**, then tap the top-right location button. The panel shows acquisition status, latitude, longitude, accuracy or a permission error. Enabling this check turns off simulated GPS.

## Use simulated GPS

On **Locations**, enable **Simulate GPS** to create an iPhone-like reading approximately 3 km after The Lizard. It follows the same route-matching and progress pipeline as a real reading. If that point belongs to a planned stage, the app selects it automatically. Simulation and the real-GPS coordinate check are kept separate.

## Import a GPX route

Open **Locations → Route data & GPX → Choose GPX file**. Coastline accepts GPX tracks or routes, reads their elevation when present and calculates distance along the imported geometry.

Before changing the device, the confirmation shows:

- how many saved locations can be rematched within 5 km of the new route;
- how many planned stages can be rematched;
- how many items would be removed.

Cancel to leave all local data unchanged. Confirm to save the imported route and preserved plan together. The itinerary start date remains unchanged. If no stage can be preserved, one default stage is created across the imported route.

**Restore bundled full South West Coast Path route** first reports how many current locations and stages can be rematched. Cancelling changes nothing. Confirming restores the supplied route and 53 default locations, keeps compatible current locations and stages, and retains the itinerary start date.

## Device-local data and limitations

Routes, locations, stages, points of interest and settings are stored in IndexedDB on the current device and browser. There is no account, cloud sync, plan export or cross-device backup. Clearing Safari website data can remove the saved plan.

An iPhone web app can receive location updates while it is active, but iOS may suspend browser activity in the background or when the screen is locked. Keep the app open while using live progress.

When the app is deployed to Netlify it can be opened at the public Netlify address without the previous Sites sign-in. A new website address has its own IndexedDB storage, so plans saved under another address do not automatically transfer to it.

import { useEffect, useMemo, useState } from "react";
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates, SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown, ArrowRight, ArrowUp, CalendarDays, Check, ChevronLeft, ChevronRight, CircleAlert, Coffee,
  CloudOff, Download, ExternalLink, FileUp, Footprints, LocateFixed, MapPin, Mountain,
  GripVertical, Navigation, Pencil, Plus, Route as RouteIcon, Satellite, Trash2, X,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { db, getBundledRoute, loadInitialData, replaceRouteAndDays, savePlanStartDate, saveRouteCheckpoints } from "../lib/db";
import { normalizeDayOrders, reorderWalkingDays } from "../lib/days";
import {
  breakDateAfter, dayDistanceKm, dayIdContainingDistance, dayIdForDate, daysUsingLocation,
  fillWalkingDayDates, localDateKey, nextPointOfInterest, plannedProgressKm, resolvePointsOfInterest,
  totalPlannedDistanceKm, type ResolvedPointOfInterest,
} from "../lib/planning";
import {
  ascentBetween, ascentDescent, importGpx, nearestRoutePosition, osMapsUrl, plannedAscentM, pointsForDay,
  prepareRouteImport, routePointAt, simulatedGpsNearCheckpoint,
} from "../lib/route";
import type { Checkpoint, GpsReading, PlannedPointOfInterest, TrailRoute, WalkingDay } from "../types";

type Tab = "track" | "plan" | "locations";
type EditorState = { mode: "new" | "edit"; day: WalkingDay } | null;
type OfflineState = "preparing" | "ready" | "limited";
type LocationEditorState = { mode: "new" | "edit"; originalName?: string; name: string; lat: string; lng: string } | null;

const formatKm = (value: number, digits = 1) => `${value.toFixed(digits)} km`;
const formatMetres = (value: number) => `${Math.round(value).toLocaleString()} m`;
const formatDate = (value: string) => value
  ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`))
  : "Date not set";

export function CoastPathApp() {
  const [route, setRoute] = useState<TrailRoute | null>(null);
  const [days, setDays] = useState<WalkingDay[]>([]);
  const [pointsOfInterest, setPointsOfInterest] = useState<PlannedPointOfInterest[]>([]);
  const [planStartDate, setPlanStartDate] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<Tab>("track");
  const [loadingError, setLoadingError] = useState("");
  const [gps, setGps] = useState<GpsReading | null>(null);
  const [simulateGps, setSimulateGps] = useState(false);
  const [trackGps, setTrackGps] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [watchId, setWatchId] = useState<number | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [offlineState, setOfflineState] = useState<OfflineState>("preparing");
  const [persistentStorageReady, setPersistentStorageReady] = useState(true);
  const [editor, setEditor] = useState<EditorState>(null);
  const [locationEditor, setLocationEditor] = useState<LocationEditorState>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [poiEditorOpen, setPoiEditorOpen] = useState(false);
  const [poiLocationName, setPoiLocationName] = useState("");
  const [selectedProfilePoiId, setSelectedProfilePoiId] = useState("");
  const [hoveredProfilePoiId, setHoveredProfilePoiId] = useState("");
  const [breakEditorOpen, setBreakEditorOpen] = useState(false);
  const [breakAfterDayId, setBreakAfterDayId] = useState("");
  const [pendingDayDeleteId, setPendingDayDeleteId] = useState<string | null>(null);
  const [pendingLocationDeleteName, setPendingLocationDeleteName] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    loadInitialData()
      .then(({ route: loadedRoute, days: loadedDays, pointsOfInterest: loadedPoints, planStartDate: loadedStartDate, storageReady }) => {
        setRoute(loadedRoute); setDays(loadedDays); setPointsOfInterest(loadedPoints); setPlanStartDate(loadedStartDate); setSelectedId(dayIdForDate(loadedDays, localDateKey()));
        setPersistentStorageReady(storageReady);
      })
      .catch((error) => setLoadingError(error instanceof Error ? error.message : "Unable to load the trail."));
    const isLocalDevelopment = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const refreshOfflineState = () => {
      if (isLocalDevelopment) { setOfflineState("ready"); return; }
      if (!navigator.onLine) {
        setOfflineState(navigator.serviceWorker.controller ? "ready" : "limited");
        return;
      }
      setOfflineState("preparing");
      prepareOfflineApp().then((ready) => setOfflineState(ready ? "ready" : "limited"));
    };
    const handleOnline = () => { setOnline(true); refreshOfflineState(); };
    const handleOffline = () => { setOnline(false); setOfflineState(navigator.serviceWorker.controller ? "ready" : "limited"); };
    const handleInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    const handleControllerChange = () => { if (navigator.onLine) refreshOfflineState(); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstall);
    navigator.serviceWorker?.addEventListener("controllerchange", handleControllerChange);
    if ("serviceWorker" in navigator) {
      if (isLocalDevelopment) {
        // A development service worker can cache stale Vite module URLs after HMR.
        navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => registration.unregister()));
        caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("coastline-")).map((key) => caches.delete(key))));
        queueMicrotask(() => setOfflineState("ready"));
      } else {
        refreshOfflineState();
      }
    } else {
      queueMicrotask(() => setOfflineState("limited"));
    }
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstall);
      navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  useEffect(() => () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); }, [watchId]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const selectedDay = days.find((day) => day.id === selectedId) ?? days[0];
  const selectedIndex = selectedDay ? days.findIndex((day) => day.id === selectedDay.id) : -1;
  const simulationCheckpointName = route?.checkpoints.some((point) => point.name === "The Lizard")
    ? "The Lizard"
    : route?.checkpoints.some((point) => point.name === "Lizard Point") ? "Lizard Point" : "";
  const simulationLocationLabel = simulationCheckpointName ? `after ${simulationCheckpointName}` : "near the route start";
  const matched = useMemo(
    () => route && gps ? nearestRoutePosition(route, gps.longitude, gps.latitude) : null,
    [route, gps],
  );
  const dayPoints = useMemo(
    () => route && selectedDay ? pointsForDay(route, selectedDay.startDistanceKm, selectedDay.endDistanceKm) : [],
    [route, selectedDay],
  );
  const climbing = useMemo(() => ascentDescent(dayPoints), [dayPoints]);
  const highestPoint = dayPoints.length ? Math.max(...dayPoints.map((point) => point.elevationM)) : 0;
  const dayDistance = selectedDay ? dayDistanceKm(selectedDay) : 0;
  const rawDayProgress = matched && selectedDay ? matched.distanceKm - selectedDay.startDistanceKm : 0;
  const dayProgress = Math.max(0, Math.min(dayDistance, rawDayProgress));
  const plannedDistance = totalPlannedDistanceKm(days);
  const planProgress = matched ? plannedProgressKm(days, matched.distanceKm) : 0;
  const dayAscentTotal = useMemo(
    () => route && selectedDay ? ascentBetween(route, selectedDay.startDistanceKm, selectedDay.endDistanceKm) : 0,
    [route, selectedDay],
  );
  const dayAscentRemaining = useMemo(
    () => route && selectedDay
      ? ascentBetween(route, Math.max(selectedDay.startDistanceKm, matched?.distanceKm ?? selectedDay.startDistanceKm), selectedDay.endDistanceKm)
      : 0,
    [route, selectedDay, matched],
  );
  const planAscentTotal = useMemo(() => route ? plannedAscentM(route, days) : 0, [route, days]);
  const planAscentRemaining = useMemo(
    () => route ? plannedAscentM(route, days, matched?.distanceKm) : 0,
    [route, days, matched],
  );
  const dayDistanceRemaining = Math.max(0, dayDistance - dayProgress);
  const dayDistancePercent = Math.round(dayDistance ? dayProgress / dayDistance * 100 : 0);
  const dayAscentCompleted = Math.max(0, dayAscentTotal - dayAscentRemaining);
  const dayAscentPercentLeft = Math.round(dayAscentTotal ? dayAscentRemaining / dayAscentTotal * 100 : 0);
  const planDistanceRemaining = Math.max(0, plannedDistance - planProgress);
  const planDistancePercent = Math.round(plannedDistance ? planProgress / plannedDistance * 100 : 0);
  const planAscentPercentLeft = Math.round(planAscentTotal ? planAscentRemaining / planAscentTotal * 100 : 0);
  const resolvedPointsOfInterest = useMemo(
    () => route ? resolvePointsOfInterest(pointsOfInterest, route.checkpoints) : [],
    [route, pointsOfInterest],
  );
  const nextPoi = useMemo(
    () => route ? nextPointOfInterest(pointsOfInterest, route.checkpoints, matched?.distanceKm ?? selectedDay?.startDistanceKm ?? 0) : null,
    [route, pointsOfInterest, matched, selectedDay],
  );
  const profilePointsOfInterest = useMemo(
    () => route && selectedDay ? resolvedPointsOfInterest
      .filter((point) => point.distanceKm >= selectedDay.startDistanceKm && point.distanceKm <= selectedDay.endDistanceKm)
      .map((point) => ({
        ...point,
        dayKm: point.distanceKm - selectedDay.startDistanceKm,
        elevationM: routePointAt(route, point.distanceKm).elevationM,
      })) : [],
    [route, selectedDay, resolvedPointsOfInterest],
  );
  const activeProfilePoi = profilePointsOfInterest.find((point) => point.id === (hoveredProfilePoiId || selectedProfilePoiId));
  const chartData = dayPoints.map((point) => ({
    ...point,
    dayKm: Number((point.distanceKm - (selectedDay?.startDistanceKm ?? 0)).toFixed(2)),
  }));
  const startLocation = route && selectedDay
    ? selectedDay.startCoordinate ?? routePointAt(route, selectedDay.startDistanceKm)
    : null;
  const endLocation = route && selectedDay
    ? selectedDay.endCoordinate ?? routePointAt(route, selectedDay.endDistanceKm)
    : null;
  const liveProfilePoint = matched && route && selectedDay
    && matched.distanceKm >= selectedDay.startDistanceKm
    && matched.distanceKm <= selectedDay.endDistanceKm
    ? routePointAt(route, matched.distanceKm)
    : null;

  const selectAdjacentDay = (offset: -1 | 1) => {
    const adjacent = days[selectedIndex + offset];
    if (adjacent) setSelectedId(adjacent.id);
  };

  const startGps = () => {
    setGpsError("");
    if (!("geolocation" in navigator)) { setGpsError("Location is not available in this browser."); return; }
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); setWatchId(null); setGps(null); return; }
    if (simulateGps) setGps(null);
    setSimulateGps(false);
    let id = -1;
    id = navigator.geolocation.watchPosition(
      (position) => setGps(position.coords),
      (error) => {
        setGpsError(error.code === 1 ? "Location permission was not granted. Allow location in Safari settings and try again." : error.message);
        if (error.code === 1) {
          if (id >= 0) navigator.geolocation.clearWatch(id);
          setWatchId((current) => current === id ? null : current);
          setGps(null);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    setWatchId(id);
  };

  const toggleGpsSimulation = () => {
    setGpsError("");
    if (simulateGps) {
      setSimulateGps(false);
      setGps(null);
      return;
    }
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    setWatchId(null);
    setTrackGps(false);
    const simulated = route ? simulatedGpsNearCheckpoint(route, simulationCheckpointName || undefined) : null;
    if (!simulated) {
      setGpsError("A simulated location could not be created for this route.");
      return;
    }
    setGps(simulated);
    setSimulateGps(true);
    const simulatedMatch = nearestRoutePosition(route!, simulated.longitude, simulated.latitude);
    const containingDayId = simulatedMatch ? dayIdContainingDistance(days, simulatedMatch.distanceKm) : undefined;
    if (containingDayId) setSelectedId(containingDayId);
  };

  const toggleGpsTracking = () => {
    setGpsError("");
    if (trackGps) {
      setTrackGps(false);
      return;
    }
    if (simulateGps) {
      setSimulateGps(false);
      setGps(null);
    }
    setTrackGps(true);
  };

  const openNewDay = () => {
    if (!route) return;
    const previous = days.at(-1);
    const start = previous
      ? route.checkpoints.find((point) => point.distanceKm >= previous.endDistanceKm - 0.05) ?? route.checkpoints[0]
      : route.checkpoints[0];
    const end = route.checkpoints.find((point) => point.distanceKm > start.distanceKm + 1) ?? route.checkpoints.at(-1)!;
    openDayEditor("new", {
      id: crypto.randomUUID(), order: days.length + 1, date: "",
      startName: start.name, endName: end.name,
      startDistanceKm: start.distanceKm, endDistanceKm: end.distanceKm,
    });
  };

  const openDayEditor = (mode: "new" | "edit", day: WalkingDay) => {
    if (!route) return;
    const closestCheckpoint = (distanceKm: number) => route.checkpoints.reduce((best, point) =>
      Math.abs(point.distanceKm - distanceKm) < Math.abs(best.distanceKm - distanceKm) ? point : best,
    );
    const start = route.checkpoints.find((point) => point.name === day.startName) ?? closestCheckpoint(day.startDistanceKm);
    const end = route.checkpoints.find((point) => point.name === day.endName) ?? closestCheckpoint(day.endDistanceKm);
    setEditor({ mode, day: {
      ...day,
      startName: start.name,
      startDistanceKm: start.distanceKm,
      startCoordinate: undefined,
      endName: end.name,
      endDistanceKm: end.distanceKm,
      endCoordinate: undefined,
    } });
  };

  const saveDay = async () => {
    if (!editor) return;
    if (editor.day.endDistanceKm <= editor.day.startDistanceKm) {
      setNotice("The end point needs to be farther along the trail than the start."); return;
    }
    const savedDay = { ...editor.day, startName: editor.day.startName.trim(), endName: editor.day.endName.trim() };
    if (!savedDay.startName || !savedDay.endName) {
      setNotice("Give both the start and end locations a name."); return;
    }
    const updated = fillWalkingDayDates(normalizeDayOrders([...days.filter((day) => day.id !== savedDay.id), savedDay]), planStartDate);
    await db.days.bulkPut(updated);
    setDays(updated); setSelectedId(savedDay.id); setEditor(null);
    setNotice("Walking stage saved and itinerary dates updated.");
  };

  const deleteDay = async (day: WalkingDay) => {
    const updated = fillWalkingDayDates(normalizeDayOrders(days.filter((candidate) => candidate.id !== day.id)), planStartDate);
    await db.transaction("rw", db.days, async () => {
      await db.days.delete(day.id);
      if (updated.length) await db.days.bulkPut(updated);
    });
    setDays(updated); setSelectedId(updated[0]?.id ?? ""); setPendingDayDeleteId(null); setNotice("Walking stage removed; numbering and dates updated.");
  };

  const changePlanStartDate = async (value: string) => {
    const updated = fillWalkingDayDates(days, value);
    await savePlanStartDate(value);
    if (updated.length) await db.days.bulkPut(updated);
    setPlanStartDate(value);
    setDays(updated);
    setNotice(value ? "Start date saved and the itinerary rescheduled." : "Start date cleared.");
  };

  const setBreakAfter = async (dayId: string, breakAfter: boolean) => {
    const updated = fillWalkingDayDates(days.map((day, index) => ({
      ...day,
      breakAfter: day.id === dayId && index < days.length - 1 ? breakAfter : day.breakAfter,
    })), planStartDate);
    if (updated.length) await db.days.bulkPut(updated);
    setDays(updated);
    setNotice(breakAfter ? "Break day added; later dates moved on by one day." : "Break day removed; later dates recalculated.");
  };

  const openBreakEditor = () => {
    const eligibleDay = days.slice(0, -1).find((day) => !day.breakAfter);
    if (!eligibleDay) {
      setNotice(days.length < 2 ? "Add at least two walking stages before inserting a break day." : "Every available break position is already in use.");
      return;
    }
    setBreakAfterDayId(eligibleDay.id);
    setBreakEditorOpen(true);
  };

  const saveBreakDay = async () => {
    if (!breakAfterDayId) return;
    await setBreakAfter(breakAfterDayId, true);
    setBreakEditorOpen(false);
  };

  const openPointOfInterestEditor = () => {
    if (!route) return;
    const available = route.checkpoints.find((location) => !pointsOfInterest.some((point) => point.locationName === location.name));
    if (!available) {
      setNotice("Every saved location is already a point of interest.");
      return;
    }
    setPoiLocationName(available.name);
    setPoiEditorOpen(true);
  };

  const savePointOfInterest = async () => {
    if (!poiLocationName || pointsOfInterest.some((point) => point.locationName === poiLocationName)) return;
    const point = { id: crypto.randomUUID(), locationName: poiLocationName };
    await db.pointsOfInterest.put(point);
    setPointsOfInterest((current) => [...current, point]);
    setPoiEditorOpen(false);
    setNotice(`${poiLocationName} added as a point of interest.`);
  };

  const removePointOfInterest = async (point: PlannedPointOfInterest) => {
    await db.pointsOfInterest.delete(point.id);
    setPointsOfInterest((current) => current.filter((candidate) => candidate.id !== point.id));
    setNotice(`${point.locationName} removed from the points of interest.`);
  };

  const reorderStages = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const updated = fillWalkingDayDates(reorderWalkingDays(days, String(active.id), String(over.id)), planStartDate);
    await db.days.bulkPut(updated);
    setDays(updated);
    setNotice("Stages reordered; numbering and dates updated.");
  };

  const usePreviousEnd = () => {
    if (!editor || !route || editor.day.order <= 1) return;
    const previous = days.find((day) => day.order === editor.day.order - 1) ?? days.at(-1);
    if (!previous) return;
    const point = route.checkpoints.find((candidate) => candidate.name === previous.endName)
      ?? route.checkpoints.reduce((best, candidate) => Math.abs(candidate.distanceKm - previous.endDistanceKm) < Math.abs(best.distanceKm - previous.endDistanceKm) ? candidate : best);
    setEditor({ ...editor, day: {
      ...editor.day,
      startName: point.name,
      startDistanceKm: point.distanceKm,
      startCoordinate: undefined,
    } });
  };

  const chooseCheckpoint = (field: "start" | "end", name: string) => {
    if (!editor || !route) return;
    const point = route.checkpoints.find((candidate) => candidate.name === name);
    if (!point) return;
    setEditor({
      ...editor,
      day: field === "start"
        ? { ...editor.day, startName: point.name, startDistanceKm: point.distanceKm, startCoordinate: undefined }
        : { ...editor.day, endName: point.name, endDistanceKm: point.distanceKm, endCoordinate: undefined },
    });
  };

  const openLocationEditor = (location?: Checkpoint) => {
    setLocationEditor(location
      ? { mode: "edit", originalName: location.name, name: location.name, lat: location.lat.toFixed(6), lng: location.lng.toFixed(6) }
      : { mode: "new", name: "", lat: "", lng: "" });
  };

  const saveLocation = async () => {
    if (!route || !locationEditor) return;
    const name = locationEditor.name.trim();
    const latText = locationEditor.lat.trim();
    const lngText = locationEditor.lng.trim();
    const lat = Number(latText);
    const lng = Number(lngText);
    if (!name || !latText || !lngText || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setNotice("Enter a location name and valid latitude and longitude."); return;
    }
    const duplicate = route.checkpoints.some((point) => point.name.toLowerCase() === name.toLowerCase() && point.name !== locationEditor.originalName);
    if (duplicate) { setNotice("A saved location already uses that name."); return; }
    const match = nearestRoutePosition(route, lng, lat);
    if (!match) { setNotice("That coordinate could not be matched to this GPX route."); return; }
    const saved: Checkpoint = { name, lat: match.lat, lng: match.lng, distanceKm: match.distanceKm };
    const checkpoints = [...route.checkpoints.filter((point) => point.name !== locationEditor.originalName), saved];
    const updatedRoute = await saveRouteCheckpoints(route, checkpoints);
    setRoute(updatedRoute);
    if (locationEditor.mode === "edit" && locationEditor.originalName) {
      const updatedDays = days.map((day) => ({
        ...day,
        ...(day.startName === locationEditor.originalName ? { startName: name, startDistanceKm: match.distanceKm, startCoordinate: undefined } : {}),
        ...(day.endName === locationEditor.originalName ? { endName: name, endDistanceKm: match.distanceKm, endCoordinate: undefined } : {}),
      }));
      if (updatedDays.length) await db.days.bulkPut(updatedDays);
      setDays(updatedDays);
      const renamedPoints = pointsOfInterest.map((point) => point.locationName === locationEditor.originalName ? { ...point, locationName: name } : point);
      if (renamedPoints.length) await db.pointsOfInterest.bulkPut(renamedPoints);
      setPointsOfInterest(renamedPoints);
    }
    setLocationEditor(null);
    setNotice(`${name} saved at ${match.distanceKm.toFixed(1)} km · matched ${Math.round(match.offRouteM)} m from the entered coordinate.`);
  };

  const deleteLocation = async (location: Checkpoint) => {
    if (!route) return;
    if (route.checkpoints.length <= 2) { setPendingLocationDeleteName(null); setNotice("Keep at least two saved locations for planning a walking day."); return; }
    const affectedDays = daysUsingLocation(days, location.name);
    const affectedPoints = pointsOfInterest.filter((point) => point.locationName === location.name);
    if (affectedDays.length) {
      setPendingLocationDeleteName(null);
      setNotice(`${location.name} is used by ${affectedDays.length} planned ${affectedDays.length === 1 ? "stage" : "stages"}. Change those stages before deleting it.`);
      return;
    }
    if (affectedPoints.length) {
      setPendingLocationDeleteName(null);
      setNotice(`${location.name} is a planned point of interest. Remove it from the Plan screen before deleting it.`);
      return;
    }
    const updatedRoute = await saveRouteCheckpoints(route, route.checkpoints.filter((point) => point.name !== location.name));
    setRoute(updatedRoute);
    setPendingLocationDeleteName(null);
    setNotice(`${location.name} removed from the saved locations list.`);
  };

  const handleImport = async (file: File | undefined) => {
    if (!file || !route) return;
    try {
      const imported = importGpx(await file.text(), file.name);
      const prepared = prepareRouteImport(route, imported, days);
      const unmatchedLocations = route.checkpoints.length - prepared.matchedLocationCount;
      const unmatchedDays = days.length - prepared.days.length;
      const warning = [
        `Import “${file.name}” and replace the current GPX route?`,
        `${prepared.matchedLocationCount} of ${route.checkpoints.length} saved locations and ${prepared.days.length} of ${days.length} planned stages can be matched to the new route.`,
        unmatchedLocations || unmatchedDays
          ? `${unmatchedLocations} locations and ${unmatchedDays} stages are more than 5 km from the new route and will be removed.`
          : "All saved locations and planned stages will be preserved.",
        "Your itinerary start date will be kept. This change applies only to this device.",
      ].join("\n\n");
      if (!window.confirm(warning)) {
        setNotice("GPX import cancelled. Nothing was changed.");
        return;
      }
      await replaceRouteAndDays(prepared.route, prepared.days);
      const seeded = await loadInitialData();
      setRoute(seeded.route); setDays(seeded.days); setPointsOfInterest(seeded.pointsOfInterest); setPlanStartDate(seeded.planStartDate); setSelectedId(dayIdForDate(seeded.days, localDateKey()));
      setNotice(`${imported.name} is ready offline. Preserved ${prepared.matchedLocationCount} locations and ${prepared.days.length} planned stages.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The GPX file could not be imported.");
    }
  };

  const restoreBundled = async () => {
    if (!route) return;
    const bundled = getBundledRoute();
    const prepared = prepareRouteImport(route, bundled, days);
    const unmatchedLocations = route.checkpoints.length - prepared.matchedLocationCount;
    const unmatchedDays = days.length - prepared.days.length;
    const warning = [
      "Restore the bundled full South West Coast Path route?",
      `${prepared.matchedLocationCount} of ${route.checkpoints.length} current locations and ${prepared.days.length} of ${days.length} planned stages can be matched to it.`,
      unmatchedLocations || unmatchedDays
        ? `${unmatchedLocations} locations and ${unmatchedDays} stages are more than 5 km from the bundled route and will be removed.`
        : "All current locations and planned stages will be preserved.",
      `The ${bundled.checkpoints.length} bundled planning locations will also be restored. Your itinerary start date will be kept.`,
    ].join("\n\n");
    if (!window.confirm(warning)) {
      setNotice("Bundled-route restoration cancelled. Nothing was changed.");
      return;
    }
    const checkpointsByName = new Map<string, Checkpoint>();
    for (const point of [...bundled.checkpoints, ...prepared.route.checkpoints]) {
      const key = point.name.toLowerCase();
      if (!checkpointsByName.has(key)) checkpointsByName.set(key, point);
    }
    const restoredRoute = { ...bundled, checkpoints: [...checkpointsByName.values()].sort((a, b) => a.distanceKm - b.distanceKm) };
    await replaceRouteAndDays(restoredRoute, prepared.days);
    const seeded = await loadInitialData();
    setRoute(seeded.route); setDays(seeded.days); setPointsOfInterest(seeded.pointsOfInterest); setPlanStartDate(seeded.planStartDate); setSelectedId(dayIdForDate(seeded.days, localDateKey()));
    setNotice(`The bundled route is restored. Preserved ${prepared.matchedLocationCount} locations and ${prepared.days.length} planned stages.`);
  };

  const installApp = async () => {
    if (!installPrompt) return;
    const prompt = installPrompt as Event & { prompt: () => Promise<void> };
    await prompt.prompt(); setInstallPrompt(null);
  };

  if (loadingError) return <main className="loading-state"><CircleAlert /><h1>Coastline could not start</h1><p>{loadingError}</p></main>;
  if (!route) return <main className="loading-state"><span className="loading-ring" /><h1>Preparing the coast path…</h1><p>Saving the route for offline use.</p></main>;

  return (
    <div className={`app-shell tab-${tab}${tab === "track" && selectedDay ? " landscape-profile-ready" : ""}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setTab("track")} aria-label="Open trail tracker">
          <span className="brand-mark"><Footprints size={21} /></span>
          <span><strong>Coastline</strong><small>South West Coast Path</small></span>
        </button>
        <div className="topbar-actions">
          <span className={`status-pill ${!online ? "offline" : offlineState === "ready" && persistentStorageReady ? "ready" : offlineState}`}>
            {!online ? <CloudOff size={14} /> : offlineState === "ready" && persistentStorageReady ? <Check size={14} /> : <Download size={14} />}
            {!online ? "Working offline" : offlineState === "ready" && persistentStorageReady ? "Offline ready" : offlineState === "preparing" ? "Preparing offline" : "Offline setup incomplete"}
          </span>
          <button className={`header-location-button ${watchId !== null ? "active" : ""}`} onClick={startGps} aria-label={watchId !== null ? "Stop using my location" : "Use my location"}>
            <LocateFixed size={17} /><span>{watchId !== null ? "Stop location" : "Use my location"}</span>
          </button>
          {installPrompt && <button className="icon-button install-button" onClick={installApp}><Download size={17} /><span>Install</span></button>}
        </div>
      </header>

      <main className="main-content">
        {tab === "track" && selectedDay && (
          <>
            <section className="profile-card panel">
              <div className="panel-heading">
                <div className="profile-heading-copy">
                  <p className="eyebrow profile-day-line"><span>Day {selectedDay.order}</span><time dateTime={selectedDay.date || undefined}>{formatDate(selectedDay.date)}</time></p>
                  <h2>{selectedDay.startName} <ArrowRight /> {selectedDay.endName}</h2>
                </div>
                <div className="climb-summary"><span><ArrowUp /> {formatMetres(dayAscentTotal)}</span><span><ArrowDown /> {climbing.descent.toLocaleString()} m</span><span><Mountain /> {highestPoint.toLocaleString()} m</span></div>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 24, right: 18, bottom: 0, left: -16 }}>
                    <defs><linearGradient id="elevationFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e97651" stopOpacity=".44"/><stop offset="100%" stopColor="#e97651" stopOpacity=".05"/></linearGradient></defs>
                    <CartesianGrid stroke="#dbe3df" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="dayKm" type="number" domain={[0, Math.ceil(dayDistance)]} unit=" km" tick={{ fontSize: 11, fill: "#66756f" }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="elevationM" unit=" m" tick={{ fontSize: 11, fill: "#66756f" }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip content={<ElevationTooltip suppress={Boolean(activeProfilePoi)} />} cursor={{ stroke: "#183f35", strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="elevationM" stroke="#dd6744" strokeWidth={2.5} fill="url(#elevationFill)" animationDuration={600} />
                    {profilePointsOfInterest.map((point) => <ReferenceDot
                      key={point.id}
                      x={point.dayKm}
                      y={point.elevationM}
                      shape={(marker) => <ProfilePoiDot
                        cx={marker.cx}
                        cy={marker.cy}
                        name={point.name}
                        active={activeProfilePoi?.id === point.id}
                        onHover={(hovering) => setHoveredProfilePoiId(hovering ? point.id : "")}
                        onToggle={() => {
                          setHoveredProfilePoiId("");
                          setSelectedProfilePoiId((current) => current === point.id ? "" : point.id);
                        }}
                      />}
                    />)}
                    {liveProfilePoint && <ReferenceLine x={liveProfilePoint.distanceKm - selectedDay.startDistanceKm} stroke="#2f83be" strokeWidth={2} strokeDasharray="4 4" label={{ value: "You are here", position: "insideTopRight", fill: "#236994", fontSize: 11 }} />}
                    {liveProfilePoint && <ReferenceDot x={liveProfilePoint.distanceKm - selectedDay.startDistanceKm} y={liveProfilePoint.elevationM} r={6} fill="#2f83be" stroke="#fffefa" strokeWidth={3} />}
                  </AreaChart>
                </ResponsiveContainer>
                {activeProfilePoi && <div className="profile-poi-label" role="status"><span /><strong>{activeProfilePoi.name}</strong></div>}
              </div>
              <div className="profile-day-navigation" aria-label="Choose walking day">
                <button onClick={() => selectAdjacentDay(-1)} disabled={selectedIndex <= 0} aria-label="Previous walking day"><ChevronLeft /></button>
                <select aria-label="Walking day" value={selectedDay.id} onChange={(event) => setSelectedId(event.target.value)}>
                  {days.map((day) => <option key={day.id} value={day.id}>Day {day.order} · {formatDate(day.date)}</option>)}
                </select>
                <button onClick={() => selectAdjacentDay(1)} disabled={selectedIndex < 0 || selectedIndex >= days.length - 1} aria-label="Next walking day"><ChevronRight /></button>
              </div>
            </section>

            <section className="tracking-card distance-progress-card panel">
              <div className="progress-heading"><div><p className="eyebrow"><Footprints size={14} /> Day distance</p><h2>{formatKm(dayProgress)} <small>elapsed</small></h2></div><strong>{dayDistancePercent}%</strong></div>
              <div className="progress-track" aria-label={`${dayDistancePercent}% of this day completed`}><span style={{ width: `${dayDistancePercent}%` }} /></div>
              <div className="progress-pair"><div><span>Remaining</span><strong>{formatKm(dayDistanceRemaining)}</strong></div><div><span>Day total</span><strong>{formatKm(dayDistance)}</strong></div></div>
            </section>

            <section className="tracking-card ascent-progress-card panel">
              <div className="progress-heading"><div><p className="eyebrow"><Mountain size={14} /> Day ascent</p><h2>{formatMetres(dayAscentRemaining)} <small>left</small></h2></div><strong>{dayAscentPercentLeft}% left</strong></div>
              <div className="progress-track ascent-track" aria-label={`${dayAscentPercentLeft}% of this day's ascent left`}><span style={{ width: `${100 - dayAscentPercentLeft}%` }} /></div>
              <div className="progress-pair"><div><span>Climbed</span><strong>{formatMetres(dayAscentCompleted)}</strong></div><div><span>Day total</span><strong>{formatMetres(dayAscentTotal)}</strong></div></div>
            </section>

            <section className="next-poi-card panel">
              <span className="poi-icon"><MapPin /></span>
              <div><p className="eyebrow">Next point of interest</p>{nextPoi ? <><h2>{nextPoi.point.name}</h2><small>{matched ? "From your live position" : `From the start of ${selectedDay.startName}`}</small></> : <><h2>No upcoming POI</h2><small>Add one from the Plan screen.</small></>}</div>
              {nextPoi && <strong>{formatKm(nextPoi.distanceRemainingKm)}</strong>}
            </section>

            <section className="total-walk-card panel">
              <div className="total-walk-heading"><div><p className="eyebrow"><RouteIcon size={14} /> Your itinerary</p><h2>Total walk</h2></div><strong>{planDistancePercent}%</strong></div>
              <div className="total-walk-metrics">
                <div><span>Distance elapsed</span><strong>{formatKm(planProgress)}</strong><small>{formatKm(planDistanceRemaining)} remaining of {formatKm(plannedDistance)}</small></div>
                <div><span>Ascent left</span><strong>{formatMetres(planAscentRemaining)}</strong><small>{planAscentPercentLeft}% left of {formatMetres(planAscentTotal)}</small></div>
              </div>
              {matched && <div className="trail-match"><span>Trail match</span><strong>{Math.round(matched.offRouteM)} m away</strong><small>{simulateGps ? `Simulated ${simulationLocationLabel}` : `iPhone accuracy ±${Math.round(gps?.accuracy ?? 0)} m`}</small></div>}
            </section>

            {gpsError && <div className="alert"><CircleAlert size={18} /><span>{gpsError}</span></div>}

            <aside className="day-actions panel">
                <div className="endpoint-links">
                  {startLocation && <a href={osMapsUrl(startLocation)} target="_blank" rel="noreferrer" aria-label={`Open ${selectedDay.startName} in OS Maps`}><MapPin />{selectedDay.startName}<ExternalLink /></a>}
                  {endLocation && <a href={osMapsUrl(endLocation)} target="_blank" rel="noreferrer" aria-label={`Open ${selectedDay.endName} in OS Maps`}><MapPin />{selectedDay.endName}<ExternalLink /></a>}
                </div>
                <button className="secondary-button" onClick={() => { openDayEditor("edit", selectedDay); setTab("plan"); }}><Pencil size={16} /> Edit this day</button>
            </aside>
          </>
        )}

        {tab === "track" && !selectedDay && (
          <section className="empty-state"><Footprints /><h1>No walking days planned</h1><p>Add your first section to start tracking progress.</p><button className="primary-button" onClick={() => { setTab("plan"); openNewDay(); }}><Plus size={18} /> Add first day</button></section>
        )}

        {tab === "plan" && (
          <section className="workspace-section">
            <div className="section-heading"><div><p className="eyebrow"><CalendarDays size={14} /> Your itinerary</p><h1>Planned walking days</h1><p>Set one start date, then drag stages into order. Dates update automatically.</p></div><div className="plan-add-control"><button className="primary-button" aria-expanded={addMenuOpen} aria-controls="plan-add-menu" onClick={() => setAddMenuOpen((open) => !open)}><Plus size={18} /> Add</button>{addMenuOpen && <div className="plan-add-menu panel" id="plan-add-menu"><button onClick={() => { setAddMenuOpen(false); openNewDay(); }}><Footprints /><span><strong>Stage</strong><small>Add another walking day</small></span></button><button onClick={() => { setAddMenuOpen(false); openPointOfInterestEditor(); }}><MapPin /><span><strong>Point of interest</strong><small>Choose from saved locations</small></span></button><button onClick={() => { setAddMenuOpen(false); openBreakEditor(); }}><Coffee /><span><strong>Break day</strong><small>Pause between two stages</small></span></button></div>}</div></div>
            <section className="plan-schedule panel">
              <label htmlFor="plan-start-date"><span>Walk start date</span><small>Every stage takes one day. Break days shift all later dates.</small></label>
              <input id="plan-start-date" type="date" value={planStartDate} onChange={(event) => changePlanStartDate(event.target.value)} />
            </section>
            <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={reorderStages}>
              <SortableContext items={days.map((day) => day.id)} strategy={verticalListSortingStrategy}>
                <div className="days-list">
                  {days.map((day) => <SortableDayItem
                    key={day.id}
                    day={day}
                    selected={selectedId === day.id}
                    onOpen={() => { setSelectedId(day.id); setTab("track"); }}
                    onEdit={() => openDayEditor("edit", day)}
                    deletePending={pendingDayDeleteId === day.id}
                    onRequestDelete={() => { setPendingLocationDeleteName(null); setPendingDayDeleteId(day.id); }}
                    onCancelDelete={() => setPendingDayDeleteId(null)}
                    onConfirmDelete={() => deleteDay(day)}
                    onRemoveBreak={() => setBreakAfter(day.id, false)}
                    pointsOfInterest={resolvedPointsOfInterest.filter((point) => dayIdContainingDistance(days, point.distanceKm) === day.id)}
                    onRemovePointOfInterest={removePointOfInterest}
                  />)}
                </div>
              </SortableContext>
            </DndContext>
            {!days.length && <div className="empty-state"><MapPin /><h2>Plan your first walking day</h2><p>Pick a start and end point on the trail.</p><button className="primary-button" onClick={openNewDay}><Plus size={18} /> Add first day</button></div>}
          </section>
        )}

        {tab === "locations" && (
          <section className="workspace-section">
            <div className="section-heading"><div><p className="eyebrow"><MapPin size={14} /> Planning points</p><h1>Locations</h1><p>Manage the named places used as walking-day start and end points.</p></div><button className="primary-button" onClick={() => openLocationEditor()}><Plus size={17} /> Add location</button></div>
            <section className="location-library panel">
              <div className="location-list">
                {route.checkpoints.map((location) => <article className="location-row" key={location.name}>
                  <span className="location-pin"><MapPin /></span>
                  <div><strong>{location.name}</strong><small>{location.lat.toFixed(6)}, {location.lng.toFixed(6)} · {location.distanceKm.toFixed(1)} km</small></div>
                  <a href={osMapsUrl(location)} target="_blank" rel="noreferrer" aria-label={`Open ${location.name} in OS Maps`}><ExternalLink /></a>
                  <button onClick={() => openLocationEditor(location)} aria-label={`Edit ${location.name}`}><Pencil /></button>
                  <button onClick={() => { setPendingDayDeleteId(null); setPendingLocationDeleteName(location.name); }} aria-label={`Delete ${location.name}`}><Trash2 /></button>
                  {pendingLocationDeleteName === location.name && <InlineDeleteConfirmation
                    label="Delete location?"
                    detail={location.name}
                    onCancel={() => setPendingLocationDeleteName(null)}
                    onConfirm={() => deleteLocation(location)}
                  />}
                </article>)}
              </div>
            </section>
            <article className="panel locations-simulation"><div><p className="eyebrow"><Satellite size={14} /> Testing</p><h2>Simulated GPS</h2><p>Test the live progress display with an iPhone-like reading about 3 km beyond The Lizard.</p></div><label className="simulation-toggle" htmlFor="simulate-gps" aria-label="Simulate GPS"><input id="simulate-gps" type="checkbox" role="switch" checked={simulateGps} onChange={toggleGpsSimulation} /><span className="toggle-track"><i /></span><span><strong>Simulate GPS</strong><small>{simulateGps ? `Test location ${simulationLocationLabel} is active` : `Use a location ${simulationLocationLabel}`}</small></span></label>{simulateGps && <button className="secondary-button" onClick={() => setTab("track")}><Navigation size={16} /> View Track</button>}</article>
            <article className="gps-check-card panel locations-gps">
              <div><p className="eyebrow"><LocateFixed size={14} /> Location services</p><h2>Check your GPS</h2><p>Show the coordinates supplied by your phone. Switch this on, then tap the location button at the top right.</p></div>
              <label className="simulation-toggle" htmlFor="track-gps" aria-label="Track GPS"><input id="track-gps" type="checkbox" role="switch" checked={trackGps} onChange={toggleGpsTracking} /><span className="toggle-track"><i /></span><span><strong>Track GPS</strong><small>{trackGps ? "Coordinate display is on" : "Coordinate display is off"}</small></span></label>
              {trackGps && <div className="gps-coordinate-display" aria-live="polite">
                {watchId !== null && gps && !simulateGps ? <>
                  <div><span>Latitude</span><strong>{gps.latitude.toFixed(6)}</strong></div>
                  <div><span>Longitude</span><strong>{gps.longitude.toFixed(6)}</strong></div>
                  <p><LocateFixed size={15} /> Accuracy ±{Math.round(gps.accuracy)} metres</p>
                </> : <p><LocateFixed size={15} /> {watchId !== null ? "Waiting for a GPS reading…" : "Tap the location button at the top right to start GPS."}</p>}
              </div>}
              {trackGps && gpsError && <div className="alert gps-check-alert"><CircleAlert size={18} /><span>{gpsError}</span></div>}
            </article>
            <details className="advanced-route panel">
              <summary><span><RouteIcon /> Route data &amp; GPX</span><small>Import, restore or inspect the offline trail</small></summary>
              <div className="advanced-route-content">
                <div className="route-facts"><div><span>Active route</span><strong>{route.name}</strong></div><div><span>Length</span><strong>{formatKm(route.officialDistanceKm)}</strong></div><div><span>Points</span><strong>{route.points.filter(Boolean).length.toLocaleString()}</strong></div><div><span>Elevation</span><strong>{route.elevationSource}</strong></div></div>
                <div className="route-import"><p>A GPX track with elevation replaces the current route after confirmation. Saved locations and stages are matched onto it where possible.</p><label className="primary-button file-button"><FileUp size={18} /> Choose GPX file<input type="file" accept=".gpx,application/gpx+xml" onChange={(event) => { handleImport(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button className="text-button" onClick={restoreBundled}>Restore bundled full South West Coast Path route</button></div>
                <div className="offline-explainer"><CloudOff /><div><strong>Available offline</strong><p>The active route and its {route.points.filter(Boolean).length.toLocaleString()} elevation points are stored on this device.</p></div></div>
              </div>
            </details>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        <NavButton active={tab === "track"} onClick={() => setTab("track")} icon={<Navigation />} label="Track" />
        <NavButton active={tab === "plan"} onClick={() => setTab("plan")} icon={<CalendarDays />} label="Plan" />
        <NavButton active={tab === "locations"} onClick={() => setTab("locations")} icon={<MapPin />} label="Locations" />
      </nav>

      {editor && route && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}>
          <section className="day-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
            <div className="editor-heading"><div><p className="eyebrow">Day {editor.day.order}</p><h2 id="editor-title">{editor.mode === "new" ? "Plan a walking day" : "Edit walking day"}</h2></div><button className="close-button" onClick={() => setEditor(null)} aria-label="Close editor"><X /></button></div>
            <label>Start point<select value={editor.day.startName} onChange={(event) => chooseCheckpoint("start", event.target.value)}>{route.checkpoints.map((point) => <option key={`s-${point.name}`} value={point.name}>{point.name}</option>)}</select></label>
            {editor.day.order > 1 && <button className="copy-button" onClick={usePreviousEnd}><ArrowDown size={16} /> Start where the previous day ended</button>}
            <label>End point<select value={editor.day.endName} onChange={(event) => chooseCheckpoint("end", event.target.value)}>{route.checkpoints.map((point) => <option key={`e-${point.name}`} value={point.name}>{point.name}</option>)}</select></label>
            <div className="editor-preview"><span>Planned distance</span><strong>{Math.max(0, editor.day.endDistanceKm - editor.day.startDistanceKm).toFixed(1)} km</strong></div>
            <div className="editor-actions"><button className="secondary-button" onClick={() => setEditor(null)}>Cancel</button><button className="primary-button" onClick={saveDay}><Check size={17} /> Save day offline</button></div>
          </section>
        </div>
      )}

      {poiEditorOpen && route && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPoiEditorOpen(false); }}>
          <section className="day-editor" role="dialog" aria-modal="true" aria-labelledby="poi-editor-title">
            <div className="editor-heading"><div><p className="eyebrow">Plan item</p><h2 id="poi-editor-title">Add a point of interest</h2></div><button className="close-button" onClick={() => setPoiEditorOpen(false)} aria-label="Close point of interest editor"><X /></button></div>
            <p className="location-editor-note">Choose a place from your saved Locations. Track will show the distance to the next one ahead.</p>
            <label>Location<select value={poiLocationName} onChange={(event) => setPoiLocationName(event.target.value)}>{route.checkpoints.filter((location) => !pointsOfInterest.some((point) => point.locationName === location.name)).map((location) => <option key={location.name} value={location.name}>{location.name} · {location.distanceKm.toFixed(1)} km</option>)}</select></label>
            <div className="editor-actions"><button className="secondary-button" onClick={() => setPoiEditorOpen(false)}>Cancel</button><button className="primary-button" onClick={savePointOfInterest}><MapPin size={17} /> Add point</button></div>
          </section>
        </div>
      )}

      {breakEditorOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBreakEditorOpen(false); }}>
          <section className="day-editor" role="dialog" aria-modal="true" aria-labelledby="break-editor-title">
            <div className="editor-heading"><div><p className="eyebrow">Plan item</p><h2 id="break-editor-title">Add a break day</h2></div><button className="close-button" onClick={() => setBreakEditorOpen(false)} aria-label="Close break day editor"><X /></button></div>
            <p className="location-editor-note">Choose the stage after which you want a day off. Every later date will move forward by one day.</p>
            <label>Break position<select value={breakAfterDayId} onChange={(event) => setBreakAfterDayId(event.target.value)}>{days.slice(0, -1).filter((day) => !day.breakAfter).map((day) => <option key={day.id} value={day.id}>After Day {day.order} · {day.endName}</option>)}</select></label>
            <div className="editor-actions"><button className="secondary-button" onClick={() => setBreakEditorOpen(false)}>Cancel</button><button className="primary-button" onClick={saveBreakDay}><Coffee size={17} /> Add break day</button></div>
          </section>
        </div>
      )}

      {locationEditor && route && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLocationEditor(null); }}>
          <section className="day-editor location-editor" role="dialog" aria-modal="true" aria-labelledby="location-editor-title">
            <div className="editor-heading"><div><p className="eyebrow">Planning point</p><h2 id="location-editor-title">{locationEditor.mode === "new" ? "Add a saved location" : "Edit saved location"}</h2></div><button className="close-button" onClick={() => setLocationEditor(null)} aria-label="Close location editor"><X /></button></div>
            <p className="location-editor-note">Enter the place coordinates. The app will store the nearest point on the active GPX route.</p>
            <label>Location name<input type="text" value={locationEditor.name} onChange={(event) => setLocationEditor({ ...locationEditor, name: event.target.value })} placeholder="For example: Mullion Cove" /></label>
            <div className="location-coordinate-fields">
              <label>Latitude<input inputMode="text" type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="e.g. 50.0834" value={locationEditor.lat} onChange={(event) => setLocationEditor({ ...locationEditor, lat: event.target.value })} /></label>
              <label>Longitude<input inputMode="text" type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="e.g. -5.3167" value={locationEditor.lng} onChange={(event) => setLocationEditor({ ...locationEditor, lng: event.target.value })} /></label>
            </div>
            <div className="editor-actions"><button className="secondary-button" onClick={() => setLocationEditor(null)}>Cancel</button><button className="primary-button" onClick={saveLocation}><MapPin size={17} /> Match and save</button></div>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status" aria-live="polite"><Check size={17} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={15} /></button></div>}
    </div>
  );
}

function SortableDayItem({ day, selected, deletePending, pointsOfInterest, onOpen, onEdit, onRequestDelete, onCancelDelete, onConfirmDelete, onRemoveBreak, onRemovePointOfInterest }: {
  day: WalkingDay;
  selected: boolean;
  deletePending: boolean;
  pointsOfInterest: ResolvedPointOfInterest[];
  onOpen: () => void;
  onEdit: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void | Promise<void>;
  onRemoveBreak: () => void;
  onRemovePointOfInterest: (point: PlannedPointOfInterest) => void | Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: day.id });
  const distance = dayDistanceKm(day);
  return <div
    ref={setNodeRef}
    className={`itinerary-item ${isDragging ? "dragging" : ""}`}
    style={{ transform: CSS.Transform.toString(transform), transition }}
  >
    <article className={`day-row ${selected ? "selected" : ""}`}>
      <button className="drag-handle" aria-label={`Drag to reorder day ${day.order}`} {...attributes} {...listeners}><GripVertical /></button>
      <button className="day-main" onClick={onOpen}>
        <span className="day-number">{String(day.order).padStart(2, "0")}</span>
        <span className="day-copy"><small>{formatDate(day.date)}</small><strong>{day.startName} <ArrowRight /> {day.endName}</strong></span>
        <span className="day-distance"><strong>{distance.toFixed(1)}</strong><small>km</small></span><ChevronRight />
      </button>
      <div className="row-actions">
        <button aria-label={`Edit day ${day.order}`} onClick={onEdit}><Pencil size={17} /></button>
        <button aria-label={`Delete day ${day.order}`} onClick={onRequestDelete}><Trash2 size={17} /></button>
      </div>
    </article>
    {deletePending && <InlineDeleteConfirmation
      label="Delete stage?"
      detail={`${day.startName} to ${day.endName}`}
      onCancel={onCancelDelete}
      onConfirm={onConfirmDelete}
    />}
    {pointsOfInterest.map((point) => <article className="itinerary-poi-row" key={point.id}>
      <span className="poi-connector" aria-hidden="true" />
      <span className="location-pin"><MapPin /></span>
      <span><small>Point of interest · {(point.distanceKm - day.startDistanceKm).toFixed(1)} km into Day {day.order}</small><strong>{point.name}</strong></span>
      <button onClick={() => onRemovePointOfInterest(point)} aria-label={`Remove ${point.name} point of interest`}><X /></button>
    </article>)}
    {day.breakAfter && <article className="break-day-row">
      <span className="break-icon"><Coffee /></span>
      <span><small>{formatDate(breakDateAfter(day))}</small><strong>Break day</strong></span>
      <button onClick={onRemoveBreak} aria-label={`Remove break day after day ${day.order}`}><X /></button>
    </article>}
  </div>;
}

function InlineDeleteConfirmation({ label, detail, onCancel, onConfirm }: {
  label: string;
  detail: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return <div className="inline-delete-confirm" role="group" aria-label={`${label} ${detail}`}>
    <span><strong>{label}</strong><small>{detail}</small></span>
    <div>
      <button className="inline-confirm-cancel" onClick={onCancel}>Cancel</button>
      <button className="inline-confirm-delete" onClick={onConfirm}>Delete</button>
    </div>
  </div>;
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button className={active ? "active" : ""} onClick={onClick} aria-current={active ? "page" : undefined}>{icon}<span>{label}</span></button>;
}

function ElevationTooltip({ active, payload, suppress = false }: { active?: boolean; payload?: Array<{ payload: { dayKm: number; elevationM: number } }>; suppress?: boolean }) {
  if (suppress || !active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="elevation-tooltip"><strong>{point.elevationM} m</strong><span>{point.dayKm.toFixed(1)} km into day</span></div>;
}

function ProfilePoiDot({ cx, cy, name, active, onHover, onToggle }: {
  cx?: number;
  cy?: number;
  name: string;
  active: boolean;
  onHover: (hovering: boolean) => void;
  onToggle: () => void;
}) {
  if (cx === undefined || cy === undefined) return <g />;
  return <g
    className={`profile-poi-dot${active ? " active" : ""}`}
    role="button"
    tabIndex={0}
    aria-label={`${name} point of interest`}
    onMouseEnter={() => onHover(true)}
    onMouseLeave={() => onHover(false)}
    onClick={onToggle}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onToggle(); }
    }}
  >
    <title>{name}</title>
    <circle className="profile-poi-hit-area" cx={cx} cy={cy} r={15} />
    <circle className="profile-poi-marker" cx={cx} cy={cy} r={active ? 8 : 6} />
  </g>;
}

async function prepareOfflineApp(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const registration = await withClientTimeout(navigator.serviceWorker.register("/sw.js"), 8000);
      const readyRegistration = await withClientTimeout(navigator.serviceWorker.ready, 8000);
      const worker = navigator.serviceWorker.controller ?? readyRegistration.active ?? registration.active;
      if (!worker) continue;
      const ready = await new Promise<boolean>((resolve) => {
        const channel = new MessageChannel();
        const timeout = window.setTimeout(() => resolve(false), 10000);
        channel.port1.onmessage = (event) => {
          window.clearTimeout(timeout);
          resolve(event.data?.ready === true);
        };
        worker.postMessage({ type: "PREPARE_OFFLINE" }, [channel.port2]);
      });
      if (ready) return true;
    } catch {
      // A short retry handles a transient first-load or iOS activation race.
    }
    if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 400));
  }
  return false;
}

function withClientTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Offline preparation timed out")), timeoutMs);
    Promise.resolve(promise).then(
      (value) => { window.clearTimeout(timeout); resolve(value); },
      (error) => { window.clearTimeout(timeout); reject(error); },
    );
  });
}

"use client";

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
import { db, loadInitialData, replaceRoute, savePlanStartDate, saveRouteCheckpoints } from "../lib/db";
import { normalizeDayOrders, reorderWalkingDays } from "../lib/days";
import {
  breakDateAfter, dayDistanceKm, dayIdContainingDistance, dayIdForDate,
  fillWalkingDayDates, localDateKey, plannedProgressKm, totalPlannedDistanceKm,
} from "../lib/planning";
import {
  ascentDescent, importGpx, nearestRoutePosition, osMapsUrl, pointsForDay,
  routePointAt, simulatedGpsNearCheckpoint,
} from "../lib/route";
import type { Checkpoint, GpsReading, TrailRoute, WalkingDay } from "../types";

type Tab = "track" | "plan" | "locations";
type EditorState = { mode: "new" | "edit"; day: WalkingDay } | null;
type OfflineState = "preparing" | "ready" | "limited";
type LocationEditorState = { mode: "new" | "edit"; originalName?: string; name: string; lat: string; lng: string } | null;

const formatKm = (value: number, digits = 1) => `${value.toFixed(digits)} km`;
const formatDate = (value: string) => value
  ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`))
  : "Date not set";

export function CoastPathApp() {
  const [route, setRoute] = useState<TrailRoute | null>(null);
  const [days, setDays] = useState<WalkingDay[]>([]);
  const [planStartDate, setPlanStartDate] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<Tab>("track");
  const [loadingError, setLoadingError] = useState("");
  const [gps, setGps] = useState<GpsReading | null>(null);
  const [simulateGps, setSimulateGps] = useState(false);
  const [trackGps, setTrackGps] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [watchId, setWatchId] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [offlineState, setOfflineState] = useState<OfflineState>("preparing");
  const [editor, setEditor] = useState<EditorState>(null);
  const [locationEditor, setLocationEditor] = useState<LocationEditorState>(null);
  const [notice, setNotice] = useState("");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    loadInitialData()
      .then(({ route: loadedRoute, days: loadedDays, planStartDate: loadedStartDate, storageReady }) => {
        setRoute(loadedRoute); setDays(loadedDays); setPlanStartDate(loadedStartDate); setSelectedId(dayIdForDate(loadedDays, localDateKey()));
        if (!storageReady) setOfflineState("limited");
      })
      .catch((error) => setLoadingError(error instanceof Error ? error.message : "Unable to load the trail."));
    setOnline(navigator.onLine);
    const isLocalDevelopment = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const refreshOfflineState = () => {
      if (isLocalDevelopment) { setOfflineState("ready"); return; }
      if (!navigator.onLine) {
        setOfflineState(navigator.serviceWorker.controller ? "ready" : "limited");
        return;
      }
      setOfflineState("preparing");
      prepareOfflineApp().then((ready) => setOfflineState((current) => current === "limited" ? "limited" : ready ? "ready" : "limited"));
    };
    const handleOnline = () => { setOnline(true); refreshOfflineState(); };
    const handleOffline = () => { setOnline(false); setOfflineState(navigator.serviceWorker.controller ? "ready" : "limited"); };
    const handleInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstall);
    if ("serviceWorker" in navigator) {
      if (isLocalDevelopment) {
        // A development service worker can cache stale Vite module URLs after HMR.
        navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => registration.unregister()));
        caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("coastline-")).map((key) => caches.delete(key))));
        setOfflineState("ready");
      } else {
        refreshOfflineState();
      }
    } else {
      setOfflineState("limited");
    }
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstall);
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
  const simulationLocationLabel = route?.checkpoints.some((point) => point.name === "Lizard Point") ? "after Lizard Point" : "near the route start";
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
    const id = navigator.geolocation.watchPosition(
      (position) => setGps(position.coords),
      (error) => setGpsError(error.code === 1 ? "Location permission was not granted. Allow location in Safari settings and try again." : error.message),
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
    const simulated = route ? simulatedGpsNearCheckpoint(route) : null;
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
    setDays(updated); setSelectedId(updated[0]?.id ?? ""); setNotice("Walking stage removed; numbering and dates updated.");
  };

  const changePlanStartDate = async (value: string) => {
    const updated = fillWalkingDayDates(days, value);
    await savePlanStartDate(value);
    if (updated.length) await db.days.bulkPut(updated);
    setPlanStartDate(value);
    setDays(updated);
    setNotice(value ? "Start date saved and the itinerary rescheduled." : "Start date cleared.");
  };

  const toggleBreakAfter = async (dayId: string) => {
    const updated = fillWalkingDayDates(days.map((day, index) => ({
      ...day,
      breakAfter: day.id === dayId && index < days.length - 1 ? !day.breakAfter : day.breakAfter,
    })), planStartDate);
    if (updated.length) await db.days.bulkPut(updated);
    setDays(updated);
    setNotice(updated.find((day) => day.id === dayId)?.breakAfter ? "Break day added; later dates moved on by one day." : "Break day removed; later dates recalculated.");
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
    const lat = Number(locationEditor.lat);
    const lng = Number(locationEditor.lng);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
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
    }
    setLocationEditor(null);
    setNotice(`${name} saved at ${match.distanceKm.toFixed(1)} km · matched ${Math.round(match.offRouteM)} m from the entered coordinate.`);
  };

  const deleteLocation = async (location: Checkpoint) => {
    if (!route) return;
    if (route.checkpoints.length <= 2) { setNotice("Keep at least two saved locations for planning a walking day."); return; }
    const updatedRoute = await saveRouteCheckpoints(route, route.checkpoints.filter((point) => point.name !== location.name));
    setRoute(updatedRoute);
    setNotice(`${location.name} removed from the saved locations list.`);
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = importGpx(await file.text(), file.name);
      await replaceRoute(imported);
      const seeded = await loadInitialData();
      setRoute(seeded.route); setDays(seeded.days); setPlanStartDate(seeded.planStartDate); setSelectedId(dayIdForDate(seeded.days, localDateKey()));
      setNotice(`${imported.name} is stored on this device and ready offline.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The GPX file could not be imported.");
    }
  };

  const restoreBundled = async () => {
    const response = await fetch("/data/swcp-route.json");
    const bundled = await response.json() as TrailRoute;
    await replaceRoute(bundled);
    const seeded = await loadInitialData();
    setRoute(seeded.route); setDays(seeded.days); setPlanStartDate(seeded.planStartDate); setSelectedId(dayIdForDate(seeded.days, localDateKey()));
    setNotice("The bundled South West Coast Path route has been restored.");
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
          <span className={`status-pill ${!online ? "offline" : offlineState}`}>
            {!online ? <CloudOff size={14} /> : offlineState === "ready" ? <Check size={14} /> : <Download size={14} />}
            {!online ? "Working offline" : offlineState === "ready" ? "Offline ready" : offlineState === "preparing" ? "Preparing offline" : "Offline setup incomplete"}
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
                <div className="climb-summary"><span><ArrowUp /> {climbing.ascent.toLocaleString()} m</span><span><ArrowDown /> {climbing.descent.toLocaleString()} m</span><span><Mountain /> {highestPoint.toLocaleString()} m</span></div>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 24, right: 18, bottom: 0, left: -16 }}>
                    <defs><linearGradient id="elevationFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e97651" stopOpacity=".44"/><stop offset="100%" stopColor="#e97651" stopOpacity=".05"/></linearGradient></defs>
                    <CartesianGrid stroke="#dbe3df" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="dayKm" type="number" domain={[0, Math.ceil(dayDistance)]} unit=" km" tick={{ fontSize: 11, fill: "#66756f" }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="elevationM" unit=" m" tick={{ fontSize: 11, fill: "#66756f" }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip content={<ElevationTooltip />} cursor={{ stroke: "#183f35", strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="elevationM" stroke="#dd6744" strokeWidth={2.5} fill="url(#elevationFill)" animationDuration={600} />
                    {liveProfilePoint && <ReferenceLine x={liveProfilePoint.distanceKm - selectedDay.startDistanceKm} stroke="#2f83be" strokeWidth={2} strokeDasharray="4 4" label={{ value: "You are here", position: "insideTopRight", fill: "#236994", fontSize: 11 }} />}
                    {liveProfilePoint && <ReferenceDot x={liveProfilePoint.distanceKm - selectedDay.startDistanceKm} y={liveProfilePoint.elevationM} r={6} fill="#2f83be" stroke="#fffefa" strokeWidth={3} />}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="profile-day-navigation" aria-label="Choose walking day">
                <button onClick={() => selectAdjacentDay(-1)} disabled={selectedIndex <= 0} aria-label="Previous walking day"><ChevronLeft /></button>
                <select aria-label="Walking day" value={selectedDay.id} onChange={(event) => setSelectedId(event.target.value)}>
                  {days.map((day) => <option key={day.id} value={day.id}>Day {day.order} · {formatDate(day.date)}</option>)}
                </select>
                <button onClick={() => selectAdjacentDay(1)} disabled={selectedIndex < 0 || selectedIndex >= days.length - 1} aria-label="Next walking day"><ChevronRight /></button>
              </div>
            </section>

            <section className="tracking-card panel">
              <div className="tracking-copy">
                <div className="progress-heading"><div><p className="eyebrow"><Footprints size={14} /> Day progress</p><h2>{formatKm(dayProgress)} <small>of {formatKm(dayDistance)}</small></h2></div><strong>{Math.round(dayDistance ? dayProgress / dayDistance * 100 : 0)}%</strong></div>
                <div className="progress-track" aria-label={`${Math.round(dayDistance ? dayProgress / dayDistance * 100 : 0)}% of this day completed`}><span style={{ width: `${dayDistance ? dayProgress / dayDistance * 100 : 0}%` }} /></div>
                <div className="progress-details">
                  <div><span>Whole plan</span><strong>{gps ? `${formatKm(planProgress)} / ${formatKm(plannedDistance)}` : formatKm(plannedDistance)}</strong><small>{gps ? `${Math.max(0, plannedDistance - planProgress).toFixed(1)} km remaining` : `${days.length} planned ${days.length === 1 ? "day" : "days"}`}</small></div>
                  {matched && <div><span>Trail match</span><strong>{Math.round(matched.offRouteM)} m away</strong><small>{simulateGps ? `Simulated ${simulationLocationLabel}` : `iPhone accuracy ±${Math.round(gps?.accuracy ?? 0)} m`}</small></div>}
                </div>
              </div>
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
            <div className="section-heading"><div><p className="eyebrow"><CalendarDays size={14} /> Your itinerary</p><h1>Planned walking days</h1><p>Set one start date, then drag stages into order. Dates update automatically.</p></div><button className="primary-button" onClick={openNewDay}><Plus size={18} /> Add a stage</button></div>
            <section className="plan-schedule panel">
              <label htmlFor="plan-start-date"><span>Walk start date</span><small>Every stage takes one day. Break days shift all later dates.</small></label>
              <input id="plan-start-date" type="date" value={planStartDate} onChange={(event) => changePlanStartDate(event.target.value)} />
            </section>
            <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={reorderStages}>
              <SortableContext items={days.map((day) => day.id)} strategy={verticalListSortingStrategy}>
                <div className="days-list">
                  {days.map((day, index) => <SortableDayItem
                    key={day.id}
                    day={day}
                    selected={selectedId === day.id}
                    canAddBreak={index < days.length - 1}
                    onOpen={() => { setSelectedId(day.id); setTab("track"); }}
                    onEdit={() => openDayEditor("edit", day)}
                    onDelete={() => deleteDay(day)}
                    onToggleBreak={() => toggleBreakAfter(day.id)}
                  />)}
                </div>
              </SortableContext>
            </DndContext>
            {!days.length && <div className="empty-state"><MapPin /><h2>Plan your first walking day</h2><p>Pick a start and end point on the trail.</p><button className="primary-button" onClick={openNewDay}><Plus size={18} /> Add first day</button></div>}
          </section>
        )}

        {tab === "locations" && (
          <section className="workspace-section locations-workspace">
            <div className="section-heading"><div><p className="eyebrow"><MapPin size={14} /> Planning points</p><h1>Locations</h1><p>Manage the named places used as walking-day start and end points.</p></div><button className="primary-button" onClick={() => openLocationEditor()}><Plus size={17} /> Add location</button></div>
            <section className="location-library panel">
              <div className="location-list">
                {route.checkpoints.map((location) => <article className="location-row" key={location.name}>
                  <span className="location-pin"><MapPin /></span>
                  <div><strong>{location.name}</strong><small>{location.lat.toFixed(6)}, {location.lng.toFixed(6)} · {location.distanceKm.toFixed(1)} km</small></div>
                  <a href={osMapsUrl(location)} target="_blank" rel="noreferrer" aria-label={`Open ${location.name} in OS Maps`}><ExternalLink /></a>
                  <button onClick={() => openLocationEditor(location)} aria-label={`Edit ${location.name}`}><Pencil /></button>
                  <button onClick={() => deleteLocation(location)} aria-label={`Delete ${location.name}`}><Trash2 /></button>
                </article>)}
              </div>
            </section>
            <article className="simulation-card panel locations-simulation"><div><p className="eyebrow"><Satellite size={14} /> Testing</p><h2>Simulated GPS</h2><p>Test the live progress display with an iPhone-like reading about 3 km beyond Lizard Point.</p></div><label className="simulation-toggle"><input type="checkbox" role="switch" checked={simulateGps} onChange={toggleGpsSimulation} /><span className="toggle-track"><i /></span><span><strong>Simulate GPS</strong><small>{simulateGps ? `Test location ${simulationLocationLabel} is active` : `Use a location ${simulationLocationLabel}`}</small></span></label>{simulateGps && <button className="secondary-button" onClick={() => setTab("track")}><Navigation size={16} /> View Track</button>}</article>
            <article className="gps-check-card panel locations-gps">
              <div><p className="eyebrow"><LocateFixed size={14} /> Location services</p><h2>Check your GPS</h2><p>Show the coordinates supplied by your phone. Switch this on, then tap the location button at the top right.</p></div>
              <label className="simulation-toggle"><input type="checkbox" role="switch" checked={trackGps} onChange={toggleGpsTracking} /><span className="toggle-track"><i /></span><span><strong>Track GPS</strong><small>{trackGps ? "Coordinate display is on" : "Coordinate display is off"}</small></span></label>
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
                <div className="route-import"><p>A GPX track with elevation replaces the bundled route on this device.</p><label className="primary-button file-button"><FileUp size={18} /> Choose GPX file<input type="file" accept=".gpx,application/gpx+xml" onChange={(event) => handleImport(event.target.files?.[0])} /></label><button className="text-button" onClick={restoreBundled}>Restore bundled Mousehole–Falmouth route</button></div>
                <div className="offline-explainer"><CloudOff /><div><strong>Available offline</strong><p>The bundled route and its {route.points.filter(Boolean).length.toLocaleString()} elevation points are stored with the app.</p></div></div>
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

      {locationEditor && route && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLocationEditor(null); }}>
          <section className="day-editor location-editor" role="dialog" aria-modal="true" aria-labelledby="location-editor-title">
            <div className="editor-heading"><div><p className="eyebrow">Planning point</p><h2 id="location-editor-title">{locationEditor.mode === "new" ? "Add a saved location" : "Edit saved location"}</h2></div><button className="close-button" onClick={() => setLocationEditor(null)} aria-label="Close location editor"><X /></button></div>
            <p className="location-editor-note">Enter the place coordinates. The app will store the nearest point on the Mousehole–Falmouth GPX.</p>
            <label>Location name<input type="text" value={locationEditor.name} onChange={(event) => setLocationEditor({ ...locationEditor, name: event.target.value })} placeholder="For example: Mullion Cove" /></label>
            <div className="location-coordinate-fields"><label>Latitude<input inputMode="decimal" type="number" min="-90" max="90" step="any" value={locationEditor.lat} onChange={(event) => setLocationEditor({ ...locationEditor, lat: event.target.value })} /></label><label>Longitude<input inputMode="decimal" type="number" min="-180" max="180" step="any" value={locationEditor.lng} onChange={(event) => setLocationEditor({ ...locationEditor, lng: event.target.value })} /></label></div>
            <div className="editor-actions"><button className="secondary-button" onClick={() => setLocationEditor(null)}>Cancel</button><button className="primary-button" onClick={saveLocation}><MapPin size={17} /> Match and save</button></div>
          </section>
        </div>
      )}

      {notice && <button className="toast" onClick={() => setNotice("")}><Check size={17} /><span>{notice}</span><X size={15} /></button>}
    </div>
  );
}

function SortableDayItem({ day, selected, canAddBreak, onOpen, onEdit, onDelete, onToggleBreak }: {
  day: WalkingDay;
  selected: boolean;
  canAddBreak: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleBreak: () => void;
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
        {canAddBreak && <button aria-label={`${day.breakAfter ? "Remove" : "Add"} break day after day ${day.order}`} aria-pressed={Boolean(day.breakAfter)} onClick={onToggleBreak}><Coffee size={17} /></button>}
        <button aria-label={`Edit day ${day.order}`} onClick={onEdit}><Pencil size={17} /></button>
        <button aria-label={`Delete day ${day.order}`} onClick={onDelete}><Trash2 size={17} /></button>
      </div>
    </article>
    {day.breakAfter && <article className="break-day-row">
      <span className="break-icon"><Coffee /></span>
      <span><small>{formatDate(breakDateAfter(day))}</small><strong>Break day</strong></span>
      <button onClick={onToggleBreak} aria-label={`Remove break day after day ${day.order}`}><X /></button>
    </article>}
  </div>;
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function ElevationTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { dayKm: number; elevationM: number } }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="elevation-tooltip"><strong>{point.elevationM} m</strong><span>{point.dayKm.toFixed(1)} km into day</span></div>;
}

async function prepareOfflineApp(): Promise<boolean> {
  try {
    const registration = await withClientTimeout(navigator.serviceWorker.register("/sw.js"), 8000);
    const readyRegistration = await withClientTimeout(navigator.serviceWorker.ready, 8000);
    const worker = navigator.serviceWorker.controller ?? readyRegistration.active ?? registration.active;
    if (!worker) return false;
    return await new Promise<boolean>((resolve) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => resolve(false), 10000);
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        resolve(event.data?.ready === true);
      };
      worker.postMessage({ type: "PREPARE_OFFLINE" }, [channel.port2]);
    });
  } catch {
    return false;
  }
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

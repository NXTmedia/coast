"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, CalendarDays, Check, ChevronRight, CircleAlert,
  CloudOff, Download, ExternalLink, FileUp, Footprints, LocateFixed, MapPin, Mountain,
  Navigation, Pencil, Plus, Route as RouteIcon, Satellite, Trash2, X,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { db, loadInitialData, replaceRoute } from "../lib/db";
import { normalizeDayOrders } from "../lib/days";
import {
  copyPreviousDayEnd, dayDistanceKm, plannedProgressKm, renameDayLocation,
  totalPlannedDistanceKm,
} from "../lib/planning";
import {
  ascentDescent, googleMapsUrl, importGpx, nearestRoutePosition, pointsForDay,
  routePointAt, simulatedGpsNearCheckpoint,
} from "../lib/route";
import type { GpsReading, TrailRoute, WalkingDay } from "../types";

type Tab = "track" | "plan" | "data";
type EditorState = { mode: "new" | "edit"; day: WalkingDay } | null;
type CoordinateDrafts = { startLat: string; startLng: string; endLat: string; endLng: string };
type OfflineState = "preparing" | "ready" | "limited";

const formatKm = (value: number, digits = 1) => `${value.toFixed(digits)} km`;
const formatDate = (value: string) => value
  ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`))
  : "Date not set";

export function CoastPathApp() {
  const [route, setRoute] = useState<TrailRoute | null>(null);
  const [days, setDays] = useState<WalkingDay[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<Tab>("track");
  const [loadingError, setLoadingError] = useState("");
  const [gps, setGps] = useState<GpsReading | null>(null);
  const [simulateGps, setSimulateGps] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [watchId, setWatchId] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [offlineState, setOfflineState] = useState<OfflineState>("preparing");
  const [editor, setEditor] = useState<EditorState>(null);
  const [coordinateDrafts, setCoordinateDrafts] = useState<CoordinateDrafts>({ startLat: "", startLng: "", endLat: "", endLng: "" });
  const [coordinateMessages, setCoordinateMessages] = useState({ start: "", end: "" });
  const [notice, setNotice] = useState("");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);

  useEffect(() => {
    loadInitialData()
      .then(({ route: loadedRoute, days: loadedDays, storageReady }) => {
        setRoute(loadedRoute); setDays(loadedDays); setSelectedId(loadedDays[0]?.id ?? "");
        if (!storageReady) setOfflineState("limited");
      })
      .catch((error) => setLoadingError(error instanceof Error ? error.message : "Unable to load the trail."));
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstall);
    if ("serviceWorker" in navigator) {
      const isLocalDevelopment = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (isLocalDevelopment) {
        // A development service worker can cache stale Vite module URLs after HMR.
        navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => registration.unregister()));
        caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("coastline-")).map((key) => caches.delete(key))));
        setOfflineState("ready");
      } else {
        prepareOfflineApp().then((ready) => setOfflineState((current) => current === "limited" ? "limited" : ready ? "ready" : "limited"));
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

  const selectedDay = days.find((day) => day.id === selectedId) ?? days[0];
  const matched = useMemo(
    () => route && gps ? nearestRoutePosition(route, gps.longitude, gps.latitude) : null,
    [route, gps],
  );
  const dayPoints = useMemo(
    () => route && selectedDay ? pointsForDay(route, selectedDay.startDistanceKm, selectedDay.endDistanceKm) : [],
    [route, selectedDay],
  );
  const climbing = useMemo(() => ascentDescent(dayPoints), [dayPoints]);
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

  const startGps = () => {
    setGpsError("");
    if (!("geolocation" in navigator)) { setGpsError("Location is not available in this browser."); return; }
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); setWatchId(null); setGps(null); return; }
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
    const simulated = route ? simulatedGpsNearCheckpoint(route) : null;
    if (!simulated) {
      setGpsError("A simulated location could not be created for this route.");
      return;
    }
    setGps(simulated);
    setSimulateGps(true);
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
    const start = day.startCoordinate ?? routePointAt(route, day.startDistanceKm);
    const end = day.endCoordinate ?? routePointAt(route, day.endDistanceKm);
    setCoordinateDrafts({
      startLat: start?.lat.toFixed(6) ?? "", startLng: start?.lng.toFixed(6) ?? "",
      endLat: end?.lat.toFixed(6) ?? "", endLng: end?.lng.toFixed(6) ?? "",
    });
    setCoordinateMessages({
      start: day.startCoordinate ? `Matched ${Math.round(day.startCoordinate.offRouteM)} m from the path` : "",
      end: day.endCoordinate ? `Matched ${Math.round(day.endCoordinate.offRouteM)} m from the path` : "",
    });
    setEditor({ mode, day });
  };

  const matchCoordinates = (field: "start" | "end") => {
    if (!route || !editor) return;
    const latText = field === "start" ? coordinateDrafts.startLat : coordinateDrafts.endLat;
    const lngText = field === "start" ? coordinateDrafts.startLng : coordinateDrafts.endLng;
    const lat = Number(latText);
    const lng = Number(lngText);
    if (!latText.trim() || !lngText.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setCoordinateMessages((messages) => ({ ...messages, [field]: "Enter a valid latitude and longitude." }));
      return;
    }
    const match = nearestRoutePosition(route, lng, lat);
    if (!match) {
      setCoordinateMessages((messages) => ({ ...messages, [field]: "No matching point was found on this route." }));
      return;
    }
    const nearby = route.checkpoints.reduce((best, point) =>
      Math.abs(point.distanceKm - match.distanceKm) < Math.abs(best.distanceKm - match.distanceKm) ? point : best,
    );
    const label = `${nearby.name} area · ${match.distanceKm.toFixed(1)} km`;
    const coordinate = { lat, lng, offRouteM: match.offRouteM };
    setEditor({
      ...editor,
      day: field === "start"
        ? { ...editor.day, startName: label, startDistanceKm: match.distanceKm, startCoordinate: coordinate }
        : { ...editor.day, endName: label, endDistanceKm: match.distanceKm, endCoordinate: coordinate },
    });
    setCoordinateMessages((messages) => ({
      ...messages,
      [field]: `Matched to the SWCP at ${match.distanceKm.toFixed(1)} km · ${Math.round(match.offRouteM)} m from the path`,
    }));
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
    const updated = normalizeDayOrders([...days.filter((day) => day.id !== savedDay.id), savedDay]);
    await db.days.bulkPut(updated);
    setDays(updated); setSelectedId(savedDay.id); setEditor(null); setNotice("Walking day saved offline.");
  };

  const deleteDay = async (day: WalkingDay) => {
    const updated = normalizeDayOrders(days.filter((candidate) => candidate.id !== day.id));
    await db.transaction("rw", db.days, async () => {
      await db.days.delete(day.id);
      if (updated.length) await db.days.bulkPut(updated);
    });
    setDays(updated); setSelectedId(updated[0]?.id ?? ""); setNotice("Walking day removed and days renumbered.");
  };

  const usePreviousEnd = () => {
    if (!editor || !route || editor.day.order <= 1) return;
    const previous = days.find((day) => day.order === editor.day.order - 1) ?? days.at(-1);
    if (!previous) return;
    const coordinate = previous.endCoordinate ?? routePointAt(route, previous.endDistanceKm);
    setEditor({ ...editor, day: copyPreviousDayEnd(editor.day, previous) });
    if (coordinate) setCoordinateDrafts((values) => ({ ...values, startLat: coordinate.lat.toFixed(6), startLng: coordinate.lng.toFixed(6) }));
    setCoordinateMessages((messages) => ({ ...messages, start: previous.endCoordinate ? `Matched ${Math.round(previous.endCoordinate.offRouteM)} m from the path` : "" }));
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
    setCoordinateDrafts((values) => field === "start"
      ? { ...values, startLat: point.lat.toFixed(6), startLng: point.lng.toFixed(6) }
      : { ...values, endLat: point.lat.toFixed(6), endLng: point.lng.toFixed(6) });
    setCoordinateMessages((messages) => ({ ...messages, [field]: "" }));
  };

  const fineTuneBoundary = (field: "start" | "end", value: number) => {
    if (!editor || !route) return;
    const point = routePointAt(route, value);
    setEditor({
      ...editor,
      day: field === "start"
        ? { ...editor.day, startName: `${value.toFixed(1)} km point`, startDistanceKm: value, startCoordinate: undefined }
        : { ...editor.day, endName: `${value.toFixed(1)} km point`, endDistanceKm: value, endCoordinate: undefined },
    });
    if (point) setCoordinateDrafts((values) => field === "start"
      ? { ...values, startLat: point.lat.toFixed(6), startLng: point.lng.toFixed(6) }
      : { ...values, endLat: point.lat.toFixed(6), endLng: point.lng.toFixed(6) });
    setCoordinateMessages((messages) => ({ ...messages, [field]: "" }));
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = importGpx(await file.text(), file.name);
      await replaceRoute(imported);
      const seeded = await loadInitialData();
      setRoute(seeded.route); setDays(seeded.days); setSelectedId(seeded.days[0]?.id ?? "");
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
    setRoute(seeded.route); setDays(seeded.days); setSelectedId(seeded.days[0]?.id ?? "");
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
    <div className="app-shell">
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
          {installPrompt && <button className="icon-button install-button" onClick={installApp}><Download size={17} /><span>Install</span></button>}
        </div>
      </header>

      <main className="main-content">
        {tab === "track" && selectedDay && (
          <>
            <section className="hero-row">
              <div>
                <p className="eyebrow"><Navigation size={14} /> Trail tracker</p>
                <h1>{selectedDay.startName} <ArrowRight /> {selectedDay.endName}</h1>
                <p>Day {selectedDay.order} · {formatDate(selectedDay.date)}</p>
              </div>
              <label className="day-picker">Viewing
                <select value={selectedDay.id} onChange={(event) => setSelectedId(event.target.value)}>
                  {days.map((day) => <option key={day.id} value={day.id}>Day {day.order}: {day.startName} → {day.endName}</option>)}
                </select>
              </label>
            </section>

            <section className="tracking-card panel">
              <div className="tracking-copy">
                <p className="eyebrow"><Footprints size={14} /> Day {selectedDay.order} progress</p>
                <h2>{gps ? `${formatKm(dayProgress)} walked` : `${formatKm(dayDistance)} planned`}</h2>
                <p>{matched ? `${simulateGps ? "Simulated near Lynmouth · " : ""}${matched.distanceKm.toFixed(1)} km along the path · ${Math.round(matched.offRouteM)} m from the trail` : "Use your iPhone location to calculate progress along this section."}</p>
                <div className="progress-track" aria-label={`${Math.round(dayDistance ? dayProgress / dayDistance * 100 : 0)}% of this day completed`}><span style={{ width: `${dayDistance ? dayProgress / dayDistance * 100 : 0}%` }} /></div>
              </div>
              <div className="tracking-actions">
                <label className="simulation-toggle">
                  <input type="checkbox" role="switch" checked={simulateGps} onChange={toggleGpsSimulation} />
                  <span className="toggle-track"><i /></span>
                  <span><strong>Simulate GPS</strong><small>Just after Lynmouth</small></span>
                </label>
                <button className={`locate-button ${watchId !== null ? "active" : ""}`} onClick={startGps}>
                  <LocateFixed size={19} /> {watchId !== null ? "Stop locating" : "Use my location"}
                </button>
              </div>
            </section>

            {gpsError && <div className="alert"><CircleAlert size={18} /><span>{gpsError}</span></div>}

            <section className="metric-grid" aria-label="Walking progress">
              <Metric icon={<Footprints />} label="Today" value={gps ? formatKm(dayProgress) : "Start GPS"} sub={gps ? `${Math.max(0, dayDistance - dayProgress).toFixed(1)} km remaining` : formatKm(dayDistance) + " planned"} accent="coral" />
              <Metric icon={<RouteIcon />} label="Whole plan" value={gps ? formatKm(planProgress) : formatKm(plannedDistance)} sub={gps ? `${Math.max(0, plannedDistance - planProgress).toFixed(1)} km remaining of ${plannedDistance.toFixed(1)} km` : `Total across ${days.length} planned ${days.length === 1 ? "day" : "days"}`} accent="green" />
              <Metric icon={<Satellite />} label="GPS match" value={matched ? `±${Math.round(gps?.accuracy ?? 0)} m` : "Not active"} sub={matched ? `${simulateGps ? "Simulated · " : ""}${Math.round(matched.offRouteM)} m from path` : "Use location or simulation"} accent="blue" />
            </section>

            <section className="detail-grid">
              <div className="profile-card panel">
                <div className="panel-heading">
                  <div><p className="eyebrow"><Mountain size={14} /> Day {selectedDay.order}</p><h2>Elevation profile</h2></div>
                  <div className="climb-summary"><span><ArrowUp /> {climbing.ascent.toLocaleString()} m</span><span><ArrowDown /> {climbing.descent.toLocaleString()} m</span></div>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -16 }}>
                      <defs><linearGradient id="elevationFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e97651" stopOpacity=".44"/><stop offset="100%" stopColor="#e97651" stopOpacity=".05"/></linearGradient></defs>
                      <CartesianGrid stroke="#dbe3df" strokeDasharray="3 5" vertical={false} />
                      <XAxis dataKey="dayKm" type="number" domain={[0, Math.ceil(dayDistance)]} unit=" km" tick={{ fontSize: 11, fill: "#66756f" }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="elevationM" unit=" m" tick={{ fontSize: 11, fill: "#66756f" }} axisLine={false} tickLine={false} width={56} />
                      <Tooltip content={<ElevationTooltip />} cursor={{ stroke: "#183f35", strokeWidth: 1 }} />
                      <Area type="monotone" dataKey="elevationM" stroke="#dd6744" strokeWidth={2.5} fill="url(#elevationFill)" animationDuration={600} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="chart-note">Move across the profile to inspect distance and elevation. Bundled elevation is illustrative until a GPX with elevation is imported.</p>
              </div>

              <aside className="day-summary panel">
                <div className="summary-route">
                  {startLocation && <a href={googleMapsUrl(startLocation)} target="_blank" rel="noreferrer" aria-label={`Open ${selectedDay.startName} in Google Maps`}><MapPin />{selectedDay.startName}<ExternalLink /></a>}
                  <div><i /><i /><i /></div>
                  {endLocation && <a href={googleMapsUrl(endLocation)} target="_blank" rel="noreferrer" aria-label={`Open ${selectedDay.endName} in Google Maps`}><MapPin />{selectedDay.endName}<ExternalLink /></a>}
                </div>
                <div className="summary-stats"><div><span>Distance</span><strong>{formatKm(dayDistance)}</strong></div><div><span>Highest point</span><strong>{Math.max(...dayPoints.map((point) => point.elevationM))} m</strong></div></div>
                <button className="secondary-button" onClick={() => { openDayEditor("edit", selectedDay); setTab("plan"); }}><Pencil size={16} /> Edit this day</button>
              </aside>
            </section>
          </>
        )}

        {tab === "track" && !selectedDay && (
          <section className="empty-state"><Footprints /><h1>No walking days planned</h1><p>Add your first section to start tracking progress.</p><button className="primary-button" onClick={() => { setTab("plan"); openNewDay(); }}><Plus size={18} /> Add first day</button></section>
        )}

        {tab === "plan" && (
          <section className="workspace-section">
            <div className="section-heading"><div><p className="eyebrow"><CalendarDays size={14} /> Your itinerary</p><h1>Planned walking days</h1><p>Choose named points along the route. Each day is saved on this device.</p></div><button className="primary-button" onClick={openNewDay}><Plus size={18} /> Add a day</button></div>
            <div className="days-list">
              {days.map((day) => {
                const distance = dayDistanceKm(day);
                return <article className={`day-row ${selectedId === day.id ? "selected" : ""}`} key={day.id}>
                  <button className="day-main" onClick={() => { setSelectedId(day.id); setTab("track"); }}>
                    <span className="day-number">{String(day.order).padStart(2, "0")}</span>
                    <span className="day-copy"><small>{formatDate(day.date)}</small><strong>{day.startName} <ArrowRight /> {day.endName}</strong></span>
                    <span className="day-distance"><strong>{distance.toFixed(1)}</strong><small>km</small></span><ChevronRight />
                  </button>
                  <div className="row-actions"><button aria-label={`Edit day ${day.order}`} onClick={() => openDayEditor("edit", day)}><Pencil size={17} /></button><button aria-label={`Delete day ${day.order}`} onClick={() => deleteDay(day)}><Trash2 size={17} /></button></div>
                </article>;
              })}
            </div>
            {!days.length && <div className="empty-state"><MapPin /><h2>Plan your first walking day</h2><p>Pick a start and end point on the trail.</p><button className="primary-button" onClick={openNewDay}><Plus size={18} /> Add first day</button></div>}
          </section>
        )}

        {tab === "data" && (
          <section className="workspace-section">
            <div className="section-heading"><div><p className="eyebrow"><RouteIcon size={14} /> Route library</p><h1>Offline trail data</h1><p>The route is stored in IndexedDB on this iPhone after the first visit.</p></div></div>
            <div className="data-grid">
              <article className="data-card panel"><span className="data-icon"><RouteIcon /></span><p className="eyebrow">Active route</p><h2>{route.name}</h2><dl><div><dt>Route length</dt><dd>{formatKm(route.officialDistanceKm, 0)}</dd></div><div><dt>Route points</dt><dd>{route.points.filter(Boolean).length.toLocaleString()}</dd></div><div><dt>Geometry</dt><dd>{route.geometrySource}</dd></div><div><dt>Elevation</dt><dd>{route.elevationSource}</dd></div></dl></article>
              <article className="import-card panel"><span className="data-icon coral"><FileUp /></span><p className="eyebrow">Bring your own data</p><h2>Import a GPX route</h2><p>A GPX track with elevation replaces the bundled route and powers the profile, GPS progress and coordinate matching — entirely on this device.</p><label className="primary-button file-button"><FileUp size={18} /> Choose GPX file<input type="file" accept=".gpx,application/gpx+xml" onChange={(event) => handleImport(event.target.files?.[0])} /></label><button className="text-button" onClick={restoreBundled}>Restore bundled SWCP route</button></article>
            </div>
            <div className="offline-explainer"><CloudOff /><div><strong>Designed for patchy coastal signal</strong><p>Plans, route geometry, elevation profiles, coordinates and GPS calculations work offline after the app is prepared.</p></div></div>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        <NavButton active={tab === "track"} onClick={() => setTab("track")} icon={<Navigation />} label="Track" />
        <NavButton active={tab === "plan"} onClick={() => setTab("plan")} icon={<CalendarDays />} label="Plan" />
        <NavButton active={tab === "data"} onClick={() => setTab("data")} icon={<RouteIcon />} label="Route" />
      </nav>

      {editor && route && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}>
          <section className="day-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
            <div className="editor-heading"><div><p className="eyebrow">Day {editor.day.order}</p><h2 id="editor-title">{editor.mode === "new" ? "Plan a walking day" : "Edit walking day"}</h2></div><button className="close-button" onClick={() => setEditor(null)} aria-label="Close editor"><X /></button></div>
            <label>Date (optional)<input type="date" value={editor.day.date} onChange={(event) => setEditor({ ...editor, day: { ...editor.day, date: event.target.value } })} /></label>
            <label>Start point<select value={editor.day.startName} onChange={(event) => chooseCheckpoint("start", event.target.value)}>{!route.checkpoints.some((point) => point.name === editor.day.startName) && <option value={editor.day.startName}>{editor.day.startName}</option>}{route.checkpoints.map((point) => <option key={`s-${point.name}`} value={point.name}>{point.name} · {point.distanceKm.toFixed(1)} km</option>)}</select></label>
            <label className="distance-control"><span><b>Fine-tune start</b><em>{editor.day.startDistanceKm.toFixed(1)} km along trail</em></span><input type="range" min="0" max={route.officialDistanceKm} step="0.1" value={editor.day.startDistanceKm} onChange={(event) => fineTuneBoundary("start", Number(event.target.value))} /></label>
            <CoordinateMatcher field="start" drafts={coordinateDrafts} setDrafts={setCoordinateDrafts} message={coordinateMessages.start} onMatch={() => matchCoordinates("start")} />
            <label>Start location name<input type="text" placeholder="For example: The harbour steps" value={editor.day.startName} onChange={(event) => setEditor({ ...editor, day: renameDayLocation(editor.day, "start", event.target.value) })} /></label>
            {editor.day.order > 1 && <button className="copy-button" onClick={usePreviousEnd}><ArrowDown size={16} /> Start where the previous day ended</button>}
            <label>End point<select value={editor.day.endName} onChange={(event) => chooseCheckpoint("end", event.target.value)}>{!route.checkpoints.some((point) => point.name === editor.day.endName) && <option value={editor.day.endName}>{editor.day.endName}</option>}{route.checkpoints.map((point) => <option key={`e-${point.name}`} value={point.name}>{point.name} · {point.distanceKm.toFixed(1)} km</option>)}</select></label>
            <label className="distance-control"><span><b>Fine-tune end</b><em>{editor.day.endDistanceKm.toFixed(1)} km along trail</em></span><input type="range" min="0" max={route.officialDistanceKm} step="0.1" value={editor.day.endDistanceKm} onChange={(event) => fineTuneBoundary("end", Number(event.target.value))} /></label>
            <CoordinateMatcher field="end" drafts={coordinateDrafts} setDrafts={setCoordinateDrafts} message={coordinateMessages.end} onMatch={() => matchCoordinates("end")} />
            <label>End location name<input type="text" placeholder="For example: Café by the beach" value={editor.day.endName} onChange={(event) => setEditor({ ...editor, day: renameDayLocation(editor.day, "end", event.target.value) })} /></label>
            <div className="editor-preview"><span>Planned distance</span><strong>{Math.max(0, editor.day.endDistanceKm - editor.day.startDistanceKm).toFixed(1)} km</strong></div>
            <div className="editor-actions"><button className="secondary-button" onClick={() => setEditor(null)}>Cancel</button><button className="primary-button" onClick={saveDay}><Check size={17} /> Save day offline</button></div>
          </section>
        </div>
      )}

      {notice && <button className="toast" onClick={() => setNotice("")}><Check size={17} /><span>{notice}</span><X size={15} /></button>}
    </div>
  );
}

function Metric({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent: string }) {
  return <article className="metric-card"><span className={`metric-icon ${accent}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong><small>{sub}</small></div></article>;
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function ElevationTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { dayKm: number; elevationM: number } }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="elevation-tooltip"><strong>{point.elevationM} m</strong><span>{point.dayKm.toFixed(1)} km into day</span></div>;
}

function CoordinateMatcher({ field, drafts, setDrafts, message, onMatch }: {
  field: "start" | "end";
  drafts: CoordinateDrafts;
  setDrafts: React.Dispatch<React.SetStateAction<CoordinateDrafts>>;
  message: string;
  onMatch: () => void;
}) {
  const title = field === "start" ? "Start" : "End";
  const latKey = `${field}Lat` as keyof CoordinateDrafts;
  const lngKey = `${field}Lng` as keyof CoordinateDrafts;
  return <div className="coordinate-method">
    <div className="coordinate-method-heading"><span><MapPin size={15} /> Or use coordinates</span><small>Matched locally to the nearest path point</small></div>
    <div className="coordinate-fields">
      <label>{title} latitude<input aria-label={`${title} latitude`} inputMode="decimal" type="number" min="-90" max="90" step="any" value={drafts[latKey]} onChange={(event) => setDrafts((values) => ({ ...values, [latKey]: event.target.value }))} /></label>
      <label>{title} longitude<input aria-label={`${title} longitude`} inputMode="decimal" type="number" min="-180" max="180" step="any" value={drafts[lngKey]} onChange={(event) => setDrafts((values) => ({ ...values, [lngKey]: event.target.value }))} /></label>
      <button className="coordinate-match-button" onClick={onMatch}><MapPin size={16} /> Match to trail</button>
    </div>
    {message && <p className={message.startsWith("Matched") ? "coordinate-result success" : "coordinate-result"}>{message}</p>}
  </div>;
}

async function prepareOfflineApp(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    const readyRegistration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Service worker timeout")), 8000)),
    ]);
    const worker = readyRegistration.active ?? registration.active;
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

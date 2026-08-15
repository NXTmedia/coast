"use client";

import { useEffect, useRef } from "react";
import {
  AttributionControl, LngLatBounds, Map as MapLibreMap, NavigationControl,
  type GeoJSONSource, type StyleSpecification,
} from "maplibre-gl";
import type { MatchedPosition, RoutePoint, TrailRoute, WalkingDay } from "../types";
import { routeLines, routePointAt } from "../lib/route";

type Props = {
  route: TrailRoute;
  day: WalkingDay;
  gps: GeolocationCoordinates | null;
  matched: MatchedPosition | null;
  hoverPoint: RoutePoint | null;
};

const lineCollection = (lines: number[][][]) => ({
  type: "FeatureCollection" as const,
  features: lines.map((coordinates) => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates },
  })),
});

const pointCollection = (points: Array<{ coordinates: [number, number]; kind: string }>) => ({
  type: "FeatureCollection" as const,
  features: points.map((point) => ({
    type: "Feature" as const,
    properties: { kind: point.kind },
    geometry: { type: "Point" as const, coordinates: point.coordinates },
  })),
});

const style: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    { id: "fallback", type: "background", paint: { "background-color": "#dce8df" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.92 } },
  ],
};

export function CoastMap({ route, day, gps, matched, hoverPoint }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const lastDayRef = useRef("");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style,
      center: [-3.63, 51.20],
      zoom: 9,
      attributionControl: false,
      cooperativeGestures: true,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.on("load", () => {
      map.addSource("trail", { type: "geojson", data: lineCollection(routeLines(route.points)) });
      map.addLayer({
        id: "trail-shadow", type: "line", source: "trail",
        paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.72 },
      });
      map.addLayer({
        id: "trail-line", type: "line", source: "trail",
        paint: { "line-color": "#215c4c", "line-width": 3, "line-opacity": 0.8 },
      });
      map.addSource("day", { type: "geojson", data: lineCollection(routeLines(route.points, day.startDistanceKm, day.endDistanceKm)) });
      map.addLayer({
        id: "day-line", type: "line", source: "day",
        paint: { "line-color": "#ee7650", "line-width": 6, "line-opacity": 1 },
      });
      map.addSource("positions", { type: "geojson", data: pointCollection([]) });
      map.addLayer({
        id: "position-halo", type: "circle", source: "positions",
        filter: ["==", ["get", "kind"], "gps"],
        paint: { "circle-radius": 13, "circle-color": "#2387f0", "circle-opacity": 0.18 },
      });
      map.addLayer({
        id: "positions", type: "circle", source: "positions",
        paint: {
          "circle-radius": ["match", ["get", "kind"], "gps", 7, "matched", 5, "hover", 6, 5],
          "circle-color": ["match", ["get", "kind"], "gps", "#2387f0", "matched", "#f2b83d", "hover", "#142c27", "#ffffff"],
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 2,
        },
      });
      fitDay(map, route, day);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource("trail") as GeoJSONSource | undefined)?.setData(lineCollection(routeLines(route.points)));
    (map.getSource("day") as GeoJSONSource | undefined)?.setData(lineCollection(routeLines(route.points, day.startDistanceKm, day.endDistanceKm)));
    if (lastDayRef.current !== day.id) {
      lastDayRef.current = day.id;
      fitDay(map, route, day);
    }
  }, [route, day]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const start = routePointAt(route, day.startDistanceKm);
    const end = routePointAt(route, day.endDistanceKm);
    const positions: Array<{ coordinates: [number, number]; kind: string }> = [];
    if (start) positions.push({ coordinates: [start.lng, start.lat], kind: "endpoint" });
    if (end) positions.push({ coordinates: [end.lng, end.lat], kind: "endpoint" });
    if (gps) positions.push({ coordinates: [gps.longitude, gps.latitude], kind: "gps" });
    if (matched) positions.push({ coordinates: [matched.lng, matched.lat], kind: "matched" });
    if (hoverPoint) positions.push({ coordinates: [hoverPoint.lng, hoverPoint.lat], kind: "hover" });
    (map.getSource("positions") as GeoJSONSource | undefined)?.setData(pointCollection(positions));
  }, [route, day, gps, matched, hoverPoint]);

  return <div ref={containerRef} className="map-canvas" aria-label="Map of the South West Coast Path" />;
}

function fitDay(map: MapLibreMap, route: TrailRoute, day: WalkingDay) {
  const lines = routeLines(route.points, day.startDistanceKm, day.endDistanceKm);
  const coordinates = lines.flat();
  if (!coordinates.length) return;
  const bounds = coordinates.reduce(
    (box, coordinate) => box.extend(coordinate as [number, number]),
    new LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number]),
  );
  map.fitBounds(bounds, { padding: { top: 58, right: 38, bottom: 58, left: 38 }, duration: 700, maxZoom: 13 });
}

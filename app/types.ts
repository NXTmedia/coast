export type RoutePoint = {
  lng: number;
  lat: number;
  elevationM: number;
  distanceKm: number;
};

export type Checkpoint = {
  name: string;
  lng: number;
  lat: number;
  distanceKm: number;
};

export type TrailRoute = {
  id: string;
  name: string;
  officialDistanceKm: number;
  generatedAt: string;
  elevationSource: string;
  geometrySource: string;
  points: Array<RoutePoint | null>;
  checkpoints: Checkpoint[];
};

export type WalkingDay = {
  id: string;
  order: number;
  date: string;
  breakAfter?: boolean;
  startName: string;
  endName: string;
  startDistanceKm: number;
  endDistanceKm: number;
  startCoordinate?: CoordinateMatch;
  endCoordinate?: CoordinateMatch;
};

export type CoordinateMatch = {
  lat: number;
  lng: number;
  offRouteM: number;
};

export type MatchedPosition = {
  lng: number;
  lat: number;
  distanceKm: number;
  offRouteM: number;
};

export type GpsReading = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
};

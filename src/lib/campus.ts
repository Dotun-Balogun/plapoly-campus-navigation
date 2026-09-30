import {
  Building2,
  Church,
  Coffee,
  DoorOpen,
  GraduationCap,
  HeartPulse,
  BookOpen,
  MapPin,
  Users,
  type LucideIcon,
} from "lucide-react";

export type CampusCategory =
  | "school"
  | "office"
  | "facility"
  | "hall"
  | "entrance"
  | "church"
  | "cafe"
  | "medical"
  | "library"
  | "other";

export interface CampusLocation {
  id: string;
  name: string;
  description: string | null;
  category: CampusCategory | string;
  building: string | null;
  floor: string | null;
  latitude: number;
  longitude: number;
  image_url?: string | null;
  /** If set, this location is a department/unit that belongs to the School with this id. Top-level Schools and every other location leave this null. */
  parent_id?: string | null;
}

export interface NavNode {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  floor?: string | null;
  type?: string | null;
}

export interface NavEdge {
  id: string;
  from_node: string;
  to_node: string;
  distance: number;
  accessible?: boolean;
  has_stairs?: boolean;
}

export const CAMPUS_CENTER: [number, number] = [9.5336, 8.9003];

export const CATEGORY_LABELS: Record<string, string> = {
  school: "School / Academic",
  office: "Office",
  facility: "Facility",
  hall: "Lecture hall",
  entrance: "Entrance",
  church: "Church",
  cafe: "Café",
  medical: "Medical centre",
  library: "Library",
  other: "Other",
};

/** Icon + colour per category, shared by the map pins, the quick-filter buttons and the admin dropdown, so they always stay in sync with each other. */
export const CATEGORY_STYLES: Record<string, { icon: LucideIcon; color: string }> = {
  school: { icon: GraduationCap, color: "#7a0b1e" },
  office: { icon: Building2, color: "#2563eb" },
  facility: { icon: MapPin, color: "#16a34a" },
  hall: { icon: Users, color: "#7c3aed" },
  entrance: { icon: DoorOpen, color: "#0f766e" },
  church: { icon: Church, color: "#92400e" },
  cafe: { icon: Coffee, color: "#b45309" },
  medical: { icon: HeartPulse, color: "#dc2626" },
  library: { icon: BookOpen, color: "#4338ca" },
  other: { icon: MapPin, color: "#6b7280" },
};

export function categoryStyle(category: string) {
  return CATEGORY_STYLES[category] ?? CATEGORY_STYLES.other;
}

/** Departments/units that belong to a given School (or any parent location). */
export function childrenOf(locations: CampusLocation[], parentId: string): CampusLocation[] {
  return locations.filter((l) => l.parent_id === parentId);
}

/** Metres between two coordinates (equirectangular approximation, fine for a campus). */
export function metresBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const latRad = (a.latitude * Math.PI) / 180;
  const dx = (b.longitude - a.longitude) * Math.cos(latRad);
  const dy = b.latitude - a.latitude;
  return Math.round(111320 * Math.sqrt(dx * dx + dy * dy));
}

/** Dijkstra shortest path over the campus graph. Returns the ordered node list. */
export function shortestPath(
  nodes: NavNode[],
  edges: NavEdge[],
  startId: string,
  endId: string,
): { path: NavNode[]; distance: number } | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (!byId.has(startId) || !byId.has(endId)) return null;

  const neighbours = new Map<string, { to: string; weight: number }[]>();
  const push = (from: string, to: string, weight: number) => {
    const list = neighbours.get(from) ?? [];
    list.push({ to, weight });
    neighbours.set(from, list);
  };
  for (const edge of edges) {
    const weight = edge.distance > 0 ? edge.distance : 1;
    push(edge.from_node, edge.to_node, weight);
    push(edge.to_node, edge.from_node, weight);
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  for (const node of nodes) dist.set(node.id, Infinity);
  dist.set(startId, 0);

  while (visited.size < nodes.length) {
    let current: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        current = id;
      }
    }
    if (current === null) break;
    if (current === endId) break;
    visited.add(current);

    for (const { to, weight } of neighbours.get(current) ?? []) {
      if (visited.has(to)) continue;
      const candidate = best + weight;
      if (candidate < (dist.get(to) ?? Infinity)) {
        dist.set(to, candidate);
        prev.set(to, current);
      }
    }
  }

  const total = dist.get(endId);
  if (total === undefined || total === Infinity) return null;

  const path: NavNode[] = [];
  let cursor: string | undefined = endId;
  while (cursor) {
    const node = byId.get(cursor);
    if (node) path.unshift(node);
    cursor = prev.get(cursor);
  }
  return { path, distance: Math.round(total) };
}

/** Closest navigation node to a location — lets any location be routed to. */
export function nearestNode(nodes: NavNode[], location: CampusLocation): NavNode | null {
  let best: NavNode | null = null;
  let bestDistance = Infinity;
  for (const node of nodes) {
    const d = metresBetween(location, node);
    if (d < bestDistance) {
      bestDistance = d;
      best = node;
    }
  }
  return best;
}

/** Compass bearing in degrees (0 = north, clockwise) from a to b. Shared by the map's route arrows and the turn-by-turn step list, so both always agree. */
export function bearing(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

const COMPASS_WORDS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** 0-360 bearing -> "north", "north-east", etc, for a plain-English turn instruction. */
export function compassWord(bearingDeg: number): string {
  const index = Math.round(bearingDeg / 45) % 8;
  return COMPASS_WORDS[index];
}

export interface RouteStep {
  instruction: string;
  distance: number;
}

/** Turns a raw node path into a Google-style "Head north for 90m, then continue toward X" list. Consecutive legs heading the same rough direction are merged so it doesn't announce every tiny graph node as its own turn. */
export function buildRouteSteps(path: NavNode[]): RouteStep[] {
  if (path.length < 2) return [];

  const legs = path.slice(1).map((node, i) => ({
    node,
    distance: metresBetween(path[i], node),
    bearing: bearing(path[i], node),
  }));

  const steps: RouteStep[] = [];
  let current = { ...legs[0] };

  const angleDiff = (a: number, b: number) => {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
  };

  for (let i = 1; i < legs.length; i += 1) {
    const leg = legs[i];
    if (angleDiff(leg.bearing, current.bearing) < 25) {
      current.distance += leg.distance;
      current.node = leg.node;
      current.bearing = leg.bearing;
    } else {
      steps.push({
        instruction: `Head ${compassWord(current.bearing)} toward ${current.node.name}`,
        distance: current.distance,
      });
      current = { ...leg };
    }
  }
  steps.push({
    instruction: `Head ${compassWord(current.bearing)} toward ${current.node.name}`,
    distance: current.distance,
  });

  const last = path[path.length - 1];
  steps.push({ instruction: `Arrive at ${last.name}`, distance: 0 });
  return steps;
}

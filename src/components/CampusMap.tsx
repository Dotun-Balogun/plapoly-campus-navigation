import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { bearing, CAMPUS_CENTER, categoryStyle, type CampusLocation, type NavNode } from "@/lib/campus";

interface CampusMapProps {
  locations: CampusLocation[];
  selectedId?: string | null;
  routePath?: NavNode[];
  currentPosition?: [number, number] | null;
  onSelect?: (location: CampusLocation) => void;
}

/** Zoom level from which a building's own photo replaces its plain category dot — this is what makes zooming in feel like Google Maps' photo pins for places. */
const PHOTO_PIN_ZOOM = 17;

/** A pin coloured and iconed per category (school, office, facility, church, cafe, medical, library...) so the map reads at a glance, like Google Maps' place-type pins. */
const categoryPinIcon = (category: string, active: boolean) => {
  const { icon: Icon, color } = categoryStyle(category);
  const size = active ? 32 : 26;
  const glyph = renderToStaticMarkup(<Icon color="#fff" size={active ? 15 : 12} strokeWidth={2.5} />);
  return L.divIcon({
    className: "plapoly-pin",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;border:3px solid #fff;background:${color};box-shadow:0 1px 6px rgba(0,0,0,.45)">${glyph}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

/** A round photo pin with a little pointer tail — shown once you're zoomed in close enough on a building that has a photo, same idea as Google Maps' place-photo pins. */
const photoPinIcon = (imageUrl: string, active: boolean) => {
  const size = active ? 58 : 46;
  return L.divIcon({
    className: "plapoly-photo-pin",
    html: `
      <span style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 5px rgba(0,0,0,.45))">
        <span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;border:3px solid #fff;background:#e5e7eb center/cover no-repeat url('${imageUrl}')"></span>
        <span style="display:block;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #fff;margin-top:-2px"></span>
      </span>`,
    iconSize: [size, size + 9],
    iconAnchor: [size / 2, size + 9],
  });
};

/** Tracks the map's current zoom so markers can switch to photo pins once you're close enough. */
function useMapZoom() {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  return zoom;
}

function LocationMarkers({
  locations,
  selectedId,
  onSelect,
}: {
  locations: CampusLocation[];
  selectedId?: string | null;
  onSelect?: (location: CampusLocation) => void;
}) {
  const zoom = useMapZoom();
  const showPhotos = zoom >= PHOTO_PIN_ZOOM;

  return (
    <>
      {locations.map((location) => {
        const active = location.id === selectedId;
        const icon =
          showPhotos && location.image_url ? photoPinIcon(location.image_url, active) : categoryPinIcon(location.category, active);
        return (
          <Marker
            key={location.id}
            position={[location.latitude, location.longitude]}
            icon={icon}
            eventHandlers={{ click: () => onSelect?.(location) }}
          >
            <Popup>
              <strong>{location.name}</strong>
              {location.building ? <div>{location.building}</div> : null}
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

/** Start/end pins for a route — only A and B get a marker, like Google Maps. Junctions in between are just the line's shape, not stops of their own. */
const routeEndpointIcon = (kind: "start" | "end") => {
  const color = kind === "start" ? "#15803d" : "#c8102e";
  const label = kind === "start" ? "A" : "B";
  return L.divIcon({
    className: "plapoly-waypoint",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;border:3px solid #fff;background:${color};color:#fff;font-size:12px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.45)">${label}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};

/** A small chevron rotated to face the direction of travel, placed at a segment's midpoint — this is what tells a first-time user "the route flows this way" instead of them having to read a bare line. */
const directionArrowIcon = (bearingDeg: number) =>
  L.divIcon({
    className: "plapoly-arrow",
    html: `<span style="display:block;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:11px solid #7a0b1e;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));transform:rotate(${bearingDeg}deg)"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

function MapFocus({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 17), { duration: 0.8 });
  }, [target, map]);
  return null;
}

function RouteFit({ path }: { path: NavNode[] }) {
  const map = useMap();
  useEffect(() => {
    if (path.length > 1) {
      map.fitBounds(
        L.latLngBounds(path.map((n) => [n.latitude, n.longitude] as [number, number])),
        { padding: [48, 48] },
      );
    }
  }, [path, map]);
  return null;
}

export default function CampusMap({
  locations,
  selectedId,
  routePath = [],
  currentPosition = null,
  onSelect,
}: CampusMapProps) {
  const selected = locations.find((l) => l.id === selectedId) ?? null;

  return (
    <MapContainer
      center={CAMPUS_CENTER}
      zoom={16}
      scrollWheelZoom
      zoomControl={false}
      className="campus-map h-full w-full"
      style={{ background: "var(--color-muted)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <LocationMarkers locations={locations} selectedId={selectedId} onSelect={onSelect} />

      {routePath.length > 1 ? (
        <>
          {/* White casing under the colour line so the route reads clearly against any tile colour — same trick Google Maps uses. */}
          <Polyline
            positions={routePath.map((n) => [n.latitude, n.longitude] as [number, number])}
            pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.95, lineCap: "round", lineJoin: "round" }}
          />
          <Polyline
            positions={routePath.map((n) => [n.latitude, n.longitude] as [number, number])}
            pathOptions={{ color: "#c8102e", weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round" }}
          />

          {/* Direction chevrons at each segment midpoint, instead of a numbered dot at every junction. */}
          {routePath.slice(0, -1).map((node, index) => {
            const next = routePath[index + 1];
            const midLat = (node.latitude + next.latitude) / 2;
            const midLng = (node.longitude + next.longitude) / 2;
            return (
              <Marker
                key={`arrow-${node.id}-${next.id}`}
                position={[midLat, midLng]}
                icon={directionArrowIcon(bearing(node, next))}
                interactive={false}
                keyboard={false}
              />
            );
          })}

          <Marker position={[routePath[0].latitude, routePath[0].longitude]} icon={routeEndpointIcon("start")}>
            <Popup>
              <strong>Start: {routePath[0].name}</strong>
            </Popup>
          </Marker>
          <Marker
            position={[routePath[routePath.length - 1].latitude, routePath[routePath.length - 1].longitude]}
            icon={routeEndpointIcon("end")}
          >
            <Popup>
              <strong>Destination: {routePath[routePath.length - 1].name}</strong>
            </Popup>
          </Marker>
        </>
      ) : null}

      {currentPosition ? (
        <>
          <Circle center={currentPosition} radius={34} pathOptions={{ color: "#1a73e8", fillColor: "#1a73e8", fillOpacity: 0.12, weight: 1 }} />
          <Marker
            position={currentPosition}
            icon={L.divIcon({
              className: "plapoly-you-are-here",
              html: `<span class="plapoly-pulse-ring"></span><span style="position:relative;display:block;width:16px;height:16px;border-radius:9999px;border:3px solid #fff;background:#1a73e8;box-shadow:0 1px 6px rgba(0,0,0,.45)"></span>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            })}
            zIndexOffset={1000}
          >
            <Popup>You are here</Popup>
          </Marker>
        </>
      ) : null}

      <MapFocus target={selected ? [selected.latitude, selected.longitude] : currentPosition} />
      <RouteFit path={routePath} />
    </MapContainer>
  );
}

import { useQuery } from "@tanstack/react-query";
import { ClientOnly, Link, createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  Compass,
  Crosshair,
  Layers3,
  MapPin,
  Navigation,
  Search,
  Share2,
  ShieldCheck,
  X,
} from "lucide-react";
import { Suspense, lazy, useMemo, useState } from "react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import previewCafeteria from "@/assets/preview-cafeteria.jpg";
import previewIct from "@/assets/preview-ict.jpg";
import previewLibrary from "@/assets/preview-library.jpg";
import previewMainGate from "@/assets/preview-main-gate.jpg";
import {
  CATEGORY_LABELS,
  buildRouteSteps,
  categoryStyle,
  childrenOf,
  type CampusLocation,
  type NavEdge,
  type NavNode,
  nearestNode,
  shortestPath,
} from "@/lib/campus";
import { edgesQuery, locationsQuery, nodesQuery } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase";

const CampusMap = lazy(() => import("@/components/CampusMap"));

const QUICK_FILTERS: { category: string; label: string }[] = [
  { category: "school", label: "Schools" },
  { category: "facility", label: "Facilities" },
  { category: "office", label: "Offices" },
  { category: "church", label: "Churches" },
  { category: "cafe", label: "Cafés" },
  { category: "medical", label: "Medical" },
  { category: "library", label: "Library" },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PLAPOLYNAV — Plateau State Polytechnic, Barkin Ladi" },
      {
        name: "description",
        content: "Explore Plateau State Polytechnic, Barkin Ladi, and preview walking routes across campus.",
      },
      { property: "og:title", content: "PLAPOLYNAV — Plateau State Polytechnic, Barkin Ladi" },
      { property: "og:description", content: "Search campus places and follow clear walking routes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const PREVIEW_LOCATIONS: CampusLocation[] = [
  { id: "preview-gate", name: "Main Gate", description: "Primary campus entrance", category: "entrance", building: "Gate House", floor: "ground", latitude: 9.5322, longitude: 8.8992, image_url: previewMainGate },
  { id: "preview-ict", name: "School of ICT", description: "Departments in information and communication technology", category: "school", building: "ICT Building", floor: "ground", latitude: 9.534, longitude: 8.9016, image_url: previewIct, parent_id: null },
  { id: "preview-cs", name: "Computer Science Department", description: "Computer Science lecture and lab building", category: "school", building: "ICT Building", floor: "1st floor", latitude: 9.5342, longitude: 8.9019, image_url: previewIct, parent_id: "preview-ict" },
  { id: "preview-libsci", name: "Library Science Department", description: "Library and Information Science", category: "school", building: "ICT Building", floor: "2nd floor", latitude: 9.5338, longitude: 8.9019, image_url: previewIct, parent_id: "preview-ict" },
  { id: "preview-library", name: "Main Library", description: "Central library and reading rooms", category: "facility", building: "Library Building", floor: "ground", latitude: 9.5344, longitude: 8.8978, image_url: previewLibrary },
  { id: "preview-cafe", name: "Cafeteria", description: "Student cafeteria", category: "cafe", building: "Student Centre", floor: "ground", latitude: 9.5329, longitude: 8.9006, image_url: previewCafeteria },
];

const PREVIEW_NODES: NavNode[] = [
  { id: "pn1", name: "Main Gate", latitude: 9.5322, longitude: 8.8992 },
  { id: "pn2", name: "Central Junction", latitude: 9.5334, longitude: 8.9 },
  { id: "pn3", name: "Library Walk", latitude: 9.534, longitude: 8.899 },
  { id: "pn4", name: "Main Library", latitude: 9.5344, longitude: 8.8978 },
  { id: "pn5", name: "ICT Walk", latitude: 9.5337, longitude: 8.9012 },
  { id: "pn6", name: "School of ICT", latitude: 9.534, longitude: 8.9016 },
  { id: "pn7", name: "Computer Science Department", latitude: 9.5342, longitude: 8.9019 },
  { id: "pn8", name: "Library Science Department", latitude: 9.5338, longitude: 8.9019 },
];

const PREVIEW_EDGES: NavEdge[] = [
  { id: "pe1", from_node: "pn1", to_node: "pn2", distance: 154 },
  { id: "pe2", from_node: "pn2", to_node: "pn3", distance: 112 },
  { id: "pe3", from_node: "pn3", to_node: "pn4", distance: 138 },
  { id: "pe4", from_node: "pn2", to_node: "pn5", distance: 96 },
  { id: "pe5", from_node: "pn5", to_node: "pn6", distance: 58 },
  { id: "pe6", from_node: "pn6", to_node: "pn7", distance: 40 },
  { id: "pe7", from_node: "pn6", to_node: "pn8", distance: 35 },
];

function MapSkeleton() {
  return <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">Loading map…</div>;
}

function HomePage() {
  const { data: liveLocations = [] } = useQuery(locationsQuery());
  const { data: liveNodes = [] } = useQuery(nodesQuery());
  const { data: liveEdges = [] } = useQuery(edgesQuery());
  const [preview, setPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CampusLocation | null>(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
  const [locationMessage, setLocationMessage] = useState("");

  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<Event & { prompt?: () => void; userChoice?: Promise<unknown> } | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem("plapolynav-guide-seen")) return;
    window.localStorage.setItem("plapolynav-guide-seen", "true");
    setPreview(true);
    setSelected(PREVIEW_LOCATIONS.find((l) => l.id === "preview-ict") ?? null);
    setDirectionsOpen(true);
    setFromId("preview-gate");
    setToId("preview-cs");
  }, []);

  // Branded boot splash — a beat of brand before the map takes over, the way a native app would.
  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 650);
    const removeTimer = setTimeout(() => setShowSplash(false), 1050);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  // Android/Chrome: capture the native "install this app" event so we can offer it ourselves.
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
      if (!window.localStorage.getItem("plapolynav-install-dismissed")) {
        setShowInstallBanner(true);
      }
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // iOS/Safari doesn't fire beforeinstallprompt at all, so it needs its own one-time instructions.
  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const isStandalone = nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    if (isIos && !isStandalone && !window.localStorage.getItem("plapolynav-ios-install-seen")) {
      setShowIosInstallHint(true);
    }
  }, []);

  const handleInstallClick = async () => {
    if (!installPromptEvent?.prompt) return;
    installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
    setShowInstallBanner(false);
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    window.localStorage.setItem("plapolynav-install-dismissed", "true");
  };

  const dismissIosHint = () => {
    setShowIosInstallHint(false);
    window.localStorage.setItem("plapolynav-ios-install-seen", "true");
  };

  const locations = preview ? PREVIEW_LOCATIONS : liveLocations;
  const nodes = preview ? PREVIEW_NODES : liveNodes;
  const edges = preview ? PREVIEW_EDGES : liveEdges;

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return locations.filter((location) =>
      [location.name, location.building, location.category, location.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    ).slice(0, 6);
  }, [locations, search]);

  const route = useMemo(() => {
    const from = locations.find((location) => location.id === fromId);
    const to = locations.find((location) => location.id === toId);
    if (!from || !to) return null;
    const startNode = nearestNode(nodes, from);
    const endNode = nearestNode(nodes, to);
    if (!startNode || !endNode) return null;
    const result = startNode.id === endNode.id ? { path: [startNode], distance: 0 } : shortestPath(nodes, edges, startNode.id, endNode.id);
    return result ? { ...result, from, to } : null;
  }, [locations, nodes, edges, fromId, toId]);

  /** Departments/units under the currently selected School, e.g. tapping "School of ICT" lists Computer Science, Library Science, ... */
  const departments = useMemo(
    () => (selected ? childrenOf(locations, selected.id) : []),
    [locations, selected],
  );

  const [navigating, setNavigating] = useState(false);
  const steps = useMemo(() => (route ? buildRouteSteps(route.path) : []), [route]);

  // A fresh from/to pick should always land back on the route summary, not stale turn-by-turn steps from a previous trip.
  useEffect(() => {
    setNavigating(false);
  }, [fromId, toId]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCurrentPosition([coords.latitude, coords.longitude]);
        setLocationMessage("Showing your current location");
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationMessage(
            "Location access is off, so we can't show where you are. You can turn it on in your browser or phone settings — search and directions still work fine without it.",
          );
        } else {
          setLocationMessage("Couldn't get your location right now — you can still search and get directions.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const togglePreview = () => {
    const next = !preview;
    setPreview(next);
    setSelected(null);
    setSearch("");
    setDirectionsOpen(next);
    setFromId(next ? "preview-gate" : "");
    setToId(next ? "preview-cs" : "");
    setSelected(next ? (PREVIEW_LOCATIONS.find((l) => l.id === "preview-ict") ?? null) : null);
  };

  const selectLocation = (location: CampusLocation) => {
    setSelected(location);
    setSearch("");
  };

  return (
    <div className="relative h-dvh min-h-[560px] overflow-hidden bg-background text-foreground">
      {showSplash ? (
        <div
          className={`fixed inset-0 z-[900] flex flex-col items-center justify-center gap-3 bg-white transition-opacity duration-500 ${splashFading ? "opacity-0" : "opacity-100"}`}
        >
          <img src="/icon-192.png" alt="PLAPOLYNAV" className="h-20 w-20 rounded-2xl shadow-lg" />
          <p className="text-lg font-bold text-primary">PLAPOLYNAV</p>
          <p className="text-xs text-muted-foreground">Plateau State Polytechnic, Barkin Ladi</p>
        </div>
      ) : null}

      <div className="absolute inset-0">
        <ClientOnly fallback={<MapSkeleton />}>
          <Suspense fallback={<MapSkeleton />}>
            <CampusMap locations={locations} selectedId={selected?.id ?? null} routePath={route?.path ?? []} currentPosition={currentPosition} onSelect={selectLocation} />
          </Suspense>
        </ClientOnly>
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] p-3 md:p-5">
        <div className="pointer-events-auto mx-auto max-w-5xl">
          <div className="flex h-14 items-center gap-3 rounded-full border border-border bg-card/95 px-3 shadow-xl backdrop-blur-md">
            <img src="/icon-192.png" alt="PLAPOLYNAV" className="h-9 w-9 rounded-full" />
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search PLAPOLY campus" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </label>
            {search ? <Button variant="ghost" size="icon" aria-label="Clear search" className="rounded-full" onClick={() => setSearch("")}><X /></Button> : null}
            <Link to="/admin" aria-label="Admin sign in" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground"><ShieldCheck className="h-4 w-4" /></Link>
          </div>

          {results.length ? (
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
              {results.map((location) => (
                <Button key={location.id} variant="ghost" className="h-auto w-full justify-start rounded-none px-4 py-3 text-left" onClick={() => selectLocation(location)}>
                  <MapPin className="text-destructive" />
                  <span className="min-w-0"><span className="block truncate font-medium">{location.name}</span><span className="block truncate text-xs text-muted-foreground">{location.building ?? CATEGORY_LABELS[location.category]}</span></span>
                </Button>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <Button onClick={togglePreview} variant={preview ? "default" : "secondary"} className="shrink-0 rounded-full shadow-lg"><Compass />{preview ? "Exit preview" : "Sample preview"}</Button>
            {QUICK_FILTERS.map(({ category, label }) => {
              const { icon: Icon } = categoryStyle(category);
              return (
                <Button key={category} variant="secondary" className="shrink-0 rounded-full shadow-lg" onClick={() => setSearch(category)}>
                  <Icon />{label}
                </Button>
              );
            })}
          </div>

          {showInstallBanner ? (
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-xl">
              <img src="/icon-192.png" alt="" className="h-9 w-9 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Install PLAPOLYNAV?</p>
                <p className="text-xs text-muted-foreground">Add it to your home screen for quick, full-screen access.</p>
              </div>
              <Button size="sm" onClick={handleInstallClick}>Install</Button>
              <Button size="icon" variant="ghost" aria-label="Dismiss install prompt" onClick={dismissInstallBanner}><X className="h-4 w-4" /></Button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="absolute right-3 top-36 z-[400] flex flex-col gap-3 md:right-5">
        <Button size="icon" variant="secondary" className="rounded-full shadow-xl" aria-label="Map layers" title="Map layers"><Layers3 /></Button>
        <Button size="icon" variant="secondary" className="rounded-full shadow-xl" aria-label="Use my location" title="Use my location" onClick={useMyLocation}><Crosshair /></Button>
      </div>

      <div className="absolute bottom-36 right-3 z-[400] md:bottom-8 md:right-5">
        <Button size="icon" className="h-14 w-14 rounded-2xl shadow-xl" aria-label="Open directions" title="Directions" onClick={() => setDirectionsOpen(true)}><Navigation className="h-6 w-6" /></Button>
      </div>

      {showIosInstallHint ? (
        <div className="pointer-events-auto fixed inset-x-3 top-20 z-[700] rounded-xl border border-border bg-card p-4 shadow-2xl md:left-5 md:right-auto md:w-[360px]">
          <div className="flex items-start gap-3">
            <Share2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Install this app</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tap the Share icon in Safari, then "Add to Home Screen", for full-screen, one-tap access.
              </p>
            </div>
            <Button size="icon" variant="ghost" aria-label="Dismiss install instructions" onClick={dismissIosHint}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      ) : null}

      <aside className={`absolute inset-x-0 bottom-0 z-[600] max-h-[64vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card shadow-2xl transition-transform duration-300 md:bottom-5 md:left-5 md:right-auto md:w-[390px] md:rounded-lg md:border ${directionsOpen || selected || locations.length === 0 ? "translate-y-0" : "translate-y-[calc(100%-7.5rem)]"}`}>
        <button type="button" aria-label="Toggle information panel" onClick={() => setDirectionsOpen((open) => !open)} className="mx-auto block w-full py-3">
          <span className="mx-auto block h-1 w-10 rounded-full bg-muted-foreground/40" />
        </button>
        <div className="px-5 pb-5">
           {selected?.image_url ? (
             <div className="relative mb-4 aspect-[16/8] overflow-hidden rounded-lg bg-muted">
               <img src={selected.image_url} alt={`${selected.name} entrance`} width={1200} height={800} loading="lazy" className="h-full w-full object-cover" />
               <span className="absolute bottom-2 left-2 rounded-md bg-card/95 px-2 py-1 text-xs font-semibold shadow">Destination preview</span>
             </div>
           ) : null}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-primary">PLAPOLYNAV</p>
              <h1 className="mt-1 text-xl font-semibold">{selected?.name ?? (preview ? "Sample campus route" : "Explore Barkin Ladi campus")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected?.description ?? (preview ? "Preview mode uses temporary sample places and never saves them." : "Search for a place or plan a walking route.")}
              </p>
            </div>

           {preview ? (
             <ol className="mt-4 grid grid-cols-3 gap-2 border-y border-border py-3 text-center text-xs">
               <li><span className="mx-auto mb-1 grid h-6 w-6 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground">1</span>Choose a place</li>
               <li><span className="mx-auto mb-1 grid h-6 w-6 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground">2</span>Check its photo</li>
               <li><span className="mx-auto mb-1 grid h-6 w-6 place-items-center rounded-full bg-primary font-bold text-primary-foreground">3</span>Follow A to B</li>
             </ol>
           ) : null}
            <Button size="icon" variant="ghost" className="shrink-0 rounded-full" aria-label="Expand directions" onClick={() => setDirectionsOpen((open) => !open)}><ChevronDown className={directionsOpen ? "rotate-180 transition-transform" : "transition-transform"} /></Button>
          </div>

          {selected && departments.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Departments in {selected.name}
              </p>
              <div className="mt-2 grid gap-2">
                {departments.map((dept) => {
                  const { icon: Icon } = categoryStyle(dept.category);
                  return (
                    <button
                      key={dept.id}
                      type="button"
                      onClick={() => selectLocation(dept)}
                      className="flex items-center gap-3 rounded-lg border border-border p-2 text-left hover:bg-accent"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                        {dept.image_url ? (
                          <img src={dept.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{dept.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{dept.building ?? "Department"}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!isSupabaseConfigured && !preview ? (
            <div className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm">
              Your Supabase connection is not configured yet. You can still explore the interface safely.
              <Button onClick={togglePreview} className="mt-3 w-full"><Compass />Open sample preview</Button>
            </div>
          ) : null}

          {isSupabaseConfigured && locations.length === 0 && !preview ? (
            <div className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm">
              No campus places have been added yet.
              <Button onClick={togglePreview} className="mt-3 w-full"><Compass />Open sample preview</Button>
            </div>
          ) : null}

          {(directionsOpen || preview) && locations.length > 0 ? (
            <div className="mt-4 space-y-3">
              <div className="space-y-2 border-l-2 border-primary pl-3">
                <select aria-label="Starting point" value={fromId} onChange={(event) => setFromId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Choose starting point</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
                <select
                  aria-label="Destination"
                  value={toId}
                  onChange={(event) => setToId(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && route) setNavigating(true);
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose destination</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </div>
              {route ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative h-16 flex-1 overflow-hidden rounded-lg bg-muted">
                      {route.from.image_url ? <img src={route.from.image_url} alt={route.from.name} className="h-full w-full object-cover" /> : null}
                      <span className="absolute bottom-1 left-1 rounded bg-card/95 px-1.5 py-0.5 text-[10px] font-semibold">A · {route.from.name}</span>
                    </div>
                    <Navigation className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="relative h-16 flex-1 overflow-hidden rounded-lg bg-muted">
                      {route.to.image_url ? <img src={route.to.image_url} alt={route.to.name} className="h-full w-full object-cover" /> : null}
                      <span className="absolute bottom-1 left-1 rounded bg-card/95 px-1.5 py-0.5 text-[10px] font-semibold">B · {route.to.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-3">
                    <div>
                      <p className="font-semibold">{route.distance} m · {Math.max(1, Math.round(route.distance / 80))} min walk</p>
                      <p className="text-xs text-muted-foreground">
                        {navigating ? "Follow the steps below" : "Follow the arrows on the map from A to B"}
                      </p>
                    </div>
                    {navigating ? (
                      <Button size="sm" variant="secondary" onClick={() => setNavigating(false)}>Exit</Button>
                    ) : (
                      <Button size="sm" onClick={() => setNavigating(true)}><Navigation className="h-4 w-4" />Go</Button>
                    )}
                  </div>
                  {navigating ? (
                    <ol className="space-y-2 rounded-lg border border-border p-3">
                      {steps.map((step, index) => (
                        <li key={index} className="flex items-start gap-3 text-sm">
                          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                            {index + 1}
                          </span>
                          <span className="flex-1">
                            {step.instruction}
                            {step.distance > 0 ? <span className="text-muted-foreground"> · {step.distance} m</span> : null}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              ) : fromId && toId ? <p className="text-sm text-muted-foreground">No connected route is available between these places.</p> : null}
            </div>
          ) : null}

          {locationMessage ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
              <Crosshair className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{locationMessage}</span>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
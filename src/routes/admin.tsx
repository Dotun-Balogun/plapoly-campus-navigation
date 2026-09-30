import { ImageOff } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, metresBetween, type CampusLocation, type NavNode } from "@/lib/campus";
import { edgesQuery, locationsQuery, nodesQuery } from "@/lib/queries";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — PLAPOLYNAV campus data" },
      {
        name: "description",
        content:
          "Sign in to manage campus locations, navigation nodes and routes used by PLAPOLYNAV.",
      },
      { property: "og:title", content: "Admin — PLAPOLYNAV campus data" },
      {
        property: "og:description",
        content: "Manage the polytechnic campus locations and navigation graph.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const inputClass = "rounded-lg border border-input bg-background px-3 py-2 text-sm";

const emptyLocationForm = {
  name: "",
  category: "school",
  building: "",
  floor: "",
  description: "",
  imageUrl: "",
  parentId: "",
  latitude: "",
  longitude: "",
};

const emptyNodeForm = {
  name: "",
  type: "junction",
  floor: "ground",
  latitude: "",
  longitude: "",
};

type Tab = "locations" | "nodes" | "edges";

function AdminPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [authPending, setAuthPending] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("locations");

  const [locationForm, setLocationForm] = useState(emptyLocationForm);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [nodeForm, setNodeForm] = useState(emptyNodeForm);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const [edgeForm, setEdgeForm] = useState({ from: "", to: "", accessible: true, hasStairs: false });
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data: locations = [] } = useQuery(locationsQuery());
  const { data: nodes = [] } = useQuery(nodesQuery());
  const { data: edges = [] } = useQuery(edgesQuery());

  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? "Unknown node";

  // ---------- Location mutations ----------
  const saveLocation = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Supabase is not configured.");
      const payload = {
        name: locationForm.name.trim(),
        category: locationForm.category,
        building: locationForm.building.trim() || null,
        floor: locationForm.floor.trim() || null,
        description: locationForm.description.trim() || null,
        image_url: locationForm.imageUrl.trim() || null,
        parent_id: locationForm.parentId || null,
        latitude: Number(locationForm.latitude),
        longitude: Number(locationForm.longitude),
      };
      if (!payload.name || Number.isNaN(payload.latitude) || Number.isNaN(payload.longitude)) {
        throw new Error("Name, latitude and longitude are required.");
      }
      const query = editingLocationId
        ? supabase.from("locations").update(payload).eq("id", editingLocationId)
        : supabase.from("locations").insert(payload);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingLocationId ? "Location updated" : "Location added");
      setLocationForm(emptyLocationForm);
      setEditingLocationId(null);
      queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeLocation = useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Location deleted");
      queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ---------- Photo upload (Supabase Storage, "location-images" bucket) ----------
  const handleImageUpload = async (file: File) => {
    if (!supabase) {
      toast.error("Supabase is not configured.");
      return;
    }
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("location-images")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("location-images").getPublicUrl(path);
      setLocationForm((prev) => ({ ...prev, imageUrl: data.publicUrl }));
      toast.success("Photo uploaded");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not upload photo: ${error.message}`
          : "Could not upload photo. Does the 'location-images' storage bucket exist yet? See SUPABASE_SETUP.md.",
      );
    } finally {
      setUploadingImage(false);
    }
  };

  // ---------- Node mutations ----------
  const saveNode = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Supabase is not configured.");
      const payload = {
        name: nodeForm.name.trim(),
        type: nodeForm.type.trim() || "junction",
        floor: nodeForm.floor.trim() || "ground",
        latitude: Number(nodeForm.latitude),
        longitude: Number(nodeForm.longitude),
      };
      if (!payload.name || Number.isNaN(payload.latitude) || Number.isNaN(payload.longitude)) {
        throw new Error("Name, latitude and longitude are required.");
      }
      const query = editingNodeId
        ? supabase.from("nav_nodes").update(payload).eq("id", editingNodeId)
        : supabase.from("nav_nodes").insert(payload);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingNodeId ? "Node updated" : "Node added");
      setNodeForm(emptyNodeForm);
      setEditingNodeId(null);
      queryClient.invalidateQueries({ queryKey: ["nav_nodes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeNode = useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error } = await supabase.from("nav_nodes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Node deleted (its routes were removed too)");
      queryClient.invalidateQueries({ queryKey: ["nav_nodes"] });
      queryClient.invalidateQueries({ queryKey: ["nav_edges"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ---------- Edge mutations ----------
  const saveEdge = useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Supabase is not configured.");
      if (!edgeForm.from || !edgeForm.to) throw new Error("Pick both nodes for the route.");
      if (edgeForm.from === edgeForm.to) throw new Error("A route needs two different nodes.");
      const a = nodes.find((n) => n.id === edgeForm.from);
      const b = nodes.find((n) => n.id === edgeForm.to);
      if (!a || !b) throw new Error("Selected nodes no longer exist.");
      const duplicate = edges.some(
        (e) =>
          e.id !== editingEdgeId &&
          ((e.from_node === edgeForm.from && e.to_node === edgeForm.to) ||
            (e.from_node === edgeForm.to && e.to_node === edgeForm.from)),
      );
      if (duplicate) throw new Error("A route between these two nodes already exists.");
      const payload = {
        from_node: edgeForm.from,
        to_node: edgeForm.to,
        distance: metresBetween(a, b),
        accessible: edgeForm.accessible,
        has_stairs: edgeForm.hasStairs,
      };
      const query = editingEdgeId
        ? supabase.from("nav_edges").update(payload).eq("id", editingEdgeId)
        : supabase.from("nav_edges").insert(payload);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingEdgeId ? "Route updated" : "Route added");
      setEdgeForm({ from: "", to: "", accessible: true, hasStairs: false });
      setEditingEdgeId(null);
      queryClient.invalidateQueries({ queryKey: ["nav_edges"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeEdge = useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error } = await supabase.from("nav_edges").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Route deleted");
      queryClient.invalidateQueries({ queryKey: ["nav_edges"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ---------- Auth ----------
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setAuthPending(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthPending(false);
    if (error) toast.error(error.message);
    else toast.success("Signed in");
  };


  // ---------- Edit helpers ----------
  const startEditLocation = (location: CampusLocation) => {
    setEditingLocationId(location.id);
    setLocationForm({
      name: location.name,
      category: String(location.category),
      building: location.building ?? "",
      floor: location.floor ?? "",
      description: location.description ?? "",
      imageUrl: location.image_url ?? "",
      parentId: location.parent_id ?? "",
      latitude: String(location.latitude),
      longitude: String(location.longitude),
    });
  };

  const startEditNode = (node: NavNode) => {
    setEditingNodeId(node.id);
    setNodeForm({
      name: node.name,
      type: node.type ?? "junction",
      floor: node.floor ?? "ground",
      latitude: String(node.latitude),
      longitude: String(node.longitude),
    });
  };

  const startEditEdge = (id: string) => {
    const edge = edges.find((e) => e.id === id);
    if (!edge) return;
    setEditingEdgeId(id);
    setEdgeForm({
      from: edge.from_node,
      to: edge.to_node,
      accessible: edge.accessible ?? true,
      hasStairs: edge.has_stairs ?? false,
    });
  };

  const tabButton = (value: Tab, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setTab(value)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        tab === value ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <img src="/icon-192.png" alt="Polytechnic crest" className="h-9 w-9 rounded-md" />
          <div className="mr-auto">
            <h1 className="text-base font-bold leading-none tracking-tight">Admin dashboard</h1>
            <p className="text-xs text-muted-foreground">Locations, nodes & routes</p>
          </div>
          {userEmail ? (
            <button
              type="button"
              onClick={() => supabase?.auth.signOut()}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Sign out
            </button>
          ) : null}
          <Link
            to="/"
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Map
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
        {!isSupabaseConfigured ? (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Supabase is not configured yet, so the admin tools are read-only. Add your keys to{" "}
            <code>.env</code> and run the migration — see <code>SUPABASE_SETUP.md</code>.
          </div>
        ) : checking ? (
          <p className="text-sm text-muted-foreground">Checking your session…</p>
        ) : !userEmail ? (
          <form
            onSubmit={signIn}
            className="mx-auto max-w-sm space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="text-center">
              <img src="/icon-192.png" alt="Polytechnic crest" className="mx-auto h-12 w-12 rounded-md" />
              <h2 className="mt-2 text-sm font-semibold">Admin sign in</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Sign in with the email and password of the admin account you created in your
                Supabase Auth dashboard.
              </p>
            </div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className={`w-full ${inputClass}`}
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className={`w-full ${inputClass}`}
            />
            <Button
              type="submit"
              disabled={authPending}
              className="w-full"
            >
              {authPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        ) : (
          <>
            <div className="flex gap-2">
              {tabButton("locations", "Locations")}
              {tabButton("nodes", "Nodes")}
              {tabButton("edges", "Routes")}
            </div>

            {/* ---------- Locations tab ---------- */}
            {tab === "locations" ? (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold">
                  {editingLocationId ? "Edit location" : "Add location"}
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={locationForm.name}
                    onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                    placeholder="Name"
                    className={inputClass}
                  />
                  <select
                    value={locationForm.category}
                    onChange={(e) => setLocationForm({ ...locationForm, category: e.target.value })}
                    className={inputClass}
                  >
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={locationForm.building}
                    onChange={(e) => setLocationForm({ ...locationForm, building: e.target.value })}
                    placeholder="Building"
                    className={inputClass}
                  />
                  <select
                    value={locationForm.parentId}
                    onChange={(e) => setLocationForm({ ...locationForm, parentId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">No parent school (standalone location)</option>
                    {locations
                      .filter((l) => l.category === "school" && l.id !== editingLocationId)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          Department under: {l.name}
                        </option>
                      ))}
                  </select>
                  <input
                    value={locationForm.floor}
                    onChange={(e) => setLocationForm({ ...locationForm, floor: e.target.value })}
                    placeholder="Floor"
                    className={inputClass}
                  />
                  <input
                    value={locationForm.latitude}
                    onChange={(e) => setLocationForm({ ...locationForm, latitude: e.target.value })}
                    placeholder="Latitude"
                    className={inputClass}
                  />
                  <input
                    value={locationForm.longitude}
                    onChange={(e) => setLocationForm({ ...locationForm, longitude: e.target.value })}
                    placeholder="Longitude"
                    className={inputClass}
                  />
                  <textarea
                    value={locationForm.description}
                    onChange={(e) =>
                      setLocationForm({ ...locationForm, description: e.target.value })
                    }
                    placeholder="Description"
                    rows={2}
                    className={`${inputClass} sm:col-span-2`}
                  />
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Place photo</label>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                        {locationForm.imageUrl ? (
                          <img src={locationForm.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent">
                        {uploadingImage ? "Uploading…" : locationForm.imageUrl ? "Replace photo" : "Upload photo"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingImage}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {locationForm.imageUrl ? (
                        <button
                          type="button"
                          onClick={() => setLocationForm({ ...locationForm, imageUrl: "" })}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={saveLocation.isPending}
                    onClick={() => saveLocation.mutate()}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {editingLocationId ? "Save changes" : "Add location"}
                  </button>
                  {editingLocationId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLocationId(null);
                        setLocationForm(emptyLocationForm);
                      }}
                      className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ---------- Nodes tab ---------- */}
            {tab === "nodes" ? (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold">
                  {editingNodeId ? "Edit node" : "Add node"}
                </h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  Nodes are the waypoints routes run between — junctions, entrances and buildings.
                  Get coordinates from Google Maps (right-click → copy).
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={nodeForm.name}
                    onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
                    placeholder="Name (e.g. Central Junction)"
                    className={inputClass}
                  />
                  <select
                    value={nodeForm.type}
                    onChange={(e) => setNodeForm({ ...nodeForm, type: e.target.value })}
                    className={inputClass}
                  >
                    <option value="junction">Junction</option>
                    <option value="building">Building</option>
                    <option value="entrance">Entrance</option>
                    <option value="walkway">Walkway</option>
                  </select>
                  <input
                    value={nodeForm.latitude}
                    onChange={(e) => setNodeForm({ ...nodeForm, latitude: e.target.value })}
                    placeholder="Latitude"
                    className={inputClass}
                  />
                  <input
                    value={nodeForm.longitude}
                    onChange={(e) => setNodeForm({ ...nodeForm, longitude: e.target.value })}
                    placeholder="Longitude"
                    className={inputClass}
                  />
                  <input
                    value={nodeForm.floor}
                    onChange={(e) => setNodeForm({ ...nodeForm, floor: e.target.value })}
                    placeholder="Floor (e.g. ground)"
                    className={inputClass}
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={saveNode.isPending}
                    onClick={() => saveNode.mutate()}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {editingNodeId ? "Save changes" : "Add node"}
                  </button>
                  {editingNodeId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNodeId(null);
                        setNodeForm(emptyNodeForm);
                      }}
                      className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ---------- Edges tab ---------- */}
            {tab === "edges" ? (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold">
                  {editingEdgeId ? "Edit route" : "Add route"}
                </h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  A route connects two nodes; the app walks it in both directions. Distance is
                  calculated automatically from the node coordinates.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    value={edgeForm.from}
                    onChange={(e) => setEdgeForm({ ...edgeForm, from: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">From node…</option>
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={edgeForm.to}
                    onChange={(e) => setEdgeForm({ ...edgeForm, to: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">To node…</option>
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={edgeForm.accessible}
                      onChange={(e) => setEdgeForm({ ...edgeForm, accessible: e.target.checked })}
                    />
                    Wheelchair accessible
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={edgeForm.hasStairs}
                      onChange={(e) => setEdgeForm({ ...edgeForm, hasStairs: e.target.checked })}
                    />
                    Has stairs
                  </label>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={saveEdge.isPending}
                    onClick={() => saveEdge.mutate()}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {editingEdgeId ? "Save changes" : "Add route"}
                  </button>
                  {editingEdgeId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEdgeId(null);
                        setEdgeForm({ from: "", to: "", accessible: true, hasStairs: false });
                      }}
                      className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* ---------- Data tables ---------- */}
        {tab === "locations" ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {/* Desktop / tablet: table */}
            <table className="hidden w-full text-left text-sm sm:table">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Coordinates</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {locations.map((location) => (
                  <tr key={location.id}>
                    <td className="px-3 py-2 font-medium">
                      {location.name}
                      {location.parent_id ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          (under {locations.find((l) => l.id === location.parent_id)?.name ?? "…"})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {CATEGORY_LABELS[location.category] ?? location.category}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {userEmail ? (
                        <span className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEditLocation(location)}
                            className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLocation.mutate(location.id)}
                            className="rounded border border-border px-2 py-1 text-xs text-destructive hover:bg-accent"
                          >
                            Delete
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Phone: stacked cards instead of a cramped table */}
            <div className="divide-y divide-border sm:hidden">
              {locations.map((location) => (
                <div key={location.id} className="flex items-center gap-3 p-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {location.image_url ? (
                      <img src={location.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageOff className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{location.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {CATEGORY_LABELS[location.category] ?? location.category}
                      {location.parent_id
                        ? ` · under ${locations.find((l) => l.id === location.parent_id)?.name ?? "…"}`
                        : ""}
                    </p>
                  </div>
                  {userEmail ? (
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEditLocation(location)}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLocation.mutate(location.id)}
                        className="rounded border border-border px-2 py-1 text-xs text-destructive hover:bg-accent"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {locations.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">No locations yet.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "nodes" ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="hidden w-full text-left text-sm sm:table">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Coordinates</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {nodes.map((node) => (
                  <tr key={node.id}>
                    <td className="px-3 py-2 font-medium">{node.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{node.type ?? "junction"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {node.latitude.toFixed(5)}, {node.longitude.toFixed(5)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {userEmail ? (
                        <span className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEditNode(node)}
                            className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeNode.mutate(node.id)}
                            className="rounded border border-border px-2 py-1 text-xs text-destructive hover:bg-accent"
                          >
                            Delete
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="divide-y divide-border sm:hidden">
              {nodes.map((node) => (
                <div key={node.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{node.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {node.type ?? "junction"} · {node.latitude.toFixed(5)}, {node.longitude.toFixed(5)}
                    </p>
                  </div>
                  {userEmail ? (
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEditNode(node)}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeNode.mutate(node.id)}
                        className="rounded border border-border px-2 py-1 text-xs text-destructive hover:bg-accent"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {nodes.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">No nodes yet.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "edges" ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="hidden w-full text-left text-sm sm:table">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Route</th>
                  <th className="px-3 py-2">Distance</th>
                  <th className="px-3 py-2">Flags</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {edges.map((edge) => (
                  <tr key={edge.id}>
                    <td className="px-3 py-2 font-medium">
                      {nodeName(edge.from_node)} ↔ {nodeName(edge.to_node)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {Math.round(edge.distance)} m
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {edge.accessible === false ? "not accessible" : "accessible"}
                      {edge.has_stairs ? " · stairs" : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {userEmail ? (
                        <span className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEditEdge(edge.id)}
                            className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeEdge.mutate(edge.id)}
                            className="rounded border border-border px-2 py-1 text-xs text-destructive hover:bg-accent"
                          >
                            Delete
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {edges.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-sm text-muted-foreground">
                      No routes yet — add nodes first, then connect them here.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <div className="divide-y divide-border sm:hidden">
              {edges.map((edge) => (
                <div key={edge.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {nodeName(edge.from_node)} ↔ {nodeName(edge.to_node)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {Math.round(edge.distance)} m · {edge.accessible === false ? "not accessible" : "accessible"}
                      {edge.has_stairs ? " · stairs" : ""}
                    </p>
                  </div>
                  {userEmail ? (
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEditEdge(edge.id)}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEdge.mutate(edge.id)}
                        className="rounded border border-border px-2 py-1 text-xs text-destructive hover:bg-accent"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {edges.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  No routes yet — add nodes first, then connect them here.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

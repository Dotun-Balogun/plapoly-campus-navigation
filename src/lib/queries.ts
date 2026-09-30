import { queryOptions } from "@tanstack/react-query";

import type { CampusLocation, NavEdge, NavNode } from "./campus";
import { supabase } from "./supabase";

async function readTable<T>(table: string, order?: string): Promise<T[]> {
  if (!supabase) return [];
  let query = supabase.from(table).select("*");
  if (order) query = query.order(order, { ascending: true });
  const { data, error } = await query;
  if (error) throw new Error(`Could not load ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

export const locationsQuery = () =>
  queryOptions({
    queryKey: ["locations"],
    queryFn: () => readTable<CampusLocation>("locations", "name"),
  });

export const nodesQuery = () =>
  queryOptions({
    queryKey: ["nav_nodes"],
    queryFn: () => readTable<NavNode>("nav_nodes", "name"),
  });

export const edgesQuery = () =>
  queryOptions({
    queryKey: ["nav_edges"],
    queryFn: () => readTable<NavEdge>("nav_edges"),
  });

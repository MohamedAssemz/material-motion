import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Storehouse {
  id: number;
  name: string;
  sort_order: number;
}

export function useStorehouses() {
  const [storehouses, setStorehouses] = useState<Storehouse[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStorehouses = useCallback(async () => {
    const { data, error } = await supabase
      .from("storehouses")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (!error && data) setStorehouses(data as Storehouse[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStorehouses();
    const channel = supabase
      .channel("storehouses-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "storehouses" },
        () => fetchStorehouses(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStorehouses]);

  const getName = useCallback(
    (id: number | string | null | undefined) => {
      if (id === null || id === undefined) return "";
      const found = storehouses.find((s) => String(s.id) === String(id));
      return found ? found.name : `#${id}`;
    },
    [storehouses],
  );

  return { storehouses, loading, getName, refetch: fetchStorehouses };
}

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TimeEntry } from '@/types';

export function useRealtimeTimeEntries(date: string) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    // Initial fetch
    async function fetchEntries() {
      const { data } = await supabase
        .from('time_entries')
        .select(`
          *,
          shifts!inner(date, location_id, start_time, end_time)
        `)
        .eq('shifts.date', date);

      if (data) setEntries(data as unknown as TimeEntry[]);
      setLoading(false);
    }

    fetchEntries();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('time_entries_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_entries',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setEntries((prev) => [...prev, payload.new as TimeEntry]);
          } else if (payload.eventType === 'UPDATE') {
            setEntries((prev) =>
              prev.map((e) => (e.id === payload.new.id ? (payload.new as TimeEntry) : e))
            );
          } else if (payload.eventType === 'DELETE') {
            setEntries((prev) => prev.filter((e) => e.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [date]);

  return { entries, loading };
}

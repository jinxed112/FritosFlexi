'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { FlexiWorker, UserRole } from '@/types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [worker, setWorker] = useState<FlexiWorker | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const userRole = user.user_metadata?.role as string;

        if (userRole === 'manager') {
          setRole({ role: 'manager' });
        } else {
          // Fetch worker profile
          const { data: workerData } = await supabase
            .from('flexi_workers')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (workerData) {
            setWorker(workerData as FlexiWorker);
            setRole({ role: 'flexi', workerId: workerData.id });
          }
        }
      }
      setLoading(false);
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          setWorker(null);
          setRole(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setWorker(null);
    setRole(null);
  };

  return { user, role, worker, loading, signOut, supabase };
}

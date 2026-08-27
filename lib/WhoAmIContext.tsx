'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { Profile } from './types';

const STORAGE_KEY = 'ledger_me_id';

interface WhoAmICtx {
  profiles: Profile[];
  me: Profile | null;
  partner: Profile | null;
  loading: boolean;
  chooseMe: (id: string) => void;
  clearMe: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<WhoAmICtx>({
  profiles: [],
  me: null,
  partner: null,
  loading: true,
  chooseMe: () => {},
  clearMe: () => {},
  refresh: async () => {},
});

export function WhoAmIProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('display_name');
    setProfiles((data as Profile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) setMeId(stored);
    refresh();
  }, [refresh]);

  function chooseMe(id: string) {
    localStorage.setItem(STORAGE_KEY, id);
    setMeId(id);
  }

  function clearMe() {
    localStorage.removeItem(STORAGE_KEY);
    setMeId(null);
  }

  const me = profiles.find((p) => p.id === meId) || null;
  const partner = profiles.find((p) => p.id !== meId) || null;

  return (
    <Ctx.Provider value={{ profiles, me, partner, loading, chooseMe, clearMe, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export const useWhoAmI = () => useContext(Ctx);

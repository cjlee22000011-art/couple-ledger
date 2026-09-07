'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { Profile } from './types';

interface AuthCtx {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  profile: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile((data as Profile) || null);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session) await loadProfile(data.session.user.id);
    setLoading(false);
  }, [loadProfile]);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess) loadProfile(sess.user.id);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh, loadProfile]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return <Ctx.Provider value={{ session, profile, loading, refresh, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

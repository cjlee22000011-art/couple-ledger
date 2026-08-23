'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { Profile, Couple } from './types';

interface AuthCtx {
  session: Session | null;
  profile: Profile | null;
  couple: Couple | null;
  partner: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  profile: null,
  couple: null,
  partner: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [couple, setCouple] = useState<Couple | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadAll(userId: string) {
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(prof as Profile | null);

    const { data: coupleRow } = await supabase
      .from('couples')
      .select('*')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .maybeSingle();
    setCouple(coupleRow as Couple | null);

    if (coupleRow) {
      const partnerId = coupleRow.user_a === userId ? coupleRow.user_b : coupleRow.user_a;
      const { data: p } = await supabase.from('profiles').select('*').eq('id', partnerId).single();
      setPartner(p as Profile | null);
    } else {
      setPartner(null);
    }
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session) await loadAll(data.session.user.id);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess) loadAll(sess.user.id);
      else {
        setProfile(null);
        setCouple(null);
        setPartner(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <Ctx.Provider value={{ session, profile, couple, partner, loading, refresh, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { auth, type Session } from '@/lib/api';

type Ctx = { session: Session | null; ready: boolean };
const AuthContext = createContext<Ctx>({ session: null, ready: false });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    auth.getSession().then((s) => {
      setSession(s);
      setReady(true);
    });
    return auth.onChange(setSession);
  }, []);

  return <AuthContext.Provider value={{ session, ready }}>{children}</AuthContext.Provider>;
}

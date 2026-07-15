import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LoginInput, User } from "@authenik8/contracts";
import { authApi } from "@authenik8/api-client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  completeOAuth: (code: string) => Promise<void>;
  setUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authApi.restore()
      .then((result) => { if (active) setUser(result?.user ?? null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(input) {
      const result = await authApi.login(input);
      setUser(result.user);
    },
    async logout() {
      await authApi.logout();
      setUser(null);
    },
    async completeOAuth(code) {
      const result = await authApi.exchangeOAuth(code);
      setUser(result.user);
    },
    setUser,
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

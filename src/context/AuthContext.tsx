import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { firebaseAuth, googleAuthProvider } from '../lib/firebase';
import { authApi, setApiAuthToken } from '../lib/api';
import type { UserProfile } from '../lib/types';

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: (updatedUser: UserProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const bootstrapSession = async () => {
      try {
        const res = await authApi.session();
        if (!active) return;
        if (res.authenticated && res.user) {
          setUser(res.user);
          if (res.token) {
            setToken(res.token);
            setApiAuthToken(res.token);
          }
          setLoading(false);
          return;
        }
      } catch {
        // Fall through to Firebase Auth check
      }

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
        if (!active) return;
        if (fbUser) {
          try {
            const idToken = await fbUser.getIdToken();
            setApiAuthToken(idToken);
            const res = await authApi.me(idToken);
            if (!active) return;
            setToken(idToken);
            setUser(res.user);
          } catch {
            setApiAuthToken(null);
            setToken(null);
            setUser(null);
          }
        }
        if (active) setLoading(false);
      });

      return unsubscribe;
    };

    let unsub: (() => void) | undefined;
    bootstrapSession().then((fn) => {
      unsub = fn;
    });

    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    setApiAuthToken(res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const registerWithEmail = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await authApi.register({ name, email, password });
      setApiAuthToken(res.token);
      setToken(res.token);
      setUser(res.user);
    },
    []
  );

  const loginWithGoogle = useCallback(async () => {
    const credential = await signInWithPopup(firebaseAuth, googleAuthProvider);
    const idToken = await credential.user.getIdToken();
    setApiAuthToken(idToken);
    const res = await authApi.me(idToken);
    setToken(idToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout network error and clear client state
    }
    try {
      if (firebaseAuth.currentUser) {
        await firebaseSignOut(firebaseAuth);
      }
    } catch {
      // Ignore Firebase sign-out error
    }
    setApiAuthToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback((updatedUser: UserProfile) => {
    setUser(updatedUser);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

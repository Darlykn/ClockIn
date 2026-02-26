import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { authApi } from '../api/auth';
import { queryClient } from './QueryProvider';
import type {
  User,
  LoginCredentials,
  LoginResponse,
  Setup2FAResponse,
  Verify2FAResponse,
} from '../types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<LoginResponse>;
  setupTOTP: (tempToken: string) => Promise<Setup2FAResponse>;
  verifyTOTP: (code: string, tempToken: string, secret?: string) => Promise<Verify2FAResponse>;
  logout: () => Promise<void>;
  setToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(
    () => localStorage.getItem('access_token')
  );
  const [isLoading, setIsLoading] = useState(true);

  const setToken = useCallback((newToken: string) => {
    localStorage.setItem('access_token', newToken);
    setTokenState(newToken);
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem('access_token');
    setTokenState(null);
    setUser(null);
    queryClient.clear();
  }, []);

  useEffect(() => {
    if (token) {
      authApi
        .getMe()
        .then(setUser)
        .catch(() => clearAuth())
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token, clearAuth]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const response = await authApi.login(credentials);
    if (response.access_token) {
      localStorage.setItem('access_token', response.access_token);
      setTokenState(response.access_token);
      const me = await authApi.getMe();
      setUser(me);
    }
    return response;
  }, []);

  const setupTOTP = useCallback((tempToken: string) => {
    return authApi.setup2FA(tempToken);
  }, []);

  const verifyTOTP = useCallback(
    async (code: string, tempToken: string, secret?: string) => {
      const response = await authApi.verify2FA(code, tempToken, secret);
      if (response.access_token) {
        setToken(response.access_token);
        const me = await authApi.getMe();
        setUser(me);
      }
      return response;
    },
    [setToken]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        setupTOTP,
        verifyTOTP,
        logout,
        setToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

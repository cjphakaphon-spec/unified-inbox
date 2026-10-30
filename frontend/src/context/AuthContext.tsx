import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Agent } from '../types';

interface AuthContextType {
  token: string | null;
  agent: Agent | null;
  login: (token: string, agent: Agent) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [agent, setAgent] = useState<Agent | null>(() => {
    const saved = localStorage.getItem('agent');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      // Validate token with /api/auth/me
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Session expired');
          return res.json();
        })
        .then((data) => {
          setAgent(data.agent);
          localStorage.setItem('agent', JSON.stringify(data.agent));
        })
        .catch(() => {
          logout();
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = (newToken: string, newAgent: Agent) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('agent', JSON.stringify(newAgent));
    setToken(newToken);
    setAgent(newAgent);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('agent');
    setToken(null);
    setAgent(null);
  };

  return (
    <AuthContext.Provider value={{ token, agent, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('ieee_admin_token') || null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    const currentToken = localStorage.getItem('ieee_admin_token');
    if (currentToken) {
      try {
        console.log('[AuthContext] 🔍 Verifying active admin token with /api/auth/me...');
        const res = await api.get('/auth/me');
        console.log('[AuthContext] ✅ Admin verified:', res.data.admin);
        setAdmin(res.data.admin);
        setToken(currentToken);
      } catch (err) {
        console.warn('[AuthContext] ⚠️ Token verification failed or expired. Logging out.');
        logout();
      }
    } else {
      setAdmin(null);
      setToken(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    checkAuth();

    // Global listener for 401 unauthorized responses
    const handleUnauthorized = () => {
      console.warn('[AuthContext] 🔔 Received auth:unauthorized event. Resetting admin state.');
      logout();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const login = async (username, password) => {
    console.log(`[AuthContext] 🔑 Initiating login for username: "${username}"`);
    const res = await api.post('/auth/login', { username, password });
    const { token: newToken, admin: adminData } = res.data;

    console.log('[AuthContext] ✅ Login successful! Storing token and setting admin state.');
    localStorage.setItem('ieee_admin_token', newToken);
    setToken(newToken);
    setAdmin(adminData);
    return res.data;
  };

  const logout = () => {
    console.log('[AuthContext] 🚪 Logging out admin user...');
    localStorage.removeItem('ieee_admin_token');
    localStorage.removeItem('ieee_current_view');
    setToken(null);
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ admin, token, isAuthenticated: !!admin, login, logout, loading, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

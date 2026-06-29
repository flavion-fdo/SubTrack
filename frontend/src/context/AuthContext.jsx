import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);

  useEffect(() => {
    // Check localStorage on mount
    const savedToken = localStorage.getItem('subtrack_token');
    const savedUser = localStorage.getItem('subtrack_user');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = (jwtToken, userDetails, newUserFlag = false) => {
    localStorage.setItem('subtrack_token', jwtToken);
    localStorage.setItem('subtrack_user', JSON.stringify(userDetails));
    setToken(jwtToken);
    setUser(userDetails);
    setIsNewUser(newUserFlag);
  };

  const clearNewUserFlag = () => {
    setIsNewUser(false);
  };

  const logout = () => {
    localStorage.removeItem('subtrack_token');
    localStorage.removeItem('subtrack_user');
    setToken(null);
    setUser(null);
    setIsNewUser(false);
  };

  // Helper function to send API requests with authorization headers
  const fetchWithAuth = async (endpoint, options = {}) => {
    const apiHost = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const url = `${apiHost}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Token expired or invalid, auto logout
      logout();
      throw new Error('Session expired. Please log in again.');
    }

    return response;
  };

  const value = {
    user,
    token,
    loading,
    isNewUser,
    login,
    logout,
    clearNewUserFlag,
    fetchWithAuth
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

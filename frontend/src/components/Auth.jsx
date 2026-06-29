import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const Auth = () => {
  const { login: saveAuth } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoaded, setGoogleLoaded] = useState(false);

  // ─── Load Google Identity Services SDK ────────────────────────────────────
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return; // Skip if not configured

    // Check if already loaded
    if (window.google?.accounts?.id) {
      setGoogleLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleLoaded(true);
    document.head.appendChild(script);

    return () => {
      // Cleanup (script stays loaded in head but that's fine)
    };
  }, []);

  // ─── Initialize Google button once SDK is loaded ──────────────────────────
  useEffect(() => {
    if (!googleLoaded || !window.google?.accounts?.id) return;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCallback,
    });
  }, [googleLoaded]);

  // ─── Google callback ─────────────────────────────────────────────────────
  const handleGoogleCallback = useCallback(async (response) => {
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const apiHost = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${apiHost}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Google sign-in failed');

      setSuccess(data.isNewUser ? 'Account created!' : 'Welcome back!');
      setTimeout(() => {
        saveAuth(data.token, data.user, data.isNewUser);
      }, 600);
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Please try again.');
      setSubmitting(false);
    }
  }, [saveAuth]);

  // ─── Google Sign-In trigger ───────────────────────────────────────────────
  const handleGoogleSignIn = () => {
    if (!window.google?.accounts?.id) {
      setError('Google sign-in is not available. Please try again later.');
      return;
    }
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Fallback: use popup login
        window.google.accounts.id.renderButton(
          document.createElement('div'),
          { type: 'standard' }
        );
        // Try One Tap again or let user know
        setError('Google popup was blocked. Please allow popups and try again.');
      }
    });
  };

  // ─── Apple Sign-In ────────────────────────────────────────────────────────
  const handleAppleSignIn = async () => {
    const clientId = import.meta.env.VITE_APPLE_CLIENT_ID;
    if (!clientId) {
      setError('Apple sign-in is not configured yet.');
      return;
    }

    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      // Load Apple JS SDK if not already loaded
      if (!window.AppleID) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      window.AppleID.auth.init({
        clientId,
        scope: 'name email',
        redirectURI: window.location.origin,
        usePopup: true,
      });

      const appleResponse = await window.AppleID.auth.signIn();
      
      const apiHost = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${apiHost}/api/auth/apple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_token: appleResponse.authorization.id_token,
          user: appleResponse.user || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Apple sign-in failed');

      setSuccess(data.isNewUser ? 'Account created!' : 'Welcome back!');
      setTimeout(() => {
        saveAuth(data.token, data.user, data.isNewUser);
      }, 600);
    } catch (err) {
      if (err?.error === 'popup_closed_by_user') {
        setSubmitting(false);
        return; // User cancelled, no error needed
      }
      setError(err.message || 'Apple sign-in failed. Please try again.');
      setSubmitting(false);
    }
  };

  // ─── Email/Password submit ───────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setSubmitting(true);
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
      const apiHost = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiHost}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed.');
      }

      setSuccess(isLogin ? 'Login successful!' : 'Registration successful!');
      
      // Artificial delay for smooth UX transition
      setTimeout(() => {
        saveAuth(data.token, data.user, data.isNewUser || false);
      }, 800);

    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
  };

  // Check if OAuth is configured
  const hasGoogle = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const hasApple = !!import.meta.env.VITE_APPLE_CLIENT_ID;
  const hasOAuth = hasGoogle || hasApple;

  return (
    <div className="auth-container">
      <div className="auth-card glass-panel">
        <div className="auth-header">
          <div className="auth-logo">SubTrack</div>
          <p className="auth-subtitle">
            {isLogin ? 'Sign in to manage your subscriptions' : 'Create an account to start tracking'}
          </p>
        </div>

        {error && (
          <div className="alert-banner alert-banner-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert-banner alert-banner-success">
            <span>✅</span>
            <span>{success}</span>
          </div>
        )}

        {/* OAuth Buttons */}
        {hasOAuth && (
          <>
            <div className="oauth-buttons">
              {hasGoogle && (
                <button
                  className="oauth-btn oauth-btn-google"
                  onClick={handleGoogleSignIn}
                  disabled={submitting}
                  type="button"
                  id="google-signin-btn"
                >
                  <svg className="oauth-icon" viewBox="0 0 24 24" width="20" height="20">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>
              )}

              {hasApple && (
                <button
                  className="oauth-btn oauth-btn-apple"
                  onClick={handleAppleSignIn}
                  disabled={submitting}
                  type="button"
                  id="apple-signin-btn"
                >
                  <svg className="oauth-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  <span>Continue with Apple</span>
                </button>
              )}
            </div>

            <div className="auth-divider">
              <span className="auth-divider-line"></span>
              <span className="auth-divider-text">or continue with email</span>
              <span className="auth-divider-line"></span>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email Address</label>
            <input
              className="form-input"
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              className="form-input"
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          {!isLogin && (
            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
              <input
                className="form-input"
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required={!isLogin}
                disabled={submitting}
              />
            </div>
          )}

          <button className="btn btn-primary btn-full" type="submit" disabled={submitting}>
            {submitting ? 'Please wait...' : isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="auth-switch">
          {isLogin ? (
            <>
              Don't have an account?{' '}
              <span className="auth-link" onClick={toggleMode}>
                Create one
              </span>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <span className="auth-link" onClick={toggleMode}>
                Sign in
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;

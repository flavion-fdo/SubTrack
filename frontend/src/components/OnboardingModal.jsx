import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const OnboardingModal = ({ onComplete }) => {
  const { user, fetchWithAuth } = useAuth();
  
  // Steps: 'consent' | 'popup' | 'scanning' | 'success' | 'manual'
  const [step, setStep] = useState('consent');
  const [syncMethod, setSyncMethod] = useState('email'); // 'email' | 'bank'
  const [selectedBank, setSelectedBank] = useState(null);
  const [bankUsername, setBankUsername] = useState('');
  const [bankPassword, setBankPassword] = useState('');
  
  // Scanning state
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [detectedSubs, setDetectedSubs] = useState([]);
  
  // Manual onboarding fallback state (original suggestions checklist)
  const [suggestions, setSuggestions] = useState([]);
  const [manualSelected, setManualSelected] = useState(new Set());
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [submittingManual, setSubmittingManual] = useState(false);
  
  const [error, setError] = useState('');
  const logContainerRef = useRef(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Load manual suggestions if fallback is chosen
  const loadManualSuggestions = async () => {
    setLoadingSuggestions(true);
    setError('');
    try {
      const provider = user?.auth_provider || 'local';
      const apiHost = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${apiHost}/api/subscriptions/suggestions?provider=${provider}`);
      const data = await res.json();
      setSuggestions(data);

      // Pre-select highlighted ones
      const highlighted = new Set(data.filter(s => s.highlighted).map(s => s.key));
      setManualSelected(highlighted);
    } catch (err) {
      setError('Failed to load subscription suggestions.');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleManualSelectToggle = (key) => {
    setManualSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleManualSubmit = async () => {
    if (manualSelected.size === 0) {
      onComplete();
      return;
    }

    setSubmittingManual(true);
    setError('');

    try {
      const res = await fetchWithAuth('/api/subscriptions/seed', {
        method: 'POST',
        body: JSON.stringify({ selectedKeys: Array.from(manualSelected) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to add subscriptions');
      }

      onComplete();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setSubmittingManual(false);
    }
  };

  // Start Sync scan simulation
  const startSyncScan = () => {
    setStep('scanning');
    setProgress(0);
    setLogs([]);
    setError('');

    const emailLogs = [
      { p: 5, t: 'Establishing secure OAuth 2.0 connection...', type: 'info' },
      { p: 15, t: 'Access token granted. Connecting to imap.gmail.com...', type: 'info' },
      { p: 30, t: 'Scanning mailbox headers for billing & receipt receipts...', type: 'info' },
      { p: 45, t: 'Found Netflix billing confirmation ($15.49/mo)...', type: 'found' },
      { p: 60, t: 'Found Spotify Premium billing transaction ($11.99/mo)...', type: 'found' },
      { p: 75, t: 'Found ChatGPT Plus invoice ($20.00/mo)...', type: 'found' },
      ((user && user.email) || '').toLowerCase().endsWith('@gmail.com')
        ? { p: 85, t: 'Found Google One storage renewal receipt ($2.99/mo)...', type: 'found' }
        : { p: 85, t: 'Found Microsoft 365 license payment notice ($9.99/mo)...', type: 'found' },
      { p: 95, t: 'Parsing pricing details and calculating next billing date...', type: 'info' },
      { p: 100, t: 'Sync complete. Sending results to database ledger...', type: 'success' }
    ];

    const bankLogs = [
      { p: 5, t: 'Connecting to bank database via Plaid API proxy...', type: 'info' },
      { p: 20, t: 'Session authenticated. Reading transaction history (past 90 days)...', type: 'info' },
      { p: 40, t: 'Analyzing bank statement for recurring subscription profiles...', type: 'info' },
      { p: 55, t: 'Detected recurring transaction: DISNEY PLUS NY - $13.99...', type: 'found' },
      { p: 70, t: 'Detected recurring transaction: ADOBE CREATIVE CO - $54.99...', type: 'found' },
      { p: 85, t: 'Detected recurring transaction: NORDVPN UT - $12.99...', type: 'found' },
      { p: 92, t: 'Detected recurring transaction: AMAZON PRIME RENEWAL - $14.99...', type: 'found' },
      { p: 98, t: 'Correlating transaction dates with next renewal dates...', type: 'info' },
      { p: 100, t: 'Sync complete. Storing active accounts in ledger...', type: 'success' }
    ];

    const targetLogs = syncMethod === 'email' ? emailLogs : bankLogs;
    let logIndex = 0;
    
    const interval = setInterval(() => {
      if (logIndex < targetLogs.length) {
        const nextLog = targetLogs[logIndex];
        setProgress(nextLog.p);
        setLogs(prev => [...prev, nextLog]);
        logIndex++;
      } else {
        clearInterval(interval);
        // Call backend API to save synced subscriptions
        saveSyncedSubscriptions();
      }
    }, 450);
  };

  const saveSyncedSubscriptions = async () => {
    try {
      const res = await fetchWithAuth('/api/subscriptions/sync', {
        method: 'POST',
        body: JSON.stringify({ method: syncMethod, consent: true })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Sync failed on server');
      }

      const data = await res.json();
      setDetectedSubs(data.subscriptions || []);
      setStep('success');
    } catch (err) {
      setError(err.message || 'Failed to complete auto-sync.');
      setStep('consent');
    }
  };

  // Category Icon Map
  const categoryIcons = {
    Entertainment: '🎬',
    Software: '💻',
    Utilities: '🔧',
    Other: '📦',
  };

  return (
    <div className="modal-overlay">
      
      {/* ─── CONSENT / METHOD SELECTION STEP ─── */}
      {step === 'consent' && (
        <div className="onboarding-modal glass-panel" style={{ maxWidth: '520px' }}>
          <div className="onboarding-header">
            <div className="onboarding-welcome-icon">⚡</div>
            <h2 className="onboarding-title">Automated Subscription Sync</h2>
            <p className="onboarding-subtitle">
              Skip manual data entry! Allow SubTrack to automatically detect and populate your active subscription ledger in seconds.
            </p>
          </div>

          {error && (
            <div className="alert-banner alert-banner-error" style={{ margin: '0 0 16px' }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="sync-options-container">
            {/* Email Sync Method Option */}
            <button 
              type="button"
              className={`sync-option-card ${syncMethod === 'email' ? 'active-option' : ''}`}
              onClick={() => setSyncMethod('email')}
            >
              <div className="sync-option-icon">📧</div>
              <div className="sync-option-info">
                <span className="sync-option-title">Scan Email Receipts</span>
                <span className="sync-option-desc">
                  One-time secure connection to scan billing keywords (from Netflix, Spotify, etc.) directly in your inbox.
                </span>
              </div>
            </button>

            {/* Bank Sync Method Option */}
            <button 
              type="button"
              className={`sync-option-card ${syncMethod === 'bank' ? 'active-option' : ''}`}
              onClick={() => setSyncMethod('bank')}
            >
              <div className="sync-option-icon">🏦</div>
              <div className="sync-option-info">
                <span className="sync-option-title">Financial Transaction Sync</span>
                <span className="sync-option-desc">
                  Connect your bank card securely via Plaid to analyze recurring ledger payments.
                </span>
              </div>
            </button>
          </div>

          <div className="compliance-box">
            <span>🔒</span>
            <div>
              <strong>Privacy and Security (GDPR/CCPA compliant)</strong><br />
              SubTrack scans message metadata for receipt keywords or bank transaction logs. We never store raw emails, credentials, or sell your financial data.
            </div>
          </div>

          <div className="onboarding-actions" style={{ marginTop: '24px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setStep('manual');
                loadManualSuggestions();
              }}
            >
              Enter Manually
            </button>
            <button 
              className="btn btn-primary"
              onClick={() => setStep('popup')}
            >
              Continue to Sync
            </button>
          </div>
        </div>
      )}

      {/* ─── SIMULATED AUTH POPUP STEP ─── */}
      {step === 'popup' && (
        <div className="simulated-popup-overlay">
          <div className="simulated-popup-window">
            <div className="simulated-popup-titlebar">
              <div className="simulated-popup-dots">
                <span className="simulated-popup-dot popup-dot-red" />
                <span className="simulated-popup-dot popup-dot-yellow" />
                <span className="simulated-popup-dot popup-dot-green" />
              </div>
              <div className="simulated-popup-url">
                {syncMethod === 'email' 
                  ? 'https://accounts.google.com/oauth2/v2/auth?scope=gmail.readonly' 
                  : 'https://cdn.plaid.com/link/v2/stable/connect.html'}
              </div>
              <button 
                type="button"
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px' }}
                onClick={() => setStep('consent')}
              >
                ✕
              </button>
            </div>
            
            <div className="simulated-popup-body">
              {syncMethod === 'email' ? (
                /* Google / Email Consent simulation */
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '12px', color: '#fff' }}>
                    Sign in with Google
                  </h3>
                  <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '24px' }}>
                    to continue to <strong>SubTrack Ledger App</strong>
                  </p>
                  
                  <div style={{ background: '#252525', padding: '16px', borderRadius: '8px', border: '1px solid #333', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justify: 'center', fontWeight: 'bold' }}>
                      {(user && user.email) ? user.email.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: '#fff' }}>{user?.email}</div>
                      <div style={{ fontSize: '12px', color: '#777' }}>Personal Account</div>
                    </div>
                  </div>

                  <p style={{ fontSize: '13px', color: '#ccc', marginBottom: '24px', lineHeight: 1.5 }}>
                    SubTrack wants access to:
                    <span style={{ display: 'block', padding: '10px', background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', borderLeft: '3px solid #fbbf24', borderRadius: '4px', marginTop: '6px', fontSize: '12px' }}>
                      👁️ View your email metadata and search messages containing billing receipts (`gmail.readonly`)
                    </span>
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '14px' }} onClick={() => setStep('consent')}>
                      Cancel
                    </button>
                    <button className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '14px' }} onClick={startSyncScan}>
                      Allow & Sync
                    </button>
                  </div>
                </div>
              ) : (
                /* Plaid Connect Bank simulation */
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: '#fff', textAlign: 'center' }}>
                    Link with Plaid
                  </h3>
                  <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '20px', textAlign: 'center' }}>
                    Select your banking institution to scan statements securely.
                  </p>

                  {!selectedBank ? (
                    <div className="plaid-bank-list">
                      {['Chase Bank', 'Bank of America', 'Wells Fargo', 'Citibank'].map(bank => (
                        <button 
                          key={bank}
                          className="plaid-bank-btn"
                          type="button"
                          onClick={() => {
                            setSelectedBank(bank);
                            setBankUsername(user?.email ? user.email.split('@')[0] : 'user123');
                            setBankPassword('••••••••••••');
                          }}
                        >
                          {bank}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', background: 'rgba(255, 255, 255, 0.05)', padding: '10px 14px', borderRadius: '6px' }}>
                        <span style={{ cursor: 'pointer' }} onClick={() => setSelectedBank(null)}>⬅️</span>
                        <strong style={{ color: '#fff' }}>{selectedBank}</strong>
                      </div>
                      
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '12px' }}>Username / Email</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ background: '#252525', color: '#fff', border: '1px solid #444', height: '40px' }} 
                          value={bankUsername}
                          onChange={(e) => setBankUsername(e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ marginTop: '12px' }}>
                        <label className="form-label" style={{ fontSize: '12px' }}>Password</label>
                        <input 
                          type="password" 
                          className="form-input" 
                          style={{ background: '#252525', color: '#fff', border: '1px solid #444', height: '40px' }} 
                          value={bankPassword}
                          onChange={(e) => setBankPassword(e.target.value)}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                        <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '14px' }} onClick={() => setSelectedBank(null)}>
                          Back
                        </button>
                        <button className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '14px', background: '#00e676', color: '#000' }} onClick={startSyncScan}>
                          Link Credentials
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── SCANNING ANIMATION STEP ─── */}
      {step === 'scanning' && (
        <div className="onboarding-modal glass-panel" style={{ maxWidth: '500px' }}>
          <h2 className="onboarding-title" style={{ textAlign: 'center', marginBottom: '8px' }}>
            {syncMethod === 'email' ? 'Scanning Email Inbox...' : 'Scanning Bank Records...'}
          </h2>
          <p className="onboarding-subtitle" style={{ textAlign: 'center', marginBottom: '24px' }}>
            Please wait while we parse subscription receipts.
          </p>

          <div className="scanner-container">
            <div className="scanner-viewfinder">
              <div className="scanner-line" />
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justify: 'center', fontSize: '42px' }}>
                {syncMethod === 'email' ? '📨' : '💸'}
              </div>
            </div>

            <div className="scanner-progress-wrapper">
              <div className="scanner-progress-bar-bg">
                <div className="scanner-progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="scanner-progress-percent">
                <span>Auto-detecting...</span>
                <span>{progress}%</span>
              </div>
            </div>

            <div className="scanner-logs" ref={logContainerRef}>
              {logs.map((log, i) => (
                <div 
                  key={i} 
                  className={`scanner-log-line ${
                    log.type === 'found' ? 'found-log' : log.type === 'success' ? 'success-log' : 'info-log'
                  }`}
                >
                  [{new Date().toLocaleTimeString([], { hour12: false })}] {log.t}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── SUCCESS SYNC DISPLAY STEP ─── */}
      {step === 'success' && (
        <div className="onboarding-modal glass-panel" style={{ maxWidth: '500px' }}>
          <div className="onboarding-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="sync-success-circle">✓</div>
            <h2 className="onboarding-title" style={{ textAlign: 'center' }}>Sync Complete!</h2>
            <p className="onboarding-subtitle" style={{ textAlign: 'center' }}>
              We've successfully synchronized and added {detectedSubs.length} subscription{detectedSubs.length !== 1 ? 's' : ''} to your profile.
            </p>
          </div>

          <div className="sync-success-list">
            {detectedSubs.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 0', fontSize: '14px' }}>
                No new subscriptions detected that weren't already in your ledger.
              </p>
            ) : (
              detectedSubs.map((sub, i) => (
                <div key={i} className="sync-success-item">
                  <div className="sync-success-item-name">
                    <span style={{ fontSize: '18px' }}>
                      {categoryIcons[sub.category] || '📦'}
                    </span>
                    <span>{sub.service_name}</span>
                  </div>
                  <div className="sync-success-item-details">
                    <span className="sync-success-item-cost">
                      ${Number(sub.cost).toFixed(2)}/{sub.billing_cycle === 'monthly' ? 'mo' : 'yr'}
                    </span>
                    <span className="sync-success-item-date">
                      Renews: {sub.next_renewal_date}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <button 
            className="btn btn-primary btn-full"
            style={{ marginTop: '16px' }}
            onClick={onComplete}
          >
            Import Subscriptions & Continue
          </button>
        </div>
      )}

      {/* ─── MANUAL CHECKS FALLBACK STEP (Original Checklist Flow) ─── */}
      {step === 'manual' && (
        <div className="onboarding-modal glass-panel">
          <div className="onboarding-header">
            <div className="onboarding-welcome-icon">🚀</div>
            <h2 className="onboarding-title">Select Subscriptions Manually</h2>
            <p className="onboarding-subtitle">
              Select the subscriptions you currently use. We'll add them to your ledger so you can start tracking right away.
            </p>
          </div>

          {error && (
            <div className="alert-banner alert-banner-error" style={{ margin: '0 0 16px' }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="onboarding-controls">
            <span className="onboarding-count">
              {manualSelected.size} of {suggestions.length} selected
            </span>
            <div className="onboarding-control-buttons">
              <button 
                className="btn-text-link" 
                onClick={() => setManualSelected(new Set(suggestions.map(s => s.key)))}
              >
                Select All
              </button>
              <span className="onboarding-control-divider">|</span>
              <button 
                className="btn-text-link" 
                onClick={() => setManualSelected(new Set())}
              >
                Deselect All
              </button>
            </div>
          </div>

          {loadingSuggestions ? (
            <div className="onboarding-loading">
              <div className="spinner-sm" />
              <span>Loading suggestions...</span>
            </div>
          ) : (
            <div className="onboarding-grid">
              {suggestions.map(item => (
                <button
                  key={item.key}
                  className={`onboarding-card ${manualSelected.has(item.key) ? 'onboarding-card-selected' : ''} ${item.highlighted ? 'onboarding-card-highlighted' : ''}`}
                  onClick={() => handleManualSelectToggle(item.key)}
                  type="button"
                >
                  <div className="onboarding-card-check">
                    {manualSelected.has(item.key) ? '✓' : ''}
                  </div>
                  <div className="onboarding-card-body">
                    <div className="onboarding-card-icon">
                      {item.name.charAt(0)}
                    </div>
                    <div className="onboarding-card-info">
                      <span className="onboarding-card-name">{item.name}</span>
                      <span className="onboarding-card-meta">
                        ${item.cost.toFixed(2)}/{item.cycle === 'monthly' ? 'mo' : 'yr'} · {categoryIcons[item.category]} {item.category}
                      </span>
                    </div>
                  </div>
                  {item.highlighted && (
                    <span className="onboarding-card-badge">
                      {user?.auth_provider === 'google' ? '🟢 Google' : user?.auth_provider === 'apple' ? '🍎 Apple' : '⭐'} Pick
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="onboarding-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setStep('consent')}
              disabled={submittingManual}
            >
              Back to Auto-Sync
            </button>
            <button
              className="btn btn-primary"
              onClick={handleManualSubmit}
              disabled={submittingManual}
            >
              {submittingManual
                ? 'Adding...'
                : manualSelected.size > 0
                  ? `Add ${manualSelected.size} Subscription${manualSelected.size !== 1 ? 's' : ''}`
                  : 'Continue'
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingModal;

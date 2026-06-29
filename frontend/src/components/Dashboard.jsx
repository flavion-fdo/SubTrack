import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import OnboardingModal from './OnboardingModal';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

const Dashboard = () => {
  const { logout, user, fetchWithAuth, isNewUser, clearNewUserFlag } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  
  // State variables
  const [subscriptions, setSubscriptions] = useState([]);
  const [analytics, setAnalytics] = useState({
    totalMonthlySpend: 0,
    totalYearlySpend: 0,
    categoryBreakdown: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState(null); // null for Add, subscription object for Edit
  const [formData, setFormData] = useState({
    service_name: '',
    cost: '',
    billing_cycle: 'monthly',
    next_renewal_date: '',
    category: 'Entertainment',
    alert_days_before: '3'
  });
  const [modalError, setModalError] = useState('');
  
  // Sorting State
  const [sortField, setSortField] = useState('next_renewal_date');
  const [sortDirection, setSortDirection] = useState('asc');

  // Load subscriptions and analytics
  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      
      const subsData = await fetchWithAuth('/api/subscriptions').then(res => res.json());
      const analyticsData = await fetchWithAuth('/api/analytics').then(res => res.json());
      
      setSubscriptions(subsData);
      setAnalytics(analyticsData);
    } catch (err) {
      setError(err.message || 'Failed to fetch dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Show onboarding modal for new users
  useEffect(() => {
    if (isNewUser) {
      setShowOnboarding(true);
    }
  }, [isNewUser]);

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    clearNewUserFlag();
    await loadData(); // Reload to show seeded subscriptions
  };

  // Handle Sort
  const handleSort = (field) => {
    const isAsc = sortField === field && sortDirection === 'asc';
    setSortDirection(isAsc ? 'desc' : 'asc');
    setSortField(field);
  };

  // Sort Subscriptions local calculation
  const sortedSubscriptions = [...subscriptions].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (sortField === 'cost') {
      aVal = Number(aVal);
      bVal = Number(bVal);
    } else {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Open Modal for Add
  const handleOpenAddModal = () => {
    setCurrentSubscription(null);
    setFormData({
      service_name: '',
      cost: '',
      billing_cycle: 'monthly',
      next_renewal_date: '',
      category: 'Entertainment',
      alert_days_before: '3'
    });
    setModalError('');
    setIsModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEditModal = (sub) => {
    setCurrentSubscription(sub);
    setFormData({
      service_name: sub.service_name,
      cost: sub.cost.toString(),
      billing_cycle: sub.billing_cycle,
      next_renewal_date: sub.next_renewal_date,
      category: sub.category,
      alert_days_before: (sub.alert_days_before !== undefined ? sub.alert_days_before : 3).toString()
    });
    setModalError('');
    setIsModalOpen(true);
  };

  // Handle Delete
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this subscription?')) return;
    try {
      const res = await fetchWithAuth(`/api/subscriptions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete subscription');
      
      // Reload page data
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to delete subscription.');
    }
  };

  // Handle Submit Form
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setModalError('');

    const { service_name, cost, billing_cycle, next_renewal_date, category, alert_days_before } = formData;

    if (!service_name || !cost || !billing_cycle || !next_renewal_date || !category || alert_days_before === undefined) {
      setModalError('All fields are required.');
      return;
    }

    if (isNaN(cost) || Number(cost) <= 0) {
      setModalError('Cost must be a positive number.');
      return;
    }

    try {
      const method = currentSubscription ? 'PUT' : 'POST';
      const endpoint = currentSubscription ? `/api/subscriptions/${currentSubscription.id}` : '/api/subscriptions';

      const res = await fetchWithAuth(endpoint, {
        method,
        body: JSON.stringify({
          service_name,
          cost: Number(cost),
          billing_cycle,
          next_renewal_date,
          category,
          alert_days_before: Number(alert_days_before)
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save subscription');

      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      setModalError(err.message || 'Failed to save subscription.');
    }
  };

  // Category Color Map helper
  const categoryColors = {
    Entertainment: '#6366f1', // Indigo
    Software: '#14b8a6',      // Teal
    Utilities: '#f59e0b',     // Amber
    Other: '#64748b'          // Slate/Muted
  };

  // Chart Setup
  const doughnutData = {
    labels: analytics.categoryBreakdown.map(c => c.category),
    datasets: [
      {
        data: analytics.categoryBreakdown.map(c => c.monthlySpend),
        backgroundColor: analytics.categoryBreakdown.map(c => categoryColors[c.category] || '#ffffff'),
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false // We render custom legend details for premium look
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return ` $${context.raw.toFixed(2)}/mo`;
          }
        }
      }
    },
    cutout: '75%'
  };

  // Upcoming Alert calculations
  const getDaysRemaining = (dateStr) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const renewal = new Date(dateStr);
    renewal.setHours(0,0,0,0);
    const diffTime = renewal.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Find immediate next renewal subscription
  const getNextRenewer = () => {
    if (subscriptions.length === 0) return null;
    // sorted by date ascending
    const withDays = subscriptions.map(sub => ({
      ...sub,
      daysLeft: getDaysRemaining(sub.next_renewal_date)
    }));
    // Sort so positive days are first, then past ones, find the closest one
    const futureRenews = withDays.filter(sub => sub.daysLeft >= 0);
    if (futureRenews.length > 0) return futureRenews[0];
    return withDays[0]; // fallback
  };

  const nextRenewer = getNextRenewer();

  return (
    <div className="dashboard-layout">
      {/* Header */}
      <header className="header">
        <div className="logo-container">
          <div className="logo-text">SubTrack</div>
          <span className="logo-badge">MVP</span>
        </div>
        <div className="user-nav">
          <span className="user-email">{user?.email}</span>
          <div className="profile-avatar" title={user?.email}>
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <button className="btn btn-secondary btn-logout-text" onClick={logout}>Logout</button>
          <button className="icon-btn btn-logout-icon" onClick={logout} title="Logout">⏻</button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {error && (
          <div className="alert-banner alert-banner-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Metrics Row */}
        <div className="metrics-row">
          <div className="metric-card glass-panel">
            <div className="metric-label">Monthly Spend</div>
            <div className="metric-value metric-value-primary">${analytics.totalMonthlySpend.toFixed(2)}</div>
            <div className="metric-subtext">Sum of all subscriptions normalized to monthly</div>
            <div className="metric-icon-bg">💳</div>
          </div>

          <div className="metric-card glass-panel">
            <div className="metric-label">Yearly Spend</div>
            <div className="metric-value metric-value-accent">${analytics.totalYearlySpend.toFixed(2)}</div>
            <div className="metric-subtext">Sum of all subscriptions normalized to yearly</div>
            <div className="metric-icon-bg">📈</div>
          </div>

          <div className="metric-card glass-panel">
            <div className="metric-label">Next Renewal</div>
            {nextRenewer ? (
              <>
                <div className="metric-value metric-value-primary">
                  {nextRenewer.service_name}
                </div>
                <div className="metric-subtext">
                  ${nextRenewer.cost.toFixed(2)} ({nextRenewer.billing_cycle}) •{' '}
                  <span className={nextRenewer.daysLeft <= 3 ? 'renewal-warning' : ''}>
                    {nextRenewer.daysLeft === 0 
                      ? 'Renews Today!' 
                      : nextRenewer.daysLeft < 0 
                        ? `Overdue by ${Math.abs(nextRenewer.daysLeft)} days`
                        : `Renews in ${nextRenewer.daysLeft} days`}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="metric-value metric-value-primary" style={{ fontSize: '24px', opacity: 0.5 }}>None</div>
                <div className="metric-subtext">Add a subscription below to start tracking</div>
              </>
            )}
            <div className="metric-icon-bg">🔔</div>
          </div>
        </div>

        {/* Analytics Section (Chart + Category list) */}
        <div className="analytics-section">
          {/* Chart Card */}
          <div className="chart-card glass-panel">
            <div className="chart-header">
              <h2 className="chart-title">Spending Breakdown</h2>
              <span className="ledger-subtitle">Monthly breakdown by category</span>
            </div>
            
            <div className="chart-inner">
              {subscriptions.length > 0 ? (
                <>
                  <div className="chart-container chart-doughnut-wrapper">
                    <Doughnut data={doughnutData} options={doughnutOptions} />
                  </div>
                  
                  {/* Custom Legend */}
                  <div className="chart-legend">
                    {analytics.categoryBreakdown.map(item => (
                      <div key={item.category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span 
                            style={{ 
                              width: '10px', 
                              height: '10px', 
                              borderRadius: '50%', 
                              backgroundColor: categoryColors[item.category] 
                            }} 
                          />
                          <span style={{ fontWeight: 500 }}>{item.category}</span>
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                          ${item.monthlySpend.toFixed(2)}/mo
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No subscription data to display breakdown.
                </div>
              )}
            </div>
          </div>

          {/* Category breakdown visual list */}
          <div className="chart-card glass-panel chart-card-category">
            <div className="chart-header">
              <h2 className="chart-title">Category Share</h2>
            </div>
            <div className="category-list">
              {['Entertainment', 'Software', 'Utilities', 'Other'].map(cat => {
                const item = analytics.categoryBreakdown.find(c => c.category === cat) || { monthlySpend: 0 };
                const percentage = analytics.totalMonthlySpend > 0 
                  ? (item.monthlySpend / analytics.totalMonthlySpend) * 100 
                  : 0;
                
                return (
                  <div key={cat} className="category-item">
                    <div className="category-item-header">
                      <div className="category-name-wrapper">
                        <span className={`category-dot dot-${cat.toLowerCase()}`} />
                        <span className="category-name">{cat}</span>
                      </div>
                      <span className="category-cost">${item.monthlySpend.toFixed(2)}/mo</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div 
                        className="progress-bar-fill" 
                        style={{ 
                          width: `${percentage}%`,
                          backgroundColor: categoryColors[cat]
                        }} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Subscription Ledger (CRUD Grid) */}
        <div className="ledger-card glass-panel">
          <div className="ledger-header">
            <div className="ledger-title-group">
              <h2 className="ledger-title">Subscriptions Ledger</h2>
              <p className="ledger-subtitle">Manage your active subscriptions and trial cycles</p>
            </div>
            <div className="ledger-actions" style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-accent" onClick={() => setShowOnboarding(true)}>⚡ Auto-Sync</button>
              <button className="btn btn-primary" onClick={handleOpenAddModal}>+ Add Subscription</button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading subscriptions...</div>
          ) : sortedSubscriptions.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: '48px' }}>📂</div>
              <h3 className="empty-title">No subscriptions tracked yet</h3>
              <p className="empty-desc">Get started by clicking the "+ Add Subscription" button to register your first billing service.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="sub-table">
                <thead>
                  <tr>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('service_name')}>
                      Service Name {sortField === 'service_name' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('cost')}>
                      Cost {sortField === 'cost' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th>Billing Cycle</th>
                    <th>Category</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => handleSort('next_renewal_date')}>
                      Next Renewal {sortField === 'next_renewal_date' && (sortDirection === 'asc' ? '▲' : '▼')}
                    </th>
                    <th>Days Left</th>
                    <th>Alert Day</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSubscriptions.map((sub) => {
                    const daysLeft = getDaysRemaining(sub.next_renewal_date);
                    return (
                      <tr key={sub.id}>
                        <td>
                          <div className="service-cell">
                            <div className="service-avatar">
                              {sub.service_name.charAt(0).toUpperCase()}
                            </div>
                            <span className="service-name-text">{sub.service_name}</span>
                          </div>
                        </td>
                        <td>
                          <span className="cost-text">${Number(sub.cost).toFixed(2)}</span>
                        </td>
                        <td>
                          <span className={`cycle-badge cycle-${sub.billing_cycle}`}>
                            {sub.billing_cycle}
                          </span>
                        </td>
                        <td>
                          <span className={`category-tag cat-${sub.category}`}>
                            {sub.category}
                          </span>
                        </td>
                        <td>
                          <span>{sub.next_renewal_date}</span>
                        </td>
                        <td>
                          <span className={daysLeft <= 3 && daysLeft >= 0 ? 'renewal-warning' : ''} style={{ fontWeight: 500 }}>
                            {daysLeft === 0 
                              ? 'Today' 
                              : daysLeft < 0 
                                ? `Overdue (${Math.abs(daysLeft)}d)` 
                                : `${daysLeft} days`}
                          </span>
                        </td>
                        <td>
                          <span>{sub.alert_days_before === 0 ? 'Same Day' : `${sub.alert_days_before}d before`}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                            <button 
                              className="icon-btn" 
                              title="Edit subscription"
                              onClick={() => handleOpenEditModal(sub)}
                            >
                              ✏️
                            </button>
                            <button 
                              className="icon-btn icon-btn-danger" 
                              title="Delete subscription"
                              onClick={() => handleDelete(sub.id)}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* CRUD Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <div className="modal-header">
              <h3 className="modal-title">
                {currentSubscription ? `Edit ${currentSubscription.service_name}` : 'Add Subscription'}
              </h3>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            {modalError && (
              <div className="alert-banner alert-banner-error">
                <span>⚠️</span>
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm}>
              <div className="form-group">
                <label className="form-label" htmlFor="modal-service_name">Service Name</label>
                <input
                  className="form-input"
                  id="modal-service_name"
                  type="text"
                  placeholder="e.g. Netflix, Adobe Creative Cloud"
                  value={formData.service_name}
                  onChange={(e) => setFormData({ ...formData, service_name: e.target.value })}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="modal-cost">Cost ($)</label>
                  <input
                    className="form-input"
                    id="modal-cost"
                    type="number"
                    step="0.01"
                    placeholder="9.99"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="modal-billing_cycle">Billing Cycle</label>
                  <select
                    className="form-select"
                    id="modal-billing_cycle"
                    value={formData.billing_cycle}
                    onChange={(e) => setFormData({ ...formData, billing_cycle: e.target.value })}
                    required
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="modal-next_renewal_date">Next Renewal Date</label>
                  <input
                    className="form-input"
                    id="modal-next_renewal_date"
                    type="date"
                    value={formData.next_renewal_date}
                    onChange={(e) => setFormData({ ...formData, next_renewal_date: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="modal-category">Category</label>
                  <select
                    className="form-select"
                    id="modal-category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    required
                  >
                    <option value="Entertainment">Entertainment</option>
                    <option value="Software">Software</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="modal-alert_days_before">Renewal Alert Day</label>
                <select
                  className="form-select"
                  id="modal-alert_days_before"
                  value={formData.alert_days_before}
                  onChange={(e) => setFormData({ ...formData, alert_days_before: e.target.value })}
                  required
                >
                  <option value="0">Same Day (0 days before)</option>
                  <option value="1">1 Day Before</option>
                  <option value="2">2 Days Before</option>
                  <option value="3">3 Days Before</option>
                  <option value="5">5 Days Before</option>
                  <option value="7">7 Days Before</option>
                  <option value="14">14 Days Before</option>
                </select>
              </div>

              <div className="modal-actions">
                <button className="btn btn-secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button className="btn btn-primary" type="submit">
                  {currentSubscription ? 'Save Changes' : 'Create Subscription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Onboarding Modal for new users */}
      {showOnboarding && (
        <OnboardingModal onComplete={handleOnboardingComplete} />
      )}

      {/* Bottom Navigation — visible on mobile only */}
      <nav className="bottom-nav">
        <button className="bottom-nav-item bottom-nav-active">
          <span className="bottom-nav-icon">📊</span>
          <span className="bottom-nav-label">Dashboard</span>
        </button>
        <button className="bottom-nav-item" onClick={handleOpenAddModal}>
          <span className="bottom-nav-icon">➕</span>
          <span className="bottom-nav-label">Add</span>
        </button>
        <button className="bottom-nav-item" onClick={logout}>
          <span className="bottom-nav-icon">⏻</span>
          <span className="bottom-nav-label">Logout</span>
        </button>
      </nav>
    </div>
  );
};

export default Dashboard;

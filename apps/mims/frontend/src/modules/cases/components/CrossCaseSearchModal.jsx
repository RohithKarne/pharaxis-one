import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { httpFetch } from '../../../shared/api/httpFetch';
import { useAuth } from '../../../shared/context/AuthContext';
import './CrossCaseSearchModal.css';

const API = import.meta.env.VITE_API_URL || '/api';

export default function CrossCaseSearchModal({ onClose }) {
  const navigate = useNavigate();
  const { token } = useAuth();
  
  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  );

  const [searchParams, setSearchParams] = useState({
    initials: '',
    name: '',
    email: '',
    phone: ''
  });

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchParams.initials && !searchParams.name && !searchParams.email && !searchParams.phone) {
      setError('Please enter at least one search criteria.');
      return;
    }
    
    setError(null);
    setLoading(true);
    setResults(null);
    
    try {
      const query = new URLSearchParams();
      if (searchParams.initials) query.append('initials', searchParams.initials);
      if (searchParams.name) query.append('name', searchParams.name);
      if (searchParams.email) query.append('email', searchParams.email);
      if (searchParams.phone) query.append('phone', searchParams.phone);

      const res = await httpFetch(`${API}/admin/contacts/cross-case-search?${query.toString()}`, { headers });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to search');
      
      setResults(data.matches || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSearchParams({ initials: '', name: '', email: '', phone: '' });
    setResults(null);
    setError(null);
  };

  return (
    <div className="cf-modal-overlay" onClick={onClose}>
      <div className="cf-modal cross-case-modal" style={{ maxWidth: 800, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="cf-modal-header" style={{ flexShrink: 0 }}>
          <span className="cf-modal-title">Cross-Case Patient/Reporter Search</span>
          <button className="cf-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="cf-modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <form onSubmit={handleSearch} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--surface, #f9fafb)', padding: '16px', borderRadius: '8px' }}>
            <div className="cf-form-field" style={{ margin: 0 }}>
              <label className="cf-modal-label">Patient Initials</label>
              <input 
                className="cf-modal-select" 
                value={searchParams.initials} 
                onChange={e => setSearchParams({...searchParams, initials: e.target.value})} 
                placeholder="e.g. J.D." 
              />
            </div>
            <div className="cf-form-field" style={{ margin: 0 }}>
              <label className="cf-modal-label">Reporter Name</label>
              <input 
                className="cf-modal-select" 
                value={searchParams.name} 
                onChange={e => setSearchParams({...searchParams, name: e.target.value})} 
                placeholder="First or Last Name" 
              />
            </div>
            <div className="cf-form-field" style={{ margin: 0 }}>
              <label className="cf-modal-label">Email</label>
              <input 
                type="email"
                className="cf-modal-select" 
                value={searchParams.email} 
                onChange={e => setSearchParams({...searchParams, email: e.target.value})} 
                placeholder="Email Address" 
              />
            </div>
            <div className="cf-form-field" style={{ margin: 0 }}>
              <label className="cf-modal-label">Phone</label>
              <input 
                className="cf-modal-select" 
                value={searchParams.phone} 
                onChange={e => setSearchParams({...searchParams, phone: e.target.value})} 
                placeholder="Phone Number" 
              />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button type="button" className="cf-modal-cancel" onClick={handleClear}>Clear</button>
              <button type="submit" className="cf-modal-confirm" disabled={loading}>
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>

          {error && <div style={{ color: 'var(--danger, #dc2626)', padding: '12px', background: '#fee2e2', borderRadius: '8px' }}>{error}</div>}

          {results && (
            <div className="cross-case-results">
              <h3 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--text, #111827)' }}>
                Found {results.length} unique {results.length === 1 ? 'individual' : 'individuals'}
              </h3>
              
              {results.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted, #6b7280)', background: 'var(--surface, #f9fafb)', borderRadius: '8px' }}>
                  No matches found for the given criteria.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {results.map((match, idx) => (
                    <div key={idx} style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', background: 'var(--surface-alt, #f3f4f6)', borderBottom: '1px solid var(--border, #e5e7eb)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '16px', color: 'var(--text, #111827)' }}>{match.name || 'Unknown'}</span>
                          <span style={{ marginLeft: '8px', fontSize: '12px', padding: '2px 8px', borderRadius: '12px', background: match.entity_type === 'patient' ? '#dbeafe' : '#fce7f3', color: match.entity_type === 'patient' ? '#1e40af' : '#9d174d', textTransform: 'capitalize' }}>
                            {match.entity_type}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary, #4b5563)' }}>
                          {match.email && <span style={{ marginRight: '12px' }}>✉️ {match.email}</span>}
                          {match.phone && <span>📞 {match.phone}</span>}
                        </div>
                      </div>
                      
                      <div style={{ padding: '0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ background: '#fafafa', borderBottom: '1px solid var(--border, #e5e7eb)', textAlign: 'left' }}>
                              <th style={{ padding: '8px 16px', fontWeight: 500, color: 'var(--text-secondary, #4b5563)' }}>Case #</th>
                              <th style={{ padding: '8px 16px', fontWeight: 500, color: 'var(--text-secondary, #4b5563)' }}>Type</th>
                              <th style={{ padding: '8px 16px', fontWeight: 500, color: 'var(--text-secondary, #4b5563)' }}>Status</th>
                              <th style={{ padding: '8px 16px', fontWeight: 500, color: 'var(--text-secondary, #4b5563)' }}>Date Received</th>
                              <th style={{ padding: '8px 16px', fontWeight: 500, color: 'var(--text-secondary, #4b5563)' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {match.cases.map(c => (
                              <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '8px 16px', fontWeight: 500 }}>{c.case_number || `Draft (${c.id})`}</td>
                                <td style={{ padding: '8px 16px' }}>{c.case_type}</td>
                                <td style={{ padding: '8px 16px' }}>{c.status}</td>
                                <td style={{ padding: '8px 16px' }}>{c.date_received ? c.date_received.substring(0, 10) : '—'}</td>
                                <td style={{ padding: '8px 16px' }}>
                                  <button 
                                    onClick={() => navigate(`/cases/${c.id}`)}
                                    style={{ color: 'var(--primary, #2563eb)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 500 }}
                                  >
                                    View Case
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

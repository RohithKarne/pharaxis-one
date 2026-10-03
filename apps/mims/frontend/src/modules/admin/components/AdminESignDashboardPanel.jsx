import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../shared/context/AuthContext';
import { apiClient } from '../../../shared/api/apiClient';

const AdminESignDashboardPanel = () => {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchIntegrity = async () => {
    try {
      setLoading(true);
      setError(null);
      const api = apiClient(token);
      const res = await api.get('/api/admin/esign/integrity-check');
      setData(res);
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to fetch integrity check');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrity();
  }, []);

  if (loading) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--text-muted)' }}>Loading hash chain integrity…</div></div>;
  }

  if (error) {
    return (
      <div className="card">
        <div className="card-header"><h3 style={{ margin: 0 }}>Hash Chain Verification Failed</h3></div>
        <div className="card-body">
          <p style={{ color: '#b91c1c', marginTop: 0 }}>{error}</p>
          <button onClick={fetchIntegrity} className="btn btn-outline">Retry</button>
        </div>
      </div>
    );
  }

  const { intact, totalEvents, headHash, lastSignatureAt, events = [] } = data;

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>E-Signature Verification Dashboard</h3>
        <button onClick={fetchIntegrity} className="btn btn-primary">Verify Hash Chain Integrity</button>
      </div>

      <div className="card-body" style={{ display: 'grid', gap: 10 }}>
        <div className="summary-line">
          <span>Status: <b style={{ color: intact ? '#166534' : '#b91c1c' }}>{intact ? 'Intact (every recorded signature matches the chain)' : 'Chain broken'}</b></span>
          <span>Total events: <b>{totalEvents}</b></span>
          <span>Last signature: <b>{lastSignatureAt ? new Date(lastSignatureAt).toLocaleString() : 'N/A'}</b></span>
        </div>
        <div style={{ fontSize: 12 }}>
          Head hash (latest): <code title={headHash} style={{ wordBreak: 'break-all' }}>{headHash || 'No signatures yet'}</code>
        </div>

        <h3 style={{ margin: '6px 0 0', fontSize: 14 }}>Recent E-Signature Events</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Signed By</th>
                <th>Action</th>
                <th>Meaning</th>
                <th>Auth Method</th>
                <th>Hash Chain (Snippet)</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {events.slice().reverse().slice(0, 20).map(evt => (
                <tr key={evt.id}>
                  <td>#{evt.case_id}</td>
                  <td>{evt.signed_name}</td>
                  <td>{evt.transition}</td>
                  <td title={evt.meaning}>{evt.meaning}</td>
                  <td>{evt.auth_method}</td>
                  <td style={{ fontFamily: 'monospace' }} title={evt.hash_chain}>
                    {evt.hash_chain ? `${evt.hash_chain.substring(0, 16)}...` : 'N/A'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {evt.created_at ? new Date(evt.created_at).toLocaleString() : ''}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>
                    No e-signature events found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminESignDashboardPanel;

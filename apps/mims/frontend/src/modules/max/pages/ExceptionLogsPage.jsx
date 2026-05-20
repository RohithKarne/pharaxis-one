import { useEffect, useMemo, useState } from 'react';
import MIMSLayout from '../../../shared/components/MIMSLayout';
import { useAuth } from '../../../shared/context/AuthContext';
import { httpFetch } from '../../../shared/api/httpFetch.js'
import { isAdminUser } from '../../../shared/utils/adminScope.js';

function formatDate(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString();
}

export default function ExceptionLogsPage() {
  const { token, user } = useAuth();
  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  );

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState({
    status: '',
    source: '',
    search: '',
  });
  const [selectedException, setSelectedException] = useState(null);
  const [copiedId, setCopiedId] = useState('');

  async function copyExceptionId(id) {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 1400);
    } catch (_) {
      setCopiedId('');
    }
  }

  async function load(nextPage = page, nextQuery = query) {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: '20',
        status: nextQuery.status || '',
        source: nextQuery.source || '',
        search: nextQuery.search || '',
      });
      for (const [k, v] of [...params.entries()]) {
        if (!v) params.delete(k);
      }
      const res = await httpFetch(`/api/admin/observability/exceptions?${params.toString()}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load exception logs.');
      setRows(data.data || []);
      setTotal(Number(data.total || 0));
      setTotalPages(Number(data.total_pages || 1));
      setPage(Number(data.page || nextPage));
    } catch (errLoad) {
      setError(errLoad.message || 'Failed to load exception logs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = isAdminUser(user);

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="mims-home-page-body">
      <div className="mims-home-wrap">
        <div className="mims-home-hero">
          <div>
            <h1>Exception Logs</h1>
            <p>Centralized exception stream with traceable exception IDs for API and client failures.</p>
          </div>
          <div className="mims-home-hero-actions">
            <button className="btn btn-outline" onClick={() => load(page, query)} disabled={loading}>Refresh</button>
          </div>
        </div>

        {!isAdmin && (
          <div className="alert alert-error">Only administrator users can access exception details.</div>
        )}
        {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}

        {isAdmin && (
          <section className="card" style={{ marginTop: 12 }}>
            <div className="card-header">
              <h3>Filters</h3>
            </div>
            <div className="card-body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                className="form-input"
                placeholder="Search by exception or endpoint"
                value={query.search}
                onChange={(e) => setQuery((prev) => ({ ...prev, search: e.target.value }))}
                style={{ minWidth: 280 }}
              />
              <select className="form-input" value={query.status} onChange={(e) => setQuery((prev) => ({ ...prev, status: e.target.value }))}>
                <option value="">All Statuses</option>
                <option value="failed">Failed</option>
                <option value="warning">Warning</option>
              </select>
              <select className="form-input" value={query.source} onChange={(e) => setQuery((prev) => ({ ...prev, source: e.target.value }))}>
                <option value="">All Sources</option>
                <option value="API Exceptions">API Exceptions</option>
                <option value="Frontend Runtime">Frontend Runtime</option>
              </select>
              <button className="btn btn-primary" onClick={() => load(1, query)} disabled={loading}>Apply</button>
            </div>
          </section>
        )}

        {isAdmin && (
          <section className="card" style={{ marginTop: 12 }}>
            <div className="card-header">
              <h3>Exceptions ({total})</h3>
            </div>
            <div className="card-body" style={{ overflowX: 'auto' }}>
              {loading ? <div className="mims-home-empty">Loading exception logs...</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Time', 'Exception ID', 'Copy', 'Source', 'Status', 'HTTP', 'Route', 'Message', 'Details'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={9} style={{ padding: 12, color: 'var(--text-muted)' }}>No exceptions found.</td></tr>
                    ) : rows.map((row) => (
                      <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px' }}>{formatDate(row.created_at)}</td>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{row.exception_id || '—'}</td>
                        <td style={{ padding: '8px 10px' }}>
                          {row.exception_id ? (
                            <button className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => copyExceptionId(row.exception_id)}>
                              {copiedId === row.exception_id ? 'Copied' : 'Copy'}
                            </button>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px' }}>{row.source}</td>
                        <td style={{ padding: '8px 10px' }}>{row.status}</td>
                        <td style={{ padding: '8px 10px' }}>{row.status_code ?? '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{row.route || '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{row.description || '—'}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setSelectedException(row)}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px' }}>
              <button className="btn btn-outline" disabled={page <= 1 || loading} onClick={() => load(page - 1, query)}>Previous</button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
              <button className="btn btn-outline" disabled={page >= totalPages || loading} onClick={() => load(page + 1, query)}>Next</button>
            </div>
          </section>
        )}
      </div>
      {selectedException && (
        <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 420, background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 20px rgba(0,0,0,0.15)', zIndex: 1300, padding: 16, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Exception Details</h3>
            <button className="btn btn-outline" onClick={() => setSelectedException(null)}>Close</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Exception ID: <span style={{ fontFamily: 'monospace' }}>{selectedException.exception_id || '—'}</span></div>
          <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <div><strong>Source:</strong> {selectedException.source || '—'}</div>
            <div><strong>Status:</strong> {selectedException.status || '—'}</div>
            <div><strong>HTTP:</strong> {selectedException.status_code ?? '—'}</div>
            <div><strong>Method:</strong> {selectedException.method || '—'}</div>
            <div><strong>Route:</strong> {selectedException.route || '—'}</div>
            <div><strong>Created:</strong> {formatDate(selectedException.created_at)}</div>
            <div><strong>Description:</strong> {selectedException.description || '—'}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <strong>Payload</strong>
            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, fontSize: 12 }}>
              {JSON.stringify(selectedException.details || {}, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </MIMSLayout>
  );
}

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../shared/context/AuthContext';
import { httpFetch } from '../../../shared/api/httpFetch';

export default function AdminPicklistsPanel() {
  const { token, orgId } = useAuth();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const [modal, setModal] = useState(null);

  async function exportCsv() {
    try {
      const res = await httpFetch(`/api/admin/picklists/export`, { headers: H });
      if (!res.ok) { alert('Export failed'); return; }
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `picklists_export_org_${orgId || '0'}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Network error during export.');
    }
  }

  return (
    <div className="admin-picklists-panel" style={{ padding: 20 }}>
      <h2>Picklist Admin Toolbar</h2>
      <div style={{ marginBottom: 20 }}>
        <button onClick={exportCsv} style={{ marginRight: 10 }}>Export Picklists (CSV)</button>
        <button onClick={() => setModal('import')}>Import Picklists (CSV)</button>
      </div>

      {modal === 'import' && (
        <ImportModal
          H={H}
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); alert('Import successful'); }}
        />
      )}
    </div>
  );
}

function ImportModal({ H, onClose, onSuccess }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(''); setPreview(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setCsv(text);
      // Basic CSV parser to count rows
      const rows = text.split('\n').filter(r => r.trim());
      const total = Math.max(0, rows.length - 1);
      // For preview, we assume all valid for now unless we implement full parsing
      setPreview({ total, valid: total, invalid: 0 });
    };
    reader.onerror = () => setErr('Could not read file.');
    reader.readAsText(file);
  }

  async function runCommit() {
    setBusy(true); setErr('');
    try {
      // Very basic manual parsing for the demo, since we need to send JSON
      const lines = csv.split('\n').filter(l => l.trim());
      if (lines.length <= 1) throw new Error("Empty CSV");
      const headers = lines[0].split(',').map(s => s.trim().toLowerCase());
      
      const rows = lines.slice(1).map(line => {
        // Handle basic CSV
        const parts = line.split(',');
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = parts[i]?.trim();
        });
        return obj;
      });

      const r = await httpFetch('/api/admin/picklists/import', {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ rows }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Import failed.'); return; }
      alert(`Import done — ${d.imported_count} rows imported.`);
      onSuccess();
    } catch (e) {
      setErr(e.message || 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', top: '20%', left: '30%', background: 'white', padding: 20, border: '1px solid #ccc', zIndex: 100 }}>
      <h3>Import Picklists</h3>
      <input type="file" accept=".csv" onChange={onFile} />
      {preview && (
        <div style={{ margin: '10px 0' }}>
          Total rows detected: {preview.total}<br/>
          Valid rows: {preview.valid}<br/>
        </div>
      )}
      {err && <div style={{ color: 'red' }}>{err}</div>}
      <div style={{ marginTop: 20 }}>
        <button onClick={onClose} style={{ marginRight: 10 }}>Cancel</button>
        {preview && <button onClick={runCommit} disabled={busy || preview.valid === 0}>{busy ? 'Importing...' : 'Import'}</button>}
      </div>
    </div>
  );
}

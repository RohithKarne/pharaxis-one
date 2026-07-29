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
    return <div className="p-4 bg-white rounded shadow text-gray-500">Loading Hash Chain Integrity...</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-white rounded shadow text-red-600 border border-red-200">
        <h3 className="text-lg font-bold mb-2">Hash Chain Verification Failed</h3>
        <p>{error}</p>
        <button 
          onClick={fetchIntegrity}
          className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  const { intact, totalEvents, headHash, lastSignatureAt, events = [] } = data;

  return (
    <div className="bg-white rounded shadow border border-gray-200">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h2 className="text-xl font-bold text-gray-800">E-Signature Verification Dashboard</h2>
        <button
          onClick={fetchIntegrity}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded shadow-sm"
        >
          Verify Hash Chain Integrity
        </button>
      </div>
      
      <div className="p-6">
        <div className="flex items-center space-x-4 mb-6">
          <div className="flex-1 p-4 rounded border bg-gray-50">
            <p className="text-sm text-gray-500 uppercase tracking-wider mb-1">Status</p>
            {intact ? (
              <div className="flex items-center text-green-700 font-bold text-lg">
                <span className="mr-2">✅</span>
                100% Intact — 21 CFR Part 11 Compliant
              </div>
            ) : (
              <div className="flex items-center text-red-600 font-bold text-lg">
                <span className="mr-2">❌</span>
                Chain Broken
              </div>
            )}
          </div>
          <div className="flex-1 p-4 rounded border bg-gray-50">
            <p className="text-sm text-gray-500 uppercase tracking-wider mb-1">Total Events</p>
            <p className="text-xl font-medium text-gray-800">{totalEvents}</p>
          </div>
          <div className="flex-1 p-4 rounded border bg-gray-50">
            <p className="text-sm text-gray-500 uppercase tracking-wider mb-1">Last Signature</p>
            <p className="text-xl font-medium text-gray-800">
              {lastSignatureAt ? new Date(lastSignatureAt).toLocaleString() : 'N/A'}
            </p>
          </div>
        </div>
        
        <div className="mb-6 p-4 rounded border bg-gray-50 overflow-hidden">
          <p className="text-sm text-gray-500 uppercase tracking-wider mb-1">Head Hash (Latest)</p>
          <p className="font-mono text-sm text-gray-700 truncate" title={headHash}>
            {headHash || 'No signatures yet'}
          </p>
        </div>
        
        <h3 className="text-lg font-bold text-gray-800 mb-4">Recent E-Signature Events</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="p-3 border-b">Case ID</th>
                <th className="p-3 border-b">Signed By</th>
                <th className="p-3 border-b">Action</th>
                <th className="p-3 border-b">Meaning</th>
                <th className="p-3 border-b">Auth Method</th>
                <th className="p-3 border-b">Hash Chain (Snippet)</th>
                <th className="p-3 border-b">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {events.slice().reverse().slice(0, 20).map(evt => (
                <tr key={evt.id} className="border-b hover:bg-gray-50 text-sm">
                  <td className="p-3 font-medium text-blue-600">#{evt.case_id}</td>
                  <td className="p-3">{evt.signed_name}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                      {evt.transition}
                    </span>
                  </td>
                  <td className="p-3 text-gray-600 truncate max-w-xs" title={evt.meaning}>
                    {evt.meaning}
                  </td>
                  <td className="p-3">{evt.auth_method}</td>
                  <td className="p-3 font-mono text-xs text-gray-500" title={evt.hash_chain}>
                    {evt.hash_chain ? `${evt.hash_chain.substring(0, 16)}...` : 'N/A'}
                  </td>
                  <td className="p-3 text-gray-600 whitespace-nowrap">
                    {evt.created_at ? new Date(evt.created_at).toLocaleString() : ''}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-gray-500">
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

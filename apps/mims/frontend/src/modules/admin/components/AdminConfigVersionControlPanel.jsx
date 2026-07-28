import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AdminConfigVersionControlPanel = () => {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newSnapshot, setNewSnapshot] = useState({ name: '', type: 'all' });

  useEffect(() => {
    fetchSnapshots();
  }, []);

  const fetchSnapshots = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/admin/config-versions');
      setSnapshots(response.data.snapshots || []);
    } catch (error) {
      console.error('Error fetching snapshots', error);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSnapshot = async () => {
    try {
      await axios.post('/api/admin/config-versions', {
        snapshotName: newSnapshot.name,
        configType: newSnapshot.type
      });
      setShowModal(false);
      fetchSnapshots();
    } catch (error) {
      console.error('Error creating snapshot', error);
    }
  };

  const handleRollback = async (id) => {
    if (window.confirm('Are you sure you want to rollback to this version? This will overwrite current configurations.')) {
      try {
        await axios.post(`/api/admin/config-versions/${id}/rollback`);
        alert('Rollback successful');
      } catch (error) {
        console.error('Error during rollback', error);
        alert('Rollback failed');
      }
    }
  };

  return (
    <div className="admin-config-version-control">
      <h2>Configuration Version Control</h2>
      <button onClick={() => setShowModal(true)}>Create Snapshot</button>
      
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Version #</th>
              <th>Snapshot Name</th>
              <th>Type</th>
              <th>Created By</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map(snap => (
              <tr key={snap.id}>
                <td>{snap.version_number || snap.id}</td>
                <td>{snap.snapshot_name}</td>
                <td>{snap.configuration_type}</td>
                <td>{snap.created_by}</td>
                <td>{new Date(snap.created_at).toLocaleDateString()}</td>
                <td>
                  <button onClick={() => handleRollback(snap.id)}>Rollback to Version</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal">
          <h3>Create New Snapshot</h3>
          <input 
            type="text" 
            placeholder="Snapshot Name" 
            value={newSnapshot.name}
            onChange={(e) => setNewSnapshot({...newSnapshot, name: e.target.value})}
          />
          <select 
            value={newSnapshot.type}
            onChange={(e) => setNewSnapshot({...newSnapshot, type: e.target.value})}
          >
            <option value="all">All</option>
            <option value="picklists">Picklists</option>
            <option value="workflows">Workflows</option>
            <option value="form_rules">Form Rules</option>
            <option value="feature_flags">Feature Flags</option>
          </select>
          <button onClick={handleCreateSnapshot}>Save</button>
          <button onClick={() => setShowModal(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
};

export default AdminConfigVersionControlPanel;

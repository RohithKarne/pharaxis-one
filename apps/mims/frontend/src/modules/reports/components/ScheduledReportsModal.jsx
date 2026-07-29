import React, { useState, useEffect } from 'react';

export default function ScheduledReportsModal({ visible, onClose, orgId }) {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(false);

    const [name, setName] = useState('');
    const [reportPresetId, setReportPresetId] = useState('');
    const [schedule, setSchedule] = useState('daily');
    const [format, setFormat] = useState('csv');
    const [recipients, setRecipients] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const fetchSchedules = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/reports/scheduled?org_id=${orgId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await res.json();
            if (data.data) {
                setSchedules(data.data);
            }
        } catch (err) {
            console.error('Failed to fetch schedules', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (visible) {
            fetchSchedules();
        }
    }, [visible, orgId]);

    const handleCreate = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        try {
            const rcpts = recipients.split(',').map(email => email.trim());
            const res = await fetch('/api/reports/scheduled', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    name,
                    report_preset_id: reportPresetId,
                    schedule,
                    format,
                    recipients: rcpts,
                    org_id: orgId
                })
            });
            const data = await res.json();
            if (data.success) {
                setName('');
                setReportPresetId('');
                setRecipients('');
                fetchSchedules();
            } else {
                setErrorMsg(data.error || 'Failed to create schedule');
            }
        } catch (err) {
            setErrorMsg('Failed to create schedule');
        }
    };

    const handleDelete = async (id) => {
        try {
            await fetch(`/api/reports/scheduled/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            fetchSchedules();
        } catch (err) {
            console.error('Failed to delete schedule', err);
        }
    };

    const handleRunNow = async (id) => {
        try {
            await fetch(`/api/reports/scheduled/${id}/run-now`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            alert('Report triggered successfully.');
        } catch (err) {
            alert('Failed to trigger report.');
        }
    };

    if (!visible) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 9999,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                background: '#fff', padding: '24px', borderRadius: '8px', width: '800px',
                maxHeight: '90vh', overflowY: 'auto', position: 'relative'
            }}>
                <button 
                    onClick={onClose}
                    style={{ position: 'absolute', top: '16px', right: '16px', cursor: 'pointer', background: 'none', border: 'none', fontSize: '20px' }}
                >
                    &times;
                </button>
                <h2>Scheduled Reports</h2>
                
                {errorMsg && <div style={{ color: 'red', marginBottom: '16px' }}>{errorMsg}</div>}

                <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                    <label>
                        Schedule Name
                        <input type="text" value={name} onChange={e => setName(e.target.value)} required style={{ width: '100%', padding: '8px' }} />
                    </label>
                    <label>
                        Report Preset ID
                        <input type="text" value={reportPresetId} onChange={e => setReportPresetId(e.target.value)} required style={{ width: '100%', padding: '8px' }} />
                    </label>
                    <label>
                        Frequency
                        <select value={schedule} onChange={e => setSchedule(e.target.value)} required style={{ width: '100%', padding: '8px' }}>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                    </label>
                    <label>
                        Format
                        <select value={format} onChange={e => setFormat(e.target.value)} required style={{ width: '100%', padding: '8px' }}>
                            <option value="csv">CSV</option>
                            <option value="pdf">PDF</option>
                        </select>
                    </label>
                    <label>
                        Recipients (comma separated emails)
                        <input type="text" value={recipients} onChange={e => setRecipients(e.target.value)} required style={{ width: '100%', padding: '8px' }} />
                    </label>
                    <button type="submit" style={{ padding: '8px 16px', background: 'var(--primary, blue)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '150px' }}>
                        Create Schedule
                    </button>
                </form>

                {loading ? <p>Loading...</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                                <th style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>Name</th>
                                <th style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>Schedule</th>
                                <th style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>Format</th>
                                <th style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {schedules.map(sch => (
                                <tr key={sch.id}>
                                    <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>{sch.name}</td>
                                    <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>{sch.schedule}</td>
                                    <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>{sch.format}</td>
                                    <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                                        <button onClick={() => handleRunNow(sch.id)} style={{ marginRight: '8px', cursor: 'pointer' }}>Run Now</button>
                                        <button onClick={() => handleDelete(sch.id)} style={{ color: 'red', cursor: 'pointer' }}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                            {schedules.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ padding: '16px', textAlign: 'center' }}>No scheduled reports found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

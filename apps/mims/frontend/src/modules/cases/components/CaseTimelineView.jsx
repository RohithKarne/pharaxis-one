import React, { useState, useEffect, useMemo } from 'react';
import { httpFetch } from '../../../shared/api/httpFetch.js';

function formatTimeRel(value) {
  if (!value) return '';
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? String(value) : dt.toLocaleString();
}

export default function CaseTimelineView({ caseId, headers }) {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('All');
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function loadTimeline() {
      try {
        const reqHeaders = {
          ...(headers?.Authorization ? { Authorization: headers.Authorization } : {}),
          ...(headers?.['Content-Type'] ? { 'Content-Type': headers['Content-Type'] } : {}),
        };
        const res = await httpFetch(`/api/cases/${caseId}/timeline`, { headers: reqHeaders });
        const data = await res.json();
        if (!cancelled) {
          setEvents(data.events || []);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadTimeline();
    return () => { cancelled = true; };
  }, [caseId, headers]);

  const filteredEvents = useMemo(() => {
    if (filter === 'All') return events;
    return events.filter(e => {
      const t = (e.type || '').toLowerCase();
      const f = filter.toLowerCase();
      if (f === 'audit' && t.includes('audit')) return true;
      if (f === 'status' && t.includes('status')) return true;
      if (f === 'comments' && (t.includes('comment') || t.includes('msg'))) return true;
      if (f === 'transmissions' && t.includes('transmission')) return true;
      if (f === 'e-signatures' && (t.includes('signature') || t.includes('esignature'))) return true;
      return t.includes(f) || f.includes(t);
    });
  }, [events, filter]);

  const toggleExpand = (idx) => {
    setExpanded(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const filterTypes = ['All', 'Audit', 'Status', 'Comments', 'Transmissions', 'E-signatures'];

  return (
    <div className="cf-timeline-container">
      <div className="cf-timeline-filters">
        {filterTypes.map(ft => (
          <button
            key={ft}
            className={`cf-timeline-filter-chip ${filter === ft ? 'active' : ''}`}
            onClick={() => setFilter(ft)}
          >
            {ft}
          </button>
        ))}
      </div>
      <div className="cf-timeline-list">
        {filteredEvents.length === 0 && <div className="cf-empty-msg">No timeline events found.</div>}
        {filteredEvents.map((ev, idx) => (
          <div key={idx} className="cf-timeline-item">
            <div className="cf-timeline-badge" data-type={ev.type || 'default'}>
              {ev.type ? ev.type.charAt(0).toUpperCase() : 'E'}
            </div>
            <div className="cf-timeline-content">
              <div className="cf-timeline-header" onClick={() => toggleExpand(idx)}>
                <div className="cf-timeline-title-row">
                  <strong>{ev.title}</strong>
                  <span className="cf-timeline-time">{formatTimeRel(ev.ts)}</span>
                </div>
                {/* getTimeline() returns the actor as `actor`; `actor_name` is the
                  raw row shape and never reaches the client. Reading only
                  actor_name made every event show as "System". */}
              <div className="cf-timeline-actor">{ev.actor || ev.actor_name || 'System'}</div>
              </div>
              {/* `detail` arrives as a parsed object (JSON_OBJECT in the query),
                  and rendering an object directly throws "Objects are not valid
                  as a React child" — which only surfaced once events actually
                  started flowing. Render the populated keys as label/value. */}
              {expanded[idx] && ev.detail && (
                <div className="cf-timeline-details">
                  {typeof ev.detail === 'object'
                    ? Object.entries(ev.detail)
                        .filter(([, v]) => v !== null && v !== '')
                        .map(([k, v]) => (
                          <div key={k}><strong>{k}:</strong> {String(v)}</div>
                        ))
                    : String(ev.detail)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

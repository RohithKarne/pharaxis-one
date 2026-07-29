import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function ReportTableViewer({ columns, rows }) {
  const navigate = useNavigate()
  const [sortCol, setSortCol] = useState(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 10

  if (!rows || rows.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No data available.</div>
  }

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc)
    } else {
      setSortCol(col)
      setSortAsc(true)
    }
  }

  const sortedRows = [...rows].sort((a, b) => {
    if (!sortCol) return 0
    const valA = String(a[sortCol] ?? '')
    const valB = String(b[sortCol] ?? '')
    const cmp = valA.localeCompare(valB, undefined, { numeric: true })
    return sortAsc ? cmp : -cmp
  })

  const totalPages = Math.ceil(sortedRows.length / pageSize)
  const displayRows = sortedRows.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rows.length} row{rows.length !== 1 ? 's' : ''}</div>
      </div>
      
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
            {columns.map((column) => (
              <th 
                key={column} 
                onClick={() => handleSort(column)}
                style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                {column.replace(/_/g, ' ')}
                {sortCol === column ? (sortAsc ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
            <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--text-muted)' }}>
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, index) => (
            <tr key={index} style={{ borderBottom: '1px solid var(--border)', background: index % 2 === 0 ? '#fff' : '#fcfcfd' }}>
              {columns.map((column) => (
                <td key={column} style={{ padding: '10px 12px', verticalAlign: 'top' }}>{row[column] ?? '—'}</td>
              ))}
              <td style={{ padding: '10px 12px', verticalAlign: 'top', textAlign: 'center' }}>
                <button 
                  onClick={() => navigate(`/cases?drilldown=${encodeURIComponent(row[columns[0]] || 'row')}`)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    border: '1px solid var(--primary)',
                    background: 'rgba(var(--primary-rgb, 79,70,229),0.08)',
                    color: 'var(--primary)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Drill-down
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontSize: '13px' }}>
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))} 
            disabled={page === 1}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: page === 1 ? '#f8fafc' : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
          >
            Previous
          </button>
          <span style={{ color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
          <button 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
            disabled={page === totalPages}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: page === totalPages ? '#f8fafc' : '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

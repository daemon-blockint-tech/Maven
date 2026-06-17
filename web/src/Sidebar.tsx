// Sidebar owns search/filter state and composes EntityTable.
import { useState } from 'react'
import { Entity, DISPOSITION_BADGE } from './types'
import EntityTable from './EntityTable'

interface SidebarProps {
  status: string
  entities: Entity[]
  totalCount: number
  selectedId: string | null
  onSelect: (id: string) => void
}

const Sidebar = ({ status, entities, totalCount, selectedId, onSelect }: SidebarProps) => {
  const [searchText, setSearchText] = useState('')
  const [filterDisposition, setFilterDisposition] = useState('All')
  const [filterOntology, setFilterOntology] = useState('All')

  const ontologies = Array.from(new Set(entities.map(e => e.ontology)))
  const dispositions = Array.from(new Set(entities.map(e => e.disposition)))

  const filtered = entities.filter(e => {
    const matchesSearch = searchText === '' ||
      e.name.toLowerCase().includes(searchText.toLowerCase()) ||
      e.id.toLowerCase().includes(searchText.toLowerCase())
    const matchesDisposition = filterDisposition === 'All' || e.disposition === filterDisposition
    const matchesOntology = filterOntology === 'All' || e.ontology === filterOntology
    return matchesSearch && matchesDisposition && matchesOntology
  })

  const selectStyle = {
    flex: 1,
    padding: '6px 8px',
    backgroundColor: '#2a2a2a',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '4px',
    fontSize: '12px',
  }

  return (
    <div style={{
      width: '400px',
      height: '100%',
      backgroundColor: '#1a1a1a',
      color: '#e0e0e0',
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid #333',
      fontFamily: 'sans-serif',
      fontSize: '13px',
    }}>
      {/* Header */}
      <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>Entity Explorer</div>
        <div style={{ fontSize: '12px', color: '#999' }}>{status}</div>
      </div>

      {/* Legend */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #333', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {Object.entries(DISPOSITION_BADGE).map(([disp, color]) => (
          <div key={disp} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, border: '1px solid #555' }} />
            <span style={{ color: '#aaa', textTransform: 'capitalize' }}>{disp}</span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
        <input
          type="text"
          placeholder="Search by name or ID..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 8px',
            backgroundColor: '#2a2a2a',
            color: '#e0e0e0',
            border: '1px solid #444',
            borderRadius: '4px',
            fontSize: '12px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Filters */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #333', display: 'flex', gap: '8px' }}>
        <select value={filterDisposition} onChange={(e) => setFilterDisposition(e.target.value)} style={selectStyle}>
          <option>All</option>
          {dispositions.map(d => <option key={d}>{d}</option>)}
        </select>
        <select value={filterOntology} onChange={(e) => setFilterOntology(e.target.value)} style={selectStyle}>
          <option>All</option>
          {ontologies.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>

      {/* Entity list + footer */}
      <EntityTable
        entities={filtered}
        selectedId={selectedId}
        onSelect={onSelect}
        totalCount={totalCount}
      />
    </div>
  )
}

export default Sidebar

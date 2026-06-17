// EntityTable renders the scrollable entity list with disposition dots.
import { Entity, getDispositionBadge } from './types'

interface EntityTableProps {
  entities: Entity[]
  selectedId: string | null
  onSelect: (id: string) => void
  totalCount: number
}

const EntityTable = ({ entities, selectedId, onSelect, totalCount }: EntityTableProps) => {
  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead style={{ position: 'sticky', top: 0, backgroundColor: '#222', borderBottom: '1px solid #333' }}>
            <tr>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', color: '#aaa', width: '12px' }}></th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', color: '#aaa' }}>Name</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', color: '#aaa' }}>Ontology</th>
            </tr>
          </thead>
          <tbody>
            {entities.map(e => (
              <tr
                key={e.id}
                onClick={() => onSelect(e.id)}
                style={{
                  cursor: 'pointer',
                  backgroundColor: selectedId === e.id ? '#1e2e3e' : 'transparent',
                  borderBottom: '1px solid #2a2a2a',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(ev) => {
                  if (selectedId !== e.id)
                    (ev.currentTarget as HTMLElement).style.backgroundColor = '#242424'
                }}
                onMouseLeave={(ev) => {
                  if (selectedId !== e.id)
                    (ev.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                }}
              >
                <td style={{ padding: '6px 4px 6px 8px' }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: getDispositionBadge(e.disposition),
                    border: '1px solid #555',
                  }} />
                </td>
                <td style={{ padding: '6px 8px', color: selectedId === e.id ? '#7cf' : '#e0e0e0' }}>
                  {e.name}
                </td>
                <td style={{ padding: '6px 8px', color: '#777', fontSize: '11px' }}>{e.ontology}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {entities.length === 0 && (
          <div style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
            No entities found
          </div>
        )}
      </div>

      <div style={{ padding: '8px 12px', borderTop: '1px solid #333', color: '#666', fontSize: '11px' }}>
        {entities.length} of {totalCount} entities
      </div>
    </>
  )
}

export default EntityTable

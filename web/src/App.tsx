import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { EntityWebSocket, EntityMessage } from './ws'
import './App.css'

interface Entity {
  id: string
  name: string
  latitude: number
  longitude: number
  ontology: string
  disposition: string
  updatedAt: string
  cesiumEntity?: Cesium.Entity
}

// MIL-STD-2525C affiliation color scheme.
// Priority: disposition (from MilView) > ontology template fallback.
// Selected state overrides base color with a bright white outline + larger point.
const DISPOSITION_COLORS: Record<string, Cesium.Color> = {
  hostile:          Cesium.Color.fromCssColorString('#FF3333'), // red
  assumed_hostile:  Cesium.Color.fromCssColorString('#FF3333'),
  suspect:          Cesium.Color.fromCssColorString('#FF9900'), // orange-red
  unknown:          Cesium.Color.fromCssColorString('#FFFF00'), // yellow
  neutral:          Cesium.Color.fromCssColorString('#00FF00'), // green
  assumed_neutral:  Cesium.Color.fromCssColorString('#00FF00'),
  friendly:         Cesium.Color.fromCssColorString('#00BFFF'), // cyan-blue
  assumed_friendly: Cesium.Color.fromCssColorString('#00BFFF'),
}

// Sidebar badge colors for the entity list.
const DISPOSITION_BADGE: Record<string, string> = {
  hostile:  '#FF3333',
  suspect:  '#FF9900',
  unknown:  '#CCCC00',
  neutral:  '#00CC00',
  friendly: '#00BFFF',
}

function getDispositionColor(disposition: string): Cesium.Color {
  return DISPOSITION_COLORS[disposition] ?? DISPOSITION_COLORS['unknown']
}

function getDispositionBadge(disposition: string): string {
  return DISPOSITION_BADGE[disposition] ?? DISPOSITION_BADGE['unknown']
}

// Apply visual style to a Cesium entity. Selected state increases size and
// adds a bright white outline; base color is driven by MIL-STD-2525 disposition.
function applyEntityStyle(cesiumEntity: Cesium.Entity, selected: boolean, disposition: string) {
  const baseColor = getDispositionColor(disposition)
  if (cesiumEntity.point) {
    cesiumEntity.point.pixelSize = new Cesium.ConstantProperty(selected ? 14 : 8)
    cesiumEntity.point.color = new Cesium.ConstantProperty(
      selected ? baseColor.brighten(0.4, new Cesium.Color()) : baseColor
    )
    cesiumEntity.point.outlineColor = new Cesium.ConstantProperty(
      selected ? Cesium.Color.WHITE : Cesium.Color.BLACK
    )
    cesiumEntity.point.outlineWidth = new Cesium.ConstantProperty(selected ? 3 : 1)
  }
  if (cesiumEntity.label) {
    cesiumEntity.label.font = new Cesium.ConstantProperty(
      selected ? 'bold 14px sans-serif' : '12px sans-serif'
    )
    cesiumEntity.label.fillColor = new Cesium.ConstantProperty(Cesium.Color.WHITE)
  }
}

const App = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const wsRef = useRef<EntityWebSocket | null>(null)
  const entitiesRef = useRef<Map<string, Entity>>(new Map())

  // selectedIdRef keeps onMessage (stale closure) in sync with current selection.
  const selectedIdRef = useRef<string | null>(null)

  const [status, setStatus] = useState<string>('Connecting...')
  const [entityCount, setEntityCount] = useState<number>(0)
  const [entities, setEntities] = useState<Entity[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState<string>('')
  const [filterOntology, setFilterOntology] = useState<string>('All')
  const [filterDisposition, setFilterDisposition] = useState<string>('All')

  useEffect(() => {
    if (!containerRef.current) return

    const envVars = import.meta.env as any
    Cesium.Ion.defaultAccessToken = envVars.VITE_CESIUM_TOKEN || ''

    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      baseLayerPicker: true,
      fullscreenButton: true,
      infoBox: false,
      selectionIndicator: false,
    })

    viewer.scene.globe.enableLighting = true
    viewerRef.current = viewer

    const wsUrl = `${envVars.VITE_API_URL || 'ws://localhost:8080'}/ws`

    const onMessage = (msg: EntityMessage) => {
      if (msg.type === 'update') {
        const entity: Entity = {
          id: msg.entity_id,
          name: msg.name || msg.entity_id,
          latitude: msg.latitude || 0,
          longitude: msg.longitude || 0,
          ontology: msg.ontology || 'unknown',
          disposition: msg.disposition || 'unknown',
          updatedAt: msg.updated_at || new Date().toISOString(),
        }

        const map = entitiesRef.current
        if (map.has(msg.entity_id)) {
          const prev = map.get(msg.entity_id)!
          if (prev.cesiumEntity) {
            viewer.entities.remove(prev.cesiumEntity)
          }
        }

        const isSelected = msg.entity_id === selectedIdRef.current
        const baseColor = getDispositionColor(entity.disposition)

        const cesiumEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(entity.longitude, entity.latitude),
          point: {
            pixelSize: isSelected ? 14 : 8,
            color: isSelected ? baseColor.brighten(0.4, new Cesium.Color()) : baseColor,
            outlineColor: isSelected ? Cesium.Color.WHITE : Cesium.Color.BLACK,
            outlineWidth: isSelected ? 3 : 1,
          },
          label: {
            text: entity.name,
            font: isSelected ? 'bold 14px sans-serif' : '12px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
          },
        })

        entity.cesiumEntity = cesiumEntity
        entitiesRef.current.set(msg.entity_id, entity)
        setEntities(Array.from(entitiesRef.current.values()))
        setEntityCount(entitiesRef.current.size)
        setStatus(`Connected (${entitiesRef.current.size} entities)`)
      } else if (msg.type === 'delete') {
        const prev = entitiesRef.current.get(msg.entity_id)
        if (prev?.cesiumEntity) {
          viewer.entities.remove(prev.cesiumEntity)
        }
        entitiesRef.current.delete(msg.entity_id)
        setEntities(Array.from(entitiesRef.current.values()))
        setEntityCount(entitiesRef.current.size)
      }
    }

    const onError = (err: string) => {
      setStatus(`Error: ${err}`)
    }

    wsRef.current = new EntityWebSocket(wsUrl, onMessage, onError)
    wsRef.current.connect().then(() => {
      setStatus(`Connected (0 entities)`)
    }).catch((err) => {
      setStatus(`Failed to connect: ${err}`)
    })

    return () => {
      if (wsRef.current) wsRef.current.disconnect()
      if (viewerRef.current && !viewerRef.current.isDestroyed()) viewerRef.current.destroy()
    }
  }, [])

  const ontologies = Array.from(new Set(entities.map(e => e.ontology)))
  const dispositions = Array.from(new Set(entities.map(e => e.disposition)))

  const filteredEntities = entities.filter(e => {
    const matchesSearch = searchText === '' ||
      e.name.toLowerCase().includes(searchText.toLowerCase()) ||
      e.id.toLowerCase().includes(searchText.toLowerCase())
    const matchesOntology = filterOntology === 'All' || e.ontology === filterOntology
    const matchesDisposition = filterDisposition === 'All' || e.disposition === filterDisposition
    return matchesSearch && matchesOntology && matchesDisposition
  })

  const handleSelectEntity = (id: string) => {
    const map = entitiesRef.current

    // Deselect previous entity imperatively.
    const prevId = selectedIdRef.current
    if (prevId && prevId !== id) {
      const prev = map.get(prevId)
      if (prev?.cesiumEntity) applyEntityStyle(prev.cesiumEntity, false, prev.disposition)
    }

    // Select new entity imperatively.
    const next = map.get(id)
    if (next?.cesiumEntity) {
      applyEntityStyle(next.cesiumEntity, true, next.disposition)
      viewerRef.current?.flyTo(next.cesiumEntity, { duration: 0.5 })
    }

    selectedIdRef.current = id
    setSelectedId(id)
  }

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, display: 'flex', flexDirection: 'row' }}>
      {/* Globe */}
      <div ref={containerRef} style={{ flex: 1, height: '100%' }} />

      {/* Sidebar */}
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
          <select
            value={filterDisposition}
            onChange={(e) => setFilterDisposition(e.target.value)}
            style={{
              flex: 1,
              padding: '6px 8px',
              backgroundColor: '#2a2a2a',
              color: '#e0e0e0',
              border: '1px solid #444',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          >
            <option>All</option>
            {dispositions.map(d => <option key={d}>{d}</option>)}
          </select>
          <select
            value={filterOntology}
            onChange={(e) => setFilterOntology(e.target.value)}
            style={{
              flex: 1,
              padding: '6px 8px',
              backgroundColor: '#2a2a2a',
              color: '#e0e0e0',
              border: '1px solid #444',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          >
            <option>All</option>
            {ontologies.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        {/* Entity List */}
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
              {filteredEntities.map(e => (
                <tr
                  key={e.id}
                  onClick={() => handleSelectEntity(e.id)}
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
                  {/* Disposition color dot */}
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
          {filteredEntities.length === 0 && (
            <div style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
              No entities found
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid #333', color: '#666', fontSize: '11px' }}>
          {filteredEntities.length} of {entityCount} entities
        </div>
      </div>
    </div>
  )
}

export default App

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
  updatedAt: string
  cesiumEntity?: Cesium.Entity
}

const App = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const wsRef = useRef<EntityWebSocket | null>(null)
  const entitiesRef = useRef<Map<string, Entity>>(new Map())

  const [status, setStatus] = useState<string>('Connecting...')
  const [entityCount, setEntityCount] = useState<number>(0)
  const [entities, setEntities] = useState<Entity[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState<string>('')
  const [filterOntology, setFilterOntology] = useState<string>('All')

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
          updatedAt: msg.updated_at || new Date().toISOString(),
        }

        const entities = entitiesRef.current
        if (entities.has(msg.entity_id)) {
          const prev = entities.get(msg.entity_id)!
          if (prev.cesiumEntity) {
            viewer.entities.remove(prev.cesiumEntity)
          }
        }

        const isSelected = msg.entity_id === selectedId
        const cesiumEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(entity.longitude, entity.latitude),
          point: {
            pixelSize: isSelected ? 12 : 8,
            color: isSelected ? Cesium.Color.RED : Cesium.Color.LIME,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
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
      if (wsRef.current) {
        wsRef.current.disconnect()
      }
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy()
      }
    }
  }, [])

  const ontologies = Array.from(new Set(entities.map(e => e.ontology)))
  const filteredEntities = entities.filter(e => {
    const matchesSearch = searchText === '' ||
      e.name.toLowerCase().includes(searchText.toLowerCase()) ||
      e.id.toLowerCase().includes(searchText.toLowerCase())
    const matchesOntology = filterOntology === 'All' || e.ontology === filterOntology
    return matchesSearch && matchesOntology
  })

  const handleSelectEntity = (id: string) => {
    setSelectedId(id)
    const entity = entitiesRef.current.get(id)
    if (entity?.cesiumEntity) {
      viewerRef.current?.flyTo(entity.cesiumEntity, { duration: 0.5 })
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, display: 'flex', flexDirection: 'row' }}>
      {/* Globe */}
      <div
        ref={containerRef}
        style={{ flex: 1, height: '100%' }}
      />

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

        {/* Filter */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
          <select
            value={filterOntology}
            onChange={(e) => setFilterOntology(e.target.value)}
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
          >
            <option>All</option>
            {ontologies.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        {/* Entity List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
          }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#222', borderBottom: '1px solid #333' }}>
              <tr>
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
                    backgroundColor: selectedId === e.id ? '#2a4a2a' : 'transparent',
                    borderBottom: '1px solid #2a2a2a',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(ev) => {
                    if (selectedId !== e.id) {
                      (ev.currentTarget as HTMLElement).style.backgroundColor = '#282828'
                    }
                  }}
                  onMouseLeave={(ev) => {
                    if (selectedId !== e.id) {
                      (ev.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  <td style={{ padding: '6px 8px', color: selectedId === e.id ? '#4f4' : '#e0e0e0' }}>
                    {e.name}
                  </td>
                  <td style={{ padding: '6px 8px', color: '#999' }}>{e.ontology}</td>
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

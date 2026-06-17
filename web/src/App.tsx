// App is the top-level orchestrator: WebSocket lifecycle, Cesium entity state,
// and selection handling. UI is delegated to GlobeViewer and Sidebar.
import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { EntityWebSocket, EntityMessage } from './ws'
import { Entity, getDispositionColor } from './types'
import { applyEntityStyle } from './cesium'
import GlobeViewer from './GlobeViewer'
import Sidebar from './Sidebar'
import './App.css'

const App = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const wsRef = useRef<EntityWebSocket | null>(null)
  const entitiesRef = useRef<Map<string, Entity>>(new Map())
  const selectedIdRef = useRef<string | null>(null)

  const [status, setStatus] = useState('Connecting...')
  const [entities, setEntities] = useState<Entity[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const envVars = import.meta.env as any
    const wsUrl = `${envVars.VITE_API_URL || 'ws://localhost:8080'}/ws`

    const onMessage = (msg: EntityMessage) => {
      const viewer = viewerRef.current
      if (!viewer) return

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
        const prev = map.get(msg.entity_id)
        if (prev?.cesiumEntity) viewer.entities.remove(prev.cesiumEntity)

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
        map.set(msg.entity_id, entity)
        setEntities(Array.from(map.values()))
        setStatus(`Connected (${map.size} entities)`)
      } else if (msg.type === 'delete') {
        const map = entitiesRef.current
        const prev = map.get(msg.entity_id)
        if (prev?.cesiumEntity) viewer.entities.remove(prev.cesiumEntity)
        map.delete(msg.entity_id)
        setEntities(Array.from(map.values()))
      }
    }

    const onError = (err: string) => setStatus(`Error: ${err}`)

    wsRef.current = new EntityWebSocket(wsUrl, onMessage, onError)
    wsRef.current.connect()
      .then(() => setStatus('Connected (0 entities)'))
      .catch((err) => setStatus(`Failed to connect: ${err}`))

    return () => {
      wsRef.current?.disconnect()
    }
  }, [])

  const handleSelectEntity = (id: string) => {
    const map = entitiesRef.current

    const prevId = selectedIdRef.current
    if (prevId && prevId !== id) {
      const prev = map.get(prevId)
      if (prev?.cesiumEntity) applyEntityStyle(prev.cesiumEntity, false, prev.disposition)
    }

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
      <GlobeViewer containerRef={containerRef} viewerRef={viewerRef} />
      <Sidebar
        status={status}
        entities={entities}
        totalCount={entities.length}
        selectedId={selectedId}
        onSelect={handleSelectEntity}
      />
    </div>
  )
}

export default App

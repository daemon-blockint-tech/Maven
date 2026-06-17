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

  useEffect(() => {
    if (!containerRef.current) return

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN || ''

    const viewer = new Cesium.Viewer(containerRef.current, {
      terrainProvider: Cesium.createWorldTerrain(),
      animation: false,
      baseLayerPicker: true,
      fullscreenButton: true,
      infoBox: false,
      selectionIndicatorSize: 0,
    })

    viewer.scene.globe.enableLighting = true
    viewerRef.current = viewer

    const wsUrl = `${import.meta.env.VITE_API_URL || 'ws://localhost:8080'}/ws`

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

        const cesiumEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(entity.longitude, entity.latitude),
          point: {
            pixelSize: 8,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
          },
          label: {
            text: entity.name,
            font: '12px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
          },
        })

        entity.cesiumEntity = cesiumEntity
        entities.set(msg.entity_id, entity)
        setEntityCount(entities.size)
        setStatus(`Connected (${entities.size} entities)`)
      } else if (msg.type === 'delete') {
        const entities = entitiesRef.current
        const prev = entities.get(msg.entity_id)
        if (prev?.cesiumEntity) {
          viewer.entities.remove(prev.cesiumEntity)
        }
        entities.delete(msg.entity_id)
        setEntityCount(entities.size)
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

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px 15px',
        borderRadius: '4px',
        fontFamily: 'sans-serif',
        fontSize: '14px',
        zIndex: 100,
      }}>
        <div>{status}</div>
        <div style={{ marginTop: '5px', fontSize: '12px' }}>Entities: {entityCount}</div>
      </div>
    </div>
  )
}

export default App

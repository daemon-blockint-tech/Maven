// GlobeViewer mounts the CesiumJS Viewer into the provided containerRef.
// The parent (App) owns the ref so it can call viewer APIs (flyTo, entities).
import { useEffect } from 'react'
import * as Cesium from 'cesium'

interface GlobeViewerProps {
  containerRef: React.RefObject<HTMLDivElement>
  viewerRef: React.MutableRefObject<Cesium.Viewer | null>
}

const GlobeViewer = ({ containerRef, viewerRef }: GlobeViewerProps) => {
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

    return () => {
      if (!viewer.isDestroyed()) viewer.destroy()
      viewerRef.current = null
    }
  }, [])

  return <div ref={containerRef} style={{ flex: 1, height: '100%' }} />
}

export default GlobeViewer

// Cesium entity styling utilities.
import * as Cesium from 'cesium'
import { getDispositionColor } from './types'

/**
 * Imperatively update point and label style on an existing Cesium entity.
 * Uses ConstantProperty to mutate in-place without remove/re-add.
 */
export function applyEntityStyle(
  cesiumEntity: Cesium.Entity,
  selected: boolean,
  disposition: string,
): void {
  const baseColor = getDispositionColor(disposition)
  if (cesiumEntity.point) {
    cesiumEntity.point.pixelSize = new Cesium.ConstantProperty(selected ? 14 : 8)
    cesiumEntity.point.color = new Cesium.ConstantProperty(
      selected ? baseColor.brighten(0.4, new Cesium.Color()) : baseColor,
    )
    cesiumEntity.point.outlineColor = new Cesium.ConstantProperty(
      selected ? Cesium.Color.WHITE : Cesium.Color.BLACK,
    )
    cesiumEntity.point.outlineWidth = new Cesium.ConstantProperty(selected ? 3 : 1)
  }
  if (cesiumEntity.label) {
    cesiumEntity.label.font = new Cesium.ConstantProperty(
      selected ? 'bold 14px sans-serif' : '12px sans-serif',
    )
    cesiumEntity.label.fillColor = new Cesium.ConstantProperty(Cesium.Color.WHITE)
  }
}

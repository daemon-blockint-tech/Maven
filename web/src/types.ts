// Shared entity type and MIL-STD-2525 color maps used across components.
import * as Cesium from 'cesium'

export interface Entity {
  id: string
  name: string
  latitude: number
  longitude: number
  ontology: string
  disposition: string
  updatedAt: string
  cesiumEntity?: Cesium.Entity
}

// MIL-STD-2525C affiliation colors for Cesium globe rendering.
export const DISPOSITION_COLORS: Record<string, Cesium.Color> = {
  hostile:          Cesium.Color.fromCssColorString('#FF3333'),
  assumed_hostile:  Cesium.Color.fromCssColorString('#FF3333'),
  suspect:          Cesium.Color.fromCssColorString('#FF9900'),
  unknown:          Cesium.Color.fromCssColorString('#FFFF00'),
  neutral:          Cesium.Color.fromCssColorString('#00FF00'),
  assumed_neutral:  Cesium.Color.fromCssColorString('#00FF00'),
  friendly:         Cesium.Color.fromCssColorString('#00BFFF'),
  assumed_friendly: Cesium.Color.fromCssColorString('#00BFFF'),
}

// CSS hex colors for sidebar badges.
export const DISPOSITION_BADGE: Record<string, string> = {
  hostile:  '#FF3333',
  suspect:  '#FF9900',
  unknown:  '#CCCC00',
  neutral:  '#00CC00',
  friendly: '#00BFFF',
}

export function getDispositionColor(disposition: string): Cesium.Color {
  return DISPOSITION_COLORS[disposition] ?? DISPOSITION_COLORS['unknown']
}

export function getDispositionBadge(disposition: string): string {
  return DISPOSITION_BADGE[disposition] ?? DISPOSITION_BADGE['unknown']
}

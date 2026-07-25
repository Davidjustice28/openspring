declare module 'react-simple-maps' {
  import type { ReactNode, CSSProperties } from 'react'

  export interface Geography {
    rsmKey: string
    id: string | number
    properties: Record<string, unknown>
  }

  export interface ComposableMapProps {
    projection?: string
    projectionConfig?: Record<string, unknown>
    width?: number
    height?: number
    className?: string
    children?: ReactNode
  }

  export interface GeographyProps {
    geography: Geography
    onClick?: () => void
    tabIndex?: number
    style?: Record<string, CSSProperties>
    className?: string
    'aria-label'?: string
  }

  export interface GeographiesProps {
    geography: string | object
    children: (args: { geographies: Geography[] }) => ReactNode
  }

  export interface MarkerProps {
    coordinates: [number, number]
    onClick?: () => void
    children?: ReactNode
  }

  export function ComposableMap(props: ComposableMapProps): JSX.Element
  export function Geographies(props: GeographiesProps): JSX.Element
  export function Geography(props: GeographyProps): JSX.Element
  export function Marker(props: MarkerProps): JSX.Element
}

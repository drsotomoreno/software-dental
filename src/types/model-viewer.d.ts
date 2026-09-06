import type { CSSProperties, HTMLAttributes } from 'react'

type ModelViewerProps = HTMLAttributes<HTMLElement> & {
  src?: string
  alt?: string
  poster?: string
  exposure?: string
  style?: CSSProperties
  'camera-controls'?: boolean | ''
  'touch-action'?: string
  'shadow-intensity'?: string
  'environment-image'?: string
  'interaction-prompt'?: string
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerProps
    }
  }
}

import type { ReactNode } from 'react'

/**
 * Minimal Slot stub component.
 * Renders its children directly without any behavior.
 */
export const Slot = ({ children }: { children?: ReactNode }) => {
  return <>{children}</>
}

export default Slot

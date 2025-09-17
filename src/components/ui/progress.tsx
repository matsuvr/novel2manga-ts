import * as React from 'react'
import { cn } from '@/lib/utils'

type DivProps = React.HTMLAttributes<HTMLDivElement>

export interface ProgressProps
  extends Omit<DivProps, 'role' | 'aria-valuenow' | 'aria-valuemin' | 'aria-valuemax'> {
  value?: number | null
}

const clamp = (v: number) => (v < 0 ? 0 : v > 100 ? 100 : v)

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => {
    const pct = clamp(Number.isFinite(value as number) ? (value as number) : 0)
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
        {...props}
      >
        <div
          className="h-full w-full flex-1 bg-primary transition-transform duration-300"
          style={{ transform: `translateX(-${100 - pct}%)` }}
        />
      </div>
    )
  },
)
Progress.displayName = 'Progress'

export { Progress }

/* eslint-disable jsx-a11y/label-has-associated-control */
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, htmlFor, ...props }, ref) => (
    // Provide either htmlFor or aria-label downstream to satisfy a11y linters in consumers
    /* biome-ignore lint/a11y/noLabelWithoutControl: This is a reusable label wrapper, association is provided by consumers via htmlFor */
    <label
      ref={ref}
      htmlFor={htmlFor}
      className={cn('text-sm font-medium leading-none', className)}
      {...props}
    />
  ),
)
Label.displayName = 'Label'

export { Label }

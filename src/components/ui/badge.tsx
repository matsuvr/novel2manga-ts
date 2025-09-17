import type * as React from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning'

const badgeVariantMap: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
  secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'text-foreground',
  success: 'border-transparent bg-green-600 text-white',
  warning: 'border-transparent bg-amber-500 text-white',
}

const baseBadgeClasses =
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant
}

function getBadgeClasses(variant: BadgeVariant = 'default', className?: string) {
  return cn(baseBadgeClasses, badgeVariantMap[variant], className)
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return <div className={getBadgeClasses(variant, className)} {...props} />
}

export { Badge }

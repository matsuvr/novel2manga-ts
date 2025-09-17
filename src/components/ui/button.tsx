import * as React from 'react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon'

const buttonVariants = {
  variant: {
    default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
    destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
    outline:
      'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
  },
  size: {
    default: 'h-9 px-4 py-2',
    sm: 'h-8 rounded-md px-3 text-xs',
    lg: 'h-10 rounded-md px-8',
    icon: 'h-9 w-9',
  },
} as const

const baseClasses =
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50'

function getButtonClasses(
  variant: ButtonVariant = 'default',
  size: ButtonSize = 'default',
  className?: string,
): string {
  const variantClasses = buttonVariants.variant[variant]
  const sizeClasses = buttonVariants.size[size]
  return cn(baseClasses, variantClasses, sizeClasses, className)
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'default', size = 'default', asChild = false, children, ...props },
    ref,
  ) => {
    const classNames = getButtonClasses(variant, size, className)

    if (asChild && React.isValidElement(children)) {
      // Strictly typed merging without using `any`.
      const childElement = children as React.ReactElement<Record<string, unknown>>
      const childProps: Record<string, unknown> = childElement.props || {}

      const mergedProps: Partial<Record<string, unknown>> & React.Attributes = {
        ...childProps,
        ...(props as Record<string, unknown>),
        className: cn((childProps.className as string) || undefined, classNames),
        ref,
      }

      return React.cloneElement(childElement, mergedProps)
    }

    return (
      <button className={classNames} ref={ref} {...props}>
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }

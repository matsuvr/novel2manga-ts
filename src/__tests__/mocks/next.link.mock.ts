import React from 'react'

export default function Link(props: any) {
  // For unit tests, render children directly
  return React.createElement('a', props, props.children)
}

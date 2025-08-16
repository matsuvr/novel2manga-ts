import '@testing-library/jest-dom'

// Mock HTMLCanvasElement globally for all tests
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: (contextType: string) => {
    if (contextType === '2d') {
      return {
        fillStyle: '#fff',
        strokeStyle: '#000',
        lineWidth: 2,
        font: '16px sans-serif',
        beginPath: () => {
          /* Mock implementation for test Canvas */
        },
        moveTo: () => {
          /* Mock implementation for test Canvas */
        },
        lineTo: () => {
          /* Mock implementation for test Canvas */
        },
        quadraticCurveTo: () => {
          /* Mock implementation for test Canvas */
        },
        closePath: () => {
          /* Mock implementation for test Canvas */
        },
        fill: () => {
          /* Mock implementation for test Canvas */
        },
        stroke: () => {
          /* Mock implementation for test Canvas */
        },
        fillRect: () => {
          /* Mock implementation for test Canvas */
        },
        strokeRect: () => {
          /* Mock implementation for test Canvas */
        },
        clearRect: () => {
          /* Mock implementation for test Canvas */
        },
        restore: () => {
          /* Mock implementation for test Canvas */
        },
        resetTransform: () => {
          /* Mock implementation for test Canvas */
        },
        save: () => {
          /* Mock implementation for test Canvas */
        },
        textAlign: 'left' as CanvasTextAlign,
        textBaseline: 'top' as CanvasTextBaseline,
        measureText: (text: string) => ({ width: text.length * 10 }) as TextMetrics,
        fillText: () => {
          /* Mock implementation for test Canvas */
        },
        drawImage: () => {
          /* Mock implementation for test Canvas */
        },
      } as unknown as CanvasRenderingContext2D
    }
    return null
  },
  writable: true,
})

Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  value: () => 'data:image/png;base64,iVBORw0KGgo=',
  writable: true,
})

// Mock global functions that might be used by Canvas-related code
globalThis.Image = class MockImage {
  width = 100
  height = 100
  src = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
} as typeof Image

// Note: createImageFromBuffer will be mocked per test as needed

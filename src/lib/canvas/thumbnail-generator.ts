/**
 * サムネイル生成ユーティリティ
 */

export interface ThumbnailOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'png' | 'jpeg' | 'webp'
}

const DEFAULT_WIDTH = 200
const DEFAULT_HEIGHT = 280 // A4比率を維持
const DEFAULT_QUALITY = 0.8

/**
 * 元画像からサムネイルを生成
 */
export async function generateThumbnail(
  sourceImageBlob: Blob,
  options: ThumbnailOptions = {},
): Promise<Blob> {
  const {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    quality = DEFAULT_QUALITY,
    format = 'jpeg',
  } = options

  if (typeof window === 'undefined') {
    return await generateServerSideThumbnail(sourceImageBlob, width, height, quality, format)
  }

  return await generateClientSideThumbnail(sourceImageBlob, width, height, quality, format)
}

/**
 * サーバーサイドでのサムネイル生成（node-canvas使用）
 */
async function generateServerSideThumbnail(
  sourceBlob: Blob,
  width: number,
  height: number,
  quality: number,
  format: string,
): Promise<Blob> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createCanvas, loadImage } = require('canvas')

    const arrayBuffer = await sourceBlob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const image = await loadImage(buffer)

    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    const aspectRatio = image.width / image.height
    const targetAspectRatio = width / height

    let drawWidth: number
    let drawHeight: number
    let offsetX = 0
    let offsetY = 0

    if (aspectRatio > targetAspectRatio) {
      drawWidth = width
      drawHeight = width / aspectRatio
      offsetY = (height - drawHeight) / 2
    } else {
      drawHeight = height
      drawWidth = height * aspectRatio
      offsetX = (width - drawWidth) / 2
    }

    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)

    const outputBuffer = canvas.toBuffer(`image/${format}`, { quality })
    return new Blob([outputBuffer], { type: `image/${format}` })
  } catch (error) {
    console.error('Server-side thumbnail generation failed:', error)
    throw new Error('サムネイル生成に失敗しました')
  }
}

/**
 * クライアントサイドでのサムネイル生成（Canvas API使用）
 */
async function generateClientSideThumbnail(
  sourceBlob: Blob,
  width: number,
  height: number,
  quality: number,
  format: string,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Canvas 2D context not available'))
          return
        }

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)

        const aspectRatio = img.width / img.height
        const targetAspectRatio = width / height

        let drawWidth: number
        let drawHeight: number
        let offsetX = 0
        let offsetY = 0

        if (aspectRatio > targetAspectRatio) {
          drawWidth = width
          drawHeight = width / aspectRatio
          offsetY = (height - drawHeight) / 2
        } else {
          drawHeight = height
          drawWidth = height * aspectRatio
          offsetX = (width - drawWidth) / 2
        }

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Failed to generate thumbnail blob'))
            }
          },
          `image/${format}`,
          quality,
        )
      }

      img.onerror = () => {
        reject(new Error('Failed to load source image'))
      }

      const objectUrl = URL.createObjectURL(sourceBlob)
      img.src = objectUrl

      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
      }
    } catch (error) {
      reject(error)
    }
  })
}

// 従来のクラス風APIとの互換を維持
export const ThumbnailGenerator = {
  generateThumbnail,
}

/**
 * サムネイル生成ユーティリティ
 */

export interface ThumbnailOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'png' | 'jpeg' | 'webp'
}

export class ThumbnailGenerator {
  private static readonly DEFAULT_WIDTH = 200
  private static readonly DEFAULT_HEIGHT = 280 // A4比率を維持
  private static readonly DEFAULT_QUALITY = 0.8

  /**
   * 元画像からサムネイルを生成
   */
  static async generateThumbnail(
    sourceImageBlob: Blob,
    options: ThumbnailOptions = {},
  ): Promise<Blob> {
    const {
      width = ThumbnailGenerator.DEFAULT_WIDTH,
      height = ThumbnailGenerator.DEFAULT_HEIGHT,
      quality = ThumbnailGenerator.DEFAULT_QUALITY,
      format = 'jpeg',
    } = options

    // サーバーサイドの場合はnode-canvasを使用
    if (typeof window === 'undefined') {
      return await ThumbnailGenerator.generateServerSideThumbnail(
        sourceImageBlob,
        width,
        height,
        quality,
        format,
      )
    }

    // ブラウザサイドの場合はCanvas APIを使用
    return await ThumbnailGenerator.generateClientSideThumbnail(
      sourceImageBlob,
      width,
      height,
      quality,
      format,
    )
  }

  /**
   * サーバーサイドでのサムネイル生成（node-canvas使用）
   */
  private static async generateServerSideThumbnail(
    sourceBlob: Blob,
    width: number,
    height: number,
    quality: number,
    format: string,
  ): Promise<Blob> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createCanvas, loadImage } = require('canvas')

      // Blobから画像データを読み込み
      const arrayBuffer = await sourceBlob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // 元画像を読み込み
      const image = await loadImage(buffer)

      // サムネイル用のCanvasを作成
      const canvas = createCanvas(width, height)
      const ctx = canvas.getContext('2d')

      // 背景を白で塗りつぶし
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)

      // アスペクト比を保持して描画サイズを計算
      const aspectRatio = image.width / image.height
      const targetAspectRatio = width / height

      let drawWidth: number
      let drawHeight: number
      let offsetX = 0
      let offsetY = 0

      if (aspectRatio > targetAspectRatio) {
        // 横長の場合、幅に合わせる
        drawWidth = width
        drawHeight = width / aspectRatio
        offsetY = (height - drawHeight) / 2
      } else {
        // 縦長の場合、高さに合わせる
        drawHeight = height
        drawWidth = height * aspectRatio
        offsetX = (width - drawWidth) / 2
      }

      // 画像を描画
      ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)

      // 指定フォーマットで出力
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
  private static async generateClientSideThumbnail(
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
          // サムネイル用のCanvasを作成
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            reject(new Error('Canvas 2D context not available'))
            return
          }

          // 背景を白で塗りつぶし
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)

          // アスペクト比を保持して描画サイズを計算
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

          // 画像を描画
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)

          // 指定フォーマットで出力
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

        // BlobからObjectURLを作成して画像として読み込み
        const objectUrl = URL.createObjectURL(sourceBlob)
        img.src = objectUrl

        // メモリリーク防止のためのクリーンアップ
        img.onload = () => {
          URL.revokeObjectURL(objectUrl)
        }
      } catch (error) {
        reject(error)
      }
    })
  }
}

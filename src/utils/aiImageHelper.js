/**
 * Utility for client-side image downsampling and optimization before sending to AI.
 * Keeps vision tokens capped at ~258 tokens (~150KB JPEG) to avoid overbilling.
 */

export async function processAiBillImage(file, maxDimension = 1280, quality = 0.85) {
  if (!file) throw new Error('No file provided')

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      const img = new Image()

      img.onload = () => {
        let width = img.width
        let height = img.height

        // Scale down to maxDimension preserving aspect ratio
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        // Clean white background for transparency fallback
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        const mimeType = 'image/jpeg'
        const dataUrl = canvas.toDataURL(mimeType, quality)
        const base64 = dataUrl.split(',')[1]

        // Calculate approximate size in KB
        const sizeKb = Math.round((base64.length * 3) / 4 / 1024)

        resolve({
          dataUrl,
          base64,
          mimeType,
          width,
          height,
          sizeKb,
          fileName: file.name,
        })
      }

      img.onerror = () => reject(new Error('Failed to load image file'))
      img.src = event.target.result
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

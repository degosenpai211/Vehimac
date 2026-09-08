import imageCompression from 'browser-image-compression'

const OPTIONS = {
  maxSizeMB: 1.3,
  maxWidthOrHeight: 2200,
  useWebWorker: true,
  initialQuality: 0.8,
}

function asFile(blob, original) {
  if (blob instanceof File) return blob
  const type = blob.type || original.type || 'image/jpeg'
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
  const base = (original.name || 'foto').replace(/\.[^.]+$/, '')
  return new File([blob], `${base}.${ext}`, { type, lastModified: Date.now() })
}

/** Comprime una foto de OT en el cliente. Si falla o no achica, devuelve el original. */
export async function compressOrderPhoto(file) {
  if (!file || !file.type?.startsWith('image/')) return file
  try {
    const out = await imageCompression(file, OPTIONS)
    if (!(out instanceof Blob) || out.size === 0) return file
    if (out.size >= file.size) return file
    return asFile(out, file)
  } catch {
    return file
  }
}

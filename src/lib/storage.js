// Demande à iOS/Safari de ne pas évincer les données (best-effort).
// Sur iOS l'octroi n'est pas garanti mais l'appel réduit le risque de purge.
export async function requestPersistentStorage() {
  if (!('storage' in navigator) || !navigator.storage.persist) {
    return { supported: false, persisted: false }
  }
  const already = await navigator.storage.persisted()
  if (already) return { supported: true, persisted: true }
  const granted = await navigator.storage.persist()
  return { supported: true, persisted: granted }
}

// Estimation d'occupation (pour l'écran Données).
export async function storageEstimate() {
  if (!('storage' in navigator) || !navigator.storage.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}

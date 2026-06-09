import { db, TABLES, SCHEMA_VERSION } from '../db.js'

// ── Export complet ─────────────────────────────────────────────────
// Toutes les tables, sans exception (règle dure : aucune donnée hors export).
export async function exportAll() {
  const data = {}
  for (const t of TABLES) {
    data[t] = await db.table(t).toArray()
  }
  return {
    app: 'fitness-recomp',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  }
}

export async function downloadBackup() {
  const bundle = await exportAll()
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fitness-recomp-${bundle.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Import / restauration ──────────────────────────────────────────
// replace=true : on remplace intégralement (clear + bulkPut). C'est une
// restauration de sauvegarde, pas une fusion — comportement attendu au V1.
export async function importBundle(bundle, { replace = true } = {}) {
  if (!bundle || typeof bundle !== 'object' || !bundle.data) {
    throw new Error('Fichier de sauvegarde invalide (clé "data" absente).')
  }
  if (bundle.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Version de schéma incompatible : fichier v${bundle.schemaVersion}, app v${SCHEMA_VERSION}.`,
    )
  }
  const tables = TABLES.map((t) => db.table(t))
  await db.transaction('rw', tables, async () => {
    for (const t of TABLES) {
      const rows = bundle.data[t]
      if (!Array.isArray(rows)) continue
      if (replace) await db.table(t).clear()
      if (rows.length) await db.table(t).bulkPut(rows)
    }
  })
}

export async function parseBackupFile(file) {
  const text = await file.text()
  return JSON.parse(text)
}

// Compte des lignes par table — affiché sur l'écran Données pour prouver
// que les données persistent réellement.
export async function tableCounts() {
  const counts = {}
  for (const t of TABLES) counts[t] = await db.table(t).count()
  return counts
}

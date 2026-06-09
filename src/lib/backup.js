import { db, TABLES, SCHEMA_VERSION } from '../db.js'
import { transformV1toV2 } from './migrate.js'

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
  triggerDownload(JSON.stringify(bundle, null, 2), `fitness-recomp-${bundle.exportedAt.slice(0, 10)}.json`)
}

export function triggerDownload(text, filename) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Import / restauration ──────────────────────────────────────────
// replace=true : remplacement intégral (restauration de sauvegarde).
// Un bundle v1 (backup Phase 0) est transformé en v2 avant insertion.
// L'insertion se fait par bulkPut SANS hook → l'updatedAt du fichier est
// PRÉSERVÉ (socle d'un merge LWW futur).
export async function importBundle(bundle, { replace = true } = {}) {
  if (!bundle || typeof bundle !== 'object' || !bundle.data) {
    throw new Error('Fichier de sauvegarde invalide (clé "data" absente).')
  }

  let data = bundle.data
  let dropped = null
  if (bundle.schemaVersion === 1) {
    const r = transformV1toV2(bundle.data)
    data = r.data
    dropped = r.dropped
    const total = Object.values(r.dropped).reduce((a, b) => a + b, 0)
    if (total > 0) {
      console.warn('[import] lignes orphelines supprimées (FK sans parent) :', r.dropped)
    }
  } else if (bundle.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Version de schéma incompatible : fichier v${bundle.schemaVersion}, app v${SCHEMA_VERSION}.`,
    )
  }

  const tables = TABLES.map((t) => db.table(t))
  await db.transaction('rw', tables, async () => {
    for (const t of TABLES) {
      const rows = data[t]
      if (!Array.isArray(rows)) continue
      if (replace) await db.table(t).clear()
      if (rows.length) await db.table(t).bulkPut(rows)
    }
  })

  return { dropped, droppedTotal: dropped ? Object.values(dropped).reduce((a, b) => a + b, 0) : 0 }
}

export async function parseBackupFile(file) {
  const text = await file.text()
  return JSON.parse(text)
}

// Compte des lignes par table — affiché sur l'écran Données.
export async function tableCounts() {
  const counts = {}
  for (const t of TABLES) counts[t] = await db.table(t).count()
  return counts
}

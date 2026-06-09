import Dexie from 'dexie'
import { DEXIE_VERSION, SETTINGS_KEY, nowMs } from '../db.js'

const DB_NAME = 'fitnessRecomp'
const BACKUP_DB_NAME = 'fitnessRecompBackups'

// ── Backup durable (IndexedDB séparée, survit à la suppression de la base) ──
function backupDb() {
  const bdb = new Dexie(BACKUP_DB_NAME)
  bdb.version(1).stores({ migrations: '++id, createdAt' })
  return bdb
}

async function stashMigrationBackup(payload) {
  const bdb = backupDb()
  await bdb.open()
  await bdb.migrations.add({ createdAt: nowMs(), payload })
  bdb.close()
}

export async function getMigrationBackups() {
  if (!(await Dexie.exists(BACKUP_DB_NAME))) return []
  const bdb = backupDb()
  await bdb.open()
  const rows = await bdb.migrations.orderBy('createdAt').reverse().toArray()
  bdb.close()
  return rows
}

// ── Migration LIVE : WIPE + RESEED ─────────────────────────────────
// Les données live de l'appareil sont jetables (seed + tests). On NE
// transforme PAS (pas de remap FK destructif) : on sauvegarde par sécurité,
// on supprime, et db.open()+seedIfEmpty() recréeront une base v2 propre.
// Idempotent : si la base est déjà en v2 (ou absente), no-op.
export async function migrateLegacyIfNeeded() {
  if (!(await Dexie.exists(DB_NAME))) {
    return { migrated: false, reason: 'fresh-install' }
  }

  // Ouverture DYNAMIQUE (sans schéma déclaré) : Dexie reflète la version et
  // les stores réellement stockés. probe.verno = version Dexie courante.
  const probe = new Dexie(DB_NAME)
  await probe.open()

  if (probe.verno >= DEXIE_VERSION) {
    probe.close()
    return { migrated: false, reason: 'already-current' }
  }

  // Base legacy v1 détectée → backup OBLIGATOIRE avant tout delete.
  const backup = {
    app: 'fitness-recomp',
    schemaVersion: 1,
    legacy: true,
    exportedAt: new Date().toISOString(),
    data: {},
  }
  for (const table of probe.tables) {
    backup.data[table.name] = await table.toArray()
  }
  probe.close()

  await stashMigrationBackup(backup) // durable AVANT le delete
  await Dexie.delete(DB_NAME) // wipe — db.open()+seedIfEmpty() reseedent en v2

  const tables = Object.keys(backup.data)
  const rows = tables.reduce((n, t) => n + backup.data[t].length, 0)
  return { migrated: true, reason: 'wiped-and-reseeded', tables, rows }
}

// ── transformV1toV2 (CHEMIN IMPORT UNIQUEMENT — jamais destructif) ──
// Transforme un bundle exporté en v1 vers la forme v2 :
//  - clés primaires réassignées en UUID,
//  - clés étrangères réécrites vers les NOUVEAUX UUID (parents d'abord),
//  - lignes orphelines (FK sans parent) supprimées + comptées,
//  - updatedAt ajouté (défaut = createdAt) ; loggedAt sur journalEntries,
//  - settings repointé sur la clé sentinelle.
// Pure : `now` injectable pour des tests déterministes.
export function transformV1toV2(v1data, now = nowMs()) {
  const stamp = (row) => row.updatedAt ?? row.createdAt ?? now
  const maps = {} // table -> Map(oldId -> newUuid)
  const out = {}
  const dropped = { tickerStates: 0, sets: 0, journalEntries: 0 }

  // 1) Parents (et tables sans FK entrante) : nouvel UUID + mapping.
  for (const t of ['ingredients', 'drinks', 'workouts', 'tickerConfigs', 'weightLogs']) {
    maps[t] = new Map()
    out[t] = (v1data[t] || []).map((row) => {
      const id = crypto.randomUUID()
      maps[t].set(row.id, id)
      return { ...row, id, updatedAt: stamp(row) } // ...row d'abord → l'ancien id est écrasé
    })
  }

  // 2) settings → clé sentinelle fixe.
  out.settings = (v1data.settings || []).map((row) => ({
    ...row,
    id: SETTINGS_KEY,
    updatedAt: stamp(row),
  }))

  // 3) Enfants : FK réécrites vers le nouvel UUID, orphelines droppées.
  out.tickerStates = []
  for (const row of v1data.tickerStates || []) {
    const fk = maps.tickerConfigs.get(row.tickerId)
    if (fk === undefined) {
      dropped.tickerStates++
      continue
    }
    out.tickerStates.push({ ...row, id: crypto.randomUUID(), tickerId: fk, updatedAt: stamp(row) })
  }

  out.sets = []
  for (const row of v1data.sets || []) {
    const fk = maps.workouts.get(row.workoutId)
    if (fk === undefined) {
      dropped.sets++
      continue
    }
    out.sets.push({ ...row, id: crypto.randomUUID(), workoutId: fk, updatedAt: stamp(row) })
  }

  out.journalEntries = []
  for (const row of v1data.journalEntries || []) {
    // le discriminant sourceType choisit la table de mapping
    const parentMap = row.sourceType === 'drink' ? maps.drinks : maps.ingredients
    const fk = parentMap.get(row.sourceId)
    if (fk === undefined) {
      dropped.journalEntries++
      continue
    }
    out.journalEntries.push({
      ...row,
      id: crypto.randomUUID(),
      sourceId: fk,
      updatedAt: stamp(row),
      loggedAt: row.loggedAt ?? row.createdAt ?? now, // D12
    })
  }

  return { data: out, dropped }
}

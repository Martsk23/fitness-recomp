import { useEffect, useRef, useState } from 'react'
import { Download, Upload, ShieldCheck, HardDrive, Database, Archive, UserCog } from 'lucide-react'
import { db, TABLES, SETTINGS_KEY } from '../db.js'
import { downloadBackup, importBundle, parseBackupFile, tableCounts, triggerDownload } from '../lib/backup.js'
import { getMigrationBackups } from '../lib/migrate.js'
import { requestPersistentStorage, storageEstimate } from '../lib/storage.js'
import { GOALS } from '../lib/metabolic.js'
import { C, num } from '../ui.js'
import Profil from './Profil.jsx'

const fmtBytes = (b) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`)

export default function Data() {
  const [counts, setCounts] = useState(null)
  const [persisted, setPersisted] = useState(null)
  const [estimate, setEstimate] = useState(null)
  const [backups, setBackups] = useState([])
  const [settings, setSettings] = useState(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null)

  const refresh = async () => {
    setCounts(await tableCounts())
    setEstimate(await storageEstimate())
    setBackups(await getMigrationBackups())
    setSettings(await db.settings.get(SETTINGS_KEY))
  }

  useEffect(() => {
    ;(async () => {
      await refresh()
      setPersisted(Boolean(await navigator.storage?.persisted?.()))
    })()
  }, [])

  const onPersist = async () => {
    const r = await requestPersistentStorage()
    setPersisted(r.persisted)
    setMsg(
      r.persisted
        ? { ok: true, text: 'Stockage persistant accordé.' }
        : { ok: false, text: "iOS n'a pas (encore) accordé la persistance — les données restent en local." },
    )
  }

  const onImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const bundle = await parseBackupFile(file)
      const { droppedTotal } = await importBundle(bundle, { replace: true })
      await refresh()
      const suffix = droppedTotal > 0 ? ` · ${droppedTotal} ligne(s) orpheline(s) ignorée(s)` : ''
      setMsg({ ok: true, text: `Restauration OK (${bundle.exportedAt?.slice(0, 10) || 'sauvegarde'})${suffix}.` })
    } catch (err) {
      setMsg({ ok: false, text: `Échec import : ${err.message}` })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const totalRows = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="px-5 pb-6 pt-1 space-y-4">
      <h2 className="text-[15px] font-semibold flex items-center gap-2">
        <Database size={16} style={{ color: C.energy }} /> Données &amp; sauvegarde
      </h2>

      {msg && (
        <div
          className="rounded-xl p-3 text-[12.5px]"
          style={{
            background: msg.ok ? 'rgba(190,242,100,0.08)' : 'rgba(251,113,133,0.08)',
            color: msg.ok ? C.energy : C.warn,
          }}
        >
          {msg.text}
        </div>
      )}

      {/* Profil & cibles — édition / recalcul */}
      {editingProfile ? (
        <div className="rounded-2xl border overflow-hidden" style={{ background: C.surface, borderColor: C.line }}>
          <div className="px-5 pt-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-medium">
              <UserCog size={16} style={{ color: C.energy }} /> Modifier le profil
            </span>
            <button onClick={() => setEditingProfile(false)} className="text-[12px] font-semibold" style={{ color: C.faint }}>
              Annuler
            </button>
          </div>
          <Profil
            onDone={() => {
              setEditingProfile(false)
              refresh()
            }}
          />
        </div>
      ) : (
        <div className="rounded-2xl p-4 border space-y-3" style={{ background: C.surface, borderColor: C.line }}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-medium">
              <UserCog size={16} style={{ color: C.energy }} /> Profil &amp; cibles
            </span>
            <button onClick={() => setEditingProfile(true)} className="text-[12px] font-semibold" style={{ color: C.protein }}>
              Éditer
            </button>
          </div>
          {settings?.targetsSource === 'computed' ? (
            <div className="grid grid-cols-2 gap-y-1.5 text-[12px]">
              <span style={{ color: C.muted }}>Objectif</span>
              <span style={{ color: C.text }}>{GOALS[settings.profile?.goal]?.label ?? '—'}</span>
              <span style={{ color: C.muted }}>Calories</span>
              <span style={{ ...num, color: C.text }}>{settings.targetKcal} kcal</span>
              <span style={{ color: C.muted }}>Prot. / Gluc. / Lip.</span>
              <span style={{ ...num, color: C.text }}>
                {settings.targetProtein} / {settings.targetCarb} / {settings.targetFat} g
              </span>
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: C.faint }}>
              Profil non configuré.
            </p>
          )}
        </div>
      )}

      {/* Sauvegarde / restauration */}
      <div className="rounded-2xl p-4 border space-y-3" style={{ background: C.surface, borderColor: C.line }}>
        <button
          onClick={async () => {
            await downloadBackup()
            setMsg({ ok: true, text: 'Export JSON généré.' })
          }}
          className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold py-3 rounded-xl active:scale-[0.98] transition"
          style={{ background: C.energy, color: C.bg }}
        >
          <Download size={16} /> Exporter (JSON complet)
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold py-3 rounded-xl border active:scale-[0.98] transition"
          style={{ borderColor: C.line, color: C.text }}
        >
          <Upload size={16} /> Importer / restaurer
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onImport} className="hidden" />
        <p className="text-[11.5px]" style={{ color: C.faint }}>
          L'import <b>remplace</b> intégralement les données actuelles.
        </p>
      </div>

      {/* Backups de migration (créés automatiquement avant un wipe v1→v2) */}
      {backups.length > 0 && (
        <div className="rounded-2xl p-4 border space-y-2" style={{ background: C.surface, borderColor: C.line }}>
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <Archive size={16} style={{ color: C.carb }} /> Backups de migration
          </div>
          <p className="text-[11.5px]" style={{ color: C.faint }}>
            Sauvegarde automatique de l'ancienne base avant migration. Récupère-la en JSON.
          </p>
          {backups.map((b) => (
            <button
              key={b.id}
              onClick={() =>
                triggerDownload(
                  JSON.stringify(b.payload, null, 2),
                  `fitness-recomp-migration-v${b.payload.schemaVersion}.json`,
                )
              }
              className="w-full flex items-center justify-between text-[12px] py-2 px-2 rounded-lg border active:scale-[0.98] transition"
              style={{ borderColor: C.line, color: C.text }}
            >
              <span style={{ color: C.muted }}>
                v{b.payload.schemaVersion} · {new Date(b.createdAt).toLocaleString('fr-FR')}
              </span>
              <span className="flex items-center gap-1" style={{ color: C.carb }}>
                <Download size={13} /> JSON
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Persistance */}
      <div className="rounded-2xl p-4 border space-y-3" style={{ background: C.surface, borderColor: C.line }}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[13px] font-medium">
            <ShieldCheck size={16} style={{ color: persisted ? C.energy : C.faint }} /> Stockage persistant
          </span>
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              color: persisted ? C.energy : C.muted,
              background: persisted ? 'rgba(190,242,100,0.1)' : C.surfaceHi,
            }}
          >
            {persisted === null ? '…' : persisted ? 'Accordé' : 'Non accordé'}
          </span>
        </div>
        {!persisted && (
          <button
            onClick={onPersist}
            className="w-full text-[12.5px] font-medium py-2.5 rounded-xl border active:scale-[0.98] transition"
            style={{ borderColor: C.line, color: C.protein }}
          >
            Demander la persistance
          </button>
        )}
        {estimate && (
          <div className="flex items-center gap-2 text-[12px]" style={{ color: C.muted }}>
            <HardDrive size={13} />
            <span style={num}>{fmtBytes(estimate.usage)}</span> utilisés
            {estimate.quota > 0 && <span style={{ color: C.faint }}>· quota ≈ {fmtBytes(estimate.quota)}</span>}
          </div>
        )}
      </div>

      {/* État de la base (preuve de persistance) */}
      <div className="rounded-2xl p-4 border" style={{ background: C.surface, borderColor: C.line }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
            Contenu de la base
          </span>
          <span style={num} className="text-[12px] font-semibold">
            {totalRows} lignes
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {TABLES.map((t) => (
            <div key={t} className="flex items-center justify-between text-[12px]">
              <span style={{ color: C.muted }}>{t}</span>
              <span style={{ ...num, color: C.text }}>{counts ? counts[t] : '…'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

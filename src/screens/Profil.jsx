import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { db, newRow, touch, nowMs, SETTINGS_KEY } from '../db.js'
import { C, num, todayKey } from '../ui.js'
import { computeTargets, isProfileComplete, ACTIVITY, ACTIVITY_LEVELS, GOALS, GOAL_KEYS } from '../lib/metabolic.js'

const parseNum = (s) => {
  const n = parseFloat(String(s).replace(',', '.').trim())
  return Number.isFinite(n) ? n : null
}
const fmtKg = (kg) => kg.toFixed(1).replace('.', ',')

// Onboarding (profil vide) ET édition ultérieure. Calcule les cibles au save
// via metabolic.js, les écrit dans settings, et crée la 1ʳᵉ pesée si la base
// n'en a aucune (le poids vient sinon du dernier weightLogs — source unique).
export default function Profil({ onboarding = false, onDone }) {
  const [loaded, setLoaded] = useState(false)
  const [sex, setSex] = useState('M')
  const [age, setAge] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [activityLevel, setActivityLevel] = useState('moderate')
  const [goal, setGoal] = useState('recomp')
  const [bodyFatPct, setBodyFatPct] = useState('')
  const [weightStr, setWeightStr] = useState('')
  const [latestWeight, setLatestWeight] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await db.settings.get(SETTINGS_KEY)
      const logs = await db.weightLogs.orderBy('datetime').toArray()
      if (!alive) return
      setLatestWeight(logs.length ? logs[logs.length - 1] : null)
      const p = s?.profile
      if (p) {
        setSex(p.sex ?? 'M')
        setAge(String(p.age ?? ''))
        setHeightCm(String(p.heightCm ?? ''))
        setActivityLevel(p.activityLevel ?? 'moderate')
        setGoal(p.goal ?? 'recomp')
        setBodyFatPct(p.bodyFatPct != null ? String(p.bodyFatPct) : '')
      }
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  if (!loaded) return null

  const weightKg = latestWeight ? latestWeight.weightKg : parseNum(weightStr)
  const profile = {
    sex,
    age: parseNum(age),
    heightCm: parseNum(heightCm),
    activityLevel,
    goal,
    bodyFatPct: bodyFatPct.trim() === '' ? null : parseNum(bodyFatPct),
  }
  const weightOk = Number.isFinite(weightKg) && weightKg >= 20 && weightKg <= 400
  const ready = isProfileComplete(profile) && weightOk
  const preview = ready ? computeTargets(profile, weightKg) : null

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!ready) {
      setError('Complète tous les champs (poids 20-400 kg).')
      return
    }
    const t = computeTargets(profile, weightKg)
    await db.transaction('rw', db.settings, db.weightLogs, async () => {
      if (!latestWeight) {
        await db.weightLogs.add(newRow({ date: todayKey(), datetime: nowMs(), weightKg, note: 'onboarding' }))
      }
      const s = await db.settings.get(SETTINGS_KEY)
      await db.settings.put(
        touch({
          ...s,
          profile,
          targetsSource: 'computed',
          computedAt: nowMs(),
          targetKcal: t.targetKcal,
          targetProtein: t.targetProtein,
          targetCarb: t.targetCarb,
          targetFat: t.targetFat,
          targetSugarsSimple: t.targetSugarsSimple,
        }),
      )
    })
    onDone?.()
  }

  return (
    <form onSubmit={onSubmit} className="px-5 pb-6 pt-1 space-y-4">
      {onboarding && (
        <p className="text-[13px] leading-relaxed" style={{ color: C.muted }}>
          Quelques infos pour calculer tes budgets caloriques et macros. Modifiables à tout moment dans Données.
        </p>
      )}

      {/* Sexe */}
      <Field label="Sexe">
        <div className="flex gap-2">
          {[
            ['M', 'Homme'],
            ['F', 'Femme'],
          ].map(([v, lbl]) => (
            <button
              key={v}
              type="button"
              onClick={() => setSex(v)}
              className="flex-1 py-2 rounded-xl text-[13px] font-semibold border active:scale-[0.98] transition"
              style={{
                background: sex === v ? C.energy : C.bg,
                color: sex === v ? C.bg : C.text,
                borderColor: sex === v ? C.energy : C.line,
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Âge">
          <NumInput aria="Âge" value={age} onChange={setAge} placeholder="30" />
        </Field>
        <Field label="Taille (cm)">
          <NumInput aria="Taille en centimètres" value={heightCm} onChange={setHeightCm} placeholder="180" />
        </Field>
      </div>

      {/* Poids : dernier weightLogs si dispo, sinon saisie (crée la 1ʳᵉ pesée) */}
      <Field label="Poids (kg)">
        {latestWeight ? (
          <div className="flex items-center justify-between rounded-xl px-3 py-2 border" style={{ borderColor: C.line }}>
            <span style={num} className="text-[15px] font-semibold">
              {fmtKg(latestWeight.weightKg)} kg
            </span>
            <span className="text-[11px]" style={{ color: C.faint }}>
              dernière pesée — modifiable dans l'onglet Poids
            </span>
          </div>
        ) : (
          <NumInput aria="Poids en kilogrammes" value={weightStr} onChange={setWeightStr} placeholder="78,4" />
        )}
      </Field>

      <Field label="Niveau d'activité">
        <Select aria="Niveau d'activité" value={activityLevel} onChange={setActivityLevel}>
          {ACTIVITY_LEVELS.map((k) => (
            <option key={k} value={k}>
              {ACTIVITY[k].label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Objectif">
        <Select aria="Objectif" value={goal} onChange={setGoal}>
          {GOAL_KEYS.map((k) => (
            <option key={k} value={k}>
              {GOALS[k].label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="% masse grasse (optionnel)">
        <NumInput aria="Pourcentage de masse grasse" value={bodyFatPct} onChange={setBodyFatPct} placeholder="ex. 15" />
        <p className="text-[11px] mt-1" style={{ color: C.faint }}>
          Si renseigné → formule Katch-McArdle, sinon Mifflin-St Jeor.
        </p>
      </Field>

      {/* Aperçu live des cibles calculées */}
      {preview && (
        <div className="rounded-2xl p-3.5 border space-y-2" style={{ background: C.surface, borderColor: C.line }}>
          <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
            Cibles calculées ({preview.formula === 'katch' ? 'Katch-McArdle' : 'Mifflin-St Jeor'})
          </div>
          <Row k="BMR" v={`${preview.bmr} kcal`} />
          <Row k="TDEE (dépense)" v={`${preview.tdee} kcal`} />
          <Row k="Objectif calorique" v={`${preview.targetKcal} kcal`} hi />
          <Row k="Protéines" v={`${preview.targetProtein} g`} />
          <Row k="Glucides" v={`${preview.targetCarb} g`} />
          <Row k="Lipides" v={`${preview.targetFat} g`} />
          <Row k="Sucres simples" v={`< ${preview.targetSugarsSimple} g`} />
          <div className="flex items-start gap-1.5 pt-1 text-[11px]" style={{ color: C.faint }}>
            <Info size={12} className="mt-0.5 shrink-0" />
            <span>
              IMC {preview.bmi.toFixed(1)} — indicatif : ne distingue pas masse grasse et masse maigre, peu pertinent
              pour un pratiquant musclé.
            </span>
          </div>
          {preview.clamps.length > 0 && (
            <p className="text-[11px]" style={{ color: C.carb }}>
              Garde-fous appliqués ({preview.clamps.join(', ')}) — cibles plafonnées pour rester sûres.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="text-[12px]" style={{ color: C.warn }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!ready}
        className="w-full py-3 rounded-xl text-[14px] font-semibold active:scale-[0.98] transition"
        style={{ background: ready ? C.energy : C.surfaceHi, color: ready ? C.bg : C.faint }}
      >
        {onboarding ? 'Commencer' : 'Enregistrer le profil'}
      </button>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[0.14em] mb-1.5" style={{ color: C.faint }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function NumInput({ aria, value, onChange, placeholder }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={aria}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl px-3 py-2 text-[15px] outline-none border"
      style={{ background: C.bg, borderColor: C.line, color: C.text, ...num }}
    />
  )
}

function Select({ aria, value, onChange, children }) {
  return (
    <select
      aria-label={aria}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl px-3 py-2 text-[14px] outline-none border"
      style={{ background: C.bg, borderColor: C.line, color: C.text }}
    >
      {children}
    </select>
  )
}

function Row({ k, v, hi }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ ...num, color: hi ? C.energy : C.text, fontWeight: hi ? 700 : 500 }}>{v}</span>
    </div>
  )
}

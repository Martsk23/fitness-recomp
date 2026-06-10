import { useEffect, useState } from 'react'
import { CalendarDays, Settings, Sun, NotebookText, Plus, Scale, Dumbbell, UserCog } from 'lucide-react'
import { C, formatFrDate } from './ui.js'
import { db, SETTINGS_KEY } from './db.js'
import { isProfileComplete } from './lib/metabolic.js'
import Jour from './screens/Jour.jsx'
import Journal from './screens/Journal.jsx'
import Data from './screens/Data.jsx'
import Poids from './screens/Poids.jsx'
import Profil from './screens/Profil.jsx'
import Bouffe from './screens/Bouffe.jsx'
import Perf from './screens/Perf.jsx'

export default function App() {
  const [tab, setTab] = useState('jour')
  const [ready, setReady] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await db.settings.get(SETTINGS_KEY)
      if (!alive) return
      setNeedsOnboarding(!isProfileComplete(s?.profile))
      setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  if (!ready) return null

  // Onboarding one-shot : profil vide → on remplace le shell par le formulaire.
  if (needsOnboarding) {
    return (
      <Shell>
        <div className="px-5 pt-6 pb-2 flex items-center gap-2" style={{ color: C.text }}>
          <UserCog size={18} style={{ color: C.energy }} />
          <span className="text-[15px] font-semibold">Bienvenue — configure ton profil</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Profil onboarding onDone={() => setNeedsOnboarding(false)} />
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <>
        {/* ── En-tête : date · chip Recomp · réglages ─────────────── */}
        <div className="px-5 pt-6 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ color: C.muted }}>
            <CalendarDays size={15} />
            <span className="text-[13px] font-medium tracking-wide">{formatFrDate()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-1 rounded-full"
              style={{ color: C.energy, background: 'rgba(190,242,100,0.10)' }}
            >
              Recomp
            </span>
            <button
              onClick={() => setTab(tab === 'data' ? 'jour' : 'data')}
              className="p-1 active:scale-90 transition"
              aria-label="Réglages et données"
            >
              <Settings size={17} style={{ color: tab === 'data' ? C.energy : C.faint }} />
            </button>
          </div>
        </div>

        {/* ── Contenu ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'jour' && <Jour onSeeJournal={() => setTab('journal')} />}
          {tab === 'journal' && <Journal />}
          {tab === 'data' && <Data />}
          {tab === 'poids' && <Poids />}
          {tab === 'bouffe' && <Bouffe onNavigate={setTab} />}
          {tab === 'perf' && <Perf />}
        </div>

        {/* ── Tab bar (5 onglets : Journal promu, Chat retiré — D26) ── */}
        <div
          className="flex items-center justify-around px-2 pt-2 pb-5 border-t"
          style={{ background: C.bg, borderColor: C.line }}
        >
          <TabBtn icon={Sun} label="Jour" id="jour" tab={tab} set={setTab} />
          <TabBtn icon={NotebookText} label="Journal" id="journal" tab={tab} set={setTab} />
          <TabBtn icon={Plus} label="Bouffe" id="bouffe" tab={tab} set={setTab} />
          <TabBtn icon={Dumbbell} label="Perf" id="perf" tab={tab} set={setTab} />
          <TabBtn icon={Scale} label="Poids" id="poids" tab={tab} set={setTab} />
        </div>
      </>
    </Shell>
  )
}

// Cadre « téléphone » partagé (onboarding + app).
function Shell({ children }) {
  return (
    <div className="min-h-screen w-full flex justify-center py-6 px-3" style={{ background: '#05070A' }}>
      <div
        className="w-full max-w-[400px] rounded-[34px] border overflow-hidden shadow-2xl flex flex-col"
        style={{ background: C.bg, color: C.text, borderColor: C.line }}
      >
        {children}
      </div>
    </div>
  )
}

function TabBtn({ icon: Icon, label, id, tab, set }) {
  const active = tab === id
  return (
    <button
      onClick={() => set(id)}
      className="flex flex-col items-center gap-1 px-2 py-1 active:scale-90 transition"
    >
      <Icon size={20} style={{ color: active ? C.energy : C.faint }} strokeWidth={active ? 2.4 : 2} />
      <span className="text-[10px] font-medium" style={{ color: active ? C.text : C.faint }}>
        {label}
      </span>
    </button>
  )
}

import React, { useState } from "react";
import {
  Plus, Droplet, Pill, Scale, Dumbbell, MessageCircle,
  CalendarDays, Check, TrendingDown, Sun
} from "lucide-react";

// ── Tokens couleur (instrument / ordinateur de bord) ──────────────
const C = {
  bg: "#0B0E13",
  surface: "#151A21",
  surfaceHi: "#1C232C",
  line: "#262E39",
  text: "#E8EBEF",
  muted: "#8A93A2",
  faint: "#5B6573",
  energy: "#BEF264", // lime
  protein: "#38BDF8", // sky
  carb: "#FBBF24", // amber
  fat: "#C084FC", // violet
  warn: "#FB7185", // rose
};

const num = { fontVariantNumeric: "tabular-nums" };

// ── Aliments rapides (démo) ───────────────────────────────────────
const QUICK = [
  { id: "rice", label: "Riz 150g", kcal: 195, p: 4, c: 42, f: 0, s: 0 },
  { id: "chick", label: "Poulet 200g", kcal: 220, p: 46, c: 0, f: 5, s: 0 },
  { id: "skyr", label: "Skyr 200g", kcal: 130, p: 22, c: 8, f: 0, s: 6 },
  { id: "banana", label: "Banane 120g", kcal: 107, p: 1, c: 27, f: 0, s: 14 },
];

const TARGETS = { kcal: 2100, p: 165, c: 200, f: 60, s: 20 };

export default function App() {
  const [tab, setTab] = useState("jour");
  const [consumed, setConsumed] = useState({ kcal: 1430, p: 118, c: 132, f: 41, s: 12 });
  const [expended] = useState(380);
  const [water, setWater] = useState(5);
  const [supps, setSupps] = useState({ Créatine: true, "Vitamine D": false, "Oméga-3": false });
  const [weighed, setWeighed] = useState(false);

  const addFood = (f) =>
    setConsumed((x) => ({
      kcal: x.kcal + f.kcal, p: x.p + f.p, c: x.c + f.c, f: x.f + f.f, s: x.s + f.s,
    }));

  const remaining = TARGETS.kcal - consumed.kcal;
  const pct = Math.min(100, (consumed.kcal / TARGETS.kcal) * 100);
  const balance = consumed.kcal - expended; // bilan réel

  return (
    <div style={{ background: "#05070A" }} className="min-h-screen w-full flex justify-center py-6 px-3">
      <div
        style={{ background: C.bg, color: C.text, borderColor: C.line }}
        className="w-full max-w-[400px] rounded-[34px] border overflow-hidden shadow-2xl"
      >
        {/* ── Barre de statut / date ─────────────────────────────── */}
        <div className="px-5 pt-6 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ color: C.muted }}>
            <CalendarDays size={15} />
            <span className="text-[13px] font-medium tracking-wide">mar. 9 juin</span>
          </div>
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-1 rounded-full"
            style={{ color: C.energy, background: "rgba(190,242,100,0.10)" }}
          >
            Recomp
          </span>
        </div>

        {tab === "jour" && (
          <div className="px-5 pb-4">
            {/* ── HÉRO : énergie restante (signature : jauge SVG) ── */}
            <div className="flex items-center gap-5 mt-2 mb-5">
              <EnergyRing pct={pct} />
              <div className="flex-1">
                <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: C.faint }}>
                  Restant aujourd'hui
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span style={{ ...num }} className="text-[40px] font-black leading-none">
                    {remaining}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: C.muted }}>kcal</span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[12px]" style={{ color: C.muted }}>
                  <span style={num}>{consumed.kcal} mangé</span>
                  <span style={{ color: C.line }}>·</span>
                  <span style={num} className="flex items-center gap-1">
                    <TrendingDown size={12} style={{ color: C.energy }} /> {expended} dépensé
                  </span>
                </div>
                <div
                  className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-0.5 rounded"
                  style={{ color: C.energy, background: "rgba(190,242,100,0.08)", ...num }}
                >
                  Bilan {balance > 0 ? "+" : ""}{balance} kcal · déficit
                </div>
              </div>
            </div>

            {/* ── Macros (jauges précises) ───────────────────────── */}
            <div className="space-y-3">
              <MacroBar name="Protéines" v={consumed.p} t={TARGETS.p} color={C.protein} />
              <MacroBar name="Glucides" v={consumed.c} t={TARGETS.c} color={C.carb} />
              <MacroBar name="Lipides" v={consumed.f} t={TARGETS.f} color={C.fat} />
            </div>

            {/* ── Intelligence glucidique ────────────────────────── */}
            <div
              className="mt-4 rounded-2xl p-3.5 border"
              style={{ background: C.surface, borderColor: C.line }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>
                  Sucres simples
                </span>
                <span style={num} className="text-[12px] font-semibold"
                  ><span style={{ color: consumed.s >= TARGETS.s ? C.warn : consumed.s >= 15 ? C.carb : C.text }}>
                    {consumed.s}
                  </span>
                  <span style={{ color: C.faint }}> / {TARGETS.s} g</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.surfaceHi }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (consumed.s / TARGETS.s) * 100)}%`,
                    background: consumed.s >= TARGETS.s ? C.warn : C.carb,
                  }}
                />
              </div>
              <div className="flex items-center gap-1.5 mt-2.5 text-[12px]" style={{ color: C.muted }}>
                <Sun size={13} style={{ color: C.carb }} />
                Pas d'entraînement aujourd'hui · privilégie l'IG bas / modéré
              </div>
            </div>

            {/* ── Ajout rapide ───────────────────────────────────── */}
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-[0.14em] mb-2" style={{ color: C.faint }}>
                Ajout rapide
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => addFood(f)}
                    className="flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-xl border active:scale-95 transition"
                    style={{ background: C.surface, borderColor: C.line, color: C.text }}
                  >
                    <Plus size={13} style={{ color: C.energy }} />
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Tickers quotidiens ─────────────────────────────── */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              {/* Eau */}
              <button
                onClick={() => setWater((w) => (w >= 8 ? 0 : w + 1))}
                className="rounded-2xl p-3.5 border text-left active:scale-[0.98] transition"
                style={{ background: C.surface, borderColor: C.line }}
              >
                <div className="flex items-center justify-between mb-2">
                  <Droplet size={16} style={{ color: C.protein }} />
                  <span style={num} className="text-[12px] font-semibold" >
                    {water}<span style={{ color: C.faint }}>/8</span>
                  </span>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 h-5 rounded-[4px] transition"
                      style={{ background: i < water ? C.protein : C.surfaceHi }}
                    />
                  ))}
                </div>
                <div className="text-[11px] mt-2" style={{ color: C.muted }}>Eau · tape pour +1</div>
              </button>

              {/* Compléments */}
              <div
                className="rounded-2xl p-3.5 border"
                style={{ background: C.surface, borderColor: C.line }}
              >
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Pill size={16} style={{ color: C.fat }} />
                  <span className="text-[12px] font-semibold">Compléments</span>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(supps).map(([k, done]) => (
                    <button
                      key={k}
                      onClick={() => setSupps((s) => ({ ...s, [k]: !s[k] }))}
                      className="w-full flex items-center gap-2 active:scale-[0.98] transition"
                    >
                      <span
                        className="w-4 h-4 rounded-[5px] flex items-center justify-center border"
                        style={{
                          background: done ? C.energy : "transparent",
                          borderColor: done ? C.energy : C.line,
                        }}
                      >
                        {done && <Check size={11} color="#0B0E13" strokeWidth={3} />}
                      </span>
                      <span
                        className="text-[12.5px]"
                        style={{ color: done ? C.text : C.muted, textDecoration: done ? "none" : "none" }}
                      >
                        {k}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Pesée du jour ──────────────────────────────────── */}
            {!weighed ? (
              <button
                onClick={() => setWeighed(true)}
                className="mt-3 w-full rounded-2xl p-3.5 border flex items-center justify-between active:scale-[0.99] transition"
                style={{ background: "rgba(56,189,248,0.06)", borderColor: "rgba(56,189,248,0.25)" }}
              >
                <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: C.protein }}>
                  <Scale size={16} /> Pas encore pesé ce matin
                </span>
                <span className="text-[12px] font-semibold" style={{ color: C.protein }}>Saisir →</span>
              </button>
            ) : (
              <div
                className="mt-3 w-full rounded-2xl p-3.5 border flex items-center justify-between"
                style={{ background: C.surface, borderColor: C.line }}
              >
                <span className="flex items-center gap-2 text-[13px]" style={{ color: C.muted }}>
                  <Scale size={16} style={{ color: C.energy }} /> Pesée enregistrée
                </span>
                <span style={num} className="text-[13px] font-semibold">78,4 kg</span>
              </div>
            )}
          </div>
        )}

        {tab !== "jour" && (
          <div className="px-5 py-20 text-center" style={{ color: C.faint }}>
            <div className="text-[13px] uppercase tracking-[0.16em] mb-1">{labelFor(tab)}</div>
            <div className="text-[12px]" style={{ color: C.muted }}>
              Écran à construire en Phase {phaseFor(tab)}
            </div>
          </div>
        )}

        {/* ── Tab bar ──────────────────────────────────────────── */}
        <div
          className="flex items-center justify-around px-2 pt-2 pb-5 border-t"
          style={{ background: C.bg, borderColor: C.line }}
        >
          <TabBtn icon={Sun} label="Jour" id="jour" tab={tab} set={setTab} />
          <TabBtn icon={Plus} label="Bouffe" id="bouffe" tab={tab} set={setTab} />
          <TabBtn icon={Scale} label="Poids" id="poids" tab={tab} set={setTab} />
          <TabBtn icon={Dumbbell} label="Perf" id="perf" tab={tab} set={setTab} />
          <TabBtn icon={MessageCircle} label="Chat" id="chat" tab={tab} set={setTab} />
        </div>
      </div>
    </div>
  );
}

// ── Jauge énergie (SVG, élément signature) ─────────────────────────
function EnergyRing({ pct }) {
  const r = 34, cx = 44, cy = 44, circ = 2 * Math.PI * r;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.surfaceHi} strokeWidth="7" />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={C.energy} strokeWidth="7"
        strokeLinecap="round" strokeDasharray={circ}
        strokeDashoffset={circ - (pct / 100) * circ}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
      <text x="44" y="40" textAnchor="middle" fill={C.text}
        style={{ fontSize: 18, fontWeight: 800, ...num }}>
        {Math.round(pct)}%
      </text>
      <text x="44" y="55" textAnchor="middle" fill={C.faint}
        style={{ fontSize: 8, letterSpacing: 1, textTransform: "uppercase" }}>
        budget
      </text>
    </svg>
  );
}

// ── Barre macro ────────────────────────────────────────────────────
function MacroBar({ name, v, t, color }) {
  const pct = Math.min(100, (v / t) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[13px] font-medium">{name}</span>
        <span style={num} className="text-[12.5px]">
          <span className="font-semibold">{v}</span>
          <span style={{ color: C.faint }}> / {t} g</span>
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: C.surfaceHi }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Bouton de la tab bar ───────────────────────────────────────────
function TabBtn({ icon: Icon, label, id, tab, set }) {
  const active = tab === id;
  return (
    <button onClick={() => set(id)} className="flex flex-col items-center gap-1 px-2 py-1 active:scale-90 transition">
      <Icon size={20} style={{ color: active ? C.energy : C.faint }} strokeWidth={active ? 2.4 : 2} />
      <span className="text-[10px] font-medium" style={{ color: active ? C.text : C.faint }}>{label}</span>
    </button>
  );
}

const labelFor = (t) => ({ bouffe: "Bibliothèque & journal", poids: "Suivi du poids", perf: "Performances", chat: "Chat repas" }[t] || "");
const phaseFor = (t) => ({ bouffe: 1, poids: 1, perf: 2, chat: 3 }[t] || 1);

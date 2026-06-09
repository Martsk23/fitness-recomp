# Fitness Recomp

PWA personnelle de suivi fitness orientée **recomposition corporelle**. Cible iPhone, **100 % locale, hors-ligne, sans compte ni serveur**. Aucune donnée ne quitte l'appareil.

## Stack
React 19 · Vite 8 · Tailwind v4 · Dexie.js (IndexedDB) · Recharts · PapaParse · `vite-plugin-pwa`.

## Lancer
```bash
npm install
npm run dev       # dev (HMR), http://localhost:5173
npm run build     # build de prod (génère le service worker)
npm run preview   # sert le build, http://localhost:4173
npm run lint
```

## Données
- Tout est stocké en **IndexedDB via Dexie** (jamais `localStorage`).
- **Aucune variable d'environnement** — l'app est entièrement locale.
- Sauvegarde / restauration : écran **Données** (icône ⚙) → export/import JSON complet.
- `src/db.js` → `TABLES` est la **source unique** pilotant l'export/import. Toute nouvelle table doit y être ajoutée dans la même tâche.

## Docs
Voir [`docs/`](docs/) : `CLAUDE.md` (contraintes + modèle de données), `ROADMAP.md`, `PROGRESS.md` (état d'avancement), `DECISIONS.md` (choix d'archi).

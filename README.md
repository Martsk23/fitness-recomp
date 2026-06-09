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
npm test          # tests de migration (node + fake-indexeddb, sans navigateur)
npm run smoke     # smoke E2E Playwright sur l'app buildée (vrai DOM + IndexedDB)
```

### Smoke E2E (Playwright) — prérequis sur machine neuve
`npm run smoke` build l'app, la sert via `preview` et la pilote dans un vrai
Chromium. Sur un clone propre, télécharger le navigateur **une fois** :
```bash
npx playwright install chromium
```
Le navigateur va dans l'emplacement par défaut (`~/.cache/ms-playwright`) et
`npm run smoke` le trouve sans config. **Seulement** si le cache est ailleurs,
pointer dessus au lancement :
```bash
PLAYWRIGHT_BROWSERS_PATH=/chemin/du/cache npm run smoke
```
Pas d'automatisation (pas de `postinstall`, pas de CI) au V1 — note manuelle.

## Données
- Tout est stocké en **IndexedDB via Dexie** (jamais `localStorage`).
- **Aucune variable d'environnement** — l'app est entièrement locale.
- Sauvegarde / restauration : écran **Données** (icône ⚙) → export/import JSON complet.
- `src/db.js` → `TABLES` est la **source unique** pilotant l'export/import. Toute nouvelle table doit y être ajoutée dans la même tâche.

## Docs
Voir [`docs/`](docs/) : `CLAUDE.md` (contraintes + modèle de données), `ROADMAP.md`, `PROGRESS.md` (état d'avancement), `DECISIONS.md` (choix d'archi).

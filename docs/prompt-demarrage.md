# Prompt de démarrage — App fitness recomp (PWA iOS)

> À coller comme premier message dans Claude Code, à la racine du repo vide.
> Garde aussi ce fichier dans `/docs/` du repo.

---

Tu es mon assistant de développement sur ce projet. **Lis ce document en entier avant d'écrire la moindre ligne de code.**

## Contexte

App **personnelle** de suivi fitness orientée **recomposition corporelle**. Je développe sur PC (Windows/Linux) via Claude Code, la cible est mon iPhone. L'app est une **PWA installable, hors-ligne, 100 % locale** (pas de serveur, pas de compte). Je suis seul utilisateur.

## Contraintes dures (à recopier dans `/docs/CLAUDE.md`, à respecter à chaque session)

- PWA installable iOS + hors-ligne complet. **Jamais** de natif / Swift / Xcode / HealthKit / Apple Fitness en direct — c'est impossible par ce chemin.
- Stockage local **IndexedDB via Dexie.js**. **Jamais** localStorage pour les données métier.
- **100 % local**, pas de backend au V1, pas de compte, aucune donnée ne quitte l'appareil.
- **Toute donnée doit être incluse dans l'export JSON.** Si tu ajoutes une table/entité, tu mets à jour l'export ET l'import dans la même tâche.
- **Mobile-first**, pensé pour un écran d'iPhone, saisie quotidienne rapide (valider en 2 secondes).
- Objectif transversal partout : recomposition → macros stricts, **sucres simples < 20 g/jour**, timing glucidique.

## Stack imposée

React + Vite + `vite-plugin-pwa`, Tailwind CSS, **Dexie.js** (IndexedDB), Recharts (graphes), PapaParse (CSV Strong).

## Méthode de travail (importante)

- **Tranches verticales** : une feature finie et utilisable avant de commencer la suivante. Jamais de chantiers à moitié partout.
- **Un commit git par feature**, message clair.
- Tu maintiens dans `/docs/` : `CLAUDE.md` (contraintes + conventions + modèle de données), `ROADMAP.md`, `PROGRESS.md` (fait / en cours / à faire), `DECISIONS.md` (choix d'archi + pourquoi).
- **À la fin de chaque session : mets à jour `PROGRESS.md`** pour qu'on reprenne sans perte de contexte.

## PREMIÈRE TÂCHE — avant tout code

Propose-moi le **schéma de données complet** : toutes les entités IndexedDB, leurs champs, types, et index Dexie. **Attends ma validation avant de coder quoi que ce soit.**

Entités au minimum :
- `ingredients` — nom, kcal/100g, protéines/100g, glucides/100g (avec part sucres simples + type IG bas/haut), lipides/100g.
- `journalEntries` — date, ingredientId, poids en g, macros calculées.
- `weightLogs` — date/heure, poids.
- `workouts` + `sets` — date, exercice, série, reps, charge.
- `tickers` — consommables quotidiens à cocher (eau, compléments…), config + état du jour, reset journalier.
- `drinks` — base boissons (voir « à recréer »).
- `settings` — objectifs caloriques/macros, préférences.

## Phase 0 — Fondations (après validation du schéma)

- Scaffold React + Vite + Tailwind, PWA **installable sur iOS**, service worker hors-ligne.
- Dexie.js avec le schéma validé.
- **Export complet en JSON** (un bouton) + **import JSON** (restauration).
- Appel à `navigator.storage.persist()` au lancement (réduire le risque d'éviction des données par iOS).
- Création de `/docs/CLAUDE.md`, `ROADMAP.md`, `PROGRESS.md`, `DECISIONS.md`.

**Livrable Phase 0 :** une coquille installable sur l'iPhone qui **ne perd pas ses données** et que je peux sauvegarder/restaurer.

## Roadmap

**Phase 1 — Le quotidien utilisable (priorité absolue)**
1. Nutrition : bibliothèque d'ingrédients bruts + composition d'un plat par pesée (g) → calcul auto kcal + macros.
2. Poids : saisie + graphe avec moyenne glissante + petit guide « bon moment pour se peser » (matin à jeun, etc.).
3. Tickers quotidiens (eau par verres, compléments) avec reset chaque jour + affichage type widget (ex. 5/8).
4. Bilan énergétique : consommé − dépensé, avec saisie manuelle rapide de la dépense du jour.

À la fin de la Phase 1, **j'utilise l'app tous les jours.**

**Phase 2 — Intelligence**
5. Intelligence glucidique : glucides bas-IG (énergie stable) vs haut-IG (autour des entraînements), sucres simples < 20 g/j, barres de composition, alertes contextuelles selon timing/activité.
6. Import CSV Strong : détection auto des colonnes (date, exercice, set, reps, poids) → suivi des perfs.
7. Analyse de perf : détection progressions / stagnations / régressions par exercice, échauffement calculé (montée en charge), table de correspondance exercice → variantes pour casser les plateaux.

**Phase 3 — Assistance**
8. Mini-chat repas, **moteur de règles 100 % local** : calcule macros restantes + contexte (sport aujourd'hui ? heure ?) → propose 2-3 idées de repas maison qui rentrent dans le budget.
9. Couche IA Claude **optionnelle**, opt-in, désactivable. Prévoir dès la Phase 3 une **interface commune** entre moteur de règles et moteur IA pour que ce soit branchable proprement (mais ne pas l'implémenter avant que le reste tourne).

## À recréer (l'ancien projet est perdu — pas de migration)

- **Base de ~38 boissons alcoolisées** (bières, vins, spiritueux, cocktails) avec portions + kcal : régénère une table de départ depuis des valeurs nutritionnelles standard.
- **Logique d'intelligence glucidique** (règles ci-dessus).
- **Bibliothèque d'ingrédients bruts de départ** (féculents, protéines, légumes, matières grasses…) en valeurs /100g, enrichissable par l'utilisateur.

## À NE PAS faire

- Pas de base Picard, pas de plats préparés industriels (je consomme ~90 % maison).
- Pas de HealthKit / Apple Fitness en direct. Dépenses = saisie manuelle ; Strong = import CSV.
- **Pas de push notifications au V1** (elles nécessitent un serveur, ce qui casse le « 100 % local »). Les rappels (ex. pesée) sont **in-app** uniquement.

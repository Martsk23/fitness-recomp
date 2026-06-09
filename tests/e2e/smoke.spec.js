import { test, expect } from '@playwright/test'

// Ces tests montent le VRAI React dans un VRAI IndexedDB sur l'app buildée.
// migration.test.mjs tourne en node (fake-indexeddb) sans monter de composant
// → il n'avait pas pu voir le bug settings.get(1) (écran Jour blanc). Ce smoke
// couvre cette classe de bug + le flux onboarding et la persistance.

// Profil M 30/180/80, modéré, recomp → objectif calorique attendu = 2483 kcal
// (valeur vérifiée dans tests/metabolic.test.mjs).
async function completeOnboarding(page) {
  await expect(page.getByText('configure ton profil')).toBeVisible()
  await page.getByLabel('Âge').fill('30')
  await page.getByLabel('Taille en centimètres').fill('180')
  await page.getByLabel('Poids en kilogrammes').fill('80')
  await page.getByLabel("Niveau d'activité").selectOption('moderate')
  await page.getByLabel('Objectif').selectOption('recomp')
  await page.getByRole('button', { name: 'Commencer' }).click()
}

test('onboarding au 1er lancement → Jour avec cibles CALCULÉES → profil persisté après reload', async ({ page }) => {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await completeOnboarding(page)

  // Jour se monte (non null) avec les cibles calculées par le moteur (pas seedées).
  await expect(page.getByText("Restant aujourd'hui")).toBeVisible()
  await expect(page.getByText('objectif 2483')).toBeVisible()

  // Persistance profil : reload → pas de ré-onboarding, Jour direct, mêmes cibles.
  await page.reload()
  await expect(page.getByText("Restant aujourd'hui")).toBeVisible()
  await expect(page.getByText('objectif 2483')).toBeVisible()

  expect(errors, `erreurs console:\n${errors.join('\n')}`).toHaveLength(0)
})

// 'YYYY-MM-DD' local (même convention que ui.js todayKey).
function dayKey(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

test('tickers : incrément/décrément borné à 0, toggle, état du jour persisté, autre date repart à 0', async ({ page }) => {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await completeOnboarding(page)

  const eau = page.getByTestId('ticker-value-Eau')
  const inc = page.getByRole('button', { name: 'Incrémenter Eau' })
  const dec = page.getByRole('button', { name: 'Décrémenter Eau' })
  const creatine = page.getByRole('button', { name: 'Cocher Créatine' })

  // Absence de ligne = 0.
  await expect(eau).toHaveText('0 / 8')

  // Incrément ×3 puis décrément ×1.
  await inc.click()
  await inc.click()
  await inc.click()
  await expect(eau).toHaveText('3 / 8')
  await dec.click()
  await expect(eau).toHaveText('2 / 8')

  // Décrément sous 0 → borné à 0 (clic ×4 depuis 2 ; bouton se désactive à 0).
  await dec.click()
  await dec.click()
  await expect(eau).toHaveText('0 / 8')
  await expect(dec).toBeDisabled()

  // Remonte à 2 + coche un complément.
  await inc.click()
  await inc.click()
  await expect(eau).toHaveText('2 / 8')
  await creatine.click()
  await expect(creatine).toHaveAttribute('aria-pressed', 'true')

  // Persistance réelle : reload (IndexedDB) → état du jour conservé.
  await page.reload()
  await expect(page.getByTestId('ticker-value-Eau')).toHaveText('2 / 8')
  await expect(page.getByRole('button', { name: 'Cocher Créatine' })).toHaveAttribute('aria-pressed', 'true')

  // "Autre date repart à 0" : on injecte une ligne d'HIER (valeur 9) directement
  // dans IndexedDB ; elle ne doit PAS remonter dans l'affichage d'aujourd'hui.
  const yKey = dayKey(new Date(Date.now() - 86_400_000))
  await page.evaluate(async (ydate) => {
    const open = indexedDB.open('fitnessRecomp')
    const idb = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result)
      open.onerror = () => rej(open.error)
    })
    const cfgs = await new Promise((res, rej) => {
      const req = idb.transaction('tickerConfigs', 'readonly').objectStore('tickerConfigs').getAll()
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    const eauCfg = cfgs.find((c) => c.label === 'Eau')
    await new Promise((res, rej) => {
      const tx = idb.transaction('tickerStates', 'readwrite')
      tx.objectStore('tickerStates').put({
        id: crypto.randomUUID(),
        tickerId: eauCfg.id,
        date: ydate,
        value: 9,
        updatedAt: Date.now(),
      })
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    idb.close()
  }, yKey)

  await page.reload()
  // Aujourd'hui inchangé (2), la ligne d'hier (9) n'a pas fui dans le jour courant.
  await expect(page.getByTestId('ticker-value-Eau')).toHaveText('2 / 8')

  expect(errors, `erreurs console:\n${errors.join('\n')}`).toHaveLength(0)
})

test('bilan énergétique : dépense saisie persistée, consommé − dépensé correct, 1 ligne keyée par date', async ({ page }) => {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await completeOnboarding(page)

  // La nutrition n'est pas encore implémentée : on injecte un repas du jour
  // directement dans IndexedDB (consommé = 600 kcal) pour activer le côté
  // "consommé" du bilan et prouver le calcul end-to-end.
  const tKey = dayKey(new Date())
  await page.evaluate(async (tdate) => {
    const open = indexedDB.open('fitnessRecomp')
    const idb = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result)
      open.onerror = () => rej(open.error)
    })
    await new Promise((res, rej) => {
      const tx = idb.transaction('journalEntries', 'readwrite')
      tx.objectStore('journalEntries').put({
        id: crypto.randomUUID(),
        date: tdate,
        sourceType: 'ingredient',
        sourceId: 'seed-test',
        nameSnapshot: 'Repas test',
        grams: 100,
        kcal: 600,
        protein: 0,
        carb: 0,
        sugarsSimple: 0,
        fat: 0,
        createdAt: Date.now(),
        loggedAt: Date.now(),
        updatedAt: Date.now(),
      })
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    idb.close()
  }, tKey)
  await page.reload() // Jour recharge le consommé du jour (profil déjà persisté → pas de ré-onboarding)

  // Dépense non saisie au départ → champ ouvert. On saisit la dépense totale.
  await page.getByLabel('Dépense totale du jour en kcal').fill('2500')
  await page.getByRole('button', { name: 'Enregistrer la dépense' }).click()
  await expect(page.getByTestId('expenditure-value')).toHaveText('2500')

  // Bilan = consommé 600 − dépensé 2500 = −1900 kcal.
  await expect(page.getByTestId('energy-balance')).toHaveText('-1900 kcal')

  // Persistance réelle : reload (IndexedDB) → dépense conservée, bilan recalculé.
  await page.reload()
  await expect(page.getByTestId('expenditure-value')).toHaveText('2500')
  await expect(page.getByTestId('energy-balance')).toHaveText('-1900 kcal')

  // Une seule ligne, keyée par la date du jour (⇒ une autre date reste vierge).
  const rows = await page.evaluate(async () => {
    const open = indexedDB.open('fitnessRecomp')
    const idb = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result)
      open.onerror = () => rej(open.error)
    })
    const all = await new Promise((res, rej) => {
      const req = idb.transaction('dailyExpenditure', 'readonly').objectStore('dailyExpenditure').getAll()
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    idb.close()
    return all
  })
  expect(rows.length).toBe(1)
  expect(rows[0].date).toBe(tKey)

  expect(errors, `erreurs console:\n${errors.join('\n')}`).toHaveLength(0)
})

test('consommé rapide : total manuel saisi → bilan, persistance, 1 ligne/date, macros non renseignées', async ({ page }) => {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await completeOnboarding(page)

  // Saisie du consommé TOTAL du jour (aucun repas injecté → vient du total manuel).
  await page.getByLabel('Consommé total du jour en kcal').fill('2100')
  await page.getByRole('button', { name: 'Enregistrer le consommé' }).click()
  await expect(page.getByTestId('consumed-value')).toHaveText('2100')

  // Macros sans détail (total kcal saisi, pas de compo) → mention "non renseigné".
  await expect(page.getByText('détail non renseigné')).toBeVisible()

  // Dépense → bilan = consommé 2100 − dépensé 2500 = −400 kcal.
  await page.getByLabel('Dépense totale du jour en kcal').fill('2500')
  await page.getByRole('button', { name: 'Enregistrer la dépense' }).click()
  await expect(page.getByTestId('energy-balance')).toHaveText('-400 kcal')

  // Persistance réelle : reload (IndexedDB) → total + bilan conservés.
  await page.reload()
  await expect(page.getByTestId('consumed-value')).toHaveText('2100')
  await expect(page.getByTestId('energy-balance')).toHaveText('-400 kcal')

  // Une seule ligne dailyIntake, keyée par la date du jour.
  const tKey = dayKey(new Date())
  const rows = await page.evaluate(async () => {
    const open = indexedDB.open('fitnessRecomp')
    const idb = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result)
      open.onerror = () => rej(open.error)
    })
    const all = await new Promise((res, rej) => {
      const req = idb.transaction('dailyIntake', 'readonly').objectStore('dailyIntake').getAll()
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    idb.close()
    return all
  })
  expect(rows.length).toBe(1)
  expect(rows[0].date).toBe(tKey)

  // Effacer → revient à "non suivi" (champ de saisie rouvert).
  await page.getByRole('button', { name: 'Effacer le consommé du jour' }).click()
  await expect(page.getByLabel('Consommé total du jour en kcal')).toBeVisible()

  expect(errors, `erreurs console:\n${errors.join('\n')}`).toHaveLength(0)
})

test('nutrition : seed parti via flag, plat pesé → kcal/macros corrects → reload → entrée conservée → consommé du Jour allumé', async ({ page }) => {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await completeOnboarding(page)

  // Le seed bibliothèque est parti au boot via le flag librarySeededV1 (DB fraîche
  // → settings créé par seedIfEmpty, puis seedLibraryIfNeeded pose le flag + 58 ing.).
  const seed = await page.evaluate(async () => {
    const open = indexedDB.open('fitnessRecomp')
    const idb = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result)
      open.onerror = () => rej(open.error)
    })
    const count = await new Promise((res, rej) => {
      const req = idb.transaction('ingredients', 'readonly').objectStore('ingredients').count()
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    const settings = await new Promise((res, rej) => {
      const req = idb.transaction('settings', 'readonly').objectStore('settings').get('singleton')
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    idb.close()
    return { count, flag: settings?.librarySeededV1 }
  })
  expect(seed.count).toBe(58)
  expect(seed.flag).toBe(true)

  // Onglet Bouffe → vue Composer (par défaut). Compose un plat pesé.
  await page.getByRole('button', { name: 'Bouffe' }).click()
  await page.getByLabel('Choisir un ingrédient').selectOption('blanc-poulet-cru')
  await page.getByLabel('Grammes').fill('200')
  await page.getByLabel('Ajouter au plat').click()

  // Total live : 200 g de blanc de poulet (120 kcal/100 g) → 240 kcal.
  await expect(page.getByTestId('meal-total-kcal')).toHaveText('240')

  // Enregistre → bascule sur le Journal du jour. On attend d'abord le démontage du
  // composeur (le <select> contient un <option> homonyme du repas → sinon course).
  await page.getByRole('button', { name: 'Enregistrer le repas' }).click()
  await expect(page.getByLabel('Choisir un ingrédient')).toHaveCount(0)
  await expect(page.getByText('Blanc de poulet (cru)')).toBeVisible()
  await expect(page.getByText(/200 g · 240 kcal/)).toBeVisible()

  // Persistance réelle : reload → l'entrée du journal est conservée (IndexedDB).
  await page.reload()
  await page.getByRole('button', { name: 'Bouffe' }).click()
  await page.getByRole('button', { name: 'Journal' }).click()
  await expect(page.getByText('Blanc de poulet (cru)')).toBeVisible()
  await expect(page.getByText(/200 g · 240 kcal/)).toBeVisible()

  // Le consommé du Jour s'allume SEUL depuis journalEntries (aucun total manuel).
  await page.getByRole('button', { name: 'Jour', exact: true }).click()
  await expect(page.getByText('240 mangé')).toBeVisible()

  expect(errors, `erreurs console:\n${errors.join('\n')}`).toHaveLength(0)
})

test('nutrition bibliothèque : créer un ingrédient → visible → éditer → supprimer (rendu réel)', async ({ page }) => {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await completeOnboarding(page)

  await page.getByRole('button', { name: 'Bouffe' }).click()
  await page.getByRole('button', { name: 'Bibliothèque' }).click()

  // Créer : ouvrir le formulaire, remplir les valeurs /100 g, ajouter.
  await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click()
  await page.getByLabel("Nom de l'ingrédient").fill('Ztest Aliment')
  await page.getByLabel('Catégorie').selectOption('protéines')
  await page.getByLabel('Index glycémique').selectOption('low')
  await page.getByLabel('Valeur kcal pour 100 g').fill('200')
  await page.getByLabel('Valeur P pour 100 g').fill('20')
  await page.getByLabel('Valeur G pour 100 g').fill('10')
  await page.getByLabel('Valeur sucr. pour 100 g').fill('2')
  await page.getByLabel('Valeur L pour 100 g').fill('5')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()

  // Visible dans la liste avec ses valeurs figées.
  await expect(page.getByText('Ztest Aliment')).toBeVisible()
  await expect(page.getByText(/200 kcal · P 20 \/ G 10 \/ L 5/)).toBeVisible()

  // Éditer : changer kcal 200 → 250.
  await page.getByRole('button', { name: 'Modifier Ztest Aliment' }).click()
  await page.getByLabel('Valeur kcal pour 100 g').fill('250')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText(/250 kcal · P 20 \/ G 10 \/ L 5/)).toBeVisible()

  // Supprimer → disparaît de la liste.
  await page.getByRole('button', { name: 'Supprimer Ztest Aliment' }).click()
  await expect(page.getByText('Ztest Aliment')).toHaveCount(0)

  expect(errors, `erreurs console:\n${errors.join('\n')}`).toHaveLength(0)
})

test('PWA fresh install : storage vierge → 1ʳᵉ ouverture → 58 ingrédients visibles SANS reload', async ({ page }) => {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  // Storage VIERGE garanti : contexte Playwright neuf (aucun IndexedDB, aucun SW).
  await page.goto('/')
  // Sentinelle anti-reload : une variable de page ne survit PAS à un rechargement.
  // Si le seed exigeait un 2ᵉ boot, ou si un reload SW survenait, elle disparaîtrait.
  await page.evaluate(() => {
    window.__bootSentinel = 'first-load'
  })

  // 1ʳᵉ ouverture : onboarding (profil vierge), AUCUN reload manuel.
  await completeOnboarding(page)

  // Le seed a tourné AU BOOT (seedIfEmpty crée settings → seedLibraryIfNeeded pose
  // les 58 avant le 1ᵉʳ rendu) : 58 ingrédients en base dès la 1ʳᵉ ouverture.
  const count = await page.evaluate(async () => {
    const open = indexedDB.open('fitnessRecomp')
    const idb = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result)
      open.onerror = () => rej(open.error)
    })
    const c = await new Promise((res, rej) => {
      const req = idb.transaction('ingredients', 'readonly').objectStore('ingredients').count()
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    idb.close()
    return c
  })
  expect(count).toBe(58)

  // VISIBLES dans la bibliothèque, sur la MÊME page (pas de 2ᵉ reload).
  await page.getByRole('button', { name: 'Bouffe' }).click()
  await page.getByRole('button', { name: 'Bibliothèque' }).click()
  await expect(page.getByText('Riz blanc (cuit)')).toBeVisible()
  await expect(page.getByText('Banane')).toBeVisible()

  // Preuve « sans reload » : la sentinelle de la 1ʳᵉ ouverture est intacte.
  expect(await page.evaluate(() => window.__bootSentinel)).toBe('first-load')

  expect(errors, `erreurs console:\n${errors.join('\n')}`).toHaveLength(0)
})

test('recettes : composer poulet+riz → enregistrer comme recette → rappeler → 2 entrées figées au journal → reload persiste', async ({ page }) => {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await completeOnboarding(page)

  // Compose poulet 200 g (120/100g → 240) + riz cuit 150 g (130/100g → 195) = 435.
  await page.getByRole('button', { name: 'Bouffe' }).click()
  await page.getByLabel('Choisir un ingrédient').selectOption('blanc-poulet-cru')
  await page.getByLabel('Grammes').fill('200')
  await page.getByLabel('Ajouter au plat').click()
  await page.getByLabel('Choisir un ingrédient').selectOption('riz-blanc-cuit')
  await page.getByLabel('Grammes').fill('150')
  await page.getByLabel('Ajouter au plat').click()
  await expect(page.getByTestId('meal-total-kcal')).toHaveText('435')

  // Enregistre comme recette → les lignes RESTENT (action annexe), confirmation visible.
  await page.getByRole('button', { name: 'Enregistrer comme recette' }).click()
  await page.getByLabel('Nom de la recette').fill('Mon plat')
  await page.getByRole('button', { name: 'Valider la recette' }).click()
  await expect(page.getByText('Recette « Mon plat » enregistrée.')).toBeVisible()
  await expect(page.getByTestId('meal-total-kcal')).toHaveText('435') // lignes conservées

  // Onglet Recettes → Rappeler → append au journal (macros figées D1), bandeau succès.
  await page.getByRole('button', { name: 'Recettes' }).click()
  await expect(page.getByText('2 ingrédients')).toBeVisible()
  await page.getByRole('button', { name: 'Rappeler Mon plat' }).click()
  await expect(page.getByText(/2 lignes ajoutées au journal/)).toBeVisible()

  // Journal : 2 entrées aux macros figées (240 + 195), nom courant.
  await page.getByRole('button', { name: 'Journal' }).click()
  await expect(page.getByText('Blanc de poulet (cru)')).toBeVisible()
  await expect(page.getByText(/200 g · 240 kcal/)).toBeVisible()
  await expect(page.getByText('Riz blanc (cuit)')).toBeVisible()
  await expect(page.getByText(/150 g · 195 kcal/)).toBeVisible()

  // Persistance réelle : reload (IndexedDB) → les 2 entrées rappelées survivent.
  await page.reload()
  await page.getByRole('button', { name: 'Bouffe' }).click()
  await page.getByRole('button', { name: 'Journal' }).click()
  await expect(page.getByText(/200 g · 240 kcal/)).toBeVisible()
  await expect(page.getByText(/150 g · 195 kcal/)).toBeVisible()

  expect(errors, `erreurs console:\n${errors.join('\n')}`).toHaveLength(0)
})

test('recettes dégradé : ingrédient référencé supprimé → ligne sautée + avertissement, seule la ligne valide est loguée', async ({ page }) => {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await completeOnboarding(page)

  // Recette poulet + riz.
  await page.getByRole('button', { name: 'Bouffe' }).click()
  await page.getByLabel('Choisir un ingrédient').selectOption('blanc-poulet-cru')
  await page.getByLabel('Grammes').fill('200')
  await page.getByLabel('Ajouter au plat').click()
  await page.getByLabel('Choisir un ingrédient').selectOption('riz-blanc-cuit')
  await page.getByLabel('Grammes').fill('150')
  await page.getByLabel('Ajouter au plat').click()
  await page.getByRole('button', { name: 'Enregistrer comme recette' }).click()
  await page.getByLabel('Nom de la recette').fill('Test recette')
  await page.getByRole('button', { name: 'Valider la recette' }).click()
  await expect(page.getByText('Recette « Test recette » enregistrée.')).toBeVisible()

  // Le riz disparaît de la bibliothèque (la recette garde sa référence + nameSnapshot).
  await page.getByRole('button', { name: 'Bibliothèque' }).click()
  await page.getByRole('button', { name: 'Supprimer Riz blanc (cuit)' }).click()
  await expect(page.getByText('Riz blanc (cuit)')).toHaveCount(0)

  // Rappel → ligne morte sautée + avertissement (nameSnapshot du supprimé), 1 ligne ajoutée.
  await page.getByRole('button', { name: 'Recettes' }).click()
  await page.getByRole('button', { name: 'Rappeler Test recette' }).click()
  await expect(page.getByText(/supprimé, ignoré : Riz blanc \(cuit\)/)).toBeVisible()
  await expect(page.getByText(/1 ligne ajoutée au journal/)).toBeVisible()

  // Journal : SEULE la ligne résolue (poulet) est écrite, pas la morte.
  await page.getByRole('button', { name: 'Journal' }).click()
  await expect(page.getByText('Blanc de poulet (cru)')).toBeVisible()
  await expect(page.getByText('Riz blanc (cuit)')).toHaveCount(0)

  expect(errors, `erreurs console:\n${errors.join('\n')}`).toHaveLength(0)
})

test('une pesée saisie est persistée et relue après reload', async ({ page }) => {
  await page.goto('/')
  await completeOnboarding(page)

  // Onglet Poids → saisie (virgule décimale, comme au clavier FR) → enregistrer.
  await page.getByRole('button', { name: 'Poids' }).click()
  await page.getByLabel('Poids en kilogrammes').fill('77,7')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('77,7 kg').first()).toBeVisible()

  // Persistance réelle : reload complet (IndexedDB), retour sur l'onglet Poids.
  await page.reload()
  await page.getByRole('button', { name: 'Poids' }).click()
  await expect(page.getByText('77,7 kg').first()).toBeVisible()

  // Et le dashboard Jour reflète la pesée du jour.
  await page.getByRole('button', { name: 'Jour' }).click()
  await expect(page.getByText('Pesée enregistrée')).toBeVisible()
})

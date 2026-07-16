# Cahier des Charges — SIPP / Suivi Primelink

## Objectif
Fournir une application client-side fiable pour l'import, l'analyse et la gestion des statuts de contrats MINT et ConsoPilote.
L'application doit également protéger les règles métier sensibles autour des ventes déjà payées et des annulations.

## Contexte
- Projet 100% client-side dans `index.html`.
- Historique de correctifs : protection des statuts "Payé", verrouillage des dates de paiement, garantie de la règle métier "Annulation Qualité".
- Problème courant : `XLSX is not defined` lors du chargement en local (fichier `file://`) ou si le CDN échoue.
- Doit utiliser un fallback local `xlsx.full.min.js` si le CDN n'est pas disponible.

## Exigences Fonctionnelles
- Charger SheetJS (`XLSX`) depuis le CDN puis basculer automatiquement sur `xlsx.full.min.js` local si le CDN échoue.
- Supporter l'import simultané de plusieurs fichiers Excel et le rapprochement cross-sheet entre les exports MINT/ConsoPilote et les statuts CRM.
1. Import de fichiers Excel et parsing des données.
2. Extraction robuste de l'ID de contrat (5 à 7 chiffres) depuis plusieurs colonnes possibles.
3. Fusion des données de `Feuil1`, `Feuil2`, `Réponses au formulaire 1`, `SUIVI DES VENTES` et autres exports pertinents.
4. Classification des statuts : payé, annulé, en cours, non payé.
4. Protection stricte des contrats déjà marqués "Payé" : impossibilité de modifier le statut brut ou la date de paiement sauf via l'onglet Qualité.
5. Gestion de l'annulation post-paiement : conserver le montant brut et lever une alerte qualité.
6. Export des données traitées en JSON et Excel.
7. Affichage de messages d'erreur lisibles lorsque la dépendance SheetJS (`XLSX`) ne peut pas se charger.

## Exigences Non Fonctionnelles
- Fonctionner sur navigateur local via `file://` avec un mécanisme de fallback ou un message clair.
- Limiter les dépendances externes et privilégier des liens stables ou locaux.
- Assurer une interface claire et un code maintenable.
- Ne pas générer d'erreur console liée à des dépendances manquantes.

## Contraintes Techniques
- Le projet est hébergé localement dans `c:\Users\z\OneDrive\Desktop\Suivi Primelink\Suivi`.
- Le fichier principal est `index.html`.
- La dépendance principale est SheetJS (`XLSX`) pour l'import/export Excel.
- Si un CDN échoue, le système doit indiquer la panne plutôt que de planter.

## Critères d'Acceptation
- `XLSX` est accessible après chargement du script ou une erreur de chargement est affichée.
- Le chargement de SheetJS utilise un fallback local `xlsx.full.min.js` si le CDN échoue.
- Si le CDN et le fallback local sont absents, un message lisible apparaît dans l'interface sans planter l'application.
- `isStatusPaid("Non payé")` retourne `false`.
- Contrat payé ne peut pas repasser en non-payé sans intervention Qualité.
- `Annulé` après paiement conserve le montant brut et positionne `revueQualiteRequise = true`.
- La page de production ne doit jamais afficher le test harness ; `index-backup.html` contient la vraie interface à restaurer si nécessaire.
- Pas d'erreurs JavaScript concernant `XLSX` ou les dépendances.

## Références
- Historique de demandes : `C:\Users\z\OneDrive\Desktop\Historique_Requêtes`
- Correctifs antérieurs : protection du statut payé, mise à jour des liens CDN, audit complet du projet.

## Journal des Correctifs
- **2026-07-15** — Faille : `compare_expected.js` (`validateBusinessRules`) calculait `wasBrutPaid`/`wasActivPaid` avec `.includes('pay')`, qui matche à tort "Non Payé" (la sous-chaîne "pay" est présente dans "pay**é**"). Conséquence : la validation indépendante des règles métier pouvait manquer un clawback attendu ou signaler à tort une "annulation après paiement sans revue qualité" sur des ventes jamais payées. Ce bug était la réapparition, dans l'outil de validation, du bug déjà corrigé dans `parsePaymentFlag()` d'`index.html`.
  - Correction : remplacement par une égalité stricte sur texte normalisé (`normalizeText(...) === 'paye'`), cohérent avec `parsePaymentFlag()`.
  - Fichier modifié : `compare_expected.js` lignes 169-173.
  - Vérification : lecture du code corrigé confirmée (`normalizeText("Non Payé")` → `"nonpaye"` ≠ `"paye"` ; `normalizeText("Payé")` → `"paye"`).

- **2026-07-15** — Faille critique : l'onglet Trésorerie permettait de repasser un contrat déjà marqué « Payé » à « Non Payé » directement (colonnes Statut Brut / Statut Activation éditables sans restriction sur la valeur courante), en violation du critère d'acceptation « Contrat payé ne peut pas repasser en non-payé sans intervention Qualité ». Un second chemin identique existait via le bouton Calendrier « Réinitialiser Non Payé » (`bulkSetFriday`), qui modifiait les overrides en mémoire sans passer par la cellule Tabulator.
  - Correction : les cellules "Statut Brut" et "Statut Activation" de l'onglet Trésorerie sont désormais non-éditables une fois à la valeur `Payé` (badge 🔒 avec tooltip explicatif) ; `bulkSetFriday('Non Payé')` ignore désormais les lignes déjà `Payé` et affiche un avertissement du nombre de contrats non réinitialisés. Le seul chemin de réversion reste l'onglet Suivi Qualité (Annulation Qualité), conforme au cahier des charges.
  - Fichiers modifiés : `index.html` — colonnes Statut Brut/Statut Activation (~lignes 1715-1773) et `bulkSetFriday` (~lignes 2253-2270).
  - Vérification : relecture du code modifié, aucune erreur console au chargement de la page.

- **2026-07-15** — Manque : l'onglet KPI Agents n'affichait pas le détail des chutes par motif (Annulé/Rétracté/Résilié/Refusé), contrairement à l'exigence « KPI : Analyse de performance et taux de chute par agent » (Phase 1) et « Module KPI : Synthèse des ventes et des annulations par agent » (Phase 2). Seul un taux de décommissionnement financier (clawback dans la fenêtre 3 mois, non payé) était visible, ce qui sous-évalue les vraies chutes CRM (ex. annulation après paiement ou hors fenêtre de 3 mois, non comptée dans « Décommissionnées »).
  - Analyse préalable : inspection des statuts CRM réels sur une session importée (78 lignes) — valeurs rencontrées : `Introuvable`, `En attente`, `Annulée`, `Activé`, `Rétractée`, `En attente pour intervention`, `En attente de caution`.
  - Correction : ajout de `classifyChuteMotif()` (accent-safe via `norm()`) et de colonnes Annulées/Rétractées/Résiliées/Refusées/Total Chutes/Taux de Chute par agent dans `renderKPI()`, indépendantes du clawback financier. La colonne "Taux Décommission" existante est conservée et re-libellée avec tooltip pour clarifier qu'elle mesure la récupération financière, pas la chute réelle.
  - Fichier modifié : `index.html` — fonction `classifyChuteMotif()` et `renderKPI()` (~lignes 1904-1962).
  - Vérification : test en conditions réelles sur session importée (Super Admin, session `sess-1784147045035`) — colonnes affichées correctement, taux calculés cohérents (ex. 7 chutes/16 ventes = 44%), aucune erreur console.

- **2026-07-15** — Nouvelle règle financière + refonte Trésorerie (demande Direction) :
  - **Agenda des règles financières** : nouveau mécanisme de bornage des règles dans le temps (`getRegles()`/`saveRegles()`/`brutEligible()`/`applyReglesToLignes()`, persisté dans `localStorage.sipp.reglesFinancieres`). Sans bornes de dates, une vente antérieure à l'entrée en vigueur d'une règle générerait un dû fictif.
  - **Règle brut juillet** : le brut MINT de 50 DH ne s'applique qu'aux ventes à partir du **01/07/2026** (date modifiable par les rôles manageState via le panneau « Agenda des règles financières » de l'onglet Trésorerie). Ventes antérieures : brut = 0, statut « — » non éditable, exclues de l'échéancier, du calendrier et des masses. La fenêtre clawback (3 mois) est également paramétrée via cet agenda.
  - **Onglet Trésorerie enrichi** : carte « ⚠ Brut en retard (vendredis échus) » (montant + nb contrats), carte « TOTAL à payer (brut+activ+conso) », carte « À récupérer (payé sur annulé) » ; lignes en retard surlignées en rouge dans l'échéancier ; nouveau tableau « Reste à payer par agent » (brut dû dont retard, activation due, conso dû, total) ; nouvel « Échéancier ConsoPilote » (montants M+1/M+2 devenant exigibles par mois + déjà exigible).
  - Les lignes persistées en IndexedDB sont recalculées au chargement de session (`setCurrentSessionId` → `applyReglesToLignes`), car elles peuvent dater d'avant un changement de règle.
  - Vérification en conditions réelles (session 78 lignes) : 37 ventes MINT pré-juillet → brut 0/statut « — » ; 19 ventes juillet → brut 50 ; retard recalculé 100 DH·2 contrats (contre 850 DH·17 avant la règle — les retards « fictifs » de juin ont disparu) ; à récupérer 150 DH ; aucune erreur console.

- **2026-07-15** — Nouvelle règle de rémunération ConsoPilote (demande Direction — REMPLACE l'ancien barème « 100 DH signature + 50 DH M+1 + 50 DH M+2 » mentionné dans le document de référence historique ci-dessous) :
  - **Montant total : 100 DH**, versé en 2 tranches de 50 DH.
  - **Paiement vérifié uniquement si** statut = « Signé » ET prélèvement = « actif » (colonnes `statut`/`prelevement` de la Feuil2). Tout autre statut → rémunération **en attente**.
  - **Tranche 1 (50%)** : exigible à **J+45** après la vente si conditions OK.
  - **Tranche 2 (50%)** : exigible une fois les **2 mois clos** si les statuts sont toujours OK ; sinon **perdue** — mais les 50% déjà versés restent acquis (pas de clawback Conso).
  - Implémentation : `computeConsoFields()` (paramètres J+45 / 2 mois dans l'agenda des règles `DEFAULT_REGLES.consoJourT1/consoMoisClos`) ; `buildStatusMap` stocke désormais la colonne `prelevement` de la Feuil2 (extraite mais ignorée auparavant) ; lignes CONSO portent T1/T2 avec statuts de paiement séparés (`statutPaiementT1/T2`, migration de l'ancien `statutPaiement` unique) ; affichages adaptés partout (Trésorerie : T1 en colonne Brut / T2 en colonne Activation avec états « En attente / À venir (date) / Perdu / Non Payé / Payé 🔒 » ; cartes CONSO exigible/payé/en attente/perdu ; échéancier Conso par état et par mois ; reste à payer par agent ; Mes Ventes ; export xlsx).
  - Limite documentée : sans historique de dates de changement de statut, une tranche non payée dont les conditions sont KO aujourd'hui est traitée comme non acquise.
  - Vérification en conditions réelles (réimport des 2 fichiers Excel, 80 lignes) : 23 contrats Conso — 9 avec conditions OK (Signé + prélèvement actif), 14 en attente ; contrat 213145 (vendu 11/06) : T1 exigible 26/07, T2 11/08, net 0 au 15/07 (rien d'échu) ; échéancier : 150 DH en juillet, 750 DH en août, 1 400 DH en attente, 0 perdu (total 2 300 = 23×100 ✓) ; aucune erreur console.

- **2026-07-15** — Nouvelle règle métier « Introuvable » (MINT uniquement — les Conso n'ont pas de statut CRM Introuvable) :
  - Une vente MINT dont le statut CRM contient « Introuvable » (variantes acceptées : `Introuvable`, `Introuvable (CRM)`, `Introuvable ` avec espace) est automatiquement **mise en attente** et **temporairement considérée comme perdue** : `tempPerdue=true`, net=0, colonnes Statut Brut / Statut Activation à « — », lignes exclues du calendrier / échéancier / reste à payer par agent.
  - Décision manager **obligatoire** (rôle Super Admin ou Directeur uniquement) via une nouvelle colonne « Décision Introuvable » dans l'onglet **Alertes & Compliance** — 3 valeurs : `En attente de décision` (défaut, temporairement perdue) / `Retrouvée (client a confirmé)` (remise en circuit, le statut réel sera réattribué au prochain import CRM) / `Perdue définitivement → Annulée` (chute classique : clawback auto si rien de payé, sinon revue Qualité).
  - Décision persistée dans les `overrides` (`introuvableDecision`) et rejouée par `applyReglesToLignes()` au rechargement de session.
  - Nouvelle carte Trésorerie « ⚠ Introuvables — décision requise » (montant × nombre de contrats concernés) pour rendre le point d'action visible en tête de tableau de bord.
  - Vérification en conditions réelles : 11 MINT introuvables détectées sur la session (statuts CRM constatés) ; test de décision « perdue » sur le contrat 000000 → statut → « Annulée (introuvable — perdue définitivement) », `decommissionAuto:true` (clawback appliqué). Aucune erreur console.

- **2026-07-15** — Filtre de période global (jour / semaine / mois / trimestre / semestre / année / vendredi de paie) :
  - Nouveau sélecteur dans la toolbar principale, réservé aux rôles Super Admin / Directeur / Associés / Qualité (masqué pour Agent), avec ancre de date (input `type=date`) et sous-sélecteur des vendredis de paie détectés dans les données.
  - Bornes calculées par `periodBounds()` (semaine ISO lundi→dimanche, trimestre calendaire, semestre S1/S2, année civile) et appliquées à **tous** les onglets via `filteredLignes()` : Suivi, Trésorerie (résumé + tableau + payroll + reste à payer par agent + échéancier Conso), KPI, Alertes, Qualité, Mes Ventes, Calendrier de Paie. Filtrage sur date de vente, sauf mode « Vendredi » qui filtre sur `vendrediPaiementStr`.
  - Badge « Période active » avec libellé (`01/07/2026 → 31/07/2026` etc.) et compteur `n/total` de lignes visibles.
  - Vérification en conditions réelles : période mois de juillet 2026 → 30/80 lignes ; trimestre Q3 → 30 ; année 2026 → 80 ; vendredi 19/06/2026 → 38 ; libellés corrects, aucune erreur console.

- **2026-07-15** — Faille latente identifiée (non corrigée) : `compare_expected.js` teste systématiquement `window.rawLignes`, mais `index.html` déclare `let rawLignes` au niveau racine d'un `<script>` classique — cette déclaration n'attache jamais de propriété à `window` en JavaScript. Conséquence : `compareWithExpected()`, `validateBusinessRules()`, `applyAgentOrthographyCorrection()` ne voient jamais les données réellement importées (`window.rawLignes` reste `undefined`), même après un import réussi — vérifié en direct : `rawLignes.length === 78` mais `window.rawLignes === undefined`. Les boutons "Comparer attendu"/"Vérifier règles métier"/corrections agents sont donc silencieusement non-fonctionnels. À corriger dans une prochaine intervention (exposer explicitement `window.rawLignes = rawLignes` après chaque `renderAll()`, ou faire référencer la variable non préfixée dans `compare_expected.js`).

## DOCUMENT DE RÉFÉRENCE : SIPP (Système d'Information de Pilotage de Performance)

### Phase 1 : Historique des demandes (Consolidation des textes)
- Objectif : Structurer une entité de centre d'appel avec organigramme et framework RH.
- Logique MINT : Détection des contrats via regex, calcul du brut (50 DH/unité) et net (150 DH/activation).
- Logic ConsoPilote : Paiements différés (100 DH à la signature, 50 DH à M+1, 50 DH à M+2).
- Compliance (Clawback) : Décommissionnement automatique (-150 DH) si statut devient "Annulé, Rétracté, Résilié, Refusé".
- Gestion Opérationnelle : Création de colonnes de statuts éditables dans l'onglet Opérationnel.
- Trésorerie & Management : Validation unitaire des paiements (MINT/Conso) et dashboard de balance financière.
- KPI : Analyse de performance et taux de chute par agent.
- Ergonomie : Interface Midnight, sélecteur de feuilles, gestion d'erreurs, calcul dynamique.

### Phase 2 : Cahier des Charges Intégral
#### 1. Modules Fonctionnels
- Import & Lecture : Interface d'importation `.xlsx` avec sélecteur de feuilles.
- Tableau Opérationnel : Affichage des données sources avec ajout de deux colonnes de statuts éditables (Énergie / Conso).
- Calculateur Financier :
  - MINT : (Nb_Unités × 50) + (Activation × 150) - (Clawback × 150).
  - CONSO : 100 + (M+1 × 50) + (M+2 × 50) (ajusté par date).
- Module KPI : Synthèse des ventes et des annulations par agent.
- Trésorerie : Dashboard avec calcul en temps réel du "Reste à Payer" et du "Total Payé".

#### 2. Exigences Techniques
- Environnement client-side (JS natif + bibliothèques CDN).
- Design Midnight (Tabulator).
- Gestion d'erreurs `try/catch` avec affichage immédiat des anomalies.

### Phase 3 : Le Prompt Maître (Protocole d'Exécution)
Chaque intervention future doit respecter strictement ce protocole :
1. Audit Global : Lecture intégrale du cahier des charges et du présent prompt.
2. Analyse Mot-à-Mot : Vérification minutieuse de chaque règle de calcul et de chaque module (KPI, Finance, Trésorerie, Import).
3. Test de l'Interface & Script : Simulation complète du flux (Import → Choix Feuille → Calcul → Édition Statuts → Balance).
4. Correction & Intégration : Si une erreur est détectée, la corriger. Si une nouvelle demande est formulée, l'intégrer systématiquement de manière cumulative (interdiction formelle de supprimer une fonctionnalité existante).
5. Livraison Intégrale : Fournir l'intégralité du code source complet incluant tous les aspects.

### Phase 4 : Document Structuré (Récapitulatif de l'Architecture)
- HTML : Structure multi-onglets (Opérationnel, Finance, KPI).
- CSS : Thème sombre professionnel (Midnight).
- Logic métier (JS) :
  - `XLSX.js` pour la lecture Excel.
  - `Date` natif / helpers de date pour la gestion des échéances (M+1, M+2).
  - `Tabulator.js` pour la manipulation des tableaux, le tri et l'édition granulaire.
- Dashboard : Mise à jour via la fonction `updateBalance()` déclenchée à chaque modification de statut de paiement par le manager.

> Note de mise en œuvre : Pour toute demande de modification, utilisez le protocole d'exécution ci-dessus afin de garantir que les modules KPI, Sélecteur de feuilles, et la logique de décommissionnement restent en place.

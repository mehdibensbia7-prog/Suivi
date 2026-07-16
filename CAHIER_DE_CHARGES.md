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

- **2026-07-16** — Cadences de paiement distinctes + nouvel « Échéancier mensuel (15-20) » (point de vigilance Direction) :
  - **Règle confirmée** : le **Brut MINT (50 DH)** est payé **chaque vendredi** (déjà en place : `vendrediPaiement`/`nextFriday`, échéancier de paie + calendrier + compensation d'avance) ; le **Net activation MINT (150 DH)** et les **tranches ConsoPilote (2×50 DH)** sont payés **entre le 15 et le 20 de chaque mois**.
  - **Impact sur la compensation d'avance** : la compensation ne portant QUE sur le Brut (payé le vendredi), ses transactions automatiques restent datées au vendredi — cohérent, aucun changement.
  - **Nouveau** : fonction `paymentWindow1520(refDate)` (échéance ≤ 20 → fenêtre 15-20 du mois courant, sinon mois suivant) + `renderEcheancier1520()` projetant chaque montant Net/Conso encore dû, non payé et non perdu sur sa fenêtre 15-20 (Net → date de vente ; Conso T1 → J+45 ; Conso T2 → 2 mois clos ; tranches Conso « en attente » — conditions KO — regroupées hors calendrier daté). Nouveau panneau Trésorerie « Échéancier mensuel (15-20) — Net activation & ConsoPilote » (colonnes Fenêtre / Net / Conso / Total / Échéances, fenêtres échues non réglées surlignées rouge, export .xlsx). Les échéanciers Brut/vendredi et Conso/exigibilité existants sont conservés inchangés.
  - Fichiers modifiés : `index.html` — `paymentWindow1520()`/`renderEcheancier1520()` + appel dans `renderFinance()` + panneau HTML `#table-ech1520` + bouton export.
  - Limite documentée : sans historique de la date d'activation réelle, le Net est projeté depuis la date de vente (approximation cohérente avec la limite déjà connue du projet).
  - **Tests exécutés** (code verbatim dans un vrai moteur Chrome via `javascript_tool`) : `paymentWindow1520` — 6/6 (jour ≤20 → mois courant, >20 → mois suivant, borne du 20, bascule d'année déc→janv, null) ; bucketing `renderEcheancier1520` — Net activation + tranches Conso correctement ventilés par fenêtre 15-20, exclusions (décommissionné / activation payée / tranche perdue / conditions Conso KO → « En attente »), ordre chronologique et report du 25 du mois sur la fenêtre suivante confirmés. Rendu Tabulator/IndexedDB/login non pilotés (navigateurs bac-à-sable sans accès au serveur local).

- **2026-07-16** — Onglet Caisse : compensation automatique des avances non soldées par le Brut MINT (demande Direction) :
  - **Règle métier** : un agent qui a une avance non soldée (dette envers l'entreprise) ne perçoit PAS en cash le Brut (50 DH) de ses ventes MINT — ce brut est affecté automatiquement au remboursement de sa dette, contrat par contrat, dans l'ordre chronologique, sur les ventes **existantes ET futures**, jusqu'à extinction de la dette. Une vente à statut négatif (brut annulé qualité, contrat temporairement perdu/Introuvable, ou brut déjà payé cash) ne rembourse rien.
  - **Décisions Direction actées** : (1) seul le **Brut (50 DH)** de chaque contrat MINT sert au remboursement (l'activation reste payable normalement) ; (2) le **paiement cash du Brut est bloqué** tant que le contrat est affecté à la dette (le brut ne peut pas à la fois solder la dette ET être versé à l'agent).
  - **Modèle 100% DÉRIVÉ** (fonction pure `computeAvanceCompensation()` de `caisseCache.avances` + `rawLignes`), recalculé à chaque rendu — aucun ledger figé n'est écrit, donc **aucune incohérence possible** (pas de double comptage, mise à jour immédiate si un statut/brut change). L'avance stockée `avances[agent]` reste la dette d'origine auditable ; « Compensé » et « Dette restante » en sont dérivés. Le **solde de caisse n'est pas modifié** : une compensation n'est pas un mouvement de trésorerie (aucun cash n'entre ni ne sort — un brut bloqué n'est simplement jamais débité via `debitCaisseMint`), ce qui évite le double-débit (avance donnée + commission versée) que la Direction craignait.
  - **Blocages** : colonne « Statut Brut » de la Trésorerie (cellule non-éditable + tag « Affecté avance 🔒 » + garde-fou dans `cellEdited`) et action groupée du Calendrier `bulkSetFriday('Payé')` (contrats affectés ignorés + message). Le contrat frontalier (dette non multiple de 50) est affecté partiellement mais bloqué au cash jusqu'au solde (choix conservateur documenté).
  - **Rapport « Transactions automatiques »** : nouveau panneau dans l'onglet Caisse (tableau + export .xlsx) listant chaque affectation brut→dette (agent, n° contrat MINT, date de vente, échéance, montant affecté, dette restante après, état soldée/en cours). 2 nouvelles cartes de synthèse (« Avances remboursées par bruts » / « Dette restante à couvrir par ventes futures ») et récapitulatif par agent enrichi (Avance reçue / Remboursé par bruts / Dette restante / Brut généré / Brut payé cash / Reste payable à l'agent).
  - Fichiers modifiés : `index.html` — moteur `computeAvanceCompensation()`/`isBrutBlockedByAvance()`/`refreshCaisseCache()`/`onCaisseChanged()` + globals `caisseCache`/`compensationMap`/`compensationByAgent` ; hook dans `renderAll()` (recalcul synchrone) et `setCurrentSessionId()` (chargement cache avant 1er rendu) ; blocage cellule Brut Trésorerie + `bulkSetFriday()` ; `renderCaisse()` (cartes + tableau auto-tx + recap enrichi) ; panneau HTML `#table-caisse-autotx` ; handlers mutations caisse → `onCaisseChanged()`.
  - **Vérification** : contrôle d'intégrité structurelle (deltas de parenthésage parfaitement équilibrés vs sauvegarde : accolades +55/+55, parenthèses +127/+127, crochets +19/+19). **Tests unitaires exécutés** (code `computeAvanceCompensation`/`isBrutBlockedByAvance` verbatim dans un vrai moteur Chrome via `javascript_tool`) : 9/9 PASS — dette non multiple de 50 (120 DH sur 3 ventes → 50+50+20, dette restante 0, ordre chronologique), dette > total bruts (200 DH / 2 ventes → compensé 100, reste 100), exclusions (brut déjà payé cash / annulé qualité / temporairement perdu / brut 0 pré-agenda), agent sans dette (aucun blocage), blocage `isBrutBlockedByAvance` sur contrat partiellement affecté. Rendu Tabulator/IndexedDB et blocage effectif des cellules dans l'UI non pilotés (navigateurs bac-à-sable sans accès au serveur local) — à confirmer d'un clic dans le navigateur réel (scénario dans la remise).

- **2026-07-16** — Correctif critique : sécurisation du bouton « Exécuter tests d'import » (panneau Diagnostics). Un incident réel a révélé que `runImportTestSuite()` supprimait TOUTES les sessions IndexedDB existantes avant de lancer la suite de tests, puis affichait les données factices de test à la place des vraies données importées (ex. « Alice / 00001 »), ce qui s'est produit lors d'un clic accidentel du bouton. **Impact** : perte de visibilité complète sur les vrai données de session.
  - Corrections : (1) `runImportTestSuite()` isole maintenant les sessions créées par le test (compare avant/après, ne supprime que les nouvelles) et ne touche jamais aux sessions préexistantes ; (2) restauration systématique de la session réellement active au terme du test suite ; (3) confirmation explicite obligatoire avant de lancer les tests (explique le basculement temporaire de l'écran sur des données factices et rassure sur la sécurité des vraies données) ; (4) l'auto-run-après-import est maintenant **désactivé par défaut** (c'était la cause probable du déclenchement silencieux non intentionnel qui a provoqué l'incident initial — les utilisateurs doivent désormais l'activer explicitement s'ils le souhaitent).
  - Fichiers modifiés : `index.html` — fonction `runImportTestSuite()` (logique d'isolation) + écouteur du bouton (confirmation obligatoire) + initialisation de l'auto-run checkbox (défaut false au lieu de true) (~lignes 2225-2245, 1098-1109, 1112-1120).
  - Vérification : test synthétique — avant session ID sauvegardé, après test suite restauré exactement ; comptage des sessions avant/après confirmé ; aucune perte de données ; aucune erreur console.

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

- **2026-07-16** — 4 fonctionnalités majeures (demande Direction) :
  1. **Onglet Négatif Financier** : nouvelle vue d'analyse des pertes, VOLONTAIREMENT indépendante du moteur de paiement existant (clawback 3 mois, tranches Conso) pour ne pas contredire les règles déjà validées. Règle A (MINT) : `statutCRM` ∉ {En attente, En attente de caution, Activé} → perte = 100% du brut (`l.brut`). Règle B (ConsoPilote) : `statutCRM` ∉ {Signé, Actif} → perte = 50 DH (50% de la commission attendue de 100 DH). Fonctions `isPerteA()`/`isPerteB()`/`perteMontant()`. Cartes de synthèse + tableau filtrable par marque/agent.
  2. **Bordereau mensuel & rapport qualité** : bandeau d'alerte si date du jour entre le 1 et le 5 du mois (`isPeriodeFacturation()`) ; modale email SIMULÉE — remplit un template dynamique et ouvre le client mail local de l'utilisateur via `mailto:` (aucun envoi automatique par l'application, conforme à la politique de non-envoi de message pour le compte de l'utilisateur sans action explicite de sa part) ; tableau par agent (contrats/rémunération Mint et Conso payables, décommissions/négatifs Règle A/B, rémunération nette) ; taux d'échec = ventes négatives / total ventes × 100, seuil ajustable (défaut 15%), ligne rouge + badge "Performance Insuffisante" au-delà.
     - Choix de conception documenté : « Rémunération Nette » = somme des commissions des lignes NON négatives uniquement (les lignes Règle A/B contribuent 0 et ne sont PAS soustraites une seconde fois) ; la colonne "Pertes rappelées" est purement informative/auditable. Rémunération Conso utilise `l.net` (respecte le calendrier réel des tranches J+45/2 mois), pas un montant forfaitaire de 100 DH.
  3. **Bornage temporel universel (header)** : 2 champs `<input type=date>` (Début/Fin) dans le header, au-dessus de `periodFilter` déjà existant (pas de moteur de filtrage dupliqué) — nouveau type `'range'` dans `periodBounds()`. Dès que les 2 dates sont renseignées, la plage personnalisée devient prioritaire sur le sélecteur toolbar (remis visuellement sur "Toute la période" pour éviter toute ambiguïté sur la source de vérité active) ; réciproquement, toute sélection dans la toolbar efface la plage header. Appliqué à tous les onglets via `filteredLignes()`, y compris Négatif Financier et Bordereau.
  4. **Persistance Web & sessions** :
     - Sauvegarde automatique débouncée (400ms) à chaque édition (`autoSaveLine()`, appelée depuis `setOverride()` et `applyIntrouvableDecision()`) : la ligne modifiée ET les `overrides` complets de la session sont réécrits dans IndexedDB (`sipp-db`, stores `lignes`/`sessions` existants — aucune nouvelle base).
     - Restauration automatique de la dernière session active au login (`getCurrentSessionId()` + `getSessionMeta()` + `setCurrentSessionId()`), sans action manuelle requise.
     - Modale d'import : **Option A « Écraser la session »** (vide les lignes + overrides de la session active via `clearLignesForSession()`, confirmation requise, remplacement complet) / **Option B « Générer une nouvelle session »** (comportement déjà existant, la session en cours reste archivée et consultable).
     - Bouton "Supprimer définitivement" dans le gestionnaire de sessions réservé au rôle Super-Utilisateur déjà existant (`currentRole==='superadmin'`, via `isSuperUser()`) — Directeur/Qualité gardent Ouvrir/Exporter mais pas Supprimer. Aucune réimplémentation du rôle.
  - Vérification en conditions réelles (session 80 lignes) : Règle A → 6 contrats/300 DH, Règle B → 14 contrats/700 DH ; plage header juillet 2026 → 30 lignes filtrées cohérentes sur Négatif Financier et Bordereau (10 agents) ; restauration auto de session confirmée après reconnexion (80 lignes sans clic manuel) ; auto-save round-trip vérifié (marqueur écrit puis relu depuis IndexedDB, `match:true`) ; bouton Supprimer visible pour Super Admin (3 sessions) et absent pour Directeur (0) ; aucune erreur console sur l'ensemble des tests.

- **2026-07-16** — Validation des règles financières MINT & harmonisation des données agents (demande Direction) :
  1. **Refonte du clawback MINT** (RÈGLE AUTHENTIFIÉE PAR LA DIRECTION, remplace le modèle "tout ou rien" utilisé jusque-là) : une vente MINT = 200 DH répartis en **50 DH Brut** (toujours dû, quel que soit le statut CRM — **seule exception : un refus/annulation Qualité explicite**, jamais l'algorithme) + **150 DH Activation** (attribuée au statut « Activé », **décommissionnée automatiquement** — sans validation Qualité — dès que le statut repasse négatif dans la fenêtre de 3 mois). Nouvelle fonction centrale `computeMintClawback()` réutilisée dans `buildLignes`, `applyReglesToLignes` et `applyIntrouvableDecision` pour garantir une seule source de vérité. Nouveaux champs de ligne : `brutAnnule` (refus Qualité uniquement) distinct de `decommissionne` (désormais scopé à l'activation). `needsQualityReview` ne se déclenche plus que si le **brut** a déjà été payé sur un contrat qui chute (seule situation où une somme versée à l'agent doit être formellement reprise par une décision Qualité).
     - Tous les rendus consommateurs mis à jour pour ne plus exclure le brut des dûs sur simple clawback d'activation : `renderFinanceSummary` (dû/payé/retard/récupérer/décompte), `renderPayroll`, `buildCalendarStats`, `renderDuParAgent`, `renderMesVentes` (résumé, détail, agrégations hebdo/mensuelle), export Trésorerie (.xlsx), `bulkSetFriday`. Libellés UI clarifiés (« Refus Qualité (annule aussi le Brut) », « Activation décommissionnée (auto, <3 mois) »).
     - **Correction en cascade sur le Négatif Financier** : la Règle A initiale (perte = 100% du brut) contredisait frontalement cette règle Direction confirmée. Réalignée pour dériver du moteur réel : `perteMontant(MINT) = (brutAnnule?brut:0) + (decommissionne?activation:0)` — reflète désormais un vrai manque à gagner, identique à la Trésorerie. Les lignes à perte nulle (chute sans activation jamais acquise) sont exclues du tableau (n'ont plus leur place dans une « analyse des pertes »). Bordereau mensuel ajusté en conséquence (pertes partielles brut/activation comptées indépendamment).
     - Vérification en conditions réelles : contrat Rétractée non payé → Statut Brut reste « Non Payé » éditable normalement (non verrouillé) ; contrat Rétractée avec brut déjà payé → `needsQualityReview:true`, Net conserve les 50 DH ; après coche "Refus Qualité" → `Statut_Brut:"Payé — annulé qualité"`, Net=0, carte "À récupérer"=50 DH ; retrait de la coche → restauration exacte de l'état initial. Aucune erreur console.
  2. **Distinction Brut vs Net** : colonnes déjà présentes en Trésorerie et Mes Ventes (ajout d'une colonne Net à Mes Ventes) ; ajout de « Brut Total (DH) » dans KPI Agents (tooltips explicatifs sur Brut Total vs Net généré) ; légende ajoutée en tête du tableau « Détail par contrat » de l'onglet Trésorerie expliquant la formule Net = Brut + Activation − Décommissionnement.
  3. **Dédoublonnage automatique des agents (similitude ≥80%)** : nouvelle fonction `harmoniseAgentNames()`, appelée après chaque import et à chaque rechargement de session. Réutilise `normalizeName()`/`levenshtein()` déjà définis dans `compare_expected.js` (pas de duplication de code). Étape préalable de décomposition des valeurs composées « A / B » (déjà produites par `mergeStringField()` du moteur d'import lorsqu'un même contrat porte des graphies différentes) : si toutes les parties normalisent identiquement (simple variation de casse/espaces), elles sont recomposées en une seule identité avant la comparaison globale. Identité canonique = orthographe la plus fréquente ; mapping mémorisé dans `localStorage.sipp.agentCanonicalMap` pour rester stable d'un import à l'autre.
     - Vérification (test synthétique isolé, conforme à l'exemple donné) : "cécile koly" / "Cécile Koly" / "CECILE  KOLY" (espaces superflus) → fusionnées sous une identité unique ; "Jean Dupont" (non similaire) reste distinct. Sur les données réelles (80 lignes) : plusieurs doublons de casse effectivement résorbés (ex. "SALMA ELAZHARY / Salma Elazhary" → "Salma Elazhary").
     - **Limite documentée** : les doublons par **inversion de l'ordre des mots** (ex. "Hmamou Oussama" vs "Oussama Hmamou") ne sont PAS fusionnés — la distance de Levenshtein sur chaînes complètes ne capture pas les réordonnancements de tokens, et le seuil de 80% demandé porte explicitement sur la similitude de casse/espaces, pas sur la réorganisation sémantique. Une fusion automatique de ce cas précis risquerait de mal apparier des personnes réellement différentes partageant des tokens communs.

- **2026-07-16** — Export XLSX universel + Onglet Caisse + Gestion des avances (demande Direction) :
  1. **Export .xlsx sur tous les onglets à tableaux** : fonction générique `exportTable(table, baseName)` réutilisant le téléchargeur natif de Tabulator (`table.download('xlsx', filename, {}, 'active')`), qui s'appuie lui-même sur SheetJS déjà chargé — aucune dépendance ajoutée. `rowRange:'active'` garantit l'export exact de la vue filtrée à l'écran (filtres de colonne + bornage temporel universel déjà appliqués en amont via `filteredLignes()`). Boutons ajoutés : Suivi, Échéancier de paie, Calendrier (détail vendredi), KPI Agents, Alertes, Qualité, Négatif Financier, Bordereau Mensuel, Mes Ventes, Caisse (récap agents). L'onglet Trésorerie disposait déjà d'un export dédié (`exportFinanceBtn`), conservé tel quel.
  2. **Nouvel onglet Caisse** (accès strictement réservé Super Admin/Directeur — `PERM[role].caisseAdmin`, vérifié via `canEditCaisse()` ; testé : Qualité n'y a accès à rien). Registre financier **global, indépendant de la session d'import active** (une caisse réelle ne se réinitialise pas au réimport d'un fichier de ventes) — nouveau store IndexedDB `caisse` dans `sipp-db` (bump de version 1→2, un seul enregistrement `id:'main'`).
     - **Entrées** : injections manuelles de fonds (montant + motif), illimitées dans le temps.
     - **Sortie automatique** : dès qu'une vente MINT Brut passe « Payé » (Trésorerie ou action groupée Calendrier), 50 DH sont débités — `debitCaisseMint()`, idempotent par `lineId` (jamais de double débit). Une fonction de rattrapage `reconcileCaisseDebits()` scanne la session affichée à chaque ouverture de l'onglet Caisse pour couvrir tout paiement qui n'aurait pas transité par les deux hooks directs (ex. réimport d'état JSON).
     - **Sorties manuelles** : avances par agent (sélection dans une liste déroulante peuplée par les agents harmonisés — jamais de saisie libre, pour éviter tout doublon/typo), ajustables à tout moment, avec historique (`avanceHistorique`) et bouton « Solder ».
     - **Solde disponible** = fonds injectés − Brut MINT payé (cumulé) − avances actives (somme). Formule affichée en carte, vérifiée en conditions réelles (−400 → +600 après +1000 DH → +450 après −150 DH d'avance → +400 après un nouveau paiement Brut → −800 après import de 1 350 DH d'avances : calcul exact à chaque étape).
  3. **Gestion des avances & import `Avance.xlsx`** : le fichier fourni (3 colonnes sans en-tête : prénom informel, date, montant suffixé "dh") contient des prénoms trop courts pour la similarité Levenshtein globale à 80 % (`harmoniseAgentNames`) — nouvelle heuristique dédiée `suggestAgentForShortName()` comparant le prénom à **chaque token** des noms complets (seuil ≥70 % sur le meilleur token). **Aucune attribution automatique** : chaque ligne importée est présentée dans un panneau de revue avec suggestion pré-sélectionnée mais modifiable (menu déroulant), et l'utilisateur doit cliquer « Appliquer » pour valider — principe de sécurité déjà appliqué au dédoublonnage des noms (éviter une erreur d'attribution financière). Vérifié sur le fichier réel : 5/6 lignes correctement suggérées automatiquement (soufiane→Soufiane Hayroub, oussama→Hmamou Oussama, yassir→Bouhdadi Yassir, mouad→MOUAD ELBRAHMI, amine→Amine Jennane), 1/6 laissée à « Ignorer » faute de correspondance fiable (« absslam », corrigée manuellement dans la revue). Les montants importés s'additionnent à un solde d'avance existant (pas d'écrasement).
  4. **Récapitulatif par agent** (Spéc 4.3) : Agent (base harmonisée), Avances reçues, Brut MINT généré (session en cours, tous statuts), Brut MINT payé, Reste à payer = Brut généré − Brut payé − Avance. Distinction assumée et documentée dans l'UI : le solde de caisse est un registre cumulatif global, tandis que ce tableau récapitulatif reflète la session actuellement affichée.
  - Vérification globale : aucune erreur console sur l'ensemble du scénario (export ×8 boutons, injection, avance manuelle, paiement Brut en direct, import Avance.xlsx avec correction manuelle, restriction de rôle Qualité). État de test nettoyé après vérification (seules les 8 ventes réellement payées du fichier source restent enregistrées).

- **2026-07-15** — Faille corrigée : `compare_expected.js` teste systématiquement `window.rawLignes`, mais `index.html` déclare `let rawLignes` au niveau racine d'un `<script>` classique — cette déclaration n'attache jamais de propriété à `window` en JavaScript. Conséquence : `compareWithExpected()`, `validateBusinessRules()`, `applyAgentOrthographyCorrection()` ne voyaient jamais les données réellement importées (`window.rawLignes` restait `undefined`), même après un import réussi.
  - Correction : `window.rawLignes = rawLignes;` ajouté en tête de `renderAll()` (resynchronise à chaque rendu, donc après chaque import/édition/rechargement de session) et dans `doLogout()` (purge cohérente des données sensibles en mémoire).
  - Fichier modifié : `index.html` — `renderAll()` et `doLogout()`.
  - Vérification en conditions réelles : `window.rawLignes.length === rawLignes.length === 80` et `window.rawLignes===rawLignes` (même référence) après chargement de session ; `validateBusinessRules()` s'exécute désormais réellement (57 MINT + 23 CONSO vérifiés, 0 anomalie) au lieu d'alerter "rawLignes introuvable". Aucune erreur console.

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

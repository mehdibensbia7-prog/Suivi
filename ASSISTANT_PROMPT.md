# Prompt d'Assistant — SIPP / Suivi Primelink

Tu es un assistant technique dédié au projet SIPP. Avant chaque action, procède toujours dans cet ordre :
1. Vérifie la mémoire du projet.
2. Audite le code et l'historique des demandes.
3. Analyse les erreurs en cours.
4. Corrige les bugs et respecte la règle métier.
5. Teste le comportement.
6. Vérifie les erreurs après correction.
7. Mets à jour le cahier des charges et le prompt.

## Instructions
- Lis toujours le contenu de `CAHIER_DE_CHARGES.md` et `ASSISTANT_PROMPT.md` avant de modifier le projet.
- Prends en compte les historiques existants dans `C:\Users\z\OneDrive\Desktop\Historique_Requêtes`.
- Conserve la structure visuelle actuelle de `index.html` (login + onglets + tableaux). Ne remplace pas cette interface par le banc de tests.
- En cas de restauration, utilise **l'historique git** (`git log` / `git checkout`) — **jamais** `index-backup.html` ni une copie manuelle : ce fichier a été retiré du dépôt le 2026-07-16 précisément parce qu'une copie manuelle risque d'être une version périmée (voir `CAHIER_DE_CHARGES.md` § Critères d'Acceptation). *(Corrigé le 2026-07-17 — cette ligne contredisait auparavant la règle actuelle documentée plus bas dans ce même fichier.)*
- Supporte l'import simultané de plusieurs fichiers Excel et le rapprochement cross-sheet entre sources MINT/ConsoPilote et statuts CRM.
- Respecte strictement la règle métier : une vente marquée "Payé" ne peut être reprise que via un processus Qualité.
- Assure-toi qu'aucune erreur JavaScript liée à `XLSX` ou aux bibliothèques CDN ne reste dans la console.
- Si une dépendance externe échoue, affiche un message clair à l'utilisateur au lieu de laisser l'application planter.
- Documente chaque modification avec un audit, une analyse, un test et une vérification.
- Privilégie les solutions robustes et maintenables.

## Règles de Qualité
- Résultat attendu : qualité technique fiable à 100%.
- Chaque correctif doit être lié à un critère d'acceptation du cahier des charges.
- Ne pas ajouter de code inutile ni de dépendances superflues.
- Règle permanente : à chaque action menée dans ce dossier, mettre à jour `CAHIER_DE_CHARGES.md` (section « Journal des Correctifs ») et le présent fichier en conséquence, avant de considérer l'action terminée.

## Dernière intervention
- 2026-07-17 : catégorisation stricte des contrats (MINT=18XXXXX/7 chiffres, ConsoPilote=2XXXXX/6 chiffres, `classifyContractRef()`) — inversion détectée corrigée automatiquement à l'import (`contractSwaps`), jamais de supposition sur un numéro hors format (`contractAnomalies`, cas réel « 7917962/166641 »). Ventes à agent inconnu affectées au compte système « Panier Entreprise » (`AGENT_INCONNU`), rémunéré comme un agent normal, protégé du dédoublonnage. Bouton « Contrats corrigés » + carte Panier Entreprise (Trésorerie). Suite `tests.js` S13/S14 exécutée dans un vrai Chrome via serveur HTTP local (`Suivi/serve.ps1` + `.claude/launch.json`, contourne l'absence de Node/Python) : 117/117 PASS, plus import réel + preuve des 2 sens d'inversion en direct sur le vrai moteur. Voir `CAHIER_DE_CHARGES.md` § Journal des Correctifs.
- 2026-07-17 : Identification ConsoPilote élargie — contrats connus de Feuil1 seule désormais visibles (cas réel ZENDA/KOLANI, contrat 236103 — déjà correctement commissionné, seul l'onglet audit était aveugle), lecture d'une colonne Agent directe apparue dans un export plus récent, recoupement d'identité étendu au format classique, dédup nouveau/ancien format, correctif d'affichage de l'agent retenu en cas de conflit (doit refléter ce que le moteur paie réellement). Voir `CAHIER_DE_CHARGES.md` § Journal des Correctifs.
- 2026-07-17 : documentation — annotation des passages obsolètes du « DOCUMENT DE RÉFÉRENCE » (Phase 1/2/4, présent dans ce fichier ET `CAHIER_DE_CHARGES.md`) qui contredisaient les règles Direction actuelles (ancien barème ConsoPilote, ancien clawback -150 DH, `updateBalance()` inexistante) ; correction de l'instruction de restauration `index-backup.html` (obsolète et dangereuse depuis le retrait de ce fichier du dépôt le 2026-07-16 — la règle actuelle est `git log`/`git checkout`, déjà documentée ailleurs dans ce même fichier mais jamais corrigée ici).
- 2026-07-16 : correctif critique du test suite. Bouton « Exécuter tests d'import » (Diagnostics) supprimait avant TOUTES les sessions, affichait les données de test à la place des vraies données. Sécurisé : isolation des sessions de test (nettoyage uniquement des créations du test), restauration de la session originale, confirmation obligatoire avant de lancer les tests, auto-run désactivé par défaut. Voir `CAHIER_DE_CHARGES.md` § Journal des Correctifs.
- 2026-07-16 : export XLSX générique sur tous les onglets (`exportTable()`, Tabulator natif) + nouvel onglet Caisse (registre financier global, indépendant des sessions d'import, store IndexedDB dédié `caisse` — bump sipp-db v1→v2) réservé Super Admin/Directeur : injections manuelles, débit auto 50 DH au paiement Brut MINT (`debitCaisseMint()`, idempotent), avances par agent (sélection en liste, jamais de texte libre) avec import `Avance.xlsx` nécessitant confirmation humaine obligatoire (`suggestAgentForShortName()` suggère, ne décide jamais). Toute future modification touchant à la caisse ou aux avances DOIT préserver ce principe de confirmation manuelle. Voir `CAHIER_DE_CHARGES.md` § Journal des Correctifs.
- 2026-07-16 : 4 fonctionnalités majeures — onglet Négatif Financier (Règles A/B), Bordereau mensuel + rapport qualité + email simulé (mailto, pas d'envoi auto), bornage temporel universel (2 champs date header, harmonisé avec `periodFilter` existant), persistance IndexedDB auto + restauration au login + import Écraser/Nouvelle session + suppression réservée Super-Utilisateur. Voir Journal des Correctifs pour le détail et les choix de conception (notamment : Négatif Financier est une vue d'analyse séparée du moteur de paiement, pour ne rien contredire des règles déjà validées).
- 2026-07-15 : correction d'une faille dans `compare_expected.js` (`validateBusinessRules`) — voir détail dans `CAHIER_DE_CHARGES.md` § Journal des Correctifs.
- 2026-07-16 : RÈGLE AUTHENTIFIÉE PAR LA DIRECTION — vente MINT = 200 DH (50 Brut, toujours dû sauf refus Qualité explicite / 150 Activation, décommissionnée automatiquement dès chute dans les 3 mois). Le brut n'est JAMAIS repris par l'algorithme. Toute intervention future touchant au clawback MINT DOIT passer par `computeMintClawback()` (source de vérité unique) et ne jamais réintroduire une exclusion du brut basée sur `l.decommissionne` seul (utiliser `l.brutAnnule`). La Règle A du Négatif Financier a été réalignée sur ce moteur réel (elle ne portait à tort que sur le brut). Dédoublonnage automatique des agents (similitude ≥80%, `harmoniseAgentNames()`) actif après chaque import/rechargement — limite connue : ne fusionne pas les inversions d'ordre de mots. Voir `CAHIER_DE_CHARGES.md` § Journal des Correctifs pour le détail complet.
- 2026-07-15 : verrouillage des colonnes Statut Brut/Statut Activation de l'onglet Trésorerie et du bouton Calendrier « Réinitialiser Non Payé » — un contrat Payé ne peut plus être repassé Non Payé que via l'onglet Suivi Qualité. Voir `CAHIER_DE_CHARGES.md` § Journal des Correctifs.
- 2026-07-15 : ajout du détail des chutes par motif (Annulé/Rétracté/Résilié/Refusé) et du taux de chute dans l'onglet KPI Agents, conforme à l'exigence « KPI : taux de chute par agent ». Faille latente identifiée mais non corrigée à ce stade : `compare_expected.js` référence `window.rawLignes`, qui n'existe jamais (déclaration `let` non attachée à `window`) — voir `CAHIER_DE_CHARGES.md` § Journal des Correctifs pour le correctif à faire. *(Corrigée le jour même — voir l'entrée « correction de la faille window.rawLignes » plus bas dans cette même liste.)*
- 2026-07-15 : nouvelle règle métier — le brut MINT 50 DH ne s'applique qu'aux ventes à partir du 01/07/2026, via le nouvel « Agenda des règles financières » (bornage des dates, date modifiable, persistée). Onglet Trésorerie enrichi : cartes retard/total/à récupérer, retards surlignés, reste à payer par agent, échéancier ConsoPilote. Toute règle financière future DOIT être bornée dans le temps via cet agenda (`getRegles()`). Voir `CAHIER_DE_CHARGES.md` § Journal des Correctifs.
- 2026-07-15 : REFONTE de la rémunération ConsoPilote (remplace l'ancien barème 100+50+50) — total 100 DH en 2 tranches : paiement vérifié uniquement si statut « Signé » ET prélèvement « actif » (Feuil2), sinon en attente ; 50% à J+45 ; 50% aux 2 mois clos si statuts toujours OK, sinon perdus (tranches payées acquises). Voir `computeConsoFields()` dans `index.html` et le Journal des Correctifs.
- 2026-07-15 : nouvelle règle « Introuvable » MINT (décision manager obligatoire dans l'onglet Alertes : Retrouvée / Perdue→Annulée / En attente) + filtre de période global (jour/semaine/mois/trimestre/semestre/année/vendredi) appliqué à tous les onglets sauf pour l'agent. Voir Journal des Correctifs.
- 2026-07-15 : correction de la faille `window.rawLignes` — `renderAll()`/`doLogout()` synchronisent désormais explicitement `window.rawLignes`, rendant enfin fonctionnels `compareWithExpected()`, `validateBusinessRules()` et les corrections orthographiques d'agents. Voir Journal des Correctifs.

## DOCUMENT DE RÉFÉRENCE : SIPP (Système d'Information de Pilotage de Performance)

> **⚠️ Texte D'ORIGINE conservé pour l'historique — plusieurs règles financières ci-dessous ont été REMPLACÉES depuis (voir « Dernière intervention » ci-dessus et `CAHIER_DE_CHARGES.md` § Journal des Correctifs, seule source de vérité actuelle). Passages obsolètes annotés, jamais à ré-implémenter tels quels : suivre `computeMintClawback()` / `computeConsoFields()` dans `index.html`.**

### Phase 1 : Historique des demandes (Consolidation des textes)
- Objectif : Structurer une entité de centre d'appel avec organigramme et framework RH.
- Logique MINT : Détection des contrats via regex, calcul du brut (50 DH/unité) et net (150 DH/activation).
- Logic ConsoPilote : Paiements différés (100 DH à la signature, 50 DH à M+1, 50 DH à M+2). **[⚠️ OBSOLÈTE — remplacé le 2026-07-15 : 100 DH en 2 tranches de 50 DH, conditionnées Signé+prélèvement actif, exigibles J+45 et 2 mois clos.]**
- Compliance (Clawback) : Décommissionnement automatique (-150 DH) si statut devient "Annulé, Rétracté, Résilié, Refusé". **[⚠️ OBSOLÈTE — remplacé le 2026-07-16 : Brut 50 DH toujours dû sauf refus Qualité explicite ; seule l'Activation 150 DH est décommissionnée automatiquement, uniquement dans la fenêtre de 3 mois.]**
- Gestion Opérationnelle : Création de colonnes de statuts éditables dans l'onglet Opérationnel.
- Trésorerie & Management : Validation unitaire des paiements (MINT/Conso) et dashboard de balance financière.
- KPI : Analyse de performance et taux de chute par agent.
- Ergonomie : Interface Midnight, sélecteur de feuilles, gestion d'erreurs, calcul dynamique.

### Phase 2 : Cahier des Charges Intégral
#### 1. Modules Fonctionnels
- Import & Lecture : Interface d'importation `.xlsx` avec sélecteur de feuilles.
- Tableau Opérationnel : Affichage des données sources avec ajout de deux colonnes de statuts éditables (Énergie / Conso).
- Calculateur Financier : **[⚠️ OBSOLÈTE — voir annotations Phase 1 ci-dessus]**
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
- Dashboard : Mise à jour via la fonction `updateBalance()` déclenchée à chaque modification de statut de paiement par le manager. **[⚠️ OBSOLÈTE/INEXACT — fonction inexistante ; le rendu passe par `renderFinanceSummary()`/`renderFinance()` via `renderAll()`.]**

> Note de mise en œuvre : Pour toute demande de modification, utilisez le protocole d'exécution ci-dessus afin de garantir que les modules KPI, Sélecteur de feuilles, et la logique de décommissionnement restent en place.

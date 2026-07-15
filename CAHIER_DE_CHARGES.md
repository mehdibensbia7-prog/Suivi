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

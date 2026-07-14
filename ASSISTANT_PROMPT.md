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
- En cas de restauration, utilise `index-backup.html` ou une copie de sauvegarde validée.
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

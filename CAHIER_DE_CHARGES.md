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
1. Import de fichiers Excel et parsing des données.
2. Extraction robuste de l'ID de contrat (5 à 7 chiffres) depuis plusieurs colonnes possibles.
3. Classification des statuts : payé, annulé, en cours, non payé.
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
- `isStatusPaid("Non payé")` retourne `false`.
- Contrat payé ne peut pas repasser en non-payé sans intervention Qualité.
- `Annulé` après paiement conserve le montant brut et positionne `revueQualiteRequise = true`.
- Pas d'erreurs JavaScript concernant `XLSX` ou les dépendances.

## Références
- Historique de demandes : `C:\Users\z\OneDrive\Desktop\Historique_Requêtes`
- Correctifs antérieurs : protection du statut payé, mise à jour des liens CDN, audit complet du projet.

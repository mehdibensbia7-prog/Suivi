SIPP — Notice rapide sur l'option Auto‑run

But
- Expliquer le comportement "Auto-run après import" ajouté dans l'interface Diagnostics.

Comportement
- Quand "Auto-run après import" est activé, la suite de tests d'import (`runImportTestSuite()`) s'exécute automatiquement après chaque import de session.
- L'option est persistée localement via `localStorage` sous la clé `sipp.autoRunTests` (valeurs: `'true'` ou `'false'`).
- La case "Ne plus afficher" pour la notice est persistée sous `sipp.autoRunDontShow`.

Comment contrôler
- Dans l'interface : ouvrez la zone Diagnostics (coin bas gauche) et décochez la case "Auto-run après import" pour désactiver.
- Pour forcer la valeur côté poste local (par exemple pour déployer un choix par défaut), ouvrez la console du navigateur et exécutez :

```javascript
localStorage.setItem('sipp.autoRunTests','false');
localStorage.setItem('sipp.autoRunDontShow','true'); // pour masquer la notice
```

Notes
- L'auto-run produit des logs visibles dans le panneau Diagnostics et des enregistrements d'audit dans IndexedDB (`sipp-db` store `audit`).
- Recommandation : laisser Auto‑run désactivé en production pour éviter des exécutions non souhaitées. Activez‑le pour les postes de test/CI.

Fichier modifié
- `index.html` — ajout de la checkbox, du badge et de la notice de démarrage.

Contact
- Pour ajuster le comportement par défaut dans le code (par ex. changement du comportement par défaut), modifiez l'initialisation de la clé `sipp.autoRunTests` dans `index.html`.

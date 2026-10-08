# Comparaison historique de production — Mesa 3

Analyse du 8 octobre 2026. Aucune modification du modèle du dashboard.

## Sources et périmètre

- Stakes et total du ledger : `docs/data/validators.json` au commit `0b67823`, snapshot du 3 octobre 2026 à 11:59:08 UTC. Les lignes portent `network_epoch_label = mesa:3`.
- Production complète N−1 : snapshot local du 8 octobre 2026 à 08:24:43 UTC, lignes portant `previous_epoch_label = mesa:3`, champ `blocks_previous_epoch` (canonique).
- Tous les producteurs avec au moins un bloc canonique Mesa 3 dans ce snapshot ont un stake historique disponible.
- La somme des stakes des lignes du tableau n'est pas le total du ledger. Le dénominateur provient de `ledger_meta.total_stake_current_epoch` du snapshot historique.

## Résultats agrégés

| Mesure | Valeur |
|---|---:|
| Total du ledger Mesa 3 | 1 303 624 138,84 MINA |
| Stake historique des comptes ayant produit au moins un bloc canonique Mesa 3 | 379 445 100,79 MINA |
| Part de ce stake dans le ledger | 29,11 % |
| Blocs canoniques Mesa 3 présents dans l'archive | 2 381 |
| Blocs / 7 140 slots | 33,35 % |
| Attendu du modèle actuel pour ces producteurs | 1 558,68 |
| Réel / attendu agrégé | 1,528 |

L'attendu individuel est recalculé comme `7140 × 0,75 × stake_Mesa3 / total_Mesa3`.

| Validateur | Stake Mesa 3 (MINA) | Blocs réels | Attendu recalculé | Réel / attendu |
|---|---:|---:|---:|---:|
| Kraken | 127 322 164,36 | 814 | 523,01 | 1,56 |
| Auro Wallet | 58 240 662,23 | 354 | 239,24 | 1,48 |
| MinaExplorer | 53 149 196,88 | 348 | 218,33 | 1,59 |
| Paribu | 35 555 079,43 | 202 | 146,05 | 1,38 |
| Carbonara | 17 450 590,87 | 101 | 71,68 | 1,41 |
| Piconbello | 13 089 633,14 | 78 | 53,77 | 1,45 |
| InfStones | 10 091 492,51 | 62 | 41,45 | 1,50 |
| 6block | 7 524 572,53 | 51 | 30,91 | 1,65 |
| PhDSOON | 3 148 814,99 | 20 | 12,93 | 1,55 |
| Minascan Pool / Staketab | 2 279 478,49 | 18 | 9,36 | 1,92 |
| Naamah Stake FR | 2 625 925,95 | 18 | 10,79 | 1,67 |

## Interprétation et limites

Le mélange des epochs expliquait certaines anomalies individuelles, mais pas le biais commun. Avec les bons stakes, plusieurs gros producteurs restent au-dessus du modèle d'environ 40 à 60 %.

Remplacer 0,75 par 1 porterait l'attendu agrégé à 2 078,24 blocs : il resterait un écart de 14,57 % par rapport aux 2 381 blocs observés. Un coefficient ajusté à ce groupe et cette epoch serait 1,14568, mais ce serait une calibration rétrospective, pas une constante démontrée du protocole.

Le groupe « actif » est ici défini par la production canonique observée pendant Mesa 3 seulement. Ce n'est pas la définition N−1 ou N du dashboard. Il exclut les validateurs opérationnels mais malchanceux et ceux ayant produit uniquement des blocs orphelins. Il ne constitue donc pas un inventaire indépendant de tous les participants actifs.

Répartir `2381 × stake_individuel / 379445100,79` fournit une comparaison descriptive à la production réseau de Mesa 3. La somme retrouve 2 381 par construction : cela ne valide pas un modèle prédictif.

Les blocs sont ceux de l'archive disponible ; cette analyse ne vérifie pas indépendamment sa complétude. Une seule epoch et un groupe sélectionné sur la production ne suffisent pas à établir un coefficient universel. La règle VRF et la concurrence entre blocs doivent être examinées avant de présenter une autre formule comme une espérance théorique.

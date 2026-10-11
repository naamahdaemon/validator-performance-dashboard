# Mesa 4 — bilan provisoire au 11 octobre 2026

Source : snapshot du 11 octobre 2026 à 16:19:55 UTC et ledger historique
`docs/data/history/mesa-4.json`, capturé le 8 octobre à 09:34:36 UTC.

Mesa 5 est détectée au slot 712. Le snapshot rapporte 0 bloc canonique confirmé
pour Mesa 5 et 219 blocs provisoires. Le champ production de l'historique Mesa 4
reste null : la condition de clôture (bloc canonique au-delà de la fin d'epoch)
n'est pas attestée par ces données. Les logs serveur seraient nécessaires pour
exclure également une erreur de collecte. Ne pas finaliser manuellement ce bilan.

À ce stade, les compteurs N−1 du snapshot donnent 2 467 blocs canoniques Mesa 4.
Le stake des producteurs avec au moins un de ces blocs est 405 302 124,25 MINA.
L'attendu agrégé actuel pour ces producteurs est 1 663,65 blocs, soit un ratio
observé/attendu de 1,4829. Les stakes utilisés sont ceux de Mesa 4, pas Mesa 5.

| Validateur | Blocs confirmés disponibles | Attendu Mesa 4 |
|---|---:|---:|
| Kraken (ancienne adresse) | 977 | 665,62 |
| MinaExplorer | 357 | 230,00 |
| Auro Wallet | 314 | 236,82 |
| Paribu | 198 | 131,36 |
| Carbonara | 98 | 69,18 |
| Piconbello | 74 | 53,24 |
| 6block | 58 | 29,96 |

Le résultat provisoire retrouve un biais proche de celui de Mesa 3 (1,5276), mais
ne constitue pas encore un second bilan définitif. Le groupe de producteurs
observés exclut les comptes sans bloc et n'est pas un inventaire indépendant du
stake opérationnel. La correspondance entre epoch du daemon et epoch de l'archive
reste également une réserve de provenance du ledger. Aucun changement du modèle.

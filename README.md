# Soundboard Card (FR)

Carte Home Assistant « **boîte à sons** » : une grille de tuiles qui lancent des morceaux courts (jingles, sonneries d'un portail, etc.) via des interrupteurs impulsionnels. Pendant la lecture, la tuile s'illumine avec une barre de progression et un égaliseur animé, et les autres tuiles sont bloquées. Recherche, repli de la grille, curseur de volume. Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.

## Installation (HACS)
HACS → ⋮ → Dépôts personnalisés → `https://github.com/Johan854/soundboard-card`, catégorie **Tableau de bord**. Puis recharger le navigateur (Ctrl+F5).

## Exemple
```yaml
type: custom:soundboard-card
title: Audio
volume_entity: number.espbadgesportail_volume_dfplayer
auto_volume: 100        # remet le volume à 100 % avant chaque morceau
duration: 5
tiles:
  - entity: switch.espbadgesportail_a_team
    name: A Team
    icon: mdi:account-group
  - entity: switch.espbadgesportail_star_wars
    name: Star Wars
    icon: mdi:space-station
  - switch.espbadgesportail_tetris
```

## Options
| Option | Défaut | Description |
|---|---|---|
| `tiles` | `[]` | Liste d'entités ou d'objets `{entity, name, icon}` (nom court déduit automatiquement sinon) |
| `title` | `Audio` | Titre |
| `volume_entity` | | `number` / `input_number` du volume (curseur + boutons − / +) |
| `auto_volume` | `0` | Volume (en %) réglé automatiquement avant chaque morceau. `0` = désactivé |
| `duration` | `5` | Durée d'un morceau en secondes (l'interrupteur repart seul sur « off », la carte compte le temps) |
| `columns` | `0` | Nombre de colonnes (0 = automatique) |
| `collapsed_count` | `12` | Tuiles visibles avant « Tout afficher » (0 = toutes) |
| `lock_while_playing` | `true` | Bloquer les autres tuiles pendant la lecture |
| `show_search` | `true` | Afficher la recherche |
| `stop_on_press` | `false` | Un second appui sur le morceau en cours renvoie l'impulsion |
| `theme` | `auto` | `auto`, `light`, `dark` |

Le bloc « Nuance de couleur » est identique à celui des autres cartes.

Sur écran étroit (smartphone), le volume passe sous la recherche, sur sa propre ligne.

## Historique des versions
- **1.1.0** : volume automatique avant chaque morceau (`auto_volume`), boutons − / + du volume, volume sur sa propre ligne sur smartphone.
- **1.0.0** : première version.

# Lunalis

Application Electron de gamification pour booster la productivité et la discipline. Transformez vos objectifs en aventure RPG avec un systeme XP, des rangs, et une progression saisoniere.

## Installation

### Prerequis

- [Node.js](https://nodejs.org/) (v18+)
- npm (inclus avec Node.js)

### Etapes

```bash
# 1. Installer les dependances
npm install

# 2. Configurer les credentials OAuth
cp .env.example .env
# Editez .env avec vos propres Client ID / Secret (voir section Configuration)

# 3. Lancer l'application
npm start
```

### Creer l'executable Windows

```bash
npm run package-win
# => release/Lunalis-win32-x64/Lunalis.exe
```

## Configuration (.env)

Copiez `.env.example` en `.env` et remplissez vos credentials :

| Variable | Description |
|----------|-------------|
| `SPOTIFY_CLIENT_ID` | Client ID de votre app Spotify Developer |
| `SPOTIFY_CLIENT_SECRET` | Client Secret Spotify |
| `SPOTIFY_REDIRECT_URI` | URI de redirection Spotify (defaut: `http://127.0.0.1:8888/callback`) |
| `GOOGLE_CLIENT_ID` | Client ID Google Cloud Console (API Calendar) |
| `GOOGLE_CLIENT_SECRET` | Client Secret Google |
| `GOOGLE_REDIRECT_URI` | URI de redirection Google (defaut: `http://localhost`) |

Pour obtenir ces credentials :
- **Spotify** : Creez une app sur [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
- **Google** : Activez l'API Calendar dans [Google Cloud Console](https://console.cloud.google.com/) et creez des identifiants OAuth 2.0

## Fonctionnalites

### Timer Focus
- Sessions personnalisables (15-120 min)
- Calcul XP en temps reel (18 min = 1 XP)
- Pauses automatiques (5 min / 25 min)
- Integration Spotify (lecture/pause)
- Attribution de projets aux sessions
- Synchronisation Google Calendar

### Systeme XP & Progression
- **Blocs obligatoires** : 2 sessions/jour (1h30 chacune = 5 XP)
- **Blocs bonus** : Apres les obligatoires (double XP)
- **Sport** : >=50 min = +3 XP
- **Sommeil** : >7h avant 22h = +2 XP, avant minuit = +1 XP
- **Punitions** : Instagram +1h = -3 XP, Musique +1h30 = -5 XP
- **Streak** : Grace day (1 jour manque tolere par semaine)

### 8 Rangs (E -> SSS)
E (Paume improductif) < 200 XP | D (Spectateur) 200 | C (Errant) 300 | B (Stratege) 400 | A (Veteran) 500 | S (Sentinelle) 600 | SS (Paragon) 700 | SSS (Elu du Destin) >= 750

### Gamification
- **Saisons** : 42 jours (6 semaines), objectif de rang
- **12 achievements** persistants (easy/medium/epic/legendary)
- **Bilan hebdomadaire** : 5 questions /10, taux d'intensite
- **Coffre mystique** : Double or Nothing apres 7 jours a 15+ XP

### Gestion de Projets
- CRUD projets par categorie
- Tracking du temps par projet
- Statistiques detaillees

## Architecture

L'application suit un pattern modulaire avec communication par evenements :

```
index.html                  <- Point d'entree, charge les CSS et modules
script.js                   <- Orchestrateur (instancie + connecte les modules)
main.js                     <- Process Electron principal (OAuth, IPC)
preload.js                  <- Bridge contextIsolation (window.electronAPI)
validation.js               <- Validation stricte des donnees importees

modules/
  constants.js              <- RANKS, INTENSITY_LEVELS, helpers
  EventEmitter.js           <- Bus pub/sub entre modules
  DataManager.js            <- localStorage, migration, dirty flag + auto-save
  XPSystem.js               <- Calcul XP, streaks avec grace day, reset quotidien
  TimerManager.js           <- Timer focus, pauses, Spotify
  ProjectManager.js         <- CRUD projets
  SeasonManager.js          <- Saisons 42j, bilans hebdomadaires
  AchievementTracker.js     <- 12 achievements persistants
  UIRenderer.js             <- Tout le rendu DOM

css/
  base.css                  <- Variables CSS, reset, scrollbar, loading
  layout.css                <- Sidebar, main content, responsive, hamburger, bottom nav
  components.css             <- Cards, timer, modales, notifications, boutons
  sections.css              <- Dashboard, focus, projets, achievements, progression, settings
  themes.css                <- Variations de couleur (fire, nature, cosmic)
  animations.css            <- @keyframes, effets visuels, prestige rangs
```

### Pattern des modules

Chaque module utilise un IIFE avec double export :
- `window.ClassName` pour le navigateur
- `module.exports` pour les tests Jest

Communication inter-modules via `EventEmitter` (pub/sub).
Donnees centralisees dans `DataManager` avec dirty flag + auto-save toutes les 30 secondes.

## Tests

```bash
npm test
```

81 tests repartis en 8 suites :
- `xp.test.js` — Fonctions XP standalone
- `tests/EventEmitter.test.js` — Bus d'evenements
- `tests/DataManager.test.js` — Stockage et migration
- `tests/XPSystem.test.js` — XP, streaks, reset quotidien
- `tests/AchievementTracker.test.js` — Achievements persistants
- `tests/ProjectManager.test.js` — CRUD projets
- `tests/SeasonManager.test.js` — Saisons et bilans
- `tests/validation.test.js` — Validation des imports

## Responsive

- **Desktop** : Sidebar fixe 280px a gauche
- **Tablette** (< 1200px) : Grilles adaptees
- **Mobile** (< 768px) : Menu hamburger, bottom nav (Dashboard/Focus/Projets/Stats)
- **Petit ecran** (< 480px) : Timer optimise pour 375px

## Sauvegarde

- Donnees sauvegardees dans localStorage (cle `myRPGLifeData`)
- Auto-save toutes les 30 secondes (dirty flag)
- Export/import JSON avec validation stricte
- Tokens OAuth chiffres (AES-256-GCM) dans le dossier utilisateur

## Scripts npm

| Commande | Description |
|----------|-------------|
| `npm start` | Lancer l'application Electron |
| `npm test` | Lancer les tests Jest |
| `npm run package-win` | Generer l'executable Windows |
| `npm run lint` | Linter le code (ESLint) |
| `npm run format` | Formater le code (Prettier) |

---

**Version** : 4.0.0 - Lunalis
**Philosophie** : "Discipline fun, addiction saine, progression constante"

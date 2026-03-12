/**
 * TimerManager.js — Gestion complète du timer focus.
 *
 * Responsabilités :
 *  - Start, pause, cancel, complete
 *  - Pauses automatiques (5min/25min de focus)
 *  - Mode Spotify (via electronAPI)
 *  - Émission d'événements quand une session se termine
 *
 * Le TimerManager ne touche PAS au DOM. Il gère l'état du timer et émet
 * des événements que UIRenderer écoute pour mettre à jour l'affichage.
 */
(function (global) {
  'use strict';

  class TimerManager {
    /**
     * @param {DataManager} dataManager
     * @param {XPSystem} xpSystem
     * @param {EventEmitter} emitter
     */
    constructor(dataManager, xpSystem, emitter) {
      this.dm = dataManager;
      this.xp = xpSystem;
      this.emitter = emitter;

      /** @type {number|null} Identifiant setInterval du timer principal */
      this._interval = null;

      /** Son de fin de session */
      this._endSound = null;

      /** État complet du timer */
      this.state = {
        isRunning: false,
        isPaused: false,
        duration: 25 * 60,     // Durée totale en secondes
        remaining: 25 * 60,    // Temps restant en secondes
        startTimestamp: null,   // Timestamp de démarrage pour calcul précis
        currentProject: null,   // ID du projet sélectionné
        isBreak: false,
        breakRemaining: 0,
        breakCount: 0,
        totalBreaks: 0,
        autoBreaks: false,
        spotifyModeActive: false
      };
    }

    get data() {
      return this.dm.data;
    }

    // =========================================================================
    // Contrôles principaux
    // =========================================================================

    /**
     * Toggle : démarre ou met en pause le timer.
     */
    toggle() {
      if (!this.state.isRunning) {
        this.start();
      } else {
        this.pause();
      }
    }

    /**
     * Démarre (ou reprend) le timer.
     * @param {Object} [options] - Options de démarrage
     * @param {boolean} [options.autoBreaks] - Activer les pauses automatiques
     * @param {boolean} [options.spotifyMode] - Activer le mode Spotify
     * @param {string|null} [options.projectId] - ID du projet associé
     */
    start(options) {
      if (options) {
        this.state.autoBreaks = !!options.autoBreaks;
        this.state.spotifyModeActive = !!options.spotifyMode;
        this.state.currentProject = options.projectId || null;
      }

      this.state.isRunning = true;
      this.state.isPaused = false;

      // Calcul du nombre de pauses prévues
      this.state.totalBreaks = Math.floor(this.state.duration / (25 * 60));
      this.state.breakCount = this.state.breakCount || 0;

      // Timestamp pour un calcul temps réel précis
      this.state.startTimestamp = Date.now() -
        (this.state.duration - this.state.remaining) * 1000;

      // Charger le son
      try {
        this._endSound = new Audio('assets/sounds/session-end.mp3');
      } catch (_) {
        // Silencieux si le fichier n'existe pas (tests)
      }

      // Spotify
      if (this.state.spotifyModeActive && typeof window !== 'undefined' && window.electronAPI) {
        if (window.electronAPI.launchSpotifyApp) window.electronAPI.launchSpotifyApp();
        if (window.electronAPI.playSpotify) window.electronAPI.playSpotify();
      }

      this.emitter.emit('timer:started', this.getPublicState());

      // Boucle principale : tick chaque seconde
      this._interval = setInterval(() => this._tick(), 1000);
    }

    /**
     * Met en pause le timer.
     */
    pause() {
      if (!this.state.isRunning) return;

      // Calculer le temps restant exact avant de stopper
      const elapsed = Math.floor((Date.now() - this.state.startTimestamp) / 1000);
      this.state.remaining = Math.max(this.state.duration - elapsed, 0);

      this.state.isRunning = false;
      this.state.isPaused = true;

      this._clearInterval();

      this.emitter.emit('timer:paused', this.getPublicState());
    }

    /**
     * Annule le timer. Si ≥15min écoulées, donne quand même les XP partiels.
     */
    cancel() {
      if (this.state.startTimestamp) {
        const elapsed = Math.floor((Date.now() - this.state.startTimestamp) / 1000 / 60);
        if (elapsed >= 15) {
          const xpGained = this.xp.calculateFocusXP(elapsed);
          const isBonus = this.xp.getMandatorySessionsToday() >= 2;
          this.xp.addXP(xpGained, `Session Annulée ${elapsed}min`);
          this._recordSession(elapsed, this.state.duration / 60, xpGained, isBonus ? 'bonus' : 'normal');
        }
      }

      this._stopSpotify();
      this._reset();
      this.emitter.emit('timer:cancelled', this.getPublicState());
    }

    /**
     * Ajuste la durée du timer (seulement quand le timer ne tourne pas).
     * @param {number} minutes - Delta en minutes (+5 ou -5)
     */
    adjustDuration(minutes) {
      if (this.state.isRunning) return;

      const current = this.state.duration / 60;
      const newMinutes = Math.max(15, Math.min(120, current + minutes));
      this.state.duration = newMinutes * 60;
      this.state.remaining = newMinutes * 60;

      this.emitter.emit('timer:durationChanged', this.getPublicState());
    }

    // =========================================================================
    // Boucle interne
    // =========================================================================

    /**
     * Tick du timer — appelé chaque seconde.
     */
    _tick() {
      const elapsed = Math.floor((Date.now() - this.state.startTimestamp) / 1000);
      this.state.remaining = Math.max(this.state.duration - elapsed, 0);

      this.emitter.emit('timer:tick', this.getPublicState());

      // Vérifier fin de session
      if (this.state.remaining <= 0) {
        this._complete();
        return;
      }

      // Vérifier si une pause automatique doit démarrer
      if (
        this.state.autoBreaks &&
        this.state.breakCount < this.state.totalBreaks &&
        elapsed >= (this.state.breakCount + 1) * 25 * 60
      ) {
        this._startBreak();
      }
    }

    /**
     * Termine la session avec succès.
     */
    _complete() {
      this._clearInterval();

      // Jouer le son de fin
      if (this.data.settings?.soundNotifications && this._endSound) {
        try { this._endSound.play(); } catch (_) {}
      }

      const minutes = this.state.duration / 60;
      const xpGained = this.xp.calculateFocusXP(minutes);
      const isBonus = this.xp.getMandatorySessionsToday() >= 2;

      this.xp.addXP(xpGained, `Session Focus ${minutes}min`);
      this._recordSession(minutes, minutes, xpGained, isBonus ? 'bonus' : 'normal');

      this._stopSpotify();

      const completedState = this.getPublicState();
      completedState.xpGained = xpGained;
      this.emitter.emit('timer:completed', completedState);

      this._reset();
    }

    // =========================================================================
    // Pauses automatiques
    // =========================================================================

    /**
     * Démarre une pause de 5 minutes.
     */
    _startBreak() {
      this.pause();
      this.state.isBreak = true;
      this.state.breakRemaining = 5 * 60;

      this.emitter.emit('timer:break:started', this.getPublicState());

      this._interval = setInterval(() => {
        this.state.breakRemaining -= 1;
        this.emitter.emit('timer:break:tick', this.getPublicState());

        if (this.state.breakRemaining <= 0) {
          this._endBreak();
        }
      }, 1000);
    }

    /**
     * Termine la pause et reprend le focus.
     */
    _endBreak() {
      this._clearInterval();
      this.state.isBreak = false;
      this.state.breakCount += 1;

      // Son de reprise
      if (this.data.settings?.soundNotifications) {
        try {
          const sound = new Audio('assets/sounds/session-end.mp3');
          sound.play();
        } catch (_) {}
      }

      this.emitter.emit('timer:break:ended', this.getPublicState());

      // Reprendre le timer principal
      this.start();
    }

    // =========================================================================
    // Enregistrement de session
    // =========================================================================

    /**
     * Enregistre une session focus dans les données.
     * @param {number} minutes - Minutes réellement effectuées
     * @param {number} scheduledMinutes - Minutes planifiées
     * @param {number} xp - XP gagnés
     * @param {string} type - 'normal' ou 'bonus'
     */
    _recordSession(minutes, scheduledMinutes, xp, type) {
      const session = {
        date: new Date().toISOString(),
        duration: minutes,
        scheduled: scheduledMinutes,
        project: this.state.currentProject || null,
        xp,
        type
      };

      this.data.focusSessions.push(session);

      // Mettre à jour le temps total du projet si sélectionné
      if (this.state.currentProject) {
        const project = this.data.projects.find(p => p.id == this.state.currentProject);
        if (project) {
          project.totalTime += minutes;
        }
      }

      this.dm.markDirty();

      // Log vers Google Calendar via Electron si ≥15 minutes
      if (typeof window !== 'undefined' && window.electronAPI && minutes >= 15) {
        const start = new Date(Date.now() - minutes * 60000).toISOString();
        const description = scheduledMinutes > minutes
          ? `session de ${scheduledMinutes} min stoppée à ${minutes} min`
          : '';
        window.electronAPI.logFocusSession({
          start, duration: minutes, project: session.project,
          xp, type, description
        });
      }

      this.emitter.emit('session:recorded', session);
    }

    // =========================================================================
    // Utilitaires internes
    // =========================================================================

    _clearInterval() {
      if (this._interval) {
        clearInterval(this._interval);
        this._interval = null;
      }
    }

    _stopSpotify() {
      if (this.state.spotifyModeActive &&
          typeof window !== 'undefined' &&
          window.electronAPI?.pauseSpotify) {
        window.electronAPI.pauseSpotify();
      }
    }

    _reset() {
      this._clearInterval();
      this.state.isRunning = false;
      this.state.isPaused = false;
      this.state.remaining = this.state.duration;
      this.state.startTimestamp = null;
      this.state.isBreak = false;
      this.state.breakRemaining = 0;
      this.state.breakCount = 0;
      this.state.spotifyModeActive = false;
    }

    // =========================================================================
    // État public (pour le rendu UI)
    // =========================================================================

    /**
     * Retourne un snapshot immutable de l'état du timer pour l'UI.
     * @returns {Object}
     */
    getPublicState() {
      return { ...this.state };
    }

    /**
     * Retourne les infos sur les pauses prévues pour affichage.
     * @returns {{ total: number, remaining: number, label: string }}
     */
    getBreakInfo() {
      const total = Math.floor(this.state.duration / (25 * 60));
      const remaining = total - this.state.breakCount;
      let label;
      if (this.state.isRunning || this.state.breakCount > 0) {
        label = `${remaining} pause${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`;
      } else {
        label = `${total} pause${total > 1 ? 's' : ''} prévue${total > 1 ? 's' : ''}`;
      }
      return { total, remaining, label };
    }
  }

  // Exposition
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimerManager;
  } else {
    global.TimerManager = TimerManager;
  }
})(typeof window !== 'undefined' ? window : global);

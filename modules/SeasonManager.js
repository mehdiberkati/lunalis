/**
 * SeasonManager.js — Logique de saisons : reset, historique, objectif, countdown.
 *
 * Responsabilités :
 *  - Vérifier si une saison est terminée (42 jours)
 *  - Démarrer une nouvelle saison (archivage + reset)
 *  - Calculer la progression de saison (jours restants, semaine courante)
 *  - Gérer l'objectif de saison
 */
(function (global) {
  'use strict';

  var SEASON_DURATION_DAYS = 42;

  class SeasonManager {
    /**
     * @param {DataManager} dataManager
     * @param {EventEmitter} emitter
     */
    constructor(dataManager, emitter) {
      this.dm = dataManager;
      this.emitter = emitter;
    }

    get data() {
      return this.dm.data;
    }

    // =========================================================================
    // Vérification et transition de saison
    // =========================================================================

    /**
     * Vérifie si la saison courante est terminée et en démarre une nouvelle si oui.
     * À appeler au démarrage de l'app.
     */
    checkSeasonReset() {
      if (!this.data.seasonStartDate) return;
      const diffDays = this._daysSinceSeasonStart();
      if (diffDays >= SEASON_DURATION_DAYS) {
        this.startNewSeason();
      }
    }

    /**
     * Archive la saison courante et en démarre une nouvelle.
     * Préserve : achievements, settings, seasonHistory.
     */
    startNewSeason() {
      const currentRank = this._getCurrentRank();

      // Archiver la saison courante
      this.data.seasonHistory.push({
        season: this.data.seasonNumber || 1,
        totalXP: this.data.totalXP,
        rank: currentRank.name,
        badge: currentRank.badge
      });

      // Sauvegarder ce qu'on préserve
      const preserved = {
        achievements: this.data.achievements,
        settings: this.data.settings,
        seasonHistory: this.data.seasonHistory
      };

      // Reset avec les données par défaut
      const defaults = this.dm.getDefaultData();
      Object.assign(this.data, defaults);

      // Restaurer les données préservées
      this.data.started = true;
      this.data.seasonNumber = preserved.seasonHistory.length + 1;
      this.data.seasonStartDate = new Date().toISOString();
      this.data.achievements = preserved.achievements;
      this.data.settings = preserved.settings;
      this.data.seasonHistory = preserved.seasonHistory;

      this.dm.saveNow();
      this.emitter.emit('season:new', {
        seasonNumber: this.data.seasonNumber,
        previousRank: this.data.seasonHistory[this.data.seasonHistory.length - 1]
      });
    }

    // =========================================================================
    // Démarrage de l'app (première fois)
    // =========================================================================

    /**
     * Démarre l'aventure avec un objectif de saison.
     * @param {number} goalXP - XP objectif (500, 600, 700, 750)
     */
    startApp(goalXP) {
      this.data.started = true;
      this.data.seasonGoalXP = goalXP;
      this.data.seasonNumber = this.data.seasonHistory.length + 1;
      this.data.seasonStartDate = new Date().toISOString();
      this.dm.saveNow();
      this.emitter.emit('app:started', { goalXP });
    }

    /**
     * Met à jour l'objectif de saison.
     * @param {number} goalXP
     */
    updateGoal(goalXP) {
      this.data.seasonGoalXP = goalXP;
      this.dm.markDirty();
      this.emitter.emit('season:goalUpdated', { goalXP });
    }

    // =========================================================================
    // Calculs de progression
    // =========================================================================

    /**
     * Retourne la progression actuelle de la saison.
     * @returns {{ daysPassed, daysRemaining, weekNumber, seasonNumber, percent, goalXP, goalPercent, goalReached }}
     */
    getProgress() {
      const daysPassed = this._daysSinceSeasonStart();
      const daysRemaining = Math.max(0, SEASON_DURATION_DAYS - daysPassed);
      const weekNumber = Math.min(6, Math.floor(daysPassed / 7) + 1);
      const percent = Math.min(100, (daysPassed / SEASON_DURATION_DAYS) * 100);
      const goalXP = this.data.seasonGoalXP || 600;
      const goalPercent = Math.min(100, (this.data.totalXP / goalXP) * 100);

      return {
        daysPassed,
        daysRemaining,
        weekNumber,
        seasonNumber: this.data.seasonNumber || 1,
        percent,
        goalXP,
        goalPercent,
        goalReached: this.data.totalXP >= goalXP
      };
    }

    /**
     * Retourne les infos de la dernière saison (pour l'affichage).
     * @returns {{ badge, rank }|null}
     */
    getLastSeasonInfo() {
      if (!this.data.seasonHistory || this.data.seasonHistory.length === 0) return null;
      return this.data.seasonHistory[this.data.seasonHistory.length - 1];
    }

    // =========================================================================
    // Bilan hebdomadaire
    // =========================================================================

    /**
     * Retourne le numéro de semaine courant dans la saison.
     * @returns {number}
     */
    getCurrentWeekNumber() {
      const start = new Date(this.data.seasonStartDate || Date.now());
      const diffMs = Math.abs(Date.now() - start.getTime());
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return Math.ceil(diffDays / 7);
    }

    /**
     * Retourne les dates de la semaine courante (lundi - dimanche).
     * @returns {string}
     */
    getWeekDates() {
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - now.getDay() + 1);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return `${monday.toLocaleDateString()} - ${sunday.toLocaleDateString()}`;
    }

    /**
     * Vérifie si un bilan hebdomadaire peut être fait (≥7 jours depuis le dernier).
     * @returns {boolean}
     */
    canDoWeeklyReview() {
      const last = this.data.weeklyReviews[this.data.weeklyReviews.length - 1];
      if (!last) return true;
      const daysSince = (Date.now() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince >= 7;
    }

    /**
     * Retourne le temps restant avant le prochain bilan possible.
     * @returns {string} Format "Xj Xh Xm"
     */
    getTimeUntilNextReview() {
      const last = this.data.weeklyReviews[this.data.weeklyReviews.length - 1];
      if (!last) return 'maintenant';

      const next = new Date(last.date);
      next.setDate(next.getDate() + 7);
      const diff = next - Date.now();
      if (diff <= 0) return 'maintenant';

      const totalSec = Math.floor(diff / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      return `${days}j ${hours}h ${minutes}m`;
    }

    /**
     * Soumet un bilan hebdomadaire.
     * @param {Object} review - { productivity, health, creativity, social, satisfaction, reflection }
     */
    submitWeeklyReview(review) {
      const totalScore = review.productivity + review.health +
        review.creativity + review.social + review.satisfaction;
      const percentage = (totalScore / 50) * 100;

      const entry = {
        date: new Date().toISOString(),
        week: this.getCurrentWeekNumber(),
        scores: {
          productivity: review.productivity,
          health: review.health,
          creativity: review.creativity,
          social: review.social,
          satisfaction: review.satisfaction
        },
        totalScore,
        percentage,
        reflection: review.reflection || ''
      };

      this.data.weeklyReviews.push(entry);
      this.dm.markDirty();
      this.emitter.emit('weekly:submitted', entry);
    }

    // =========================================================================
    // Utilitaires internes
    // =========================================================================

    _daysSinceSeasonStart() {
      if (!this.data.seasonStartDate) return 0;
      const start = new Date(this.data.seasonStartDate);
      return Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
    }

    _getCurrentRank() {
      // Import dynamique des rangs depuis LunalisConstants si disponible, sinon fallback
      var ranks;
      if (typeof LunalisConstants !== 'undefined') {
        ranks = LunalisConstants.RANKS;
      } else if (typeof require !== 'undefined') {
        ranks = require('./constants').RANKS;
      } else {
        ranks = [
          { name: 'Paumé improductif', xp: 0, badge: 'E', avatar: '😵' },
          { name: 'Élu du Destin', xp: 750, badge: 'SSS', avatar: '🌙' }
        ];
      }

      let current = ranks[0];
      for (let i = ranks.length - 1; i >= 0; i--) {
        if (this.data.totalXP >= ranks[i].xp) {
          current = ranks[i];
          break;
        }
      }
      return current;
    }
  }

  // Exposition
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeasonManager;
  } else {
    global.SeasonManager = SeasonManager;
  }
})(typeof window !== 'undefined' ? window : global);

/**
 * XPSystem.js — Source unique de vérité pour toute la logique XP.
 *
 * Responsabilités :
 *  - Calcul XP focus (Math.floor — unifié)
 *  - Ajout/soustraction d'XP avec historique
 *  - Calcul du streak avec tolérance "jour de grâce"
 *  - Reset quotidien (centralisé ici, PAS dans addXP)
 *  - Taux d'intensité hebdomadaire
 *
 * Bug fix streak (grace day) :
 *  1 jour manqué par semaine de 7 jours est toléré sans casser le streak.
 *  Les grâces sont réinitialisées toutes les 7 jours de streak accumulé.
 */
(function (global) {
  'use strict';

  class XPSystem {
    /**
     * @param {DataManager} dataManager
     * @param {EventEmitter} emitter
     */
    constructor(dataManager, emitter) {
      this.dm = dataManager;
      this.emitter = emitter;
    }

    // =========================================================================
    // Accesseur pratique
    // =========================================================================

    get data() {
      return this.dm.data;
    }

    // =========================================================================
    // Calcul XP
    // =========================================================================

    /**
     * Calcule l'XP gagné pour une session focus.
     * Utilise Math.floor (source unique — supprime le doublon xp.js/script.js).
     *
     * Formule : base = floor(minutes / 18)
     * Bonus x2 si 2 blocs obligatoires déjà accomplis aujourd'hui.
     *
     * @param {number} minutes - Durée de la session en minutes
     * @param {number} [mandatorySessions] - Sessions obligatoires déjà complétées
     * @returns {number} XP gagné (entier)
     */
    calculateFocusXP(minutes, mandatorySessions) {
      const sessions = mandatorySessions !== undefined
        ? mandatorySessions
        : this.getMandatorySessionsToday();
      const baseXP = Math.floor(minutes / 18);
      return sessions >= 2 ? baseXP * 2 : baseXP;
    }

    /**
     * Retourne le nombre de sessions obligatoires (90min chacune) effectuées aujourd'hui.
     * Maximum 2 (au-delà, c'est le bloc bonus).
     * @returns {number}
     */
    getMandatorySessionsToday() {
      const today = new Date().toDateString();
      const dailyMinutes = this.data.focusSessions
        .filter(s => new Date(s.date).toDateString() === today)
        .reduce((sum, s) => sum + s.duration, 0);
      return Math.min(2, Math.floor(dailyMinutes / 90));
    }

    // =========================================================================
    // Ajout / soustraction d'XP
    // =========================================================================

    /**
     * Ajoute (ou soustrait) des XP.
     * NE déclenche PAS checkDailyReset — c'est la responsabilité du démarrage.
     *
     * @param {number} amount - Quantité d'XP (peut être négatif)
     * @param {string} reason - Raison affichée dans l'historique
     */
    addXP(amount, reason) {
      var oldTotalXP = this.data.totalXP;

      this.data.totalXP += amount;
      this.data.dailyXP += amount;

      // Empêcher les XP négatifs globaux
      if (this.data.totalXP < 0) this.data.totalXP = 0;
      if (this.data.dailyXP < 0) this.data.dailyXP = 0;

      // Entrée dans l'historique
      this.data.xpHistory.push({
        date: new Date().toISOString(),
        amount,
        reason,
        total: this.data.totalXP
      });

      // Mettre à jour le streak en cache
      const streakResult = this.calculateStreak();
      this.data.currentStreak = streakResult.streak;

      // Vérifier si le rang a changé
      var C = typeof LunalisConstants !== 'undefined' ? LunalisConstants : {};
      var ranks = C.RANKS || [];
      var rankChanged = false;
      var oldRank = null;
      var newRank = null;
      if (ranks.length > 0) {
        oldRank = this._getRankForXP(oldTotalXP, ranks);
        newRank = this._getRankForXP(this.data.totalXP, ranks);
        rankChanged = oldRank.badge !== newRank.badge;
      }

      // Marquer les données comme modifiées
      this.dm.markDirty();

      // Émettre l'événement XP pour les autres modules
      this.emitter.emit('xp:added', {
        amount,
        reason,
        totalXP: this.data.totalXP,
        dailyXP: this.data.dailyXP,
        streak: streakResult.streak,
        graceDaysUsed: streakResult.graceDaysUsed,
        rankChanged: rankChanged,
        newBadge: newRank ? newRank.badge : null
      });

      // Émettre le changement de rang APRÈS xp:added
      if (rankChanged) {
        this.emitter.emit('rank:changed', {
          oldBadge: oldRank.badge,
          newBadge: newRank.badge,
          oldRank: oldRank,
          newRank: newRank
        });
      }
    }

    // =========================================================================
    // Reset quotidien
    // =========================================================================

    /**
     * Vérifie si un reset quotidien est nécessaire et l'applique.
     * À appeler UNE SEULE FOIS au démarrage de l'app.
     * (Pas dans addXP — pattern centralisé)
     */
    checkDailyReset() {
      const today = new Date().toDateString();
      if (this.data.lastDailyReset !== today) {
        this._performDailyReset();
      }
    }

    /**
     * Effectue le reset quotidien.
     * Appelé par checkDailyReset() et par le scheduler de minuit.
     */
    _performDailyReset() {
      this.data.dailyXP = 0;
      this.data.lastDailyReset = new Date().toDateString();
      this.dm.markDirty();
      this.emitter.emit('daily:reset', { date: this.data.lastDailyReset });
    }

    /**
     * Planifie le prochain reset à minuit.
     * S'enchaîne récursivement chaque jour.
     */
    scheduleDailyReset() {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const msUntilMidnight = midnight - now;

      setTimeout(() => {
        this._performDailyReset();
        this.emitter.emit('ui:refresh', { reason: 'daily-reset' });
        this.scheduleDailyReset(); // Reprogram pour le lendemain
      }, msUntilMidnight);
    }

    // =========================================================================
    // Détermination du rang
    // =========================================================================

    /**
     * Retourne le rang actuel basé sur les XP totaux.
     * @returns {{ name: string, xp: number, badge: string, avatar: string }}
     */
    getCurrentRank() {
      var C = typeof LunalisConstants !== 'undefined' ? LunalisConstants : {};
      var ranks = C.RANKS || [];
      return this._getRankForXP(this.data.totalXP, ranks);
    }

    /**
     * Retourne le rang correspondant à un montant d'XP donné.
     * @param {number} xp
     * @param {Array} ranks — Tableau des rangs triés par XP croissant
     * @returns {Object} Rang correspondant (ou premier rang par défaut)
     */
    _getRankForXP(xp, ranks) {
      if (!ranks || ranks.length === 0) return { name: 'Inconnu', xp: 0, badge: 'E', avatar: '?' };
      var rank = ranks[0];
      for (var i = ranks.length - 1; i >= 0; i--) {
        if (xp >= ranks[i].xp) {
          rank = ranks[i];
          break;
        }
      }
      return rank;
    }

    // =========================================================================
    // Calcul du streak (avec tolérance "jour de grâce")
    // =========================================================================

    /**
     * Calcule le streak courant avec la règle du "jour de grâce".
     *
     * Règle : 1 jour manqué par tranche de 7 jours consécutifs est toléré.
     * Les grâces se réinitialisent à chaque fenêtre de 7 jours complète.
     *
     * @returns {{ streak: number, graceDaysUsed: number, graceActive: boolean }}
     */
    calculateStreak() {
      // Construction de la map XP par jour
      const xpByDay = new Map();
      this.data.xpHistory.forEach(entry => {
        const day = new Date(entry.date).toDateString();
        xpByDay.set(day, (xpByDay.get(day) || 0) + entry.amount);
      });

      let streak = 0;
      let graceDaysUsed = 0;
      let daysInCurrentWeek = 0; // Compteur pour la fenêtre de 7 jours
      const today = new Date();

      for (let i = 0; ; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dayStr = date.toDateString();
        const xp = xpByDay.get(dayStr) || 0;

        if (xp >= 15) {
          // Jour valide
          streak++;
          daysInCurrentWeek++;
        } else if (graceDaysUsed < 1) {
          // Jour de grâce disponible — tolérer le jour manqué
          graceDaysUsed++;
          streak++;
          daysInCurrentWeek++;
        } else {
          // Plus de grâce disponible — streak cassé
          break;
        }

        // Réinitialiser les grâces toutes les 7 jours de streak
        if (daysInCurrentWeek >= 7) {
          daysInCurrentWeek = 0;
          graceDaysUsed = 0;
        }
      }

      return {
        streak,
        graceDaysUsed,
        graceActive: graceDaysUsed > 0
      };
    }

    // =========================================================================
    // Streaks spécialisés
    // =========================================================================

    /**
     * Calcule le streak de sessions sport consécutives.
     * @returns {number}
     */
    getSportStreak() {
      let streak = 0;
      const today = new Date();
      while (true) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - streak);
        const dateStr = date.toDateString();
        if (this.data.dailyActions[dateStr]?.sport) {
          streak++;
        } else {
          break;
        }
      }
      return streak;
    }

    /**
     * Calcule le streak de jours avec les 2 blocs obligatoires complétés (≥180min).
     * @returns {number}
     */
    getBlocksStreak() {
      let streak = 0;
      const today = new Date();
      while (true) {
        const date = new Date(today);
        date.setDate(today.getDate() - streak);
        const dayStr = date.toDateString();
        const dailyMinutes = this.data.focusSessions
          .filter(s => new Date(s.date).toDateString() === dayStr)
          .reduce((sum, s) => sum + s.duration, 0);
        if (dailyMinutes >= 180) {
          streak++;
        } else {
          break;
        }
      }
      return streak;
    }

    /**
     * Retourne le maximum de minutes focus effectuées en une seule journée.
     * @returns {number}
     */
    getMaxDailyFocus() {
      const minutesByDay = {};
      this.data.focusSessions.forEach(s => {
        const day = new Date(s.date).toDateString();
        minutesByDay[day] = (minutesByDay[day] || 0) + s.duration;
      });
      const values = Object.values(minutesByDay);
      return values.length ? Math.max(...values) : 0;
    }

    // =========================================================================
    // Taux d'intensité
    // =========================================================================

    /**
     * Calcule le taux d'intensité basé sur les 4 derniers bilans hebdomadaires.
     * @returns {number} Pourcentage 0-100
     */
    calculateIntensityRate() {
      if (!this.data.weeklyReviews || this.data.weeklyReviews.length === 0) return 0;
      const recent = this.data.weeklyReviews.slice(-4);
      const average = recent.reduce((sum, r) => sum + r.percentage, 0) / recent.length;
      return Math.floor(average);
    }

    // =========================================================================
    // Stats pour la progression
    // =========================================================================

    /**
     * Retourne les statistiques globales de progression.
     * @returns {Object}
     */
    getProgressionStats() {
      const totalFocusMinutes = this.data.focusSessions
        .reduce((sum, s) => sum + s.duration, 0);
      const streakResult = this.calculateStreak();

      return {
        totalFocusTime: Math.floor(totalFocusMinutes / 60),
        currentStreak: streakResult.streak,
        graceDaysUsed: streakResult.graceDaysUsed,
        intensityRate: this.calculateIntensityRate(),
        averageSessionLength: this.data.focusSessions.length > 0
          ? Math.floor(totalFocusMinutes / this.data.focusSessions.length)
          : 0
      };
    }

    /**
     * Retourne les XP par jour sur les N derniers jours.
     * @param {number} daysCount
     * @returns {Array<{day, xp, date}>}
     */
    getLastDaysXP(daysCount) {
      const days = [];
      const today = new Date();
      for (let i = daysCount - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' });
        const dayXP = this.data.xpHistory
          .filter(e => new Date(e.date).toDateString() === date.toDateString())
          .reduce((sum, e) => sum + e.amount, 0);
        days.push({ day: dayName, xp: dayXP, date: date.toLocaleDateString('fr-FR') });
      }
      return days;
    }

    /**
     * Retourne le nombre de sessions focus par jour sur les N derniers jours.
     * @param {number} daysCount
     * @returns {Array<{day, sessions, date}>}
     */
    getLastDaysFocus(daysCount) {
      const days = [];
      const today = new Date();
      for (let i = daysCount - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' });
        const sessions = this.data.focusSessions.filter(s => {
          return new Date(s.date).toDateString() === date.toDateString();
        }).length;
        days.push({ day: dayName, sessions, date: date.toLocaleDateString('fr-FR') });
      }
      return days;
    }
  }

  // Exposition
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = XPSystem;
  } else {
    global.XPSystem = XPSystem;
  }
})(typeof window !== 'undefined' ? window : global);

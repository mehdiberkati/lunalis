/**
 * AchievementTracker.js — Gestion des achievements avec persistance réelle.
 *
 * Bug fix majeur : quand un achievement est débloqué, on stocke { id, unlockedAt }
 * dans data.achievements (objet) et on ne revérifie PLUS la condition.
 * Un achievement débloqué ne peut JAMAIS se re-verrouiller, même après un reset de saison.
 *
 * Architecture :
 *  - getDefinitions() : retourne les définitions (conditions, icônes, etc.)
 *  - getAll() : retourne la liste fusionnée (définition + état persisté)
 *  - checkNewUnlocks() : appelé après chaque addXP, vérifie les nouvelles conditions
 */
(function (global) {
  'use strict';

  class AchievementTracker {
    /**
     * @param {DataManager} dataManager
     * @param {XPSystem} xpSystem
     * @param {EventEmitter} emitter
     */
    constructor(dataManager, xpSystem, emitter) {
      this.dm = dataManager;
      this.xp = xpSystem;
      this.emitter = emitter;

      // Écouter les événements XP pour vérifier les déblocages
      this.emitter.on('xp:added', () => this.checkNewUnlocks());
    }

    get data() {
      return this.dm.data;
    }

    // =========================================================================
    // Définitions d'achievements (statique — jamais de state ici)
    // =========================================================================

    /**
     * Retourne les définitions de tous les achievements.
     * Chaque définition contient une fonction condition() qui évalue dynamiquement
     * si la condition est remplie, ainsi que progress() et target pour l'affichage.
     * @returns {Array<Object>}
     */
    getDefinitions() {
      return [
        {
          id: 'first_session',
          name: 'Premier Pas',
          description: 'Complétez votre première session de focus',
          icon: '🎯', xp: 10, tier: 'tier-easy',
          condition: () => this.data.focusSessions.length > 0,
          progress: () => Math.min(1, this.data.focusSessions.length),
          target: 1
        },
        {
          id: 'daily_quota',
          name: 'Quota Quotidien',
          description: 'Atteignez 15 XP en une journée',
          icon: '⚡', xp: 15, tier: 'tier-easy',
          condition: () => this.data.dailyXP >= 15,
          progress: () => this.data.dailyXP,
          target: 15
        },
        {
          id: 'focus_hunter',
          name: 'Chasseur de Focus',
          description: '10 sessions de focus',
          icon: '🏹', xp: 25, tier: 'tier-medium',
          condition: () => this.data.focusSessions.length >= 10,
          progress: () => this.data.focusSessions.length,
          target: 10
        },
        {
          id: 'weekly_warrior',
          name: 'Guerrier Hebdomadaire',
          description: '7 jours consécutifs à 15+ XP',
          icon: '⚔️', xp: 50, tier: 'tier-medium',
          condition: () => this.xp.calculateStreak().streak >= 7,
          progress: () => this.xp.calculateStreak().streak,
          target: 7
        },
        {
          id: 'sport_master',
          name: 'Maître du Sport',
          description: '7 jours consécutifs de sport',
          icon: '🏃', xp: 30, tier: 'tier-medium',
          condition: () => this.xp.getSportStreak() >= 7,
          progress: () => this.xp.getSportStreak(),
          target: 7
        },
        {
          id: 'discipline_forge',
          name: 'Forgeur de Discipline',
          description: "Réaliser 3 jours d'affilée avec les 2 blocs obligatoires",
          icon: '🛡️', xp: 25, tier: 'tier-medium',
          condition: () => this.xp.getBlocksStreak() >= 3,
          progress: () => this.xp.getBlocksStreak(),
          target: 3
        },
        {
          id: 'focus_master',
          name: 'Maître du Focus',
          description: '50 sessions de focus',
          icon: '🧘', xp: 100, tier: 'tier-epic',
          condition: () => this.data.focusSessions.length >= 50,
          progress: () => this.data.focusSessions.length,
          target: 50
        },
        {
          id: 'rank_sentinel',
          name: 'Sentinelle Accomplie',
          description: 'Atteignez le rang S',
          icon: '👑', xp: 50, tier: 'tier-epic',
          condition: () => this.data.totalXP >= 600,
          progress: () => this.data.totalXP,
          target: 600
        },
        {
          id: 'marathoner',
          name: 'Marathonien',
          description: '4h de focus en une journée',
          icon: '🏅', xp: 200, tier: 'tier-epic',
          condition: () => this.xp.getMaxDailyFocus() >= 240,
          progress: () => this.xp.getMaxDailyFocus(),
          target: 240
        },
        {
          id: 'xp_collector',
          name: 'Collectionneur XP',
          description: 'Atteindre 1000 XP total',
          icon: '💠', xp: 150, tier: 'tier-legendary',
          condition: () => this.data.totalXP >= 1000,
          progress: () => this.data.totalXP,
          target: 1000
        },
        {
          id: 'living_legend',
          name: 'Légende Vivante',
          description: '100 sessions de focus',
          icon: '🌠', xp: 300, tier: 'tier-legendary',
          condition: () => this.data.focusSessions.length >= 100,
          progress: () => this.data.focusSessions.length,
          target: 100
        },
        {
          id: 'chosen_one',
          name: "L'Élu",
          description: 'Finir la saison avec le rang SSS',
          icon: '🏆', xp: 1000, tier: 'tier-legendary',
          condition: () => this.data.totalXP >= 750,
          progress: () => this.data.totalXP,
          target: 750
        }
      ];
    }

    // =========================================================================
    // Lecture fusionnée (définitions + état persisté)
    // =========================================================================

    /**
     * Vérifie si un achievement est déjà débloqué (persisté).
     * @param {string} id
     * @returns {boolean}
     */
    isUnlocked(id) {
      return !!(this.data.achievements && this.data.achievements[id]);
    }

    /**
     * Retourne la liste complète des achievements avec leur état.
     * Les achievements débloqués conservent leur date de déblocage.
     * Les achievements verrouillés affichent la progression actuelle.
     * @returns {Array<Object>}
     */
    getAll() {
      const definitions = this.getDefinitions();
      return definitions.map(def => {
        const persisted = this.data.achievements[def.id];
        const unlocked = !!persisted;
        return {
          id: def.id,
          name: def.name,
          description: def.description,
          icon: def.icon,
          xp: def.xp,
          tier: def.tier,
          unlocked,
          unlockedAt: unlocked ? persisted.unlockedAt : null,
          progress: unlocked ? def.target : (typeof def.progress === 'function' ? def.progress() : 0),
          target: def.target
        };
      });
    }

    // =========================================================================
    // Vérification des nouveaux déblocages
    // =========================================================================

    /**
     * Vérifie si de nouveaux achievements doivent être débloqués.
     * Appelé après chaque addXP via l'événement 'xp:added'.
     * Ne re-vérifie PAS les achievements déjà débloqués.
     */
    checkNewUnlocks() {
      const definitions = this.getDefinitions();
      let newUnlocks = [];

      definitions.forEach(def => {
        // SKIP si déjà débloqué — ne JAMAIS revérifier
        if (this.isUnlocked(def.id)) return;

        // Évaluer la condition
        try {
          if (def.condition()) {
            this._unlock(def);
            newUnlocks.push(def);
          }
        } catch (err) {
          console.error(`[AchievementTracker] Erreur condition "${def.id}":`, err);
        }
      });

      // Émettre un événement si de nouveaux achievements sont débloqués
      if (newUnlocks.length > 0) {
        this.emitter.emit('achievement:unlocked', { achievements: newUnlocks });
      }
    }

    /**
     * Persiste le déblocage d'un achievement.
     * @param {Object} def - Définition de l'achievement
     */
    _unlock(def) {
      if (!this.data.achievements) {
        this.data.achievements = {};
      }
      this.data.achievements[def.id] = {
        unlockedAt: new Date().toISOString()
      };
      this.dm.markDirty();
    }
  }

  // Exposition
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AchievementTracker;
  } else {
    global.AchievementTracker = AchievementTracker;
  }
})(typeof window !== 'undefined' ? window : global);

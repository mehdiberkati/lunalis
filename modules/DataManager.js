/**
 * DataManager.js — Source unique de vérité pour les données persistantes.
 *
 * Responsabilités :
 *  - Charger/sauvegarder les données depuis localStorage
 *  - Fournir les données par défaut et la migration de versions
 *  - Export JSON et import avec validation
 *  - Auto-save via dirty flag (pas de saveData() dispersé)
 *  - Préparer l'architecture pour un futur passage IPC/fichier
 *
 * Architecture dirty flag :
 *  Chaque modification de données appelle markDirty().
 *  L'auto-save toutes les 30s vérifie le flag et sauvegarde si nécessaire.
 *  Les opérations critiques peuvent forcer une sauvegarde immédiate.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'myRPGLifeData';
  const CURRENT_VERSION = 2; // Version 2 : achievements comme objet { id: { unlockedAt } }
  const AUTO_SAVE_INTERVAL = 30000; // 30 secondes

  class DataManager {
    /**
     * @param {EventEmitter} emitter - Bus d'événements global
     */
    constructor(emitter) {
      this.emitter = emitter;
      this._dirty = false;
      this._autoSaveTimer = null;

      /** Données chargées en mémoire — source unique de vérité */
      this.data = this._loadFromStorage();
    }

    // =========================================================================
    // Données par défaut
    // =========================================================================

    /**
     * Retourne la structure de données fraîche (nouvelle saison ou reset).
     * @returns {Object}
     */
    getDefaultData() {
      return {
        version: CURRENT_VERSION,
        started: false,
        seasonNumber: 1,
        seasonStartDate: null,
        seasonHistory: [],
        totalXP: 0,
        dailyXP: 0,
        currentStreak: 0,
        lastDailyReset: new Date().toDateString(),
        projects: [],
        focusSessions: [],
        dailyActions: {},
        xpHistory: [],
        // Version 2 : objet indexé par ID pour une persistance réelle
        // Format : { "achievement_id": { unlockedAt: "ISO string" } }
        achievements: {},
        weeklyReviews: [],
        seasonGoalXP: null,
        settings: {
          theme: 'default',
          soundNotifications: true,
          chartRange: 7
        }
      };
    }

    // =========================================================================
    // Migration de données
    // =========================================================================

    /**
     * Applique les migrations nécessaires pour passer d'une ancienne version.
     * @param {Object} data - Données à migrer
     * @param {number} fromVersion
     * @returns {Object} Données migrées
     */
    _migrateData(data, fromVersion) {
      // Migration v0 → v1 (champs de base)
      if (fromVersion < 1) {
        data.version = 1;
        if (!Array.isArray(data.seasonHistory)) data.seasonHistory = [];
        if (!Array.isArray(data.weeklyReviews)) data.weeklyReviews = [];
        if (!data.settings) data.settings = {};
      }

      // Migration v1 → v2 (achievements : tableau → objet indexé par ID)
      if (fromVersion < 2) {
        data.version = 2;
        if (Array.isArray(data.achievements)) {
          // Ancien format : tableau d'IDs ou d'objets { id, unlockedAt }
          const migrated = {};
          data.achievements.forEach(a => {
            if (typeof a === 'string') {
              migrated[a] = { unlockedAt: new Date().toISOString() };
            } else if (a && a.id) {
              migrated[a.id] = { unlockedAt: a.unlockedAt || new Date().toISOString() };
            }
          });
          data.achievements = migrated;
        } else if (!data.achievements || typeof data.achievements !== 'object') {
          data.achievements = {};
        }
        // Ajout du champ currentStreak si absent
        if (typeof data.currentStreak !== 'number') {
          data.currentStreak = 0;
        }
      }

      return data;
    }

    // =========================================================================
    // Chargement
    // =========================================================================

    /**
     * Charge et valide les données depuis localStorage.
     * En cas d'échec, retourne les données par défaut.
     * @returns {Object}
     */
    _loadFromStorage() {
      const defaults = this.getDefaultData();
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults;

        const parsed = JSON.parse(raw);
        if (!this._validateStructure(parsed)) {
          console.warn('[DataManager] Données invalides, utilisation des valeurs par défaut.');
          return defaults;
        }

        // Fusion avec les défauts pour garantir tous les champs
        let data = {
          ...defaults,
          ...parsed,
          settings: { ...defaults.settings, ...(parsed.settings || {}) }
        };

        // Migration si nécessaire
        let version = typeof parsed.version === 'number' ? parsed.version : 0;
        while (version < CURRENT_VERSION) {
          data = this._migrateData(data, version);
          version = typeof data.version === 'number' ? data.version : version + 1;
        }
        data.version = CURRENT_VERSION;

        // Déduction rétrocompatible de "started"
        if (parsed.started === undefined) {
          data.started = (parsed.totalXP > 0) ||
            (Array.isArray(parsed.seasonHistory) && parsed.seasonHistory.length > 0);
        }

        return data;
      } catch (err) {
        console.error('[DataManager] Erreur chargement:', err);
        return defaults;
      }
    }

    /**
     * Validation basique de la structure des données.
     * @param {*} data
     * @returns {boolean}
     */
    _validateStructure(data) {
      if (!data || typeof data !== 'object') return false;
      if (typeof data.totalXP !== 'number') return false;
      // Les tableaux sont optionnels — on les fusionne avec les défauts
      return true;
    }

    // =========================================================================
    // Sauvegarde
    // =========================================================================

    /**
     * Marque les données comme modifiées (déclenche l'auto-save).
     */
    markDirty() {
      this._dirty = true;
    }

    /**
     * Sauvegarde immédiate dans localStorage.
     * À appeler pour les opérations critiques (fin de saison, reset, etc.)
     */
    saveNow() {
      try {
        this.data.version = CURRENT_VERSION;
        this.data.lastSaved = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        this._dirty = false;
        this.emitter.emit('data:saved', { timestamp: this.data.lastSaved });
      } catch (err) {
        console.error('[DataManager] Erreur sauvegarde:', err);
      }
    }

    /**
     * Démarre l'auto-save périodique.
     * Ne sauvegarde que si des données ont changé (dirty flag).
     */
    startAutoSave() {
      if (this._autoSaveTimer) clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = setInterval(() => {
        if (this._dirty) {
          this.saveNow();
        }
      }, AUTO_SAVE_INTERVAL);
    }

    /**
     * Arrête l'auto-save (utile pour les tests).
     */
    stopAutoSave() {
      if (this._autoSaveTimer) {
        clearInterval(this._autoSaveTimer);
        this._autoSaveTimer = null;
      }
    }

    // =========================================================================
    // Export / Import
    // =========================================================================

    /**
     * Exporte toutes les données en fichier JSON téléchargeable.
     */
    exportToFile() {
      const filename = `lunalis-backup-${new Date().toISOString().split('T')[0]}.json`;
      const dataStr = JSON.stringify(this.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }

    /**
     * Importe des données depuis un fichier JSON.
     * Fusionne avec les données actuelles après validation.
     * @param {Function} onSuccess - Callback en cas de succès
     * @param {Function} onError - Callback en cas d'erreur
     */
    importFromFile(onSuccess, onError) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const imported = JSON.parse(evt.target.result);
            // Validation stricte via validateData (validation.js)
            var validation = (typeof validateData === 'function')
              ? validateData(imported)
              : { valid: this._validateStructure(imported), errors: [] };
            if (!validation.valid) {
              throw new Error('Format de données invalide: ' + (validation.errors || []).join(', '));
            }
            // Fusion : les données importées écrasent les actuelles
            this.data = { ...this.data, ...imported };
            this.saveNow();
            this.emitter.emit('data:imported', {});
            if (onSuccess) onSuccess();
          } catch (err) {
            console.error('[DataManager] Erreur import:', err);
            if (onError) onError(err);
          }
        };
        reader.readAsText(file);
      };

      input.click();
    }

    /**
     * Réinitialise toutes les données sauf les achievements et settings.
     * Préserve également l'historique des saisons.
     */
    resetAllData() {
      const preserved = {
        achievements: this.data.achievements,
        settings: this.data.settings,
        seasonHistory: this.data.seasonHistory
      };

      this.data = this.getDefaultData();
      this.data.achievements = preserved.achievements;
      this.data.settings = preserved.settings;
      this.data.seasonHistory = preserved.seasonHistory;

      this.saveNow();
      this.emitter.emit('data:reset', {});
    }
  }

  // Exposition
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataManager;
  } else {
    global.DataManager = DataManager;
  }
})(typeof window !== 'undefined' ? window : global);

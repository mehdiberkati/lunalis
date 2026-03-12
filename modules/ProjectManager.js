/**
 * ProjectManager.js — CRUD projets, stats par projet, sélecteur.
 *
 * Responsabilités :
 *  - Créer, modifier, supprimer des projets
 *  - Calculer les stats focus par projet
 *  - Fournir la liste pour le sélecteur dans le timer
 */
(function (global) {
  'use strict';

  class ProjectManager {
    /**
     * @param {DataManager} dataManager
     * @param {EventEmitter} emitter
     */
    constructor(dataManager, emitter) {
      this.dm = dataManager;
      this.emitter = emitter;
      /** @type {number|null} ID du projet en cours d'édition */
      this.editingProjectId = null;
    }

    get data() {
      return this.dm.data;
    }

    // =========================================================================
    // CRUD
    // =========================================================================

    /**
     * Retourne tous les projets.
     * @returns {Array<Object>}
     */
    getAll() {
      return this.data.projects || [];
    }

    /**
     * Retourne un projet par son ID.
     * @param {number} id
     * @returns {Object|null}
     */
    getById(id) {
      return this.data.projects.find(p => p.id === id) || null;
    }

    /**
     * Crée un nouveau projet.
     * @param {Object} params
     * @param {string} params.name
     * @param {string} [params.description]
     * @param {number} [params.timeGoal] - Objectif en heures
     * @returns {Object} Le projet créé
     */
    create(params) {
      const project = {
        id: Date.now(),
        name: params.name.trim(),
        description: params.description ? params.description.trim() : '',
        timeGoal: params.timeGoal || 0,
        createdAt: new Date().toISOString(),
        totalTime: 0
      };

      this.data.projects.push(project);
      this.dm.markDirty();
      this.emitter.emit('project:created', project);
      return project;
    }

    /**
     * Met à jour un projet existant.
     * @param {number} id
     * @param {Object} params
     * @returns {Object|null} Le projet mis à jour
     */
    update(id, params) {
      const project = this.getById(id);
      if (!project) return null;

      if (params.name !== undefined) project.name = params.name.trim();
      if (params.description !== undefined) project.description = params.description.trim();
      if (params.timeGoal !== undefined) project.timeGoal = params.timeGoal || 0;

      this.dm.markDirty();
      this.emitter.emit('project:updated', project);
      return project;
    }

    /**
     * Supprime un projet par son ID.
     * @param {number} id
     * @returns {boolean} true si le projet a été supprimé
     */
    delete(id) {
      const index = this.data.projects.findIndex(p => p.id === id);
      if (index === -1) return false;

      this.data.projects.splice(index, 1);
      this.dm.markDirty();
      this.emitter.emit('project:deleted', { id });
      return true;
    }

    // =========================================================================
    // Stats par projet
    // =========================================================================

    /**
     * Retourne les stats focus par projet (temps total, sessions).
     * @returns {Array<{name, totalTime, sessions}>}
     */
    getFocusStats() {
      const stats = new Map();

      // "Général" pour les sessions sans projet
      stats.set(null, { name: 'Général', totalTime: 0, sessions: 0 });

      // Initialiser avec tous les projets
      this.data.projects.forEach(p => {
        stats.set(p.id, { name: p.name, totalTime: 0, sessions: 0 });
      });

      // Cumuler les sessions
      this.data.focusSessions.forEach(session => {
        const projectId = session.project;
        if (stats.has(projectId)) {
          stats.get(projectId).totalTime += session.duration;
          stats.get(projectId).sessions += 1;
        }
      });

      return Array.from(stats.values())
        .filter(s => s.sessions > 0)
        .sort((a, b) => b.totalTime - a.totalTime);
    }

    // =========================================================================
    // État d'édition (pour l'UI formulaire)
    // =========================================================================

    /**
     * Démarre l'édition d'un projet.
     * @param {number|null} id - null pour un nouveau projet
     */
    startEditing(id) {
      this.editingProjectId = id;
    }

    /**
     * Annule l'édition en cours.
     */
    cancelEditing() {
      this.editingProjectId = null;
    }

    /**
     * Sauvegarde le formulaire (création ou mise à jour).
     * @param {Object} formData - { name, description, timeGoal }
     * @returns {Object|null}
     */
    saveFromForm(formData) {
      if (!formData.name || !formData.name.trim()) return null;

      let result;
      if (this.editingProjectId) {
        result = this.update(this.editingProjectId, formData);
      } else {
        result = this.create(formData);
      }

      this.editingProjectId = null;
      return result;
    }
  }

  // Exposition
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectManager;
  } else {
    global.ProjectManager = ProjectManager;
  }
})(typeof window !== 'undefined' ? window : global);

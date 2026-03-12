/**
 * AvatarRenderer.js — Rendu du personnage SVG sur le dashboard.
 *
 * Crée un personnage en SVG art cyberpunk/anime qui évolue visuellement
 * selon le rang (E à SSS). Les classes CSS contrôlent couleurs et effets.
 *
 * Layers SVG (du fond vers l'avant) :
 *  1. Aura (lueur diffuse, D+)
 *  2. Cape d'énergie (SS+)
 *  3. Corps / manteau
 *  4. Lignes d'énergie (B+)
 *  5. Armure épaules (S+)
 *  6. Épaules + Capuche + Visage + Yeux
 *  7. Flammes (A+)
 *  8. Particules (C+)
 *  9. Halo (SSS)
 */
(function (global) {
  'use strict';

  /** Ordre des badges pour indexation rapide. */
  var BADGE_ORDER = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

  class AvatarRenderer {
    /**
     * @param {EventEmitter|null} emitter — Bus d'événements (optionnel pour les tests)
     */
    constructor(emitter) {
      this.emitter = emitter || null;
      this.currentBadge = 'E';
      this._container = null;
    }

    // =========================================================================
    // API publique
    // =========================================================================

    /**
     * Initialise le renderer : injecte le SVG dans le conteneur DOM.
     * @param {string} containerId — ID du conteneur HTML
     */
    init(containerId) {
      if (typeof document === 'undefined') return;
      this._container = document.getElementById(containerId);
      if (!this._container) return;
      this._container.innerHTML = this._buildSVG();
      this._applyRank(this.currentBadge);
    }

    /**
     * Met à jour le rang affiché (sans animation).
     * @param {string} badge — Badge du rang (E, D, C, B, A, S, SS, SSS)
     * @returns {string} Ancien badge
     */
    setRank(badge) {
      var prev = this.currentBadge;
      this.currentBadge = badge;
      this._applyRank(badge);
      return prev;
    }

    /**
     * Retourne l'index du rang (0 = E, 7 = SSS).
     * @param {string} badge
     * @returns {number}
     */
    getRankIndex(badge) {
      var idx = BADGE_ORDER.indexOf(badge);
      return idx >= 0 ? idx : 0;
    }

    /**
     * Animation flash lors d'un gain d'XP.
     * Ajoute temporairement la classe CSS .avatar-xp-flash.
     */
    flashXP() {
      if (!this._container) return;
      var c = this._container;
      c.classList.remove('avatar-xp-flash');
      // Force reflow pour relancer l'animation si déjà en cours
      void c.offsetWidth;
      c.classList.add('avatar-xp-flash');
      setTimeout(function () { c.classList.remove('avatar-xp-flash'); }, 700);
    }

    /**
     * Animation de montée de rang.
     * Phase 1 : pulse + dissolution (600ms)
     * Phase 2 : nouveau rang + apparition (800ms)
     *
     * @param {string} oldBadge
     * @param {string} newBadge
     */
    playRankUp(oldBadge, newBadge) {
      if (!this._container) return;
      var self = this;
      var c = this._container;

      // Phase 1 : dissolution du rang actuel
      c.classList.add('avatar-rank-up');

      setTimeout(function () {
        // Phase 2 : appliquer le nouveau rang + reveal
        self.setRank(newBadge);
        c.classList.remove('avatar-rank-up');
        c.classList.add('avatar-rank-reveal');

        setTimeout(function () {
          c.classList.remove('avatar-rank-reveal');
        }, 800);
      }, 600);
    }

    // =========================================================================
    // Méthodes internes
    // =========================================================================

    /**
     * Applique la classe CSS correspondant au rang sur le conteneur.
     * @param {string} badge
     */
    _applyRank(badge) {
      if (!this._container) return;
      var c = this._container;
      BADGE_ORDER.forEach(function (b) {
        c.classList.remove('avatar-rank-' + b.toLowerCase());
      });
      c.classList.add('avatar-rank-' + badge.toLowerCase());
    }

    /**
     * Construit le SVG complet du personnage.
     * Tous les layers sont présents ; la visibilité est contrôlée par CSS.
     * @returns {string} SVG inline
     */
    _buildSVG() {
      return [
        '<svg class="avatar-svg" viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">',

        // === Définitions (filtres) ===
        '<defs>',
        '  <filter id="avGlow">',
        '    <feGaussianBlur stdDeviation="3" result="b"/>',
        '    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>',
        '  </filter>',
        '  <filter id="avGlowStrong">',
        '    <feGaussianBlur stdDeviation="6" result="b"/>',
        '    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>',
        '  </filter>',
        '</defs>',

        // === 1. Aura (arrière-plan diffus) ===
        '<circle class="av-aura" cx="100" cy="155" r="85"/>',

        // === 2. Cape d'énergie (SS+) ===
        '<path class="av-cape" d="M48,118 Q20,190 12,280 Q55,260 100,268 Q145,260 188,280 Q180,190 152,118"/>',

        // === 3. Corps / manteau ===
        '<path class="av-body" d="M50,118 L28,282 L76,265 L78,285 L122,285 L124,265 L172,282 L150,118 Z"/>',

        // === 4. Lignes d'énergie (B+) ===
        '<g class="av-lines">',
        '  <line x1="66" y1="135" x2="48" y2="262"/>',
        '  <line x1="134" y1="135" x2="152" y2="262"/>',
        '  <line x1="100" y1="122" x2="100" y2="278"/>',
        '</g>',

        // === 5. Armure épaules (S+) ===
        '<g class="av-armor">',
        '  <path class="av-plate" d="M45,115 L28,128 L35,145 L58,130 Z"/>',
        '  <path class="av-plate" d="M155,115 L172,128 L165,145 L142,130 Z"/>',
        '</g>',

        // === 6a. Épaules ===
        '<path class="av-shoulders" d="M50,118 Q100,100 150,118"/>',

        // === 6b. Capuche ===
        '<path class="av-hood" d="M100,18 C62,18 45,50 45,82 L45,98 C45,112 68,122 100,122 C132,122 155,112 155,98 L155,82 C155,50 138,18 100,18 Z"/>',

        // === 6c. Visage (ombre sous la capuche) ===
        '<ellipse class="av-face" cx="100" cy="90" rx="30" ry="22"/>',

        // === 6d. Yeux ===
        '<g class="av-eyes">',
        '  <ellipse class="av-eye" cx="86" cy="88" rx="4.5" ry="2.5"/>',
        '  <ellipse class="av-eye" cx="114" cy="88" rx="4.5" ry="2.5"/>',
        '</g>',

        // === 7. Flammes (A+) ===
        '<g class="av-flames">',
        '  <path class="av-flame" d="M58,282 Q48,248 60,222 Q72,248 58,282 Z"/>',
        '  <path class="av-flame" d="M100,288 Q88,248 102,215 Q116,248 100,288 Z"/>',
        '  <path class="av-flame" d="M142,282 Q132,248 144,218 Q156,248 142,282 Z"/>',
        '</g>',

        // === 8. Particules (C+) ===
        '<g class="av-particles">',
        '  <circle class="av-p" cx="32" cy="75" r="3"/>',
        '  <circle class="av-p" cx="168" cy="90" r="2.5"/>',
        '  <circle class="av-p" cx="25" cy="185" r="2"/>',
        '  <circle class="av-p" cx="175" cy="175" r="3"/>',
        '  <circle class="av-p" cx="40" cy="245" r="2.5"/>',
        '  <circle class="av-p" cx="160" cy="55" r="2"/>',
        '  <circle class="av-p" cx="48" cy="135" r="1.5"/>',
        '  <circle class="av-p" cx="152" cy="235" r="2"/>',
        '</g>',

        // === 9. Halo (SSS) ===
        '<ellipse class="av-halo" cx="100" cy="15" rx="35" ry="8"/>',

        '</svg>'
      ].join('\n');
    }
  }

  // Exposition IIFE (navigateur + Node.js)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AvatarRenderer;
  } else {
    global.AvatarRenderer = AvatarRenderer;
  }
})(typeof window !== 'undefined' ? window : global);

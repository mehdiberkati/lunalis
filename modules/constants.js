/**
 * constants.js — Source unique de vérité pour toutes les constantes de Lunalis.
 * Importé par tous les modules. Fonctionne en Node.js (Jest) et en navigateur.
 */
(function (global) {
  'use strict';

  /** Tableau des rangs, du plus bas au plus haut. */
  const RANKS = [
    { name: 'Paumé improductif',            xp: 0,   badge: 'E',   avatar: '😵' },
    { name: 'Le Spectateur de Sa Vie',       xp: 200, badge: 'D',   avatar: '🎯' },
    { name: "L'Errant du Crépuscule",        xp: 300, badge: 'C',   avatar: '⚡' },
    { name: 'Le Stratège Naissant',          xp: 400, badge: 'B',   avatar: '🔥' },
    { name: 'Le Vétéran',                    xp: 500, badge: 'A',   avatar: '💎' },
    { name: "Sentinelle de l'Ascension",     xp: 600, badge: 'S',   avatar: '👑' },
    { name: 'Le Paragon du Zénith',          xp: 700, badge: 'SS',  avatar: '🌟' },
    { name: 'Élu du Destin',                 xp: 750, badge: 'SSS', avatar: '🌙' }
  ];

  /** Niveaux d'intensité basés sur le taux hebdomadaire (%). */
  const INTENSITY_LEVELS = [
    {
      min: 0, max: 39,
      emoji: '👤', title: 'Errant du Néant', role: 'Déserteur',
      description: "Tu n'es pas encore dans le Game. Tu fuis tes missions, tu manques de régularité et d'effort soutenu. Rien n'est encore vraiment enclenché.",
      color: 'linear-gradient(#666,#000)', glow: '#888888'
    },
    {
      min: 40, max: 59,
      emoji: '⚖️', title: 'Survivant', role: 'Inconstant',
      description: "Tu fais le strict minimum. Tu es plus dans la réaction que dans l'action. Tu avances à petits pas, mais sans vraie direction ou maîtrise.",
      color: '#16a34a'
    },
    {
      min: 60, max: 74,
      emoji: '🔥', title: 'Forgeron de Volonté', role: 'Bâtisseur Stable',
      description: "Tu commences à structurer, à créer une base solide. Tu avances, tu construis, mais tu t'arrêtes parfois en chemin. Il manque encore de la régularité.",
      color: '#f97316'
    },
    {
      min: 75, max: 84,
      emoji: '💎', title: 'Artisan du Focus', role: 'Fort & cohérent',
      description: "Tu produis régulièrement, tu tiens tes engagements. Tu gagnes du terrain, tu consolides ton système. La constance commence à porter ses fruits.",
      color: 'linear-gradient(#0911b0,#7408c7)'
    },
    {
      min: 85, max: 94,
      emoji: '⚔️', title: 'Champion du Flow', role: 'Leader Ultra discipliné',
      description: "Tu incarnes la discipline et la constance. Tu avances avec puissance, tu es fiable et tu inspires ceux qui t'observent. Ton momentum est fort.",
      color: '#dc2626'
    },
    {
      min: 95, max: 100,
      emoji: '🌌', title: 'Transcendant', role: 'Maître',
      description: "Tu exploses tous tes objectifs. Tu es en pleine fusion avec ta mission. Rien ne peut t'arrêter : tu es aligné, focus, inarrêtable.",
      color: 'linear-gradient(45deg,#2c1b7e,#601ebd,#007acc,#39b54a)', glow: '#9b5de5'
    }
  ];

  /** XP minimum par jour pour valider le streak. */
  const STREAK_XP_THRESHOLD = 15;

  /** Durée d'une saison en jours. */
  const SEASON_DURATION_DAYS = 42;

  /** Durée de session obligatoire pour compter comme "bloc" (en minutes). */
  const MANDATORY_BLOCK_DURATION = 90;

  /** Nombre de blocs obligatoires par jour. */
  const MANDATORY_BLOCKS_COUNT = 2;

  /** Diviseur XP focus (minutes / XP_FOCUS_DIVISOR = XP de base). */
  const XP_FOCUS_DIVISOR = 18;

  /** Labels des rangs pour l'objectif de saison. */
  const SEASON_GOAL_LABELS = {
    500: "Le Vétéran (A)",
    600: "Sentinelle de l'Ascension (S)",
    700: "Le Paragon du Zénith (SS)",
    750: "Élu du Destin (SSS)"
  };

  /** Helper : extrait la première couleur hexadécimale d'un gradient ou retourne la couleur brute. */
  function extractBaseColor(color) {
    if (color.startsWith('linear-gradient')) {
      const match = color.match(/#(?:[0-9a-fA-F]{3,6})/);
      return match ? match[0] : '#ffffff';
    }
    return color;
  }

  /** Helper : éclaircit une couleur hex d'un pourcentage donné. */
  function lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const r = (num >> 16) + amt;
    const g = ((num >> 8) & 0x00ff) + amt;
    const b = (num & 0x00ff) + amt;
    const clamp = v => Math.max(0, Math.min(255, v));
    return '#' + ((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1);
  }

  /** Helper : convertit hex en rgba. */
  function hexToRgba(hex, alpha) {
    if (alpha === undefined) alpha = 1;
    const num = parseInt(hex.replace('#', ''), 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  const LunalisConstants = {
    RANKS,
    INTENSITY_LEVELS,
    STREAK_XP_THRESHOLD,
    SEASON_DURATION_DAYS,
    MANDATORY_BLOCK_DURATION,
    MANDATORY_BLOCKS_COUNT,
    XP_FOCUS_DIVISOR,
    SEASON_GOAL_LABELS,
    extractBaseColor,
    lightenColor,
    hexToRgba
  };

  // Exposition
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LunalisConstants;
  } else {
    global.LunalisConstants = LunalisConstants;
  }
})(typeof window !== 'undefined' ? window : global);

/**
 * Tests unitaires pour AvatarRenderer.
 *
 * On teste la logique pure (sans DOM) :
 *  - Constructeur, valeurs par défaut
 *  - getRankIndex() — mapping badge → index
 *  - setRank() — mise à jour du badge courant
 *  - _buildSVG() — contenu du SVG (layers attendus)
 *  - Méthodes DOM-dépendantes ne plantent pas sans conteneur
 */
const AvatarRenderer = require('../modules/AvatarRenderer');

describe('AvatarRenderer', () => {
  let avatar;

  beforeEach(() => {
    avatar = new AvatarRenderer(null);
  });

  // =========================================================================
  // Constructeur
  // =========================================================================

  test('constructor initialise les valeurs par défaut', () => {
    expect(avatar.currentBadge).toBe('E');
    expect(avatar._container).toBeNull();
    expect(avatar.emitter).toBeNull();
  });

  test('constructor accepte un emitter', () => {
    var fakeEmitter = { on: jest.fn(), emit: jest.fn() };
    var av = new AvatarRenderer(fakeEmitter);
    expect(av.emitter).toBe(fakeEmitter);
  });

  // =========================================================================
  // getRankIndex
  // =========================================================================

  test('getRankIndex retourne l\'index correct pour chaque badge', () => {
    expect(avatar.getRankIndex('E')).toBe(0);
    expect(avatar.getRankIndex('D')).toBe(1);
    expect(avatar.getRankIndex('C')).toBe(2);
    expect(avatar.getRankIndex('B')).toBe(3);
    expect(avatar.getRankIndex('A')).toBe(4);
    expect(avatar.getRankIndex('S')).toBe(5);
    expect(avatar.getRankIndex('SS')).toBe(6);
    expect(avatar.getRankIndex('SSS')).toBe(7);
  });

  test('getRankIndex retourne 0 pour un badge invalide', () => {
    expect(avatar.getRankIndex('X')).toBe(0);
    expect(avatar.getRankIndex('')).toBe(0);
    expect(avatar.getRankIndex('SSSS')).toBe(0);
  });

  // =========================================================================
  // setRank
  // =========================================================================

  test('setRank met à jour currentBadge', () => {
    avatar.setRank('A');
    expect(avatar.currentBadge).toBe('A');
  });

  test('setRank retourne l\'ancien badge', () => {
    var old = avatar.setRank('SS');
    expect(old).toBe('E');
    var old2 = avatar.setRank('SSS');
    expect(old2).toBe('SS');
  });

  test('setRank fonctionne sans conteneur DOM', () => {
    expect(() => avatar.setRank('B')).not.toThrow();
    expect(avatar.currentBadge).toBe('B');
  });

  // =========================================================================
  // _buildSVG
  // =========================================================================

  test('_buildSVG retourne un SVG valide', () => {
    var svg = avatar._buildSVG();
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('viewBox="0 0 200 300"');
  });

  test('_buildSVG contient toutes les couches (layers)', () => {
    var svg = avatar._buildSVG();
    // Couches obligatoires
    expect(svg).toContain('av-hood');
    expect(svg).toContain('av-body');
    expect(svg).toContain('av-face');
    expect(svg).toContain('av-eyes');
    expect(svg).toContain('av-eye');
    expect(svg).toContain('av-shoulders');
    // Couches d'effets
    expect(svg).toContain('av-aura');
    expect(svg).toContain('av-particles');
    expect(svg).toContain('av-flames');
    expect(svg).toContain('av-flame');
    expect(svg).toContain('av-cape');
    expect(svg).toContain('av-halo');
    expect(svg).toContain('av-armor');
    expect(svg).toContain('av-plate');
    expect(svg).toContain('av-lines');
  });

  test('_buildSVG contient les filtres SVG', () => {
    var svg = avatar._buildSVG();
    expect(svg).toContain('<defs>');
    expect(svg).toContain('avGlow');
    expect(svg).toContain('avGlowStrong');
  });

  test('_buildSVG contient 8 particules', () => {
    var svg = avatar._buildSVG();
    var matches = svg.match(/av-p"/g) || svg.match(/class="av-p"/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBe(8);
  });

  test('_buildSVG contient 3 flammes', () => {
    var svg = avatar._buildSVG();
    var matches = svg.match(/class="av-flame"/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBe(3);
  });

  // =========================================================================
  // Méthodes DOM-dépendantes (ne doivent pas planter)
  // =========================================================================

  test('init ne plante pas sans document', () => {
    expect(() => avatar.init('nonExistent')).not.toThrow();
  });

  test('flashXP ne plante pas sans conteneur', () => {
    expect(() => avatar.flashXP()).not.toThrow();
  });

  test('playRankUp ne plante pas sans conteneur', () => {
    expect(() => avatar.playRankUp('E', 'D')).not.toThrow();
  });

  // =========================================================================
  // _applyRank (sans DOM, no-op sûr)
  // =========================================================================

  test('_applyRank ne plante pas sans conteneur', () => {
    expect(() => avatar._applyRank('SSS')).not.toThrow();
  });
});

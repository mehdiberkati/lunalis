const EventEmitter = require('../modules/EventEmitter');
const DataManager = require('../modules/DataManager');
const XPSystem = require('../modules/XPSystem');

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn(key => store[key] || null),
    setItem: jest.fn((key, value) => { store[key] = value; }),
    removeItem: jest.fn(key => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; })
  };
})();
global.localStorage = localStorageMock;

describe('XPSystem', () => {
  let emitter, dm, xp;

  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    emitter = new EventEmitter();
    dm = new DataManager(emitter);
    xp = new XPSystem(dm, emitter);
  });

  afterEach(() => {
    dm.stopAutoSave();
  });

  // =========================================================================
  // calculateFocusXP
  // =========================================================================

  test('calculateFocusXP utilise Math.floor', () => {
    // 25 / 18 = 1.38 → floor = 1
    expect(xp.calculateFocusXP(25, 0)).toBe(1);
    // 90 / 18 = 5
    expect(xp.calculateFocusXP(90, 0)).toBe(5);
    // 17 / 18 = 0.94 → floor = 0
    expect(xp.calculateFocusXP(17, 0)).toBe(0);
  });

  test('calculateFocusXP double après 2 blocs obligatoires', () => {
    // 36 / 18 = 2, x2 = 4
    expect(xp.calculateFocusXP(36, 2)).toBe(4);
    // 90 / 18 = 5, x2 = 10
    expect(xp.calculateFocusXP(90, 3)).toBe(10);
  });

  // =========================================================================
  // addXP
  // =========================================================================

  test('addXP ajoute des XP et émet xp:added', () => {
    const fn = jest.fn();
    emitter.on('xp:added', fn);
    xp.addXP(10, 'Test');
    expect(dm.data.totalXP).toBe(10);
    expect(dm.data.dailyXP).toBe(10);
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({
      amount: 10,
      reason: 'Test',
      totalXP: 10,
      dailyXP: 10
    }));
  });

  test('addXP empêche les XP négatifs', () => {
    xp.addXP(-50, 'Penalty');
    expect(dm.data.totalXP).toBe(0);
    expect(dm.data.dailyXP).toBe(0);
  });

  test('addXP enregistre dans xpHistory', () => {
    xp.addXP(5, 'Test');
    expect(dm.data.xpHistory).toHaveLength(1);
    expect(dm.data.xpHistory[0].amount).toBe(5);
    expect(dm.data.xpHistory[0].reason).toBe('Test');
  });

  test('addXP ne déclenche PAS checkDailyReset', () => {
    // Simuler un jour passé
    dm.data.lastDailyReset = 'Mon Jan 01 2024';
    dm.data.dailyXP = 50;
    xp.addXP(10, 'Test');
    // dailyXP doit être 60 (pas reset à 0+10)
    expect(dm.data.dailyXP).toBe(60);
  });

  // =========================================================================
  // checkDailyReset
  // =========================================================================

  test('checkDailyReset reset si jour différent', () => {
    dm.data.dailyXP = 50;
    dm.data.lastDailyReset = 'Mon Jan 01 2024';
    xp.checkDailyReset();
    expect(dm.data.dailyXP).toBe(0);
    expect(dm.data.lastDailyReset).toBe(new Date().toDateString());
  });

  test('checkDailyReset ne reset pas si même jour', () => {
    dm.data.dailyXP = 50;
    dm.data.lastDailyReset = new Date().toDateString();
    xp.checkDailyReset();
    expect(dm.data.dailyXP).toBe(50);
  });

  // =========================================================================
  // calculateStreak (avec grâce)
  // =========================================================================

  test('calculateStreak retourne 1 (grace) si aucun XP aujourd\'hui', () => {
    // L'algorithme utilise 1 grace day pour aujourd'hui (0 XP < 15)
    // puis casse au jour suivant car plus de grace
    const result = xp.calculateStreak();
    expect(result.streak).toBe(1);
    expect(result.graceDaysUsed).toBe(1);
  });

  test('calculateStreak compte les jours consécutifs à ≥15 XP', () => {
    // Simuler 3 jours d'affilée (aujourd'hui + 2 jours avant)
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      dm.data.xpHistory.push({
        date: date.toISOString(),
        amount: 15,
        reason: 'Test'
      });
    }
    const result = xp.calculateStreak();
    // 3 jours valides + 1 grace day pour le jour -3 = 4
    expect(result.streak).toBe(4);
    expect(result.graceDaysUsed).toBe(1);
  });

  test('calculateStreak tolère 1 jour manqué par semaine (grace day)', () => {
    const today = new Date();
    // Jour 0 (aujourd'hui) : 15 XP
    dm.data.xpHistory.push({ date: today.toISOString(), amount: 15, reason: 'Test' });
    // Jour -1 : manqué (grace day)
    // Jour -2 : 15 XP
    const dayMinus2 = new Date(today);
    dayMinus2.setDate(today.getDate() - 2);
    dm.data.xpHistory.push({ date: dayMinus2.toISOString(), amount: 15, reason: 'Test' });

    const result = xp.calculateStreak();
    expect(result.streak).toBe(3); // aujourd'hui + grace + jour -2
    expect(result.graceDaysUsed).toBe(1);
    expect(result.graceActive).toBe(true);
  });

  test('calculateStreak casse si 2 jours manqués d\'affilée', () => {
    const today = new Date();
    // Jour 0 : 15 XP
    dm.data.xpHistory.push({ date: today.toISOString(), amount: 15, reason: 'Test' });
    // Jour -1 : manqué (grace)
    // Jour -2 : manqué (plus de grace → casse)
    // Jour -3 : 15 XP (ne compte plus)
    const dayMinus3 = new Date(today);
    dayMinus3.setDate(today.getDate() - 3);
    dm.data.xpHistory.push({ date: dayMinus3.toISOString(), amount: 15, reason: 'Test' });

    const result = xp.calculateStreak();
    expect(result.streak).toBe(2); // aujourd'hui + 1 grace
  });

  // =========================================================================
  // calculateIntensityRate
  // =========================================================================

  test('calculateIntensityRate retourne 0 sans reviews', () => {
    expect(xp.calculateIntensityRate()).toBe(0);
  });

  test('calculateIntensityRate utilise Math.floor', () => {
    dm.data.weeklyReviews = [
      { percentage: 70 },
      { percentage: 80 },
      { percentage: 60 },
      { percentage: 91 }
    ];
    // (70+80+60+91) / 4 = 75.25 → floor = 75
    expect(xp.calculateIntensityRate()).toBe(75);
  });
});

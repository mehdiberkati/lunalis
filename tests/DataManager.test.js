const EventEmitter = require('../modules/EventEmitter');
const DataManager = require('../modules/DataManager');

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

describe('DataManager', () => {
  let emitter, dm;

  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    emitter = new EventEmitter();
    dm = new DataManager(emitter);
  });

  afterEach(() => {
    dm.stopAutoSave();
  });

  test('getDefaultData() retourne une structure valide', () => {
    const data = dm.getDefaultData();
    expect(data.version).toBe(2);
    expect(data.totalXP).toBe(0);
    expect(data.achievements).toEqual({});
    expect(Array.isArray(data.projects)).toBe(true);
    expect(Array.isArray(data.focusSessions)).toBe(true);
  });

  test('charge les données par défaut si localStorage est vide', () => {
    expect(dm.data.totalXP).toBe(0);
    expect(dm.data.version).toBe(2);
    expect(dm.data.started).toBe(false);
  });

  test('markDirty() active le dirty flag', () => {
    expect(dm._dirty).toBe(false);
    dm.markDirty();
    expect(dm._dirty).toBe(true);
  });

  test('saveNow() sauvegarde dans localStorage et reset dirty', () => {
    dm.data.totalXP = 100;
    dm.markDirty();
    dm.saveNow();
    expect(dm._dirty).toBe(false);
    expect(localStorageMock.setItem).toHaveBeenCalled();
    const saved = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
    expect(saved.totalXP).toBe(100);
  });

  test('saveNow() émet data:saved', () => {
    const fn = jest.fn();
    emitter.on('data:saved', fn);
    dm.saveNow();
    expect(fn).toHaveBeenCalled();
  });

  test('migration v1 → v2 : achievements array → objet', () => {
    localStorageMock.setItem('myRPGLifeData', JSON.stringify({
      version: 1,
      totalXP: 50,
      dailyXP: 0,
      achievements: ['first_session', 'daily_quota'],
      projects: [],
      focusSessions: [],
      xpHistory: [],
      dailyActions: {}
    }));

    const dm2 = new DataManager(emitter);
    expect(dm2.data.version).toBe(2);
    expect(typeof dm2.data.achievements).toBe('object');
    expect(dm2.data.achievements.first_session).toBeDefined();
    expect(dm2.data.achievements.first_session.unlockedAt).toBeDefined();
    expect(dm2.data.achievements.daily_quota).toBeDefined();
  });

  test('resetAllData() préserve achievements, settings et seasonHistory', () => {
    dm.data.totalXP = 500;
    dm.data.achievements = { test: { unlockedAt: '2024-01-01' } };
    dm.data.settings = { theme: 'fire' };
    dm.data.seasonHistory = [{ season: 1, totalXP: 200 }];

    dm.resetAllData();

    expect(dm.data.totalXP).toBe(0);
    expect(dm.data.achievements.test).toBeDefined();
    expect(dm.data.settings.theme).toBe('fire');
    expect(dm.data.seasonHistory).toHaveLength(1);
  });

  test('startAutoSave() sauvegarde périodiquement si dirty', () => {
    jest.useFakeTimers();
    dm.startAutoSave();
    dm.markDirty();

    jest.advanceTimersByTime(30000);
    expect(localStorageMock.setItem).toHaveBeenCalled();
    expect(dm._dirty).toBe(false);

    jest.useRealTimers();
  });
});

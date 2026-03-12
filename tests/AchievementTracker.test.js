const EventEmitter = require('../modules/EventEmitter');
const DataManager = require('../modules/DataManager');
const XPSystem = require('../modules/XPSystem');
const AchievementTracker = require('../modules/AchievementTracker');

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

describe('AchievementTracker', () => {
  let emitter, dm, xpSys, tracker;

  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    emitter = new EventEmitter();
    dm = new DataManager(emitter);
    xpSys = new XPSystem(dm, emitter);
    tracker = new AchievementTracker(dm, xpSys, emitter);
  });

  afterEach(() => {
    dm.stopAutoSave();
  });

  test('getDefinitions() retourne un tableau de définitions', () => {
    const defs = tracker.getDefinitions();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0]).toHaveProperty('id');
    expect(defs[0]).toHaveProperty('condition');
  });

  test('isUnlocked() retourne false par défaut', () => {
    expect(tracker.isUnlocked('first_session')).toBe(false);
  });

  test('isUnlocked() retourne true après déblocage', () => {
    dm.data.achievements.first_session = { unlockedAt: '2024-01-01' };
    expect(tracker.isUnlocked('first_session')).toBe(true);
  });

  test('getAll() retourne la liste fusionnée', () => {
    const all = tracker.getAll();
    expect(all.length).toBe(tracker.getDefinitions().length);
    expect(all[0]).toHaveProperty('unlocked');
    expect(all[0]).toHaveProperty('progress');
  });

  test('un achievement débloqué a unlocked=true et une date', () => {
    dm.data.achievements.first_session = { unlockedAt: '2024-06-15T12:00:00Z' };
    const all = tracker.getAll();
    const first = all.find(a => a.id === 'first_session');
    expect(first.unlocked).toBe(true);
    expect(first.unlockedAt).toBe('2024-06-15T12:00:00Z');
  });

  test('checkNewUnlocks() débloque first_session quand condition remplie', () => {
    const fn = jest.fn();
    emitter.on('achievement:unlocked', fn);

    // Simuler 1 session focus
    dm.data.focusSessions.push({ date: new Date().toISOString(), duration: 25 });

    tracker.checkNewUnlocks();

    expect(tracker.isUnlocked('first_session')).toBe(true);
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({
      achievements: expect.arrayContaining([
        expect.objectContaining({ id: 'first_session' })
      ])
    }));
  });

  test('checkNewUnlocks() ne revérifie PAS un achievement déjà débloqué', () => {
    // Pré-débloquer
    dm.data.achievements.first_session = { unlockedAt: '2024-01-01' };

    const fn = jest.fn();
    emitter.on('achievement:unlocked', fn);

    // Ajouter la condition
    dm.data.focusSessions.push({ date: new Date().toISOString(), duration: 25 });

    tracker.checkNewUnlocks();

    // L'événement NE doit PAS inclure first_session
    if (fn.mock.calls.length > 0) {
      const unlocked = fn.mock.calls[0][0].achievements;
      expect(unlocked.find(a => a.id === 'first_session')).toBeUndefined();
    }
  });

  test('les achievements persistent même après addXP', () => {
    // Débloquer via condition
    dm.data.focusSessions.push({ date: new Date().toISOString(), duration: 25 });
    tracker.checkNewUnlocks();
    expect(tracker.isUnlocked('first_session')).toBe(true);

    // Simuler un "reset" des conditions (vider les sessions)
    dm.data.focusSessions = [];

    // L'achievement doit RESTER débloqué (persistance)
    expect(tracker.isUnlocked('first_session')).toBe(true);
    const all = tracker.getAll();
    const first = all.find(a => a.id === 'first_session');
    expect(first.unlocked).toBe(true);
  });
});

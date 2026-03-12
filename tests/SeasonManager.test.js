const EventEmitter = require('../modules/EventEmitter');
const DataManager = require('../modules/DataManager');
const SeasonManager = require('../modules/SeasonManager');

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

describe('SeasonManager', () => {
  let emitter, dm, season;

  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    emitter = new EventEmitter();
    dm = new DataManager(emitter);
    season = new SeasonManager(dm, emitter);
  });

  afterEach(() => {
    dm.stopAutoSave();
  });

  test('startApp() initialise les données de saison', () => {
    season.startApp(600);
    expect(dm.data.started).toBe(true);
    expect(dm.data.seasonGoalXP).toBe(600);
    expect(dm.data.seasonStartDate).toBeDefined();
    expect(dm.data.seasonNumber).toBe(1);
  });

  test('getProgress() retourne les bonnes valeurs', () => {
    dm.data.seasonStartDate = new Date().toISOString();
    dm.data.seasonGoalXP = 600;
    dm.data.totalXP = 300;
    dm.data.seasonNumber = 1;

    const progress = season.getProgress();
    expect(progress.daysRemaining).toBeLessThanOrEqual(42);
    expect(progress.seasonNumber).toBe(1);
    expect(progress.goalXP).toBe(600);
    expect(progress.goalPercent).toBe(50);
    expect(progress.goalReached).toBe(false);
  });

  test('getProgress() goalReached=true quand XP ≥ objectif', () => {
    dm.data.seasonStartDate = new Date().toISOString();
    dm.data.seasonGoalXP = 600;
    dm.data.totalXP = 700;

    expect(season.getProgress().goalReached).toBe(true);
  });

  test('checkSeasonReset() ne reset pas si saison pas terminée', () => {
    dm.data.seasonStartDate = new Date().toISOString();
    dm.data.totalXP = 100;
    season.checkSeasonReset();
    expect(dm.data.totalXP).toBe(100);
  });

  test('checkSeasonReset() reset si saison terminée (>42 jours)', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 43);
    dm.data.seasonStartDate = oldDate.toISOString();
    dm.data.totalXP = 300;
    dm.data.seasonNumber = 1;
    dm.data.achievements = { test: { unlockedAt: '2024-01-01' } };

    const fn = jest.fn();
    emitter.on('season:new', fn);

    season.checkSeasonReset();

    expect(dm.data.totalXP).toBe(0);
    expect(dm.data.seasonNumber).toBe(2);
    expect(dm.data.achievements.test).toBeDefined(); // Préservé
    expect(dm.data.seasonHistory).toHaveLength(1);
    expect(fn).toHaveBeenCalled();
  });

  test('getLastSeasonInfo() retourne null sans historique', () => {
    expect(season.getLastSeasonInfo()).toBeNull();
  });

  test('getLastSeasonInfo() retourne la dernière saison', () => {
    dm.data.seasonHistory = [
      { season: 1, totalXP: 200, rank: 'Paumé', badge: 'E' },
      { season: 2, totalXP: 500, rank: 'Le Vétéran', badge: 'A' }
    ];
    const info = season.getLastSeasonInfo();
    expect(info.badge).toBe('A');
    expect(info.rank).toBe('Le Vétéran');
  });

  test('canDoWeeklyReview() retourne true sans review précédent', () => {
    expect(season.canDoWeeklyReview()).toBe(true);
  });

  test('canDoWeeklyReview() retourne false si review < 7 jours', () => {
    dm.data.weeklyReviews.push({ date: new Date().toISOString() });
    expect(season.canDoWeeklyReview()).toBe(false);
  });

  test('canDoWeeklyReview() retourne true si review > 7 jours', () => {
    const old = new Date();
    old.setDate(old.getDate() - 8);
    dm.data.weeklyReviews.push({ date: old.toISOString() });
    expect(season.canDoWeeklyReview()).toBe(true);
  });

  test('submitWeeklyReview() enregistre et émet weekly:submitted', () => {
    const fn = jest.fn();
    emitter.on('weekly:submitted', fn);

    dm.data.seasonStartDate = new Date().toISOString();
    season.submitWeeklyReview({
      productivity: 8, health: 7, creativity: 6, social: 9, satisfaction: 8,
      reflection: 'Good week'
    });

    expect(dm.data.weeklyReviews).toHaveLength(1);
    const review = dm.data.weeklyReviews[0];
    expect(review.totalScore).toBe(38);
    expect(review.percentage).toBe(76);
    expect(review.reflection).toBe('Good week');
    expect(fn).toHaveBeenCalled();
  });
});

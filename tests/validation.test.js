const { validateData } = require('../validation');

describe('validateData', () => {
  function validBase() {
    return {
      version: 2,
      totalXP: 100,
      dailyXP: 10,
      started: true,
      seasonNumber: 1,
      seasonGoalXP: 600,
      seasonStartDate: new Date().toISOString(),
      projects: [{ id: 1, name: 'Test' }],
      focusSessions: [{ date: new Date().toISOString(), duration: 25 }],
      xpHistory: [],
      seasonHistory: [],
      weeklyReviews: [],
      achievements: { first_session: { unlockedAt: '2024-01-01T00:00:00Z' } }
    };
  }

  test('accepte des données valides', () => {
    const result = validateData(validBase());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejette null/undefined', () => {
    expect(validateData(null).valid).toBe(false);
    expect(validateData(undefined).valid).toBe(false);
  });

  test('rejette un tableau', () => {
    expect(validateData([]).valid).toBe(false);
  });

  test('rejette totalXP négatif', () => {
    const data = validBase();
    data.totalXP = -5;
    const result = validateData(data);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/totalXP/);
  });

  test('rejette totalXP non-nombre', () => {
    const data = validBase();
    data.totalXP = 'abc';
    expect(validateData(data).valid).toBe(false);
  });

  test('rejette version invalide', () => {
    const data = validBase();
    data.version = 5;
    expect(validateData(data).valid).toBe(false);
  });

  test('rejette started non-booléen', () => {
    const data = validBase();
    data.started = 'yes';
    expect(validateData(data).valid).toBe(false);
  });

  test('rejette seasonNumber négatif', () => {
    const data = validBase();
    data.seasonNumber = -1;
    expect(validateData(data).valid).toBe(false);
  });

  test('rejette focusSessions non-tableau', () => {
    const data = validBase();
    data.focusSessions = 'not array';
    expect(validateData(data).valid).toBe(false);
  });

  test('rejette focusSession avec date future (>2 ans)', () => {
    const data = validBase();
    const future = new Date();
    future.setFullYear(future.getFullYear() + 3);
    data.focusSessions = [{ date: future.toISOString(), duration: 25 }];
    const result = validateData(data);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/futur/);
  });

  test('rejette focusSession avec duration négative', () => {
    const data = validBase();
    data.focusSessions = [{ date: new Date().toISOString(), duration: -10 }];
    expect(validateData(data).valid).toBe(false);
  });

  test('rejette projet sans name', () => {
    const data = validBase();
    data.projects = [{ id: 1, name: '' }];
    expect(validateData(data).valid).toBe(false);
  });

  test('rejette projet sans id', () => {
    const data = validBase();
    data.projects = [{ name: 'Test' }];
    expect(validateData(data).valid).toBe(false);
  });

  test('accepte achievements v1 (array) pour migration', () => {
    const data = validBase();
    data.achievements = ['first_session'];
    expect(validateData(data).valid).toBe(true);
  });

  test('rejette achievement avec date invalide', () => {
    const data = validBase();
    data.achievements = { test: { unlockedAt: 'not-a-date' } };
    expect(validateData(data).valid).toBe(false);
  });

  test('rejette reflection trop longue', () => {
    const data = validBase();
    data.weeklyReviews = [{ reflection: 'x'.repeat(10001) }];
    expect(validateData(data).valid).toBe(false);
  });

  test('rejette seasonStartDate invalide', () => {
    const data = validBase();
    data.seasonStartDate = 'not-a-date';
    expect(validateData(data).valid).toBe(false);
  });

  test('accepte données minimales (champs optionnels absents)', () => {
    const result = validateData({ totalXP: 0 });
    expect(result.valid).toBe(true);
  });
});

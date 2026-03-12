const { calculateFocusXP, calculateIntensityRate } = require('./xp.js');

test('calculateFocusXP returns base XP with Math.floor', () => {
  // 36 / 18 = 2, pas de bonus
  expect(calculateFocusXP(36, 0)).toBe(2);
  // 25 / 18 = 1.38 -> floor = 1
  expect(calculateFocusXP(25, 0)).toBe(1);
});

test('calculateFocusXP returns bonus XP after mandatory sessions', () => {
  // 36 / 18 = 2, bonus x2 = 4
  expect(calculateFocusXP(36, 2)).toBe(4);
});

test('calculateIntensityRate averages last four weeks with Math.floor', () => {
  const scores = [
    { percentage: 50 },
    { percentage: 70 },
    { percentage: 80 },
    { percentage: 60 },
    { percentage: 90 },
  ];
  // Derniers 4 : 70+80+60+90 = 300 / 4 = 75
  expect(calculateIntensityRate(scores)).toBe(75);
});

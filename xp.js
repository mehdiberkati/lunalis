function calculateFocusXP(minutes, mandatorySessions) {
  const baseXP = Math.floor(minutes / 18);
  const isBonus = mandatorySessions >= 2;
  return baseXP * (isBonus ? 2 : 1);
}

function calculateIntensityRate(weeklyScores) {
  if (!weeklyScores || weeklyScores.length === 0) return 0;
  const recent = weeklyScores.slice(-4);
  const average =
    recent.reduce((sum, score) => sum + score.percentage, 0) / recent.length;
  return Math.floor(average);
}

function getIntensityLabel(rate, intensityLevels) {
  const level = intensityLevels.find((l) => rate >= l.min && rate <= l.max);
  return level ? `${level.emoji} ${level.title}` : 'Errant du Néant';
}

module.exports = {
  calculateFocusXP,
  calculateIntensityRate,
  getIntensityLabel
};

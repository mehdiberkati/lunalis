/**
 * Validation stricte des données importées.
 * Retourne { valid: boolean, errors: string[] }
 */
function validateData(data) {
  var errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['Les données doivent être un objet'] };
  }

  // --- Champs numériques ---
  if (typeof data.totalXP !== 'number' || !isFinite(data.totalXP) || data.totalXP < 0) {
    errors.push('totalXP doit être un nombre >= 0');
  }
  if (data.dailyXP !== undefined && (typeof data.dailyXP !== 'number' || !isFinite(data.dailyXP) || data.dailyXP < 0)) {
    errors.push('dailyXP doit être un nombre >= 0');
  }
  if (data.version !== undefined && (typeof data.version !== 'number' || ![1, 2].includes(data.version))) {
    errors.push('version doit être 1 ou 2');
  }
  if (data.seasonNumber !== undefined && (typeof data.seasonNumber !== 'number' || data.seasonNumber < 0 || data.seasonNumber !== Math.floor(data.seasonNumber))) {
    errors.push('seasonNumber doit être un entier positif');
  }
  if (data.seasonGoalXP !== undefined && (typeof data.seasonGoalXP !== 'number' || !isFinite(data.seasonGoalXP) || data.seasonGoalXP < 0)) {
    errors.push('seasonGoalXP doit être un nombre >= 0');
  }

  // --- Booléens ---
  if (data.started !== undefined && typeof data.started !== 'boolean') {
    errors.push('started doit être un booléen');
  }

  // --- Tableaux ---
  var arrayFields = ['projects', 'focusSessions', 'xpHistory', 'seasonHistory', 'weeklyReviews'];
  for (var i = 0; i < arrayFields.length; i++) {
    var field = arrayFields[i];
    if (data[field] !== undefined && !Array.isArray(data[field])) {
      errors.push(field + ' doit être un tableau');
    }
  }

  // --- Validation des focusSessions ---
  if (Array.isArray(data.focusSessions)) {
    var maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 2);
    for (var j = 0; j < data.focusSessions.length; j++) {
      var session = data.focusSessions[j];
      if (!session || typeof session !== 'object') {
        errors.push('focusSessions[' + j + '] doit être un objet');
        continue;
      }
      if (session.date) {
        var d = new Date(session.date);
        if (isNaN(d.getTime())) {
          errors.push('focusSessions[' + j + '].date invalide');
        } else if (d > maxDate) {
          errors.push('focusSessions[' + j + '].date est trop dans le futur');
        }
      }
      if (session.duration !== undefined && (typeof session.duration !== 'number' || session.duration < 0)) {
        errors.push('focusSessions[' + j + '].duration doit être un nombre positif');
      }
    }
  }

  // --- Validation des projects ---
  if (Array.isArray(data.projects)) {
    for (var k = 0; k < data.projects.length; k++) {
      var project = data.projects[k];
      if (!project || typeof project !== 'object') {
        errors.push('projects[' + k + '] doit être un objet');
        continue;
      }
      if (project.id === undefined || project.id === null) {
        errors.push('projects[' + k + '] doit avoir un id');
      }
      if (typeof project.name !== 'string' || project.name.trim() === '') {
        errors.push('projects[' + k + '].name doit être une chaîne non vide');
      }
    }
  }

  // --- Validation des achievements ---
  if (data.achievements !== undefined) {
    if (Array.isArray(data.achievements)) {
      // v1 format (array of strings) — acceptable for migration
    } else if (typeof data.achievements === 'object' && data.achievements !== null) {
      var keys = Object.keys(data.achievements);
      for (var m = 0; m < keys.length; m++) {
        var ach = data.achievements[keys[m]];
        if (!ach || typeof ach !== 'object') {
          errors.push('achievements.' + keys[m] + ' doit être un objet');
        } else if (ach.unlockedAt && isNaN(new Date(ach.unlockedAt).getTime())) {
          errors.push('achievements.' + keys[m] + '.unlockedAt date invalide');
        }
      }
    } else {
      errors.push('achievements doit être un objet ou un tableau');
    }
  }

  // --- Sanitization des strings (vérification taille) ---
  if (data.seasonStartDate !== undefined) {
    if (typeof data.seasonStartDate === 'string') {
      if (data.seasonStartDate.length > 100) {
        errors.push('seasonStartDate trop long');
      } else if (isNaN(new Date(data.seasonStartDate).getTime())) {
        errors.push('seasonStartDate date invalide');
      }
    } else {
      errors.push('seasonStartDate doit être une chaîne');
    }
  }

  // --- Vérification taille des weekly reviews ---
  if (Array.isArray(data.weeklyReviews)) {
    for (var n = 0; n < data.weeklyReviews.length; n++) {
      var review = data.weeklyReviews[n];
      if (!review || typeof review !== 'object') {
        errors.push('weeklyReviews[' + n + '] doit être un objet');
        continue;
      }
      if (review.reflection && typeof review.reflection === 'string' && review.reflection.length > 10000) {
        errors.push('weeklyReviews[' + n + '].reflection dépasse 10000 caractères');
      }
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateData };
} else {
  window.validateData = validateData;
}

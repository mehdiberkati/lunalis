/**
 * script.js — Orchestrateur léger de Lunalis.
 *
 * Ce fichier instancie tous les modules, les connecte via EventEmitter,
 * et configure les écouteurs DOM. Il expose window.app pour les onclick
 * restants dans index.html.
 *
 * Aucune logique métier ici : tout est délégué aux modules.
 */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  // =========================================================================
  // 1. Instanciation des modules
  // =========================================================================

  var emitter = new EventEmitter();
  var dm = new DataManager(emitter);
  var xp = new XPSystem(dm, emitter);
  var timer = new TimerManager(dm, xp, emitter);
  var pm = new ProjectManager(dm, emitter);
  var season = new SeasonManager(dm, emitter);
  var achievements = new AchievementTracker(dm, xp, emitter);
  var avatar = new AvatarRenderer(emitter);
  var ui = new UIRenderer(emitter, dm, xp, timer, pm, season, achievements);

  // =========================================================================
  // 2. Connexion des événements inter-modules
  // =========================================================================

  ui.bindEvents();

  // --- Avatar SVG : réactions aux événements XP et rang ---
  emitter.on('xp:added', function (d) {
    // Flash uniquement si pas de changement de rang (le rank-up est plus dramatique)
    if (!d.rankChanged) {
      avatar.flashXP();
    }
  });

  emitter.on('rank:changed', function (d) {
    avatar.playRankUp(d.oldBadge, d.newBadge);
  });

  // Événements UI → logique métier
  emitter.on('ui:editProject', function (d) {
    pm.startEditing(d.id);
    var project = pm.getById(d.id);
    if (project) {
      var form = document.getElementById('projectForm');
      var nameInput = document.getElementById('projectName');
      var descInput = document.getElementById('projectDescription');
      var goalInput = document.getElementById('projectTimeGoal');
      if (form) form.style.display = 'block';
      if (nameInput) nameInput.value = project.name;
      if (descInput) descInput.value = project.description || '';
      if (goalInput) goalInput.value = project.timeGoal || '';
    }
  });

  emitter.on('ui:deleteProject', function (d) {
    if (confirm('Supprimer ce projet ?')) {
      pm.delete(d.id);
      ui.renderProjects();
      ui.showNotification('Projet supprimé', 'success');
    }
  });

  emitter.on('ui:submitWeeklyReview', function (review) {
    if (!season.canDoWeeklyReview()) {
      ui.showNotification('Bilan déjà effectué cette semaine', 'info');
      return;
    }
    season.submitWeeklyReview(review);
    xp.addXP(5, 'Bilan Hebdomadaire');
    ui.showNotification('Bilan validé ! +5 XP', 'success');
    ui.renderWeeklyReview();
    ui.updateDashboard();
  });

  emitter.on('ui:logSleep', function (d) {
    var today = new Date().toDateString();
    if (!dm.data.dailyActions[today]) dm.data.dailyActions[today] = {};
    if (dm.data.dailyActions[today].sleep) {
      ui.showNotification('Sommeil déjà enregistré aujourd\'hui', 'info');
      ui.closeModal();
      return;
    }
    dm.data.dailyActions[today].sleep = d.quality;
    var xpGain = d.quality === 'good' ? 2 : (d.quality === 'average' ? 1 : 0);
    if (xpGain > 0) {
      xp.addXP(xpGain, 'Sommeil (' + d.quality + ')');
      ui.showNotification('😴 +' + xpGain + ' XP pour le sommeil !', 'success');
    } else {
      ui.showNotification('😴 Sommeil enregistré (0 XP)', 'info');
    }
    dm.markDirty();
    ui.closeModal();
    ui.updateDashboard();
  });

  emitter.on('ui:logDistraction', function (d) {
    var today = new Date().toDateString();
    if (!dm.data.dailyActions[today]) dm.data.dailyActions[today] = {};
    var penalty = d.type === 'instagram' ? -3 : -5;
    var label = d.type === 'instagram' ? 'Instagram +1h' : 'Musique +1h30';
    xp.addXP(penalty, 'Distraction: ' + label);
    ui.showNotification('📱 ' + penalty + ' XP (' + label + ')', 'warning');
    dm.markDirty();
    ui.closeModal();
    ui.updateDashboard();
  });

  emitter.on('ui:changeTheme', function (d) {
    dm.data.settings.theme = d.theme;
    document.body.className = d.theme === 'default' ? '' : 'theme-' + d.theme;
    dm.markDirty();
  });

  emitter.on('ui:resetData', function () {
    if (confirm('Réinitialiser toutes les données ? Les achievements et paramètres seront conservés.')) {
      dm.resetAllData();
      ui.showNotification('Données réinitialisées', 'success');
      ui.updateAll();
    }
  });

  // =========================================================================
  // 3. Écouteurs DOM
  // =========================================================================

  // Synchro bottom nav avec la section active
  function syncBottomNav(section) {
    document.querySelectorAll('.bottom-nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.section === section);
    });
  }

  // Navigation (sidebar)
  document.querySelectorAll('.nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      ui.showSection(btn.dataset.section);
      syncBottomNav(btn.dataset.section);
      // Fermer le sidebar mobile
      var sidebar = document.getElementById('sidebar');
      var overlay = document.getElementById('sidebarOverlay');
      var hamburger = document.getElementById('hamburgerBtn');
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
      if (hamburger) hamburger.classList.remove('active');
    });
  });

  // Hamburger menu (mobile)
  var hamburgerBtn = document.getElementById('hamburgerBtn');
  var sidebarEl = document.getElementById('sidebar');
  var sidebarOverlay = document.getElementById('sidebarOverlay');

  function toggleSidebar() {
    if (sidebarEl) sidebarEl.classList.toggle('open');
    if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
    if (hamburgerBtn) hamburgerBtn.classList.toggle('active');
  }

  if (hamburgerBtn) hamburgerBtn.addEventListener('click', toggleSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

  // Bottom nav (mobile)
  document.querySelectorAll('.bottom-nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      ui.showSection(btn.dataset.section);
      // Mettre à jour l'état actif du bottom nav
      document.querySelectorAll('.bottom-nav-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

  // Rank card → modale des rangs
  var rankCard = document.getElementById('rankCard');
  if (rankCard) rankCard.addEventListener('click', function () { ui.showRanksModal(); });

  // Intensity card → modale d'intensité
  var intensityCard = document.querySelector('.intensity-card');
  if (intensityCard) intensityCard.addEventListener('click', function () { ui.showIntensityModal(); });

  // Bouton focus principal (dashboard CTA)
  var focusStartBtn = document.getElementById('focusStartBtn');
  if (focusStartBtn) focusStartBtn.addEventListener('click', function () { ui.showSection('focus'); });

  // Timer : Start/Pause
  var startPauseBtn = document.getElementById('startPauseBtn');
  if (startPauseBtn) startPauseBtn.addEventListener('click', function () {
    if (!timer.state.isRunning && !timer.state.isPaused) {
      // Premier démarrage
      var autoBreaks = document.getElementById('autoBreaks');
      var spotifyMode = document.getElementById('spotifyMode');
      var projectSelect = document.getElementById('projectSelect');
      timer.start({
        autoBreaks: autoBreaks ? autoBreaks.checked : false,
        spotifyMode: spotifyMode ? spotifyMode.checked : false,
        projectId: projectSelect ? projectSelect.value : null
      });
    } else {
      timer.toggle();
    }
  });

  // Timer : Annuler
  var resetBtn = document.getElementById('resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', function () { timer.cancel(); });

  // Durée +5 / -5
  var decreaseBtn = document.getElementById('decreaseDurationBtn');
  var increaseBtn = document.getElementById('increaseDurationBtn');
  if (decreaseBtn) decreaseBtn.addEventListener('click', function () { timer.adjustDuration(-5); });
  if (increaseBtn) increaseBtn.addEventListener('click', function () { timer.adjustDuration(5); });

  // Toggle pauses auto → mise à jour affichage
  var autoBreaksToggle = document.getElementById('autoBreaks');
  if (autoBreaksToggle) autoBreaksToggle.addEventListener('change', function () { ui.updateBreakInfo(); });

  // Création projet (bouton + dans le timer)
  var createProjectBtn = document.getElementById('createProjectBtn');
  if (createProjectBtn) createProjectBtn.addEventListener('click', function () { app.showProjectForm(); });

  // Modal : fermeture au clic sur l'overlay (sauf pendant une pause)
  var modalOverlay = document.getElementById('modalOverlay');
  if (modalOverlay) modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay && !timer.state.isBreak) {
      ui.closeModal();
    }
  });

  // Overlay de démarrage
  var startAdventureBtn = document.getElementById('startAdventureBtn');
  var seasonGoalSelect = document.getElementById('seasonGoalSelect');

  if (seasonGoalSelect) {
    seasonGoalSelect.addEventListener('change', function () {
      dm.data.seasonGoalXP = parseInt(seasonGoalSelect.value, 10);
      if (startAdventureBtn) startAdventureBtn.disabled = !dm.data.seasonGoalXP;
      dm.markDirty();
      ui.updateDashboard();
    });
  }

  if (startAdventureBtn) {
    startAdventureBtn.addEventListener('click', function () {
      if (!dm.data.seasonGoalXP) {
        ui.showNotification('Veuillez choisir un objectif de saison.', 'error');
        return;
      }
      season.startApp(dm.data.seasonGoalXP);
      ui.hideStartOverlay();
      ui.updateAll();
      ui.showNotification('Bienvenue dans Lunalis ! Bonne chance !', 'success');
    });
  }

  // =========================================================================
  // 4. API publique (pour les onclick restants dans index.html)
  // =========================================================================

  window.app = {
    // Sport
    logSport: function () {
      var today = new Date().toDateString();
      if (!dm.data.dailyActions[today]) dm.data.dailyActions[today] = {};
      if (dm.data.dailyActions[today].sport) {
        ui.showNotification('Sport déjà enregistré aujourd\'hui', 'info');
        return;
      }
      dm.data.dailyActions[today].sport = true;
      xp.addXP(3, 'Sport (50min)');
      ui.showNotification('💪 +3 XP pour le sport !', 'success');
      dm.markDirty();
      ui.updateDashboard();
    },

    // Modales
    showSleepModal: function () { ui.showSleepModal(); },
    showDistractionModal: function () { ui.showDistractionModal(); },
    closeModal: function () { ui.closeModal(); },

    // Bilan hebdomadaire
    goToWeeklyReview: function () { ui.showSection('weekly'); },

    // Projets
    showProjectForm: function () {
      pm.cancelEditing();
      var form = document.getElementById('projectForm');
      var nameInput = document.getElementById('projectName');
      var descInput = document.getElementById('projectDescription');
      var goalInput = document.getElementById('projectTimeGoal');
      if (form) form.style.display = 'block';
      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
      if (goalInput) goalInput.value = '';
    },

    cancelProject: function () {
      pm.cancelEditing();
      var form = document.getElementById('projectForm');
      if (form) form.style.display = 'none';
    },

    saveProject: function () {
      var nameInput = document.getElementById('projectName');
      var descInput = document.getElementById('projectDescription');
      var goalInput = document.getElementById('projectTimeGoal');
      var result = pm.saveFromForm({
        name: nameInput ? nameInput.value : '',
        description: descInput ? descInput.value : '',
        timeGoal: goalInput ? parseInt(goalInput.value, 10) || 0 : 0
      });
      if (result) {
        var form = document.getElementById('projectForm');
        if (form) form.style.display = 'none';
        ui.renderProjects();
        ui.showNotification('Projet sauvegardé !', 'success');
      } else {
        ui.showNotification('Veuillez entrer un nom de projet', 'error');
      }
    },

    // Double or Nothing
    chooseSafeReward: function () {
      xp.addXP(5, 'Coffre Mystique - Récompense Sûre');
      ui.showNotification('✨ +5 XP de récompense sûre !', 'success');
      var chest = document.getElementById('doubleOrNothingChest');
      if (chest) chest.style.display = 'none';
    },

    chooseDoubleOrNothing: function () {
      var challengeDetails = document.getElementById('challengeDetails');
      if (challengeDetails) challengeDetails.style.display = 'block';
      dm.data.doubleOrNothingActive = true;
      dm.markDirty();
      ui.showNotification('🔥 Défi accepté ! Bonne chance demain !', 'warning');
    }
  };

  // =========================================================================
  // 5. Initialisation au démarrage
  // =========================================================================

  // Appliquer le thème sauvegardé
  var savedTheme = dm.data.settings?.theme || 'default';
  if (savedTheme !== 'default') {
    document.body.className = 'theme-' + savedTheme;
  }

  // Reset quotidien (centralisé — une seule fois au démarrage)
  xp.checkDailyReset();

  // Vérifier si la saison est finie
  season.checkSeasonReset();

  // Planifier le reset de minuit
  xp.scheduleDailyReset();

  // Démarrer l'auto-save (dirty flag)
  dm.startAutoSave();

  // Mise à jour initiale de l'UI
  ui.updateAll();

  // Initialiser l'avatar SVG avec le rang actuel
  avatar.init('avatarScene');
  var currentRank = xp.getCurrentRank();
  avatar.setRank(currentRank.badge);

  // Countdown hebdomadaire
  ui.startWeeklyCountdown();

  // Overlay de démarrage si première utilisation
  if (!dm.data.started) {
    ui.showStartOverlay();
  }
});

/**
 * UIRenderer.js — Tout le rendu HTML : dashboard, progression, settings, modales.
 *
 * Les autres modules lui envoient des données, il les affiche.
 * Ce module est le SEUL à toucher le DOM.
 * Il écoute les événements pour se rafraîchir automatiquement.
 */
(function (global) {
  'use strict';

  /** Opacité du glow sur la valeur d'intensité. */
  var INTENSITY_VALUE_GLOW_OPACITY = 0.4;

  class UIRenderer {
    /**
     * @param {EventEmitter} emitter
     * @param {DataManager} dataManager
     * @param {XPSystem} xpSystem
     * @param {TimerManager} timerManager
     * @param {ProjectManager} projectManager
     * @param {SeasonManager} seasonManager
     * @param {AchievementTracker} achievementTracker
     */
    constructor(emitter, dataManager, xpSystem, timerManager, projectManager, seasonManager, achievementTracker) {
      this.emitter = emitter;
      this.dm = dataManager;
      this.xp = xpSystem;
      this.timer = timerManager;
      this.pm = projectManager;
      this.season = seasonManager;
      this.achievements = achievementTracker;
      this.chartRange = this.data.settings?.chartRange || 7;
      this._weeklyCountdownInterval = null;
    }

    get data() { return this.dm.data; }

    // =========================================================================
    // Initialisation des écouteurs d'événements
    // =========================================================================

    /**
     * Connecte tous les événements aux méthodes de rendu.
     * Appelé par l'orchestrateur après instanciation de tous les modules.
     */
    bindEvents() {
      // Rafraîchissement global
      this.emitter.on('ui:refresh', () => this.updateAll());
      this.emitter.on('xp:added', () => this.updateDashboard());
      this.emitter.on('daily:reset', () => this.updateAll());
      this.emitter.on('data:imported', () => this.updateAll());
      this.emitter.on('data:reset', () => this.updateAll());
      this.emitter.on('season:new', () => this.updateAll());

      // Timer
      this.emitter.on('timer:tick', () => this.updateTimerDisplay());
      this.emitter.on('timer:started', () => this._onTimerStarted());
      this.emitter.on('timer:paused', () => this._onTimerPaused());
      this.emitter.on('timer:completed', (s) => this._onTimerCompleted(s));
      this.emitter.on('timer:cancelled', () => this._onTimerReset());
      this.emitter.on('timer:durationChanged', () => this._onDurationChanged());
      this.emitter.on('timer:break:started', () => this._onBreakStarted());
      this.emitter.on('timer:break:tick', () => this._updateBreakDisplay());
      this.emitter.on('timer:break:ended', () => this._onBreakEnded());

      // Achievements
      this.emitter.on('achievement:unlocked', (d) => this._onAchievementUnlocked(d));

      // Sessions
      this.emitter.on('session:recorded', () => this.updateFocusStats());
    }

    // =========================================================================
    // Rafraîchissement global
    // =========================================================================

    updateAll() {
      this.updateDashboard();
      this.updateTimerDisplay();
      this.updateBreakInfo();
      this.updateFocusStats();
    }

    // =========================================================================
    // DASHBOARD
    // =========================================================================

    updateDashboard() {
      this._updateXPDisplay();
      this._updateChallengeProgress();
      this._updateSeasonGoal();
      this._updateIntensityDisplay();
      this._updateSeasonDisplay();
      this._updateLastSeasonDisplay();
      this._updateRankDisplay();
      this._updateStreakDisplay();
    }

    _updateXPDisplay() {
      var C = typeof LunalisConstants !== 'undefined' ? LunalisConstants : { RANKS: [] };
      var ranks = C.RANKS;

      this._setText('currentXP', this.data.totalXP);
      this._setText('dailyXP', this.data.dailyXP);

      var current = this._getCurrentRank(ranks);
      var currentIdx = ranks.findIndex(function(r) { return r.xp === current.xp; });
      var next = ranks[Math.min(currentIdx + 1, ranks.length - 1)];
      var percent = current.xp === next.xp ? 100
        : Math.min(100, ((this.data.totalXP - current.xp) / (next.xp - current.xp)) * 100);

      this._setStyle('xpFill', 'width', percent + '%');
      this._setText('nextRankXP', next.xp);
    }

    _updateChallengeProgress() {
      var progress = Math.min(100, (this.data.dailyXP / 15) * 100);
      this._setStyle('challengeFill', 'width', progress + '%');
      this._setText('challengeStatus', this.data.dailyXP + '/15 XP');
      var bar = document.getElementById('challengeBar');
      if (bar) bar.style.setProperty('--progress', progress + '%');
    }

    _updateSeasonGoal() {
      var sp = this.season.getProgress();
      this._setStyle('seasonGoalFill', 'width', sp.goalPercent + '%');
      this._setText('seasonGoalText', this.data.totalXP + ' / ' + sp.goalXP + ' XP');
      var block = document.getElementById('seasonGoalBlock');
      if (block) {
        if (sp.goalReached) block.classList.add('goal-achieved');
        else block.classList.remove('goal-achieved');
      }
      var C = typeof LunalisConstants !== 'undefined' ? LunalisConstants : {};
      var label = (C.SEASON_GOAL_LABELS || {})[sp.goalXP] || "Sentinelle de l'Ascension (S)";
      var el = document.getElementById('seasonGoalLabel');
      if (el) el.innerHTML = 'Atteindre le rang <strong>' + label + '</strong>';
    }

    _updateIntensityDisplay() {
      var C = typeof LunalisConstants !== 'undefined' ? LunalisConstants : {};
      var LEVELS = C.INTENSITY_LEVELS || [];
      var rate = this.xp.calculateIntensityRate();
      var valueEl = document.getElementById('intensityValue');
      var labelEl = document.getElementById('intensityLabel');
      var progressEl = document.getElementById('intensityProgress');
      var circleEl = document.getElementById('intensityCircle');
      var card = document.getElementById('intensityCard');
      if (!valueEl || !labelEl || !progressEl || !card) return;

      var level = LEVELS.find(function(l) { return rate >= l.min && rate <= l.max; }) || LEVELS[0];
      if (!level) return;

      valueEl.textContent = rate + '%';
      labelEl.textContent = level.emoji + ' ' + level.title;

      var radius = 75;
      var circumference = 2 * Math.PI * radius;
      var offset = circumference - (Math.min(rate, 100) / 100) * circumference;
      progressEl.style.strokeDasharray = circumference;
      var prev = parseFloat(progressEl.dataset.prevOffset) || circumference;
      progressEl.dataset.prevOffset = offset;
      if (progressEl.animate) {
        progressEl.animate(
          [{ strokeDashoffset: prev }, { strokeDashoffset: offset }],
          { duration: 800, easing: 'ease-out', fill: 'forwards' }
        );
      } else {
        progressEl.style.strokeDashoffset = offset;
      }
      progressEl.style.stroke = level.color;

      var extractBaseColor = C.extractBaseColor || function(c) { return c; };
      var lightenColor = C.lightenColor || function(h) { return h; };
      var hexToRgba = C.hexToRgba || function(h, a) { return h; };

      var base = extractBaseColor(level.color);
      var glow = level.glow || lightenColor(base, 60);
      var text = lightenColor(base, 60);
      card.style.setProperty('--intensity-color', base);
      card.style.setProperty('--intensity-light', glow);
      progressEl.style.filter = 'drop-shadow(0 0 8px ' + glow + ')';
      if (circleEl) circleEl.style.boxShadow = '0 0 12px ' + glow;
      card.style.boxShadow = '0 0 20px ' + glow;
      valueEl.style.color = text;
      valueEl.style.textShadow = '0 0 8px ' + hexToRgba(glow, INTENSITY_VALUE_GLOW_OPACITY);
      labelEl.style.color = text;

      if (rate >= 85) valueEl.classList.add('intensity-glow');
      else valueEl.classList.remove('intensity-glow');
    }

    _updateSeasonDisplay() {
      var sp = this.season.getProgress();
      this._setText('currentSeason', sp.seasonNumber);
      this._setText('currentWeek', sp.weekNumber);
      this._setText('daysRemaining', sp.daysRemaining);
      var fill = document.getElementById('seasonFill');
      if (fill) {
        fill.style.width = sp.percent + '%';
        if (sp.daysRemaining <= 7) fill.classList.add('ending');
        else fill.classList.remove('ending');
      }
    }

    _updateLastSeasonDisplay() {
      var info = this.season.getLastSeasonInfo();
      var card = document.getElementById('lastSeasonCard');
      var rankEl = document.getElementById('lastSeasonRank');
      if (!card || !rankEl) return;
      if (info) {
        card.style.display = 'block';
        rankEl.textContent = info.badge + ' - ' + info.rank;
      } else {
        card.style.display = 'none';
      }
    }

    _updateRankDisplay() {
      var C = typeof LunalisConstants !== 'undefined' ? LunalisConstants : {};
      var ranks = C.RANKS || [];
      var current = this._getCurrentRank(ranks);
      this._setText('rankName', current.name);
      this._setText('rankBadge', current.badge);
      // L'avatar SVG est géré par AvatarRenderer (plus d'emoji)
      var card = document.getElementById('rankCard');
      if (card) {
        ['e','d','c','b','a','s','ss','sss'].forEach(function(b) { card.classList.remove('rank-' + b); });
        card.classList.add('rank-' + current.badge.toLowerCase());
      }
    }

    _updateStreakDisplay() {
      var result = this.xp.calculateStreak();
      this._setText('streakDays', result.streak);
    }

    // =========================================================================
    // TIMER
    // =========================================================================

    updateTimerDisplay() {
      var st = this.timer.getPublicState();
      var m = Math.floor(st.remaining / 60);
      var s = st.remaining % 60;
      this._setText('timerTime', this._pad(m) + ':' + this._pad(s));

      var totalMin = st.duration / 60;
      var xpPreview = this.xp.calculateFocusXP(totalMin);
      this._setText('timerXPPreview', '+' + xpPreview + ' XP');

      var progress = ((st.duration - st.remaining) / st.duration) * 100;
      var timerProgress = document.getElementById('timerProgress');
      if (timerProgress) {
        var c = 2 * Math.PI * 90;
        var off = c - (progress / 100) * c;
        timerProgress.style.strokeDasharray = c;
        timerProgress.style.strokeDashoffset = off;
      }
    }

    updateBreakInfo() {
      var info = document.getElementById('breakInfo');
      var toggle = document.getElementById('autoBreaks');
      if (!info || !toggle) return;
      if (toggle.checked) {
        var bi = this.timer.getBreakInfo();
        info.innerHTML = '<span class="remaining">' + bi.label + '</span>';
      } else {
        info.textContent = '';
      }
    }

    _onTimerStarted() {
      this._setTimerButton('running', 'Pause');
      this._setFocusMode(true);
      this._disableTimerOptions(true);
      this.updateBreakInfo();
    }

    _onTimerPaused() {
      this._setTimerButton(null, 'Reprendre');
      this._setFocusMode(false);
      this._disableTimerOptions(false);
    }

    _onTimerCompleted(state) {
      this._setTimerButton(null, 'Commencer Focus');
      this._setFocusMode(false);
      this._disableTimerOptions(false);
      if (state.xpGained > 1) this._showXPPop(state.xpGained);
      this.showNotification('🎯 Session terminée ! +' + state.xpGained + ' XP', 'success');
      this.updateFocusStats();
      this.updateDashboard();
      this.updateTimerDisplay();
      this.updateBreakInfo();
    }

    _onTimerReset() {
      this._setTimerButton(null, 'Commencer Focus');
      this._setFocusMode(false);
      this._disableTimerOptions(false);
      this.updateFocusStats();
      this.updateDashboard();
      this.updateTimerDisplay();
      this.updateBreakInfo();
    }

    _onDurationChanged() {
      var st = this.timer.getPublicState();
      this._setText('durationDisplay', (st.duration / 60) + ' min');
      this.updateTimerDisplay();
      this.updateBreakInfo();
    }

    _onBreakStarted() {
      this._showBreakModal();
    }

    _updateBreakDisplay() {
      var st = this.timer.getPublicState();
      var el = document.getElementById('breakTimer');
      if (el) {
        var m = Math.floor(st.breakRemaining / 60);
        var s = st.breakRemaining % 60;
        el.textContent = this._pad(m) + ':' + this._pad(s);
      }
    }

    _onBreakEnded() {
      this.closeModal();
    }

    _onAchievementUnlocked(data) {
      var names = data.achievements.map(function(a) { return a.name; }).join(', ');
      this.showNotification('🏆 Achievement débloqué : ' + names, 'success');
    }

    // =========================================================================
    // FOCUS STATS
    // =========================================================================

    updateFocusStats() {
      var todayStr = new Date().toDateString();
      var todaySessions = this.data.focusSessions.filter(function(s) {
        return new Date(s.date).toDateString() === todayStr;
      });
      var dailySessions = todaySessions.length;
      var dailyMinutes = todaySessions.reduce(function(sum, s) { return sum + s.duration; }, 0);
      var seasonMinutes = this.data.focusSessions.reduce(function(sum, s) { return sum + s.duration; }, 0);
      var mandatoryBlocks = Math.min(2, Math.floor(dailyMinutes / 90));

      var dailyFocusXP = this.data.xpHistory
        .filter(function(e) { return new Date(e.date).toDateString() === todayStr && e.reason.indexOf('Session Focus') === 0; })
        .reduce(function(sum, e) { return sum + e.amount; }, 0);

      var streak = this.xp.calculateStreak().streak;

      this._setText('dailySessions', dailySessions);
      this._setText('dailyFocusTime', dailyMinutes + 'min');
      this._setText('seasonFocusTime', Math.floor(seasonMinutes / 60) + 'h');
      this._setText('mandatoryBlocks', mandatoryBlocks + '/2');
      this._setText('dailyFocusXP', dailyFocusXP);
      this._setText('focusStreak', streak);

      this._setStyle('dailyProgressFill', 'width', Math.min(100, (dailySessions / 3) * 100) + '%');

      var block1 = document.getElementById('block1');
      var block2 = document.getElementById('block2');
      var block3 = document.getElementById('block3');
      if (block1) block1.classList.toggle('completed', dailyMinutes >= 90);
      if (block2) block2.classList.toggle('completed', dailyMinutes >= 180);
      if (block3) {
        block3.classList.toggle('locked', dailyMinutes < 180);
        block3.classList.toggle('completed', dailyMinutes >= 270);
      }
    }

    // =========================================================================
    // SECTIONS RENDER (appelées par l'orchestrateur lors de navigation)
    // =========================================================================

    renderProjects() {
      var grid = document.getElementById('projectsGrid');
      if (!grid) return;
      var projects = this.pm.getAll();

      if (projects.length === 0) {
        grid.innerHTML = '<div class="no-projects"><div class="no-projects-icon">📋</div><p>Aucun projet créé pour le moment.</p><p>Créez votre premier projet pour commencer à tracker votre temps !</p></div>';
        this._updateProjectSelector();
        return;
      }

      grid.innerHTML = projects.map(function(p) {
        var pctComplete = p.timeGoal > 0 ? Math.round((p.totalTime / 60) / p.timeGoal * 100) : 0;
        var circumference = 2 * Math.PI * 25;
        var dashoffset = circumference * (1 - Math.min(p.totalTime / 60 / (p.timeGoal || 1), 1));
        return '<div class="project-card">' +
          '<div class="project-header"><h3>' + p.name + '</h3>' +
          '<div class="project-header-right">' +
          '<div class="project-progress-ring"><svg class="progress-ring" width="60" height="60">' +
          '<circle cx="30" cy="30" r="25" class="progress-ring-bg"></circle>' +
          '<circle cx="30" cy="30" r="25" class="progress-ring-fill" style="stroke-dasharray:' + circumference + ';stroke-dashoffset:' + dashoffset + '"></circle>' +
          '</svg><div class="progress-percentage">' + pctComplete + '%</div></div>' +
          '<div class="project-controls">' +
          '<button class="project-edit" data-edit-id="' + p.id + '" aria-label="Modifier">✏️</button>' +
          '<button class="project-delete" data-delete-id="' + p.id + '" aria-label="Supprimer">🗑️</button>' +
          '</div></div></div>' +
          '<p class="project-description">' + (p.description || 'Aucune description') + '</p>' +
          '<div class="project-stats">' +
          '<div class="stat-item"><span class="stat-icon">⏱️</span><div class="stat-content"><div class="stat-value">' + Math.floor(p.totalTime / 60) + 'h ' + (p.totalTime % 60) + 'min</div><div class="stat-label">Temps total</div></div></div>' +
          (p.timeGoal > 0 ?
            '<div class="stat-item"><span class="stat-icon">🎯</span><div class="stat-content"><div class="stat-value">' + p.timeGoal + 'h</div><div class="stat-label">Objectif</div></div></div>' +
            '<div class="stat-item"><span class="stat-icon">📈</span><div class="stat-content"><div class="stat-value">' + Math.max(0, p.timeGoal - Math.floor(p.totalTime / 60)) + 'h</div><div class="stat-label">Restant</div></div></div>'
            : '') +
          '</div></div>';
      }).join('');

      this._updateProjectSelector();
      this._bindProjectButtons();
    }

    _bindProjectButtons() {
      var self = this;
      document.querySelectorAll('[data-edit-id]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          self.emitter.emit('ui:editProject', { id: parseInt(btn.dataset.editId, 10) });
        });
      });
      document.querySelectorAll('[data-delete-id]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          self.emitter.emit('ui:deleteProject', { id: parseInt(btn.dataset.deleteId, 10) });
        });
      });
    }

    _updateProjectSelector() {
      var sel = document.getElementById('projectSelect');
      if (!sel) return;
      var projects = this.pm.getAll();
      sel.innerHTML = '<option value="">Sélectionner un projet</option>' +
        projects.map(function(p) { return '<option value="' + p.id + '">' + p.name + '</option>'; }).join('');
    }

    renderAchievements() {
      var container = document.getElementById('achievementsContent');
      if (!container) return;

      var all = this.achievements.getAll();
      var unlockedCount = all.filter(function(a) { return a.unlocked; }).length;

      var tiers = { 'tier-easy': 'Facile', 'tier-medium': 'Moyen', 'tier-epic': 'Épique', 'tier-legendary': 'Légendaire' };
      var grouped = {};
      Object.keys(tiers).forEach(function(k) { grouped[k] = []; });
      all.forEach(function(a) { if (grouped[a.tier]) grouped[a.tier].push(a); });

      container.innerHTML =
        '<div class="achievements-header"><div class="achievements-stats">' +
        '<div class="achievement-counter"><span class="counter-number">' + unlockedCount + '</span>' +
        '<span class="counter-total">/ ' + all.length + '</span><span class="counter-label">Succès débloqués</span></div>' +
        '<div class="achievement-progress"><div class="progress-bar"><div class="progress-fill" style="width:' + ((unlockedCount / all.length) * 100) + '%"></div></div></div></div></div>' +
        Object.keys(tiers).map(function(tier) {
          return '<h3 class="achievement-group-title">' + tiers[tier] + '</h3><div class="achievements-grid">' +
            grouped[tier].map(function(a) {
              return '<div class="achievement-card ' + tier + ' ' + (a.unlocked ? 'unlocked' : 'locked') + '">' +
                '<div class="achievement-icon">' + a.icon + '</div>' +
                '<div class="achievement-info"><h4>' + a.name + '</h4><p>' + a.description + '</p>' +
                '<div class="achievement-reward">+' + a.xp + ' XP</div>' +
                (a.unlocked
                  ? '<div class="achievement-date">Débloqué le ' + new Date(a.unlockedAt).toLocaleDateString() + '</div>'
                  : '<div class="achievement-progress-text">' + (a.progress || 0) + '/' + (a.target || '?') + '</div>') +
                '</div>' + (a.unlocked ? '<div class="achievement-badge">✓</div>' : '') + '</div>';
            }).join('') + '</div>';
        }).join('');

      // Animation
      var wrapper = document.querySelector('#achievements .achievements-container');
      if (wrapper) {
        wrapper.classList.remove('fade-in-up');
        void wrapper.offsetWidth;
        wrapper.classList.add('fade-in-up');
      }
    }

    renderProgression() {
      var content = document.getElementById('progressionContent');
      if (!content) return;

      var stats = this.xp.getProgressionStats();
      var self = this;

      content.innerHTML =
        '<div class="progression-overview"><div class="stats-cards">' +
        this._statCardLarge('⚡', this.data.totalXP, 'XP Total', 'primary') +
        this._statCardLarge('🎯', stats.totalFocusTime + 'h', 'Temps Focus', 'secondary') +
        this._statCardLarge('🔥', stats.currentStreak, 'Streak Actuel', 'accent') +
        this._statCardLarge('📊', stats.intensityRate + '%', "Taux d'Intensité", 'success') +
        '</div></div>' +
        '<div class="chart-range-select"><label for="chartRange">Période :</label>' +
        '<select id="chartRange"><option value="7">7 jours</option><option value="30">30 jours</option><option value="custom">Personnalisé</option></select>' +
        '<input type="number" id="customRange" min="1" max="365" style="display:none" /></div>' +
        '<div class="progression-charts"><div class="chart-container"><h4>📈 Évolution XP (' + this.chartRange + ' derniers jours)</h4><div class="xp-chart">' + this._renderBarChart(this.xp.getLastDaysXP(this.chartRange), 'xp', 15) + '</div></div>' +
        '<div class="chart-container"><h4>🎯 Sessions Focus par Jour</h4><div class="focus-chart">' + this._renderBarChart(this.xp.getLastDaysFocus(this.chartRange), 'sessions', 3, true) + '</div></div></div>' +
        '<div class="progression-details"><div class="detail-section"><h4>🏆 Progression par Rang</h4>' + this._renderRankProgressBar() + '<div class="ranks-progression">' + this._renderRanksProgression() + '</div></div>' +
        '<div class="detail-section"><h4>📋 Temps Focus par Projet</h4><div class="projects-focus-stats">' + this._renderProjectsFocusStats() + '</div></div></div>' +
        '<div class="progression-details"><div class="detail-section full-width"><h4>📋 Projets les Plus Actifs</h4><div class="projects-stats">' + this._renderProjectsStats() + '</div></div></div>';

      // Bind chart range
      var rangeSelect = document.getElementById('chartRange');
      var customInput = document.getElementById('customRange');
      if (rangeSelect) {
        rangeSelect.value = this.chartRange > 30 ? 'custom' : this.chartRange.toString();
        rangeSelect.addEventListener('change', function() {
          if (rangeSelect.value === 'custom') {
            customInput.style.display = 'inline-block';
          } else {
            customInput.style.display = 'none';
            self.chartRange = parseInt(rangeSelect.value, 10);
            self.data.settings.chartRange = self.chartRange;
            self.renderProgression();
          }
        });
      }
      if (customInput) {
        if (this.chartRange > 30) customInput.value = this.chartRange;
        customInput.addEventListener('change', function() {
          self.chartRange = parseInt(customInput.value, 10) || 7;
          self.data.settings.chartRange = self.chartRange;
          self.renderProgression();
        });
      }

      // Bind chart click
      var xpChart = document.querySelector('.xp-chart');
      if (xpChart) xpChart.addEventListener('click', function() { self._flashElement(xpChart); self._showXPDetails(); });
      var focusChart = document.querySelector('.focus-chart');
      if (focusChart) focusChart.addEventListener('click', function() { self._flashElement(focusChart); self._showFocusDetails(); });
    }

    renderWeeklyReview() {
      var content = document.getElementById('weeklyContent');
      if (!content) return;

      var week = this.season.getCurrentWeekNumber();
      var canReview = this.season.canDoWeeklyReview();
      var self = this;

      content.innerHTML =
        '<div class="weekly-status"><div class="week-info"><h3>Semaine ' + week + ' - Saison ' + (this.data.seasonNumber || 1) + '</h3><p class="week-dates">' + this.season.getWeekDates() + '</p></div>' +
        (canReview ? this._renderWeeklyForm() : this._renderWeeklyCompleted()) +
        '</div><div class="weekly-history"><h4>📈 Historique des Bilans</h4><div class="reviews-grid">' + this._renderWeeklyHistory() + '</div></div>';

      this._setupWeeklySliders();
      this._bindWeeklyHistoryCards();
    }

    async renderSettings() {
      var content = document.getElementById('settingsContent');
      if (!content) return;

      var googleConnected = (typeof window !== 'undefined' && window.electronAPI?.isGoogleConnected)
        ? await window.electronAPI.isGoogleConnected() : false;
      var spotifyConnected = (typeof window !== 'undefined' && window.electronAPI?.isSpotifyConnected)
        ? await window.electronAPI.isSpotifyConnected() : false;

      content.innerHTML = this._settingsHTML(googleConnected, spotifyConnected);
      this._setupSettingsListeners();
    }

    // =========================================================================
    // MODALES & NOTIFICATIONS
    // =========================================================================

    showModal(htmlContent, fullscreen) {
      var modal = document.getElementById('modal');
      var overlay = document.getElementById('modalOverlay');
      if (modal && overlay) {
        modal.innerHTML = htmlContent;
        if (fullscreen) modal.classList.add('fullscreen');
        else modal.classList.remove('fullscreen');
        overlay.style.display = 'flex';
        requestAnimationFrame(function() { overlay.classList.add('show'); });
      }
    }

    closeModal() {
      var overlay = document.getElementById('modalOverlay');
      var modal = document.getElementById('modal');
      if (overlay) {
        overlay.classList.remove('show');
        setTimeout(function() { overlay.style.display = 'none'; }, 300);
      }
      if (modal) modal.classList.remove('fullscreen');
    }

    showNotification(message, type) {
      var container = document.getElementById('notifications');
      if (!container) return;
      var el = document.createElement('div');
      el.className = 'notification ' + (type || 'info');
      el.textContent = message;
      container.appendChild(el);
      setTimeout(function() { el.classList.add('show'); }, 100);
      setTimeout(function() {
        el.classList.remove('show');
        setTimeout(function() { if (el.parentNode) container.removeChild(el); }, 300);
      }, 3000);
    }

    // =========================================================================
    // Navigation
    // =========================================================================

    showSection(name) {
      document.querySelectorAll('.content-section').forEach(function(s) { s.classList.remove('active'); });
      document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
      var target = document.getElementById(name);
      if (target) target.classList.add('active');
      var btn = document.querySelector('[data-section="' + name + '"]');
      if (btn) btn.classList.add('active');

      switch (name) {
        case 'projects': this.renderProjects(); break;
        case 'achievements': this.renderAchievements(); break;
        case 'progression': this.renderProgression(); break;
        case 'weekly': this.renderWeeklyReview(); break;
        case 'settings': this.renderSettings(); break;
      }
    }

    // =========================================================================
    // OVERLAYS
    // =========================================================================

    showStartOverlay() {
      var overlay = document.getElementById('startOverlay');
      var btn = document.getElementById('startAdventureBtn');
      var sel = document.getElementById('seasonGoalSelect');
      if (sel) sel.value = this.data.seasonGoalXP || '';
      if (btn) btn.disabled = !this.data.seasonGoalXP;
      if (overlay) overlay.style.display = 'flex';
    }

    hideStartOverlay() {
      var overlay = document.getElementById('startOverlay');
      if (overlay) overlay.classList.add('fade-out');
      setTimeout(function() {
        if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('fade-out'); }
      }, 500);
    }

    // =========================================================================
    // Countdown hebdomadaire
    // =========================================================================

    startWeeklyCountdown() {
      var self = this;
      if (this._weeklyCountdownInterval) clearInterval(this._weeklyCountdownInterval);
      this._updateWeeklyCountdown();
      this._weeklyCountdownInterval = setInterval(function() { self._updateWeeklyCountdown(); }, 60000);
    }

    _updateWeeklyCountdown() {
      this._setText('weeklyCountdown', this.season.getTimeUntilNextReview());
    }

    // =========================================================================
    // HELPERS INTERNES
    // =========================================================================

    _getCurrentRank(ranks) {
      var current = ranks[0];
      for (var i = ranks.length - 1; i >= 0; i--) {
        if (this.data.totalXP >= ranks[i].xp) { current = ranks[i]; break; }
      }
      return current;
    }

    _setText(id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    _setStyle(id, prop, value) {
      var el = document.getElementById(id);
      if (el) el.style[prop] = value;
    }

    _pad(n) { return n.toString().padStart(2, '0'); }

    _setTimerButton(addClass, text) {
      var btn = document.getElementById('startPauseBtn');
      var txt = document.getElementById('startPauseText');
      if (btn) { btn.classList.remove('running'); if (addClass) btn.classList.add(addClass); }
      if (txt) txt.textContent = text;
    }

    _setFocusMode(active) {
      var c = document.querySelector('.app-container');
      if (c) { if (active) c.classList.add('focus-mode'); else c.classList.remove('focus-mode'); }
    }

    _disableTimerOptions(disabled) {
      var ab = document.getElementById('autoBreaks');
      var sm = document.getElementById('spotifyMode');
      if (ab) ab.disabled = disabled;
      if (sm) sm.disabled = disabled;
    }

    _showXPPop(amount) {
      var zone = document.getElementById('xpPopContainer');
      if (!zone) return;
      var el = document.createElement('div');
      el.className = 'xp-popup';
      el.textContent = '+' + amount + ' XP';
      zone.appendChild(el);
      setTimeout(function() { if (el.parentNode) zone.removeChild(el); }, 1000);
    }

    _showBreakModal() {
      this.showModal('<div class="modal-header"><h3>⏸ Pause</h3></div><div class="modal-body break-body"><div class="break-timer" id="breakTimer">05:00</div></div>');
    }

    _flashElement(el) {
      if (!el) return;
      el.classList.add('flash');
      setTimeout(function() { el.classList.remove('flash'); }, 600);
    }

    _statCardLarge(icon, value, label, cls) {
      return '<div class="stat-card-large ' + cls + '"><div class="stat-icon">' + icon + '</div><div class="stat-content"><div class="stat-number">' + value + '</div><div class="stat-label">' + label + '</div></div></div>';
    }

    _renderBarChart(data, valueKey, defaultMax, isFocus) {
      var max = Math.max.apply(null, data.map(function(d) { return d[valueKey]; }).concat([defaultMax]));
      return '<div class="chart-bars">' + data.map(function(d) {
        return '<div class="chart-bar"><div class="bar-fill' + (isFocus ? ' focus' : '') + '" style="height:' + ((d[valueKey] / max) * 100) + '%"></div><div class="bar-label">' + d.day + '</div><div class="bar-value">' + d[valueKey] + '</div></div>';
      }).join('') + '</div>';
    }

    _renderRankProgressBar() {
      var C = typeof LunalisConstants !== 'undefined' ? LunalisConstants : {};
      var ranks = C.RANKS || [];
      var current = this._getCurrentRank(ranks);
      var idx = ranks.findIndex(function(r) { return r.name === current.name; });
      var next = ranks[Math.min(idx + 1, ranks.length - 1)];
      if (next.xp === current.xp) return '<p class="next-rank-info">Rang maximum atteint</p>';
      var pct = Math.min(100, Math.round(((this.data.totalXP - current.xp) / (next.xp - current.xp)) * 100));
      return '<div class="next-rank-bar"><div class="next-rank-info">Prochain rang : ' + next.name + ' (' + next.xp + ' XP)</div><div class="next-rank-progress"><div class="next-rank-fill" style="width:' + pct + '%"></div></div></div>';
    }

    _renderRanksProgression() {
      var C = typeof LunalisConstants !== 'undefined' ? LunalisConstants : {};
      var ranks = C.RANKS || [];
      var current = this._getCurrentRank(ranks);
      var totalXP = this.data.totalXP;
      return ranks.map(function(rank) {
        var unlocked = totalXP >= rank.xp;
        var isCurrent = current.name === rank.name;
        var cls = 'rank-' + rank.badge.toLowerCase();
        return '<div class="rank-item ' + cls + ' ' + (unlocked ? 'unlocked' : 'locked') + ' ' + (isCurrent ? 'current' : '') + '">' +
          '<div class="rank-avatar">' + rank.avatar + '</div><div class="rank-info"><div class="rank-name">' + rank.name + ' <span class="rank-class">' + rank.badge + '</span></div><div class="rank-requirement">' + rank.xp + ' XP</div></div></div>';
      }).join('');
    }

    _renderProjectsFocusStats() {
      var stats = this.pm.getFocusStats();
      if (stats.length === 0) return '<p class="no-projects-stats">Aucune session de focus enregistrée</p>';
      var maxTime = Math.max.apply(null, stats.map(function(s) { return s.totalTime; }));
      return stats.map(function(s) {
        return '<div class="project-focus-stat"><div class="project-focus-info"><div class="project-focus-name">' + s.name + '</div><div class="project-focus-sessions">' + s.sessions + ' session' + (s.sessions > 1 ? 's' : '') + '</div></div><div class="project-focus-time"><div class="focus-time-value">' + Math.floor(s.totalTime / 60) + 'h ' + (s.totalTime % 60) + 'min</div><div class="focus-time-bar"><div class="focus-time-fill" style="width:' + ((s.totalTime / maxTime) * 100) + '%"></div></div></div></div>';
      }).join('');
    }

    _renderProjectsStats() {
      var projects = this.pm.getAll();
      if (projects.length === 0) return '<p class="no-projects-stats">Aucun projet créé</p>';
      return projects.slice(0, 5).map(function(p) {
        return '<div class="project-stat-item"><div class="project-name">' + p.name + '</div><div class="project-time">' + Math.floor(p.totalTime / 60) + 'h ' + (p.totalTime % 60) + 'min</div></div>';
      }).join('');
    }

    _renderWeeklyForm() {
      var fields = [
        ['productivity', '🎯 Productivité et focus'],
        ['health', '💪 Santé et bien-être'],
        ['creativity', '🎨 Créativité et apprentissage'],
        ['social', '🤝 Relations sociales'],
        ['satisfaction', '😊 Satisfaction générale']
      ];
      return '<div class="weekly-form-container"><h4>📝 Évaluez votre semaine (sur 10)</h4><div class="weekly-questions">' +
        fields.map(function(f) {
          return '<div class="question-item"><label>' + f[1] + '</label><div class="rating-slider"><input type="range" id="' + f[0] + '" min="1" max="10" value="5" class="slider"><span class="rating-value">5/10</span></div></div>';
        }).join('') +
        '</div><div class="weekly-summary"><h5>💭 Réflexion de la semaine</h5><textarea id="weeklyReflection" placeholder="Qu\'avez-vous appris cette semaine ? Quels sont vos objectifs pour la semaine prochaine ?"></textarea></div>' +
        '<button class="submit-review-btn" id="submitWeeklyBtn">✨ Valider le Bilan (+5 XP)</button></div>';
    }

    _renderWeeklyCompleted() {
      return '<div class="review-completed"><div class="completed-icon">✅</div><h4>Bilan de la semaine terminé !</h4><p>Prochain bilan disponible dans ' + this.season.getTimeUntilNextReview() + '</p></div>';
    }

    _renderWeeklyHistory() {
      var reviews = this.data.weeklyReviews;
      if (reviews.length === 0) return '<p class="no-reviews">Aucun bilan effectué pour le moment</p>';
      return reviews.slice(-8).reverse().map(function(r) {
        var idx = reviews.indexOf(r);
        return '<div class="review-card" data-review-index="' + idx + '"><div class="review-header"><span class="review-week">Semaine ' + r.week + '</span><span class="review-score">' + r.totalScore + '/50</span></div><div class="review-percentage"><div class="percentage-bar"><div class="percentage-fill" style="width:' + r.percentage + '%"></div></div><span>' + Math.round(r.percentage) + '%</span></div></div>';
      }).join('');
    }

    _setupWeeklySliders() {
      document.querySelectorAll('.slider').forEach(function(s) {
        var span = s.parentElement.querySelector('.rating-value');
        s.addEventListener('input', function() { if (span) span.textContent = s.value + '/10'; });
      });
      var submitBtn = document.getElementById('submitWeeklyBtn');
      var self = this;
      if (submitBtn) {
        submitBtn.addEventListener('click', function() {
          self.emitter.emit('ui:submitWeeklyReview', {
            productivity: parseInt(document.getElementById('productivity').value, 10),
            health: parseInt(document.getElementById('health').value, 10),
            creativity: parseInt(document.getElementById('creativity').value, 10),
            social: parseInt(document.getElementById('social').value, 10),
            satisfaction: parseInt(document.getElementById('satisfaction').value, 10),
            reflection: document.getElementById('weeklyReflection').value
          });
        });
      }
    }

    _bindWeeklyHistoryCards() {
      var self = this;
      document.querySelectorAll('.review-card').forEach(function(card) {
        card.addEventListener('click', function() {
          var idx = parseInt(card.dataset.reviewIndex, 10);
          var review = self.data.weeklyReviews[idx];
          if (review) self._showWeeklyReviewDetails(review);
        });
      });
    }

    _showWeeklyReviewDetails(review) {
      var scores = review.scores;
      var rows = [
        ['🎯 Productivité et focus', scores.productivity],
        ['💪 Santé et bien-être', scores.health],
        ['🎨 Créativité et apprentissage', scores.creativity],
        ['🤝 Relations sociales', scores.social],
        ['😊 Satisfaction générale', scores.satisfaction]
      ].map(function(r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '/10</td></tr>'; }).join('');
      var reflection = review.reflection ? review.reflection.replace(/\n/g, '<br>') : 'Aucune réflexion enregistrée.';
      this.showModal(
        '<div class="modal-header"><h3>Détails Bilan - Semaine ' + review.week + '</h3><button class="modal-close" id="closeModalBtn">×</button></div>' +
        '<div class="modal-body"><table class="detail-table"><tbody>' + rows + '</tbody></table><div class="reflection-text"><h4>Réflexion</h4><p>' + reflection + '</p></div></div>', true);
      var self = this;
      var closeBtn = document.getElementById('closeModalBtn');
      if (closeBtn) closeBtn.addEventListener('click', function() { self.closeModal(); });
    }

    _showXPDetails() {
      var data = this.xp.getLastDaysXP(this.chartRange);
      var rows = data.map(function(d, i) {
        var lvl = d.xp >= 11 ? 'high' : (d.xp >= 3 ? 'medium' : 'low');
        return '<tr class="fade-in-up ' + lvl + '" style="animation-delay:' + (i * 0.05) + 's"><td>' + d.date + '</td><td>' + d.xp + '</td></tr>';
      }).join('');
      this.showModal(
        '<div class="modal-header"><h3>Détails XP (' + this.chartRange + ' jours)</h3><button class="modal-close" id="closeModalBtn">×</button></div>' +
        '<div class="modal-body"><table class="detail-table"><thead><tr><th>Date</th><th>XP</th></tr></thead><tbody>' + rows + '</tbody></table></div>', true);
      var self = this;
      var btn = document.getElementById('closeModalBtn');
      if (btn) btn.addEventListener('click', function() { self.closeModal(); });
    }

    _showFocusDetails() {
      var data = this.xp.getLastDaysFocus(this.chartRange);
      var rows = data.map(function(d, i) {
        var lvl = d.sessions >= 3 ? 'focus-many' : (d.sessions === 2 ? 'focus-two' : (d.sessions === 1 ? 'focus-one' : 'focus-zero'));
        return '<tr class="fade-in-up ' + lvl + '" style="animation-delay:' + (i * 0.05) + 's"><td>' + d.date + '</td><td>' + d.sessions + '</td></tr>';
      }).join('');
      this.showModal(
        '<div class="modal-header"><h3>Détails Focus (' + this.chartRange + ' jours)</h3><button class="modal-close" id="closeModalBtn">×</button></div>' +
        '<div class="modal-body"><table class="detail-table"><thead><tr><th>Date</th><th>Sessions</th></tr></thead><tbody>' + rows + '</tbody></table></div>', true);
      var self = this;
      var btn = document.getElementById('closeModalBtn');
      if (btn) btn.addEventListener('click', function() { self.closeModal(); });
    }

    // =========================================================================
    // SETTINGS (HTML complet + listeners)
    // =========================================================================

    _settingsHTML(googleConnected, spotifyConnected) {
      return '<div class="settings-grid">' +
        '<div class="settings-card focus-settings"><div class="settings-header"><div class="settings-icon">🎯</div><h3>Paramètres de Focus</h3></div><div class="settings-content">' +
        '<div class="setting-group"><label class="setting-label"><span class="label-icon">⏱️</span>Durée par défaut des sessions</label><div class="select-wrapper"><select id="defaultFocusDuration" class="modern-select"><option value="15">15 minutes</option><option value="25" selected>25 minutes</option><option value="45">45 minutes</option><option value="90">90 minutes</option></select></div></div>' +
        '<div class="setting-group"><div class="toggle-setting"><div class="toggle-info"><span class="toggle-icon">⏸️</span><div class="toggle-text"><div class="toggle-title">Pauses automatiques</div><div class="toggle-subtitle">5 min toutes les 25 min</div></div></div><label class="modern-toggle"><input type="checkbox" id="autoBreaksEnabled" checked><span class="toggle-slider"></span></label></div></div>' +
        '<div class="setting-group"><div class="toggle-setting"><div class="toggle-info"><span class="toggle-icon">🔊</span><div class="toggle-text"><div class="toggle-title">Notifications sonores</div><div class="toggle-subtitle">Sons de fin de session</div></div></div><label class="modern-toggle"><input type="checkbox" id="soundNotifications"' + (this.data.settings?.soundNotifications ? ' checked' : '') + '><span class="toggle-slider"></span></label></div></div>' +
        '</div></div>' +
        '<div class="settings-card appearance-settings"><div class="settings-header"><div class="settings-icon">🎨</div><h3>Apparence</h3></div><div class="settings-content">' +
        '<div class="setting-group"><label class="setting-label"><span class="label-icon">🌈</span>Thème de couleur</label><div class="theme-selector">' +
        '<div class="theme-option" data-theme="default"><div class="theme-preview lunalis"></div><span class="theme-name">Lunalis</span><span class="theme-subtitle">Bleu/Violet</span></div>' +
        '<div class="theme-option" data-theme="fire"><div class="theme-preview solaris"></div><span class="theme-name">Solaris</span><span class="theme-subtitle">Rouge/Orange</span></div>' +
        '<div class="theme-option" data-theme="nature"><div class="theme-preview verdalis"></div><span class="theme-name">Verdalis</span><span class="theme-subtitle">Vert/Nature</span></div>' +
        '<div class="theme-option" data-theme="cosmic"><div class="theme-preview cosmalis"></div><span class="theme-name">Cosmalis</span><span class="theme-subtitle">Violet/Rose</span></div></div></div>' +
        '<div class="setting-group"><div class="toggle-setting"><div class="toggle-info"><span class="toggle-icon">✨</span><div class="toggle-text"><div class="toggle-title">Animations</div><div class="toggle-subtitle">Effets visuels et transitions</div></div></div><label class="modern-toggle"><input type="checkbox" id="animationsEnabled" checked><span class="toggle-slider"></span></label></div></div>' +
        '</div></div>' +
        '<div class="settings-card data-settings"><div class="settings-header"><div class="settings-icon">💾</div><h3>Gestion des Données</h3></div><div class="settings-content"><div class="data-actions">' +
        '<button class="data-btn export-btn" id="exportBtn"><span class="btn-icon">📤</span><div class="btn-content"><div class="btn-title">Exporter</div><div class="btn-subtitle">Sauvegarder mes données</div></div></button>' +
        '<button class="data-btn import-btn" id="importBtn"><span class="btn-icon">📥</span><div class="btn-content"><div class="btn-title">Importer</div><div class="btn-subtitle">Restaurer des données</div></div></button>' +
        '<button class="data-btn reset-btn" id="resetBtn2"><span class="btn-icon">🗑️</span><div class="btn-content"><div class="btn-title">Réinitialiser</div><div class="btn-subtitle">Effacer toutes les données</div></div></button>' +
        '</div></div></div>' +
        '<div class="settings-card sync-settings"><div class="settings-header"><div class="settings-icon">📅</div><h3>Google Calendar</h3></div><div class="settings-content">' +
        (googleConnected
          ? '<div class="connected-status"><span class="status-icon">🟢</span> Compte Google Connecté</div><div class="gc-actions"><button id="openGoogleCalendarBtn" class="data-btn open-btn">Ouvrir Google Calendar</button><button id="disconnectGoogleCalendarBtn" class="data-btn disconnect-btn">Se déconnecter</button></div>'
          : '<button id="connectGoogleCalendarBtn" class="data-btn connect-btn">Se connecter à Google Calendar</button>') +
        '</div></div>' +
        '<div class="settings-card spotify-settings"><div class="settings-header"><div class="settings-icon">🎵</div><h3>Spotify</h3></div><div class="settings-content">' +
        (spotifyConnected
          ? '<div class="connected-status"><span class="status-icon">🟢</span> Compte Spotify connecté</div><div class="gc-actions"><button id="disconnectSpotifyBtn" class="data-btn disconnect-btn">Se déconnecter</button></div>'
          : '<button id="connectSpotifyBtn" class="data-btn connect-btn">Se connecter à Spotify</button>') +
        '</div></div>' +
        '<div class="settings-card info-settings"><div class="settings-header"><div class="settings-icon">ℹ️</div><h3>Informations</h3></div><div class="settings-content"><div class="info-grid">' +
        '<div class="info-item"><div class="info-icon">🚀</div><div class="info-content"><div class="info-value">3.0.0 - Lunalis</div><div class="info-label">Version</div></div></div>' +
        '<div class="info-item"><div class="info-icon">💾</div><div class="info-content"><div class="info-value">' + new Date(this.data.lastSaved || Date.now()).toLocaleDateString() + '</div><div class="info-label">Dernière sauvegarde</div></div></div>' +
        '<div class="info-item"><div class="info-icon">🎯</div><div class="info-content"><div class="info-value">' + this.data.focusSessions.length + '</div><div class="info-label">Sessions totales</div></div></div>' +
        '<div class="info-item"><div class="info-icon">📋</div><div class="info-content"><div class="info-value">' + this.data.projects.length + '</div><div class="info-label">Projets créés</div></div></div>' +
        '</div></div></div></div>';
    }

    _setupSettingsListeners() {
      var self = this;

      // Thèmes
      document.querySelectorAll('.theme-option').forEach(function(opt) {
        opt.addEventListener('click', function() {
          document.querySelectorAll('.theme-option').forEach(function(o) { o.classList.remove('active'); });
          opt.classList.add('active');
          self.emitter.emit('ui:changeTheme', { theme: opt.dataset.theme });
        });
      });
      var currentTheme = this.data.settings?.theme || 'default';
      var active = document.querySelector('[data-theme="' + currentTheme + '"]');
      if (active) active.classList.add('active');

      // Son
      var soundToggle = document.getElementById('soundNotifications');
      if (soundToggle) soundToggle.addEventListener('change', function() {
        self.data.settings = self.data.settings || {};
        self.data.settings.soundNotifications = soundToggle.checked;
        self.dm.markDirty();
      });

      // Export / Import / Reset
      var expBtn = document.getElementById('exportBtn');
      if (expBtn) expBtn.addEventListener('click', function() { self.dm.exportToFile(); self.showNotification('Données exportées !', 'success'); });

      var impBtn = document.getElementById('importBtn');
      if (impBtn) impBtn.addEventListener('click', function() {
        self.dm.importFromFile(
          function() { self.showNotification('Données importées !', 'success'); self.updateAll(); },
          function() { self.showNotification("Erreur lors de l'importation", 'error'); }
        );
      });

      var resetBtn = document.getElementById('resetBtn2');
      if (resetBtn) resetBtn.addEventListener('click', function() { self.emitter.emit('ui:resetData', {}); });

      // Google Calendar
      var connectGC = document.getElementById('connectGoogleCalendarBtn');
      if (connectGC && window.electronAPI) connectGC.addEventListener('click', async function() {
        var ok = await window.electronAPI.connectGoogleCalendar();
        self.showNotification(ok ? 'Google Calendar connecté' : 'Erreur de connexion Google', ok ? 'success' : 'error');
        if (ok) self.renderSettings();
      });
      var openGC = document.getElementById('openGoogleCalendarBtn');
      if (openGC && window.electronAPI) openGC.addEventListener('click', function() {
        window.electronAPI.openExternal('https://calendar.google.com/calendar/u/0/r');
      });
      var disconnGC = document.getElementById('disconnectGoogleCalendarBtn');
      if (disconnGC && window.electronAPI) disconnGC.addEventListener('click', async function() {
        var ok = await window.electronAPI.disconnectGoogleCalendar();
        if (ok) { self.showNotification('Google Calendar déconnecté', 'success'); self.renderSettings(); }
      });

      // Spotify
      var connectSP = document.getElementById('connectSpotifyBtn');
      if (connectSP && window.electronAPI) connectSP.addEventListener('click', async function() {
        var ok = await window.electronAPI.connectSpotify();
        self.showNotification(ok ? 'Spotify connecté' : 'Erreur de connexion Spotify', ok ? 'success' : 'error');
        if (ok) self.renderSettings();
      });
      var disconnSP = document.getElementById('disconnectSpotifyBtn');
      if (disconnSP && window.electronAPI) disconnSP.addEventListener('click', async function() {
        var ok = await window.electronAPI.disconnectSpotify();
        if (ok) { self.showNotification('Spotify déconnecté', 'success'); self.renderSettings(); }
      });
    }

    // Modales spécifiques émises via events (appelées par l'orchestrateur)

    showRanksModal() {
      this.showModal(
        '<div class="modal-header"><h3>Rangs disponibles</h3><button class="modal-close" id="closeModalBtn">×</button></div><div class="modal-body ranks-modal">' + this._renderRanksProgression() + '</div>', true);
      var self = this;
      var btn = document.getElementById('closeModalBtn');
      if (btn) btn.addEventListener('click', function() { self.closeModal(); });
    }

    showIntensityModal() {
      var C = typeof LunalisConstants !== 'undefined' ? LunalisConstants : {};
      var levels = C.INTENSITY_LEVELS || [];
      var extractBaseColor = C.extractBaseColor || function(c) { return c; };
      var lightenColor = C.lightenColor || function(h) { return h; };
      var html = levels.map(function(l) {
        var base = extractBaseColor(l.color);
        var glow = l.glow || lightenColor(base, 60);
        return '<div class="intensity-level" style="--level-color:' + base + ';--level-glow:' + glow + '">' +
          '<div class="level-icon">' + l.emoji + '</div><div class="level-info"><div class="level-title">' + l.title + ' (' + l.min + '-' + l.max + '%)</div><div class="level-role">' + l.role + '</div><div class="level-desc">' + l.description + '</div></div></div>';
      }).join('');
      this.showModal(
        '<div class="modal-header"><h3>Niveaux d\'Intensité</h3><button class="modal-close" id="closeModalBtn">×</button></div><div class="modal-body intensity-modal">' + html + '</div>', true);
      var self = this;
      var btn = document.getElementById('closeModalBtn');
      if (btn) btn.addEventListener('click', function() { self.closeModal(); });
    }

    showSleepModal() {
      this.showModal(
        '<div class="modal-header"><h3>😴 Enregistrer le Sommeil</h3><button class="modal-close" id="closeModalBtn">×</button></div>' +
        '<div class="modal-body"><div class="sleep-options">' +
        '<button class="sleep-btn good" data-sleep="good"><span class="sleep-icon">🌙</span><div class="sleep-info"><strong>Bon sommeil</strong><small>>7h avant 22h</small></div><span class="sleep-xp">+2 XP</span></button>' +
        '<button class="sleep-btn average" data-sleep="average"><span class="sleep-icon">😴</span><div class="sleep-info"><strong>Sommeil correct</strong><small>>7h avant minuit</small></div><span class="sleep-xp">+1 XP</span></button>' +
        '<button class="sleep-btn bad" data-sleep="bad"><span class="sleep-icon">😵</span><div class="sleep-info"><strong>Mauvais sommeil</strong><small>&lt;7h ou après minuit</small></div><span class="sleep-xp">0 XP</span></button>' +
        '</div></div>');
      var self = this;
      var closeBtn = document.getElementById('closeModalBtn');
      if (closeBtn) closeBtn.addEventListener('click', function() { self.closeModal(); });
      document.querySelectorAll('[data-sleep]').forEach(function(btn) {
        btn.addEventListener('click', function() { self.emitter.emit('ui:logSleep', { quality: btn.dataset.sleep }); });
      });
    }

    showDistractionModal() {
      this.showModal(
        '<div class="modal-header"><h3>📱 Déclarer des Distractions</h3><button class="modal-close" id="closeModalBtn">×</button></div>' +
        '<div class="modal-body"><div class="distraction-options">' +
        '<button class="distraction-btn instagram" data-distraction="instagram"><span class="distraction-icon">📸</span><div class="distraction-info"><strong>Instagram +1h</strong><small>Perte de temps sur les réseaux</small></div><span class="distraction-penalty">-3 XP</span></button>' +
        '<button class="distraction-btn music" data-distraction="music"><span class="distraction-icon">🎵</span><div class="distraction-info"><strong>Musique +1h30</strong><small>Écoute excessive de musique</small></div><span class="distraction-penalty">-5 XP</span></button>' +
        '</div></div>');
      var self = this;
      var closeBtn = document.getElementById('closeModalBtn');
      if (closeBtn) closeBtn.addEventListener('click', function() { self.closeModal(); });
      document.querySelectorAll('[data-distraction]').forEach(function(btn) {
        btn.addEventListener('click', function() { self.emitter.emit('ui:logDistraction', { type: btn.dataset.distraction }); });
      });
    }
  }

  // Exposition
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIRenderer;
  } else {
    global.UIRenderer = UIRenderer;
  }
})(typeof window !== 'undefined' ? window : global);

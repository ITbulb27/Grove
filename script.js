(function(){
  const DAY_LABELS = ['M','T','W','T','F','S','S'];
  const todayIdx = (new Date().getDay() + 6) % 7; // Monday = 0
  const THEME_KEY = 'grove-theme-v1';
  const PROFILES_KEY = 'grove-profiles-v1';
  const ACTIVE_PROFILE_KEY = 'grove-active-profile-v1';
  const dataKey = (profileId) => `grove-data-v1-${profileId}`;

  let profiles = [];
  let activeProfileId = null;
  let data = null; // { habits, weekStart, history }
  let habits = [];
  let nextId = 1;
  let dragId = null;
  let lastRemoved = null;
  let toastTimer = null;

  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const summaryEl = document.getElementById('summary');
  const input = document.getElementById('input');
  const categorySelect = document.getElementById('category');
  const addBtn = document.getElementById('addBtn');
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const exportBtn = document.getElementById('exportBtn');
  const toastEl = document.getElementById('toast');

  const profileBtn = document.getElementById('profileBtn');
  const profileMenu = document.getElementById('profileMenu');
  const profileList = document.getElementById('profileList');
  const profileNameEl = document.getElementById('profileName');
  const newProfileInput = document.getElementById('newProfileInput');
  const addProfileBtn = document.getElementById('addProfileBtn');

  const historyBtn = document.getElementById('historyBtn');
  const historyModal = document.getElementById('historyModal');
  const closeHistory = document.getElementById('closeHistory');
  const historyList = document.getElementById('historyList');
  const historyEmpty = document.getElementById('historyEmpty');
  const historyProfileName = document.getElementById('historyProfileName');

  // ---------- date helpers ----------
  function toISODate(d){
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function currentWeekStart(){
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - todayIdx);
    return toISODate(monday);
  }
  function weekRangeLabel(weekStartISO){
    const start = new Date(weekStartISO + 'T00:00:00');
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const opts = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString(undefined, opts)} \u2013 ${end.toLocaleDateString(undefined, opts)}`;
  }

  // ---------- profiles ----------
  function loadProfiles(){
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (e) { /* fall through */ }
    const def = [{ id: 'default', name: 'You' }];
    saveProfiles(def);
    return def;
  }
  function saveProfiles(list){
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function loadActiveProfileId(){
    let id = null;
    try { id = localStorage.getItem(ACTIVE_PROFILE_KEY); } catch (e) {}
    if (!id || !profiles.some(p => p.id === id)) id = profiles[0].id;
    return id;
  }
  function saveActiveProfileId(id){
    try { localStorage.setItem(ACTIVE_PROFILE_KEY, id); } catch (e) {}
  }
  function makeProfileId(){
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---------- per-profile data ----------
  function defaultHabits(){
    return [
      { id: 1, name: 'Morning walk', category: 'health', note: '', days: [true, true, false, true, false, false, false], best: 2 },
      { id: 2, name: 'Read 20 minutes', category: 'learning', note: '', days: [true, false, false, false, false, false, false], best: 1 },
    ];
  }
  function defaultData(){
    return { habits: defaultHabits(), weekStart: currentWeekStart(), history: [] };
  }
  const LEGACY_HABITS_KEY = 'grove-habits-v1';
  function loadProfileData(profileId){
    try {
      const raw = localStorage.getItem(dataKey(profileId));
      if (!raw) {
        // migrate pre-profile data (single habit list) into the default profile once
        if (profileId === 'default') {
          try {
            const legacyRaw = localStorage.getItem(LEGACY_HABITS_KEY);
            const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
            if (Array.isArray(legacy) && legacy.length) {
              return { habits: legacy, weekStart: currentWeekStart(), history: [] };
            }
          } catch (e) {}
        }
        return defaultData();
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.habits)) return defaultData();
      if (!Array.isArray(parsed.history)) parsed.history = [];
      if (!parsed.weekStart) parsed.weekStart = currentWeekStart();
      return parsed;
    } catch (e) {
      return defaultData();
    }
  }
  function saveProfileData(){
    try { localStorage.setItem(dataKey(activeProfileId), JSON.stringify(data)); }
    catch (e) { /* storage unavailable — fail silently, app still works in-memory */ }
  }

  function archiveWeekIfNeeded(){
    const nowWeek = currentWeekStart();
    if (data.weekStart === nowWeek) return;
    if (data.habits.length){
      data.history.unshift({
        weekStart: data.weekStart,
        habits: data.habits.map(h => ({
          name: h.name,
          category: h.category,
          days: h.days.slice(),
          doneCount: h.days.filter(Boolean).length
        }))
      });
      if (data.history.length > 52) data.history.length = 52;
    }
    data.habits.forEach(h => { h.days = [false,false,false,false,false,false,false]; });
    data.weekStart = nowWeek;
  }

  function switchToProfile(profileId){
    activeProfileId = profileId;
    saveActiveProfileId(profileId);
    data = loadProfileData(profileId);
    archiveWeekIfNeeded();
    habits = data.habits;
    nextId = habits.reduce((m, h) => Math.max(m, h.id), 0) + 1;
    saveProfileData();
    const p = profiles.find(x => x.id === profileId);
    profileNameEl.textContent = p ? p.name : 'You';
    render();
  }

  // ---------- theme ----------
  function loadTheme(){
    try { return localStorage.getItem(THEME_KEY) || 'dark'; }
    catch (e) { return 'dark'; }
  }
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    themeIcon.textContent = theme === 'light' ? '\u2600' : '\u263e';
    themeToggle.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    try { localStorage.setItem(THEME_KEY, theme); } catch(e) {}
  }
  applyTheme(loadTheme());
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });

  // ---------- helpers ----------
  function computeStreak(days){
    let streak = 0;
    for (let i = todayIdx; i >= 0; i--){
      if (days[i]) streak++; else break;
    }
    return streak;
  }

  function ringMarkup(doneCount){
    const r = 22, c = 2 * Math.PI * r;
    const frac = doneCount / 7;
    const offset = c * (1 - frac);
    return `
      <div class="ring-wrap">
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle class="ring-bg" cx="28" cy="28" r="${r}"></circle>
          <circle class="ring-fg" cx="28" cy="28" r="${r}"
            stroke-dasharray="${c}" stroke-dashoffset="${offset}"></circle>
        </svg>
        <div class="ring-num">${doneCount}/7</div>
      </div>`;
  }

  function escapeHtml(str){
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function showToast(message, { actionLabel, onAction, duration = 5000 } = {}){
    clearTimeout(toastTimer);
    toastEl.innerHTML = `<span>${escapeHtml(message)}</span>` +
      (actionLabel ? `<button id="toastAction">${escapeHtml(actionLabel)}</button>` : '');
    toastEl.classList.add('show');
    if (actionLabel && onAction){
      document.getElementById('toastAction').addEventListener('click', () => {
        onAction();
        hideToast();
      });
    }
    toastTimer = setTimeout(hideToast, duration);
  }
  function hideToast(){
    toastEl.classList.remove('show');
  }

  // ---------- render: habit list ----------
  function render(justCompletedId){
    listEl.innerHTML = '';
    emptyEl.style.display = habits.length ? 'none' : 'block';

    if (habits.length){
      const completedCount = habits.filter(h => h.days.filter(Boolean).length === 7).length;
      summaryEl.style.display = 'block';
      summaryEl.innerHTML = `<strong>${completedCount}</strong> of ${habits.length} habit${habits.length === 1 ? '' : 's'} fully checked off this week`;
    } else {
      summaryEl.style.display = 'none';
    }

    habits.forEach(h => {
      const doneCount = h.days.filter(Boolean).length;
      const streak = computeStreak(h.days);
      const isComplete = doneCount === 7;

      const card = document.createElement('div');
      card.className = 'card' + (isComplete ? ' complete' : '') + (h.id === justCompletedId ? ' celebrate' : '');
      card.draggable = true;
      card.dataset.id = h.id;
      card.innerHTML = `
        ${ringMarkup(doneCount)}
        <div class="card-body">
          <div class="title-row">
            <span class="tag ${h.category || 'other'}"></span>
            <p class="card-title" data-id="${h.id}" title="Click to rename">${escapeHtml(h.name)}</p>
          </div>
          <input class="note-input" data-id="${h.id}" placeholder="Add a note\u2026" value="${escapeHtml(h.note || '')}" maxlength="80" />
          <div class="days">
            ${h.days.map((done, i) => `
              <button class="day ${done ? 'done' : ''} ${i === todayIdx ? 'today' : ''}"
                data-id="${h.id}" data-day="${i}"
                aria-pressed="${done}"
                aria-label="${DAY_LABELS[i]}, ${done ? 'done' : 'not done'}">${DAY_LABELS[i]}</button>
            `).join('')}
          </div>
        </div>
        <div class="streak">
          <span class="n ${streak === 0 ? 'zero' : ''}">${streak}</span>
          <span class="lbl">day streak</span>
          <div class="best">best: <b>${h.best || 0}</b></div>
        </div>
        <button class="remove" data-remove="${h.id}">Remove</button>
      `;
      listEl.appendChild(card);
    });
  }

  // ---------- render: profile menu ----------
  function renderProfileMenu(){
    profileList.innerHTML = '';
    profiles.forEach(p => {
      const row = document.createElement('div');
      row.className = 'profile-row' + (p.id === activeProfileId ? ' active' : '');
      row.dataset.id = p.id;
      row.innerHTML = `
        <span class="radio"></span>
        <span class="pname" data-id="${p.id}">${escapeHtml(p.name)}</span>
        <span class="prow-actions">
          <button type="button" data-rename="${p.id}" title="Rename">\u270e</button>
          ${profiles.length > 1 ? `<button type="button" class="danger" data-delprofile="${p.id}" title="Delete">\u2715</button>` : ''}
        </span>
      `;
      profileList.appendChild(row);
    });
  }

  function openProfileMenu(){
    renderProfileMenu();
    profileMenu.hidden = false;
    profileBtn.setAttribute('aria-expanded', 'true');
  }
  function closeProfileMenu(){
    profileMenu.hidden = true;
    profileBtn.setAttribute('aria-expanded', 'false');
  }

  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (profileMenu.hidden) openProfileMenu(); else closeProfileMenu();
  });
  document.addEventListener('click', (e) => {
    if (!profileMenu.hidden && !profileMenu.contains(e.target) && e.target !== profileBtn) closeProfileMenu();
  });

  profileList.addEventListener('click', (e) => {
    const renameBtn = e.target.closest('[data-rename]');
    if (renameBtn){
      const id = renameBtn.dataset.rename;
      const span = profileList.querySelector(`.pname[data-id="${id}"]`);
      const current = span.textContent;
      const editInput = document.createElement('input');
      editInput.className = 'pname';
      editInput.value = current;
      editInput.maxLength = 24;
      span.replaceWith(editInput);
      editInput.focus();
      editInput.select();
      const commit = () => {
        const val = editInput.value.trim() || current;
        const p = profiles.find(x => x.id === id);
        if (p) p.name = val;
        saveProfiles(profiles);
        if (id === activeProfileId) profileNameEl.textContent = val;
        renderProfileMenu();
      };
      editInput.addEventListener('blur', commit);
      editInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') editInput.blur(); });
      editInput.addEventListener('click', (ev) => ev.stopPropagation());
      return;
    }
    const delBtn = e.target.closest('[data-delprofile]');
    if (delBtn){
      const id = delBtn.dataset.delprofile;
      if (profiles.length <= 1) return;
      const p = profiles.find(x => x.id === id);
      const wasActive = id === activeProfileId;
      profiles = profiles.filter(x => x.id !== id);
      saveProfiles(profiles);
      try { localStorage.removeItem(dataKey(id)); } catch(err) {}
      showToast(`Deleted profile "${p ? p.name : ''}"`, { duration: 3000 });
      if (wasActive){
        switchToProfile(profiles[0].id);
      }
      renderProfileMenu();
      return;
    }
    const row = e.target.closest('.profile-row');
    if (row && row.dataset.id !== activeProfileId){
      switchToProfile(row.dataset.id);
      closeProfileMenu();
    }
  });

  function addProfile(){
    const name = newProfileInput.value.trim();
    if (!name) { newProfileInput.focus(); return; }
    const p = { id: makeProfileId(), name };
    profiles.push(p);
    saveProfiles(profiles);
    newProfileInput.value = '';
    switchToProfile(p.id);
    renderProfileMenu();
    showToast(`Added profile "${name}"`, { duration: 3000 });
  }
  addProfileBtn.addEventListener('click', addProfile);
  newProfileInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addProfile(); });

  // ---------- history modal ----------
  function renderHistory(){
    const p = profiles.find(x => x.id === activeProfileId);
    historyProfileName.textContent = p ? p.name : 'You';
    historyList.innerHTML = '';
    const weeks = data.history;
    historyEmpty.style.display = weeks.length ? 'none' : 'block';
    weeks.forEach(week => {
      const wrap = document.createElement('div');
      wrap.className = 'history-week';
      const habitsHtml = week.habits.map(h => `
        <div class="history-habit">
          <span class="tag ${h.category || 'other'}"></span>
          <span class="hname">${escapeHtml(h.name)}</span>
          <span class="hbar">${h.days.map(d => `<span class="${d ? 'done' : ''}"></span>`).join('')}</span>
          <span class="hcount ${h.doneCount === 7 ? 'full' : ''}">${h.doneCount}/7</span>
        </div>
      `).join('');
      wrap.innerHTML = `<div class="history-week-range">${weekRangeLabel(week.weekStart)}</div>${habitsHtml}`;
      historyList.appendChild(wrap);
    });
  }
  function openHistory(){
    renderHistory();
    historyModal.hidden = false;
  }
  function hideHistory(){
    historyModal.hidden = true;
  }
  historyBtn.addEventListener('click', openHistory);
  closeHistory.addEventListener('click', hideHistory);
  historyModal.addEventListener('click', (e) => { if (e.target === historyModal) hideHistory(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !historyModal.hidden) hideHistory(); });

  // ---------- actions ----------
  function toggleDay(id, day){
    const h = habits.find(x => x.id === id);
    h.days[day] = !h.days[day];
    const streak = computeStreak(h.days);
    h.best = Math.max(h.best || 0, streak);
    const justCompleted = h.days.filter(Boolean).length === 7 ? id : null;
    saveProfileData();
    render(justCompleted);
  }

  function renameHabit(id, name){
    const h = habits.find(x => x.id === id);
    if (name.trim()) h.name = name.trim();
    saveProfileData();
    render();
  }

  function updateNote(id, note){
    const h = habits.find(x => x.id === id);
    h.note = note;
    saveProfileData();
  }

  function removeHabit(id){
    const idx = habits.findIndex(x => x.id === id);
    if (idx === -1) return;
    lastRemoved = { habit: habits[idx], index: idx };
    habits.splice(idx, 1);
    saveProfileData();
    render();
    showToast(`Removed "${lastRemoved.habit.name}"`, {
      actionLabel: 'Undo',
      onAction: () => {
        habits.splice(lastRemoved.index, 0, lastRemoved.habit);
        saveProfileData();
        render();
      }
    });
  }

  function addHabit(){
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    habits.push({
      id: nextId++,
      name,
      category: categorySelect.value,
      note: '',
      days: [false,false,false,false,false,false,false],
      best: 0
    });
    input.value = '';
    saveProfileData();
    render();
  }

  function exportData(){
    const p = profiles.find(x => x.id === activeProfileId);
    const payload = { profile: p ? p.name : 'You', weekStart: data.weekStart, habits, history: data.history };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (p ? p.name : 'grove').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'grove';
    a.download = `grove-habits-${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported grove-habits.json', { duration: 3000 });
  }

  // ---------- events ----------
  listEl.addEventListener('click', (e) => {
    const dayBtn = e.target.closest('.day');
    if (dayBtn){
      toggleDay(Number(dayBtn.dataset.id), Number(dayBtn.dataset.day));
      return;
    }
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn){
      removeHabit(Number(removeBtn.dataset.remove));
      return;
    }
    const title = e.target.closest('.card-title');
    if (title){
      const id = Number(title.dataset.id);
      const current = title.textContent;
      const input2 = document.createElement('input');
      input2.value = current;
      input2.maxLength = 40;
      input2.style.cssText = 'font-family:inherit;font-size:19px;font-weight:500;background:none;border:none;border-bottom:1px solid var(--gold);color:var(--text);width:100%;outline:none;';
      title.replaceWith(input2);
      input2.focus();
      input2.select();
      const commit = () => renameHabit(id, input2.value);
      input2.addEventListener('blur', commit);
      input2.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input2.blur(); });
    }
  });

  listEl.addEventListener('change', (e) => {
    const noteInput = e.target.closest('.note-input');
    if (noteInput) updateNote(Number(noteInput.dataset.id), noteInput.value);
  });

  // drag-to-reorder
  listEl.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    dragId = Number(card.dataset.id);
    card.classList.add('dragging');
  });
  listEl.addEventListener('dragend', (e) => {
    const card = e.target.closest('.card');
    if (card) card.classList.remove('dragging');
    dragId = null;
  });
  listEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    const overCard = e.target.closest('.card');
    if (!overCard || dragId === null) return;
    const overId = Number(overCard.dataset.id);
    if (overId === dragId) return;
    const fromIdx = habits.findIndex(h => h.id === dragId);
    const toIdx = habits.findIndex(h => h.id === overId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = habits.splice(fromIdx, 1);
    habits.splice(toIdx, 0, moved);
    render();
    const newCard = listEl.querySelector(`[data-id="${dragId}"]`);
    if (newCard) newCard.classList.add('dragging');
  });
  listEl.addEventListener('drop', (e) => {
    e.preventDefault();
    saveProfileData();
  });

  addBtn.addEventListener('click', addHabit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addHabit(); });
  exportBtn.addEventListener('click', exportData);

  // ---------- init ----------
  profiles = loadProfiles();
  activeProfileId = loadActiveProfileId();
  saveActiveProfileId(activeProfileId);
  data = loadProfileData(activeProfileId);
  archiveWeekIfNeeded();
  habits = data.habits;
  nextId = habits.reduce((m, h) => Math.max(m, h.id), 0) + 1;
  saveProfileData();
  const activeP = profiles.find(x => x.id === activeProfileId);
  profileNameEl.textContent = activeP ? activeP.name : 'You';
  render();
})();
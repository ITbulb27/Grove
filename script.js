(function(){
  const DAY_LABELS = ['M','T','W','T','F','S','S'];
  const todayIdx = (new Date().getDay() + 6) % 7; // Monday = 0
  const STORAGE_KEY = 'grove-habits-v1';
  const THEME_KEY = 'grove-theme-v1';

  let habits = loadHabits();
  let nextId = habits.reduce((m, h) => Math.max(m, h.id), 0) + 1;
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

  // ---------- persistence ----------
  function loadHabits(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultHabits();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return defaultHabits();
      return parsed;
    } catch (e) {
      return defaultHabits();
    }
  }
  function defaultHabits(){
    return [
      { id: 1, name: 'Morning walk', category: 'health', note: '', days: [true, true, false, true, false, false, false], best: 2 },
      { id: 2, name: 'Read 20 minutes', category: 'learning', note: '', days: [true, false, false, false, false, false, false], best: 1 },
    ];
  }
  function saveHabits(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(habits)); }
    catch (e) { /* storage unavailable — fail silently, app still works in-memory */ }
  }

  // ---------- theme ----------
  function loadTheme(){
    try { return localStorage.getItem(THEME_KEY) || 'dark'; }
    catch (e) { return 'dark'; }
  }
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    themeIcon.textContent = theme === 'light' ? '☀' : '☾';
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

  // ---------- render ----------
  function render(justCompletedId){
    listEl.innerHTML = '';
    emptyEl.style.display = habits.length ? 'none' : 'block';

    // weekly summary
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
          <input class="note-input" data-id="${h.id}" placeholder="Add a note…" value="${escapeHtml(h.note || '')}" maxlength="80" />
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

  // ---------- actions ----------
  function toggleDay(id, day){
    const h = habits.find(x => x.id === id);
    h.days[day] = !h.days[day];
    const streak = computeStreak(h.days);
    h.best = Math.max(h.best || 0, streak);
    const justCompleted = h.days.filter(Boolean).length === 7 ? id : null;
    saveHabits();
    render(justCompleted);
  }

  function renameHabit(id, name){
    const h = habits.find(x => x.id === id);
    if (name.trim()) h.name = name.trim();
    saveHabits();
    render();
  }

  function updateNote(id, note){
    const h = habits.find(x => x.id === id);
    h.note = note;
    saveHabits();
  }

  function removeHabit(id){
    const idx = habits.findIndex(x => x.id === id);
    if (idx === -1) return;
    lastRemoved = { habit: habits[idx], index: idx };
    habits.splice(idx, 1);
    saveHabits();
    render();
    showToast(`Removed "${lastRemoved.habit.name}"`, {
      actionLabel: 'Undo',
      onAction: () => {
        habits.splice(lastRemoved.index, 0, lastRemoved.habit);
        saveHabits();
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
    saveHabits();
    render();
  }

  function exportData(){
    const blob = new Blob([JSON.stringify(habits, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grove-habits.json';
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
    saveHabits();
  });

  addBtn.addEventListener('click', addHabit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addHabit(); });
  exportBtn.addEventListener('click', exportData);

  render();
})();
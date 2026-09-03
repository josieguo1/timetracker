'use strict';

/* ============================ State ============================ */

const STORAGE_KEY = 'timetrack.v1';

// Default presets: light hex is canonical/stored; dark is the same hue
// re-stepped for the dark surface. The first eight are the core set, ordered
// so adjacent chart series stay distinguishable; the rest broaden the choice.
// The editable copy lives in state.palette — users can delete and add slots.
const DEFAULT_PALETTE = [
  { name: 'Blue',      light: '#2a78d6', dark: '#3987e5' },
  { name: 'Orange',    light: '#eb6834', dark: '#d95926' },
  { name: 'Aqua',      light: '#1baf7a', dark: '#199e70' },
  { name: 'Yellow',    light: '#eda100', dark: '#c98500' },
  { name: 'Magenta',   light: '#e87ba4', dark: '#d55181' },
  { name: 'Green',     light: '#008300', dark: '#008300' },
  { name: 'Violet',    light: '#4a3aa7', dark: '#9085e9' },
  { name: 'Red',       light: '#e34948', dark: '#e66767' },
  { name: 'Sky',       light: '#5aa9e6', dark: '#6cb4ef' },
  { name: 'Navy',      light: '#1f4e8c', dark: '#5c8bc9' },
  { name: 'Teal',      light: '#0f8b8d', dark: '#2ba5a7' },
  { name: 'Mint',      light: '#54b891', dark: '#48a382' },
  { name: 'Forest',    light: '#2f6b3a', dark: '#57945f' },
  { name: 'Olive',     light: '#7a7a2e', dark: '#9b9b4a' },
  { name: 'Lime',      light: '#a4c400', dark: '#8fae13' },
  { name: 'Gold',      light: '#c69214', dark: '#d8a62c' },
  { name: 'Peach',     light: '#f0956a', dark: '#d97f52' },
  { name: 'Brick',     light: '#b04a3a', dark: '#c96a57' },
  { name: 'Maroon',    light: '#7d2a3c', dark: '#a34e5e' },
  { name: 'Rose',      light: '#c94f7c', dark: '#d8749a' },
  { name: 'Plum',      light: '#8e4a9e', dark: '#a86bb8' },
  { name: 'Indigo',    light: '#5c6bc0', dark: '#7a88d6' },
  { name: 'Brown',     light: '#8d6e63', dark: '#a1887f' },
  { name: 'Slate',     light: '#607080', dark: '#8595a5' },
];

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

let exportLightMode = false; // PDF export always renders the light look

function displayColor(hex) {
  const h = String(hex).toLowerCase();
  // Check the defaults first so deleted presets keep their dark variant.
  const slot = DEFAULT_PALETTE.find(p => p.light.toLowerCase() === h)
    || state.palette.find(p => p.light.toLowerCase() === h);
  if (slot && slot.dark && darkQuery.matches && !exportLightMode) return slot.dark;
  return hex;
}

function defaultState() {
  return {
    projects: [],  // {id, name, color, archived, createdAt}
    entries: [],   // {id, projectId, start, end|null}
    palette: DEFAULT_PALETTE.map(p => ({ ...p })),
    settings: { defaultRange: 'week', defaultBucket: 'day' },
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : base.projects,
      entries: Array.isArray(parsed.entries) ? parsed.entries : base.entries,
      palette: Array.isArray(parsed.palette) ? parsed.palette : base.palette,
      settings: Object.assign(base.settings, parsed.settings || {}),
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save data', err);
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function projectById(id) {
  return state.projects.find(p => p.id === id) || null;
}

// Subprojects: a project with a (valid) parentId is a subproject of it.
function childrenOf(id) {
  return state.projects.filter(p => p.parentId === id);
}

function isSub(p) {
  return !!(p.parentId && projectById(p.parentId));
}

function isTopLevel(p) {
  return !isSub(p);
}

function projectLabel(p) {
  const parent = p.parentId && projectById(p.parentId);
  return parent ? `${parent.name} › ${p.name}` : p.name;
}

function runningEntry() {
  return state.entries.find(e => e.end === null) || null;
}

/* ============================ Utils ============================ */

const $ = sel => document.querySelector(sel);

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'style') Object.assign(node.style, v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(child);
  }
  return node;
}

// In-app confirmation modal — native confirm() is unreliable in embedded
// browsers, which silently auto-decline it.
function confirmDialog(message, confirmLabel = 'Delete') {
  return new Promise(resolve => {
    const done = v => { overlay.remove(); resolve(v); };
    const overlay = el('div', { class: 'modal-overlay' }, [
      el('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true' }, [
        el('p', { class: 'modal-msg', text: message }),
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'btn-ghost', text: 'Cancel', onclick: () => done(false) }),
          el('button', { class: 'btn-primary modal-danger', text: confirmLabel, onclick: () => done(true) }),
        ]),
      ]),
    ]);
    overlay.addEventListener('click', ev => { if (ev.target === overlay) done(false); });
    document.body.appendChild(overlay);
  });
}

const MS_MIN = 60000;
const MS_HOUR = 3600000;
const MS_DAY = 86400000;

function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
function startOfWeek(t) { // Monday
  const d = new Date(startOfDay(t));
  const shift = (d.getDay() + 6) % 7;
  return addDays(d.getTime(), -shift);
}
function startOfMonth(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(1); return d.getTime(); }
function addMonths(t, n) { const d = new Date(t); d.setMonth(d.getMonth() + n); return d.getTime(); }
function startOfYear(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setMonth(0, 1); return d.getTime(); }

function fmtDur(ms) {
  const mins = Math.round(ms / MS_MIN);
  if (mins < 1) return ms > 0 ? '<1m' : '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function fmtTime(t) {
  const d = new Date(t);
  return fmtHM(d.getHours(), d.getMinutes());
}

function fmtDayHeading(dayStart) {
  const today = startOfDay(Date.now());
  if (dayStart === today) return 'Today';
  if (dayStart === addDays(today, -1)) return 'Yesterday';
  const d = new Date(dayStart);
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString([], opts);
}

/* ============================ Tabs ============================ */

let activeTab = 'timer';

function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach(btn => {
    const sel = btn.dataset.tab === name;
    btn.setAttribute('aria-selected', String(sel));
  });
  document.querySelectorAll('.panel').forEach(p => { p.hidden = true; });
  $(`#panel-${name}`).hidden = false;
  if (name === 'timer') renderTimer();
  if (name === 'projects') renderProjects();
  if (name === 'reports') renderReports();
  if (name === 'settings') renderSettings();
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/* ============================ Timer tab ============================ */

function startTimer(projectId) {
  stopTimer();
  state.entries.push({ id: uid(), projectId, start: Date.now(), end: null });
  saveState();
  renderTimer();
}

function stopTimer() {
  const run = runningEntry();
  if (!run) return;
  run.end = Date.now();
  saveState();
}

function renderTimer() {
  const select = $('#timer-project');
  const run = runningEntry();
  const active = state.projects.filter(p => !p.archived);

  const prevChoice = select.value;
  select.textContent = '';
  // Time is tracked on subprojects only — projects without them aren't listed.
  for (const p of active.filter(isTopLevel)) {
    for (const c of active.filter(x => x.parentId === p.id)) {
      select.appendChild(el('option', { value: c.id, text: `${p.name} › ${c.name}` }));
    }
  }
  if (run) {
    // Running project may be archived; make sure it is listed and selected.
    if (!active.some(p => p.id === run.projectId)) {
      const p = projectById(run.projectId);
      select.appendChild(el('option', { value: run.projectId, text: p ? p.name : 'Deleted project' }));
    }
    select.value = run.projectId;
  } else if (active.some(p => p.id === prevChoice)) {
    select.value = prevChoice;
  }
  select.disabled = !!run;

  const toggle = $('#timer-toggle');
  toggle.textContent = run ? 'Stop' : 'Start';
  toggle.classList.toggle('stop', !!run);
  toggle.disabled = !run && select.options.length === 0;

  const hint = $('#timer-hint');
  hint.textContent = '';
  if (!run && select.options.length === 0) {
    const noProjects = active.length === 0;
    hint.append(noProjects ? 'No projects yet — ' : 'No subprojects yet — ');
    hint.appendChild(el('a', {
      href: '#',
      text: noProjects ? 'create one in the Projects tab' : 'add one with + Sub in the Projects tab',
      onclick: ev => { ev.preventDefault(); switchTab('projects'); },
    }));
    hint.append('.');
  } else if (run) {
    const p = projectById(run.projectId);
    hint.textContent = p ? `Tracking ${projectLabel(p)} since ${fmtTime(run.start)}.` : '';
  }

  updateTimerSwatch();
  updateClock();
  renderEntryList();
}

function updateTimerSwatch() {
  const select = $('#timer-project');
  const p = projectById(select.value);
  $('#timer-swatch').style.background = p ? displayColor(p.color) : 'var(--gridline)';
}

function updateClock() {
  const run = runningEntry();
  $('#timer-clock').textContent = run ? fmtClock(Date.now() - run.start) : '0:00:00';
  document.title = run ? `${fmtClock(Date.now() - run.start)} · TIME TRACKER` : 'TIME TRACKER';
}

function entryDuration(e) {
  return (e.end === null ? Date.now() : e.end) - e.start;
}

let editingEntryId = null;

/* ---------- Custom time picker ---------- */
// 12-hour wheel picker, opened by clicking the time field and centred beneath
// it. Like the lock-screen picker, whatever number rests in the middle of a
// column is the selected value — scrolling changes it, and columns snap to
// centre. No visible scrollbar; the centred value carries light shading.

const TP_ITEM_H = 32;  // must match .tp-item height in the stylesheet

function fmtHM(h, m) {
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

let openPickerClose = null; // at most one picker open at a time

function createTimePicker(ms, label) {
  let h = new Date(ms).getHours();
  let m = new Date(ms).getMinutes();

  const field = el('button', {
    type: 'button', class: 'tp-field', 'aria-label': label,
    'aria-haspopup': 'listbox', text: fmtHM(h, m),
  });
  const pop = el('div', { class: 'tp-pop' });
  pop.hidden = true;
  const wrap = el('span', { class: 'tp-wrap' }, [field, pop]);

  const colInits = []; // scroll each column to its value when the pop opens

  const mkCol = (values, startIdx, onSel, fmt) => {
    const len = values.length;
    // Hours and minutes wrap around endlessly: render several copies of the
    // list and silently recentre when the scroll nears either end. The
    // two-item AM/PM column stays finite.
    const REPS = len > 2 ? (len < 24 ? 33 : 9) : 1;
    const midBase = Math.floor(REPS / 2) * len;
    const colEl = el('div', { class: 'tp-col', role: 'listbox', 'aria-label': label });
    const items = [];
    for (let r = 0; r < REPS; r++) {
      values.forEach((v, vi) => {
        const i = r * len + vi;
        const item = el('button', {
          type: 'button', class: 'tp-item', role: 'option', 'aria-selected': 'false',
          text: fmt(v),
          onclick: () => colEl.scrollTo({ top: i * TP_ITEM_H, behavior: 'smooth' }),
        });
        colEl.appendChild(item);
        items.push(item);
      });
    }

    let idx = -1;
    const setIdx = (i, silent) => {
      i = Math.max(0, Math.min(items.length - 1, i));
      if (i === idx) return;
      if (items[idx]) {
        items[idx].classList.remove('selected');
        items[idx].setAttribute('aria-selected', 'false');
      }
      idx = i;
      items[idx].classList.add('selected');
      items[idx].setAttribute('aria-selected', 'true');
      if (!silent) {
        onSel(values[idx % len]);
        field.textContent = fmtHM(h, m);
      }
    };
    setIdx(midBase + startIdx, true);

    // The value resting at the column's centre is the selection. (No rAF
    // here — browsers pause animation frames in background tabs.)
    colEl.addEventListener('scroll', () => {
      const i = Math.round(colEl.scrollTop / TP_ITEM_H);
      setIdx(i, false);
      if (REPS > 1 && (i < len * 2 || i >= (REPS - 2) * len)) {
        const centred = midBase + (((i % len) + len) % len);
        if (items[idx]) { // clear the pre-jump highlight before reselecting
          items[idx].classList.remove('selected');
          items[idx].setAttribute('aria-selected', 'false');
        }
        idx = -1;
        colEl.scrollTop = centred * TP_ITEM_H;
        setIdx(centred, true);
      }
    });

    colInits.push(() => { colEl.scrollTop = idx * TP_ITEM_H; });
    pop.appendChild(colEl);
  };

  mkCol(Array.from({ length: 12 }, (_, i) => i + 1),
    (h % 12 === 0 ? 12 : h % 12) - 1,
    v => { h = (v % 12) + (h >= 12 ? 12 : 0); },
    String);
  mkCol(Array.from({ length: 60 }, (_, i) => i),
    m,
    v => { m = v; },
    v => String(v).padStart(2, '0'));
  mkCol(['AM', 'PM'],
    h < 12 ? 0 : 1,
    v => { h = v === 'AM' ? h % 12 : (h % 12) + 12; },
    v => v);

  const close = () => {
    pop.hidden = true;
    document.removeEventListener('pointerdown', onDocDown, true);
    if (openPickerClose === close) openPickerClose = null;
  };
  const onDocDown = ev => { if (!wrap.contains(ev.target)) close(); };

  field.addEventListener('click', () => {
    if (!pop.hidden) { close(); return; }
    if (openPickerClose) openPickerClose();
    pop.hidden = false;
    for (const init of colInits) init();
    openPickerClose = close;
    document.addEventListener('pointerdown', onDocDown, true);
  });

  return { el: wrap, get: () => ({ h, m }) };
}

/* ---------- Custom date picker (calendar popover) ---------- */

function fmtDateField(t) {
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function createDatePicker(ms, label) {
  let sel = startOfDay(ms);
  let view = startOfMonth(ms);
  const field = el('button', {
    type: 'button', class: 'tp-field', 'aria-label': label,
    'aria-haspopup': 'dialog', text: fmtDateField(sel),
  });
  const pop = el('div', { class: 'dp-pop' });
  pop.hidden = true;
  const wrap = el('span', { class: 'tp-wrap' }, [field, pop]);

  const build = () => {
    pop.textContent = '';
    const monthDate = new Date(view);
    pop.appendChild(el('div', { class: 'dp-head' }, [
      el('button', { type: 'button', class: 'btn-icon', text: '‹', 'aria-label': 'Previous month', onclick: () => { view = addMonths(view, -1); build(); } }),
      el('span', { class: 'dp-title', text: monthDate.toLocaleDateString([], { month: 'long', year: 'numeric' }) }),
      el('button', { type: 'button', class: 'btn-icon', text: '›', 'aria-label': 'Next month', onclick: () => { view = addMonths(view, 1); build(); } }),
    ]));
    const grid = el('div', { class: 'dp-grid' });
    for (const wd of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) grid.appendChild(el('span', { class: 'dp-wd', text: wd }));
    const first = startOfWeek(view);
    for (let t = first, i = 0; i < 42; t = addDays(t, 1), i++) {
      const day = t;
      const inMonth = new Date(day).getMonth() === monthDate.getMonth();
      grid.appendChild(el('button', {
        type: 'button',
        class: 'dp-day' + (day === sel ? ' selected' : '') + (inMonth ? '' : ' dim'),
        text: String(new Date(day).getDate()),
        onclick: () => { sel = day; field.textContent = fmtDateField(sel); close(); },
      }));
    }
    pop.appendChild(grid);
  };

  const close = () => {
    pop.hidden = true;
    document.removeEventListener('pointerdown', onDoc, true);
    if (openPickerClose === close) openPickerClose = null;
  };
  const onDoc = ev => { if (!wrap.contains(ev.target)) close(); };
  field.addEventListener('click', () => {
    if (!pop.hidden) { close(); return; }
    if (openPickerClose) openPickerClose();
    view = startOfMonth(sel);
    build();
    pop.hidden = false;
    openPickerClose = close;
    document.addEventListener('pointerdown', onDoc, true);
  });

  return { el: wrap, get: () => sel };
}

function entryEditRow(e, p) {
  const isRunning = e.end === null;
  const datePicker = createDatePicker(e.start, 'Entry date');
  const startPicker = createTimePicker(e.start, 'Start time');
  const endPicker = isRunning ? null : createTimePicker(e.end, 'End time');
  const errEl = el('div', { class: 'entry-error', role: 'alert' });

  const save = () => {
    errEl.textContent = '';
    const s = startPicker.get();
    const day = datePicker.get();
    const startDay = new Date(day);
    startDay.setHours(s.h, s.m, 0, 0);
    const newStart = startDay.getTime();
    if (isRunning) {
      if (newStart > Date.now()) {
        errEl.textContent = 'Invalid entry — the start time can’t be in the future.';
        return;
      }
      e.start = newStart;
    } else {
      // Both times stay within the chosen day — no midnight rollover.
      const en = endPicker.get();
      const endDay = new Date(day);
      endDay.setHours(en.h, en.m, 0, 0);
      const newEnd = endDay.getTime();
      if (newEnd <= newStart) {
        errEl.textContent = 'Invalid entry — the end time must be after the start time.';
        return;
      }
      e.start = newStart;
      e.end = newEnd;
    }
    editingEntryId = null;
    saveState();
    renderTimer();
  };
  const cancel = () => { editingEntryId = null; renderTimer(); };

  return el('div', { class: 'entry editing' }, [
    el('span', { class: 'swatch', style: { background: p ? displayColor(p.color) : 'var(--gridline)' } }),
    el('span', { class: 'entry-name', text: p ? projectLabel(p) : 'Deleted project' }),
    datePicker.el,
    startPicker.el,
    el('span', { class: 'entry-range', text: '–' }),
    isRunning ? el('span', { class: 'entry-range', text: 'now' }) : endPicker.el,
    el('button', { class: 'btn-primary', text: 'Save', onclick: save }),
    el('button', { class: 'btn-ghost', text: 'Cancel', onclick: cancel }),
    errEl,
  ]);
}

function renderEntryList() {
  const wrap = $('#entry-days');
  wrap.textContent = '';

  if (state.entries.length === 0) {
    wrap.appendChild(el('div', { class: 'empty', text: 'Nothing tracked yet. Pick a project and press Start.' }));
    return;
  }

  const byDay = new Map();
  for (const e of state.entries) {
    const day = startOfDay(e.start);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }
  const days = [...byDay.keys()].sort((a, b) => b - a);

  for (const day of days) {
    const entries = byDay.get(day).sort((a, b) => b.start - a.start);
    const total = entries.reduce((sum, e) => sum + entryDuration(e), 0);

    const group = el('div', { class: 'day-group' });
    group.appendChild(el('div', { class: 'day-head' }, [
      el('h3', { text: fmtDayHeading(day) }),
      el('span', { class: 'day-total', 'data-day': day, text: fmtDur(total) }),
    ]));

    for (const e of entries) {
      const p = projectById(e.projectId);
      if (e.id === editingEntryId) {
        group.appendChild(entryEditRow(e, p));
        continue;
      }
      const isRunning = e.end === null;
      const row = el('div', { class: 'entry' + (isRunning ? ' running' : '') }, [
        el('span', { class: 'swatch', style: { background: p ? displayColor(p.color) : 'var(--gridline)' } }),
        el('div', { class: 'entry-main' }, [
          el('span', { class: 'entry-name', text: p ? projectLabel(p) : 'Deleted project' }),
          el('span', { class: 'entry-range', text: `${fmtTime(e.start)} – ${isRunning ? 'now' : fmtTime(e.end)}` }),
        ]),
        el('span', { class: 'entry-dur', 'data-entry': e.id, text: fmtDur(entryDuration(e)) }),
      ]);
      row.appendChild(el('button', {
        class: 'btn-icon', title: 'Edit times', 'aria-label': 'Edit start and end time', text: '✎',
        onclick: () => { editingEntryId = e.id; renderTimer(); },
      }));
      row.appendChild(el('button', {
        class: 'btn-icon danger', title: 'Delete entry', 'aria-label': 'Delete entry', text: '✕',
        onclick: async () => {
          if (!isRunning && !(await confirmDialog('Delete this entry?'))) return;
          state.entries = state.entries.filter(x => x.id !== e.id);
          saveState();
          renderTimer();
        },
      }));
      group.appendChild(row);
    }
    wrap.appendChild(group);
  }
}

$('#timer-toggle').addEventListener('click', () => {
  const run = runningEntry();
  if (run) {
    stopTimer();
    renderTimer();
  } else {
    const projectId = $('#timer-project').value;
    if (projectId) startTimer(projectId);
  }
});

$('#timer-project').addEventListener('change', updateTimerSwatch);

// Live tick: update the clock, the running entry row and its day total.
setInterval(() => {
  const run = runningEntry();
  if (!run) return;
  updateClock();
  if (activeTab !== 'timer') return;
  const durEl = document.querySelector(`[data-entry="${run.id}"]`);
  if (durEl) durEl.textContent = fmtDur(entryDuration(run));
  const day = startOfDay(run.start);
  const dayEl = document.querySelector(`[data-day="${day}"]`);
  if (dayEl) {
    const total = state.entries
      .filter(e => startOfDay(e.start) === day)
      .reduce((sum, e) => sum + entryDuration(e), 0);
    dayEl.textContent = fmtDur(total);
  }
}, 1000);

/* ============================ Projects tab ============================ */

function firstUnusedSlot() {
  const used = new Set(state.projects.map(p => p.color.toLowerCase()));
  const free = state.palette.find(s => !used.has(s.light.toLowerCase()));
  if (free) return free.light;
  return state.palette.length > 0 ? state.palette[0].light : DEFAULT_PALETTE[0].light;
}

let pickedColor = firstUnusedSlot();
let editingProjectId = null;

// Shared editable swatch row: `palette` is a live array in state (the project
// palette or the theme palette) — deleting and adding presets mutates it.
function buildSwatchRow(container, palette, selected, onPick) {
  container.textContent = '';
  const sel = String(selected).toLowerCase();
  const isCustom = !palette.some(p => p.light.toLowerCase() === sel);

  palette.forEach((slot, i) => {
    const pick = el('button', {
      type: 'button',
      class: 'swatch-pick',
      role: 'radio',
      title: slot.name,
      'aria-label': slot.name,
      'aria-checked': String(slot.light.toLowerCase() === sel),
      style: { background: displayColor(slot.light) },
      onclick: () => onPick(slot.light),
    });
    const del = el('button', {
      type: 'button',
      class: 'swatch-del',
      title: `Remove ${slot.name} preset`,
      'aria-label': `Remove ${slot.name} preset`,
      text: '×',
      onclick: async () => {
        if (!(await confirmDialog(`Remove the ${slot.name} preset colour?`, 'Remove'))) return;
        palette.splice(i, 1);
        saveState();
        onPick(selected); // re-render the row; the current pick is unchanged
      },
    });
    container.appendChild(el('span', { class: 'swatch-wrap' }, [pick, del]));
  });

  // Custom colour: an in-app grid panel that the circle toggles open and
  // closed (the native OS picker can't be retracted programmatically).
  const isOpen = container.dataset.customOpen === '1';
  const customBtn = el('button', {
    type: 'button',
    class: 'swatch-pick swatch-custom',
    title: 'Custom Colour',
    'aria-label': 'Custom Colour',
    'aria-expanded': String(isOpen),
    onclick: () => {
      container.dataset.customOpen = isOpen ? '' : '1';
      onPick(selected);
    },
  });
  customBtn.style.background = isCustom
    ? selected
    : 'conic-gradient(#e34948, #eda100, #1baf7a, #2a78d6, #4a3aa7, #e87ba4, #e34948)';
  if (isCustom) customBtn.style.borderColor = 'var(--text-primary)';

  // "+ Add Preset" sits permanently beside the circle; it saves whatever
  // colour is currently selected.
  const addBtn = el('button', {
    type: 'button',
    class: 'btn-ghost swatch-add',
    text: '+ Add Preset',
    onclick: () => {
      const v = String(selected).toLowerCase();
      if (!palette.some(p => p.light.toLowerCase() === v)) {
        palette.push({ name: v, light: v, dark: v });
        saveState();
      }
      onPick(v);
    },
  });

  const customWrap = el('span', { class: 'swatch-custom-wrap' }, [customBtn, addBtn]);
  if (isOpen) customWrap.appendChild(buildColorPanel(selected, onPick));
  container.appendChild(customWrap);

  // One outside-click listener per container; rebuilds replace it.
  if (container._customDoc) {
    document.removeEventListener('pointerdown', container._customDoc, true);
    container._customDoc = null;
  }
  if (isOpen) {
    const onDoc = ev => {
      if (customWrap.contains(ev.target)) return;
      document.removeEventListener('pointerdown', onDoc, true);
      container._customDoc = null;
      if (document.contains(container)) {
        container.dataset.customOpen = '';
        onPick(selected);
      }
    };
    container._customDoc = onDoc;
    document.addEventListener('pointerdown', onDoc, true);
  }
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const CUSTOM_HUES = [0, 25, 45, 60, 90, 140, 170, 200, 220, 250, 280, 320];
const CUSTOM_SHADES = [[0.7, 0.8], [0.7, 0.65], [0.7, 0.5], [0.7, 0.38], [0.55, 0.27]]; // [saturation, lightness]

function buildColorPanel(selected, onPick) {
  const sel = String(selected).toLowerCase();
  const panel = el('div', { class: 'color-pop', role: 'listbox', 'aria-label': 'Custom colour' });
  const rows = CUSTOM_SHADES.map(([s, l]) => CUSTOM_HUES.map(hue => hslToHex(hue, s, l)));
  rows.push(Array.from({ length: 12 }, (_, i) => hslToHex(0, 0, 0.98 - i * (0.93 / 11)))); // greys
  for (const row of rows) {
    const rowEl = el('div', { class: 'color-row' });
    for (const c of row) {
      rowEl.appendChild(el('button', {
        type: 'button',
        class: 'color-cell' + (c === sel ? ' selected' : ''),
        'aria-label': c,
        title: c,
        style: { background: c },
        onclick: () => onPick(c),
      }));
    }
    panel.appendChild(rowEl);
  }
  return panel;
}

function projectTotal(projectId) {
  return state.entries
    .filter(e => e.projectId === projectId)
    .reduce((sum, e) => sum + entryDuration(e), 0);
}

function projectTotalRollup(p) {
  return projectTotal(p.id) + childrenOf(p.id).reduce((sum, c) => sum + projectTotal(c.id), 0);
}

let addingSubFor = null;

function renderProjects() {
  buildSwatchRow($('#swatch-row'), state.palette, pickedColor, color => {
    pickedColor = color;
    renderProjects();
  });

  const activeWrap = $('#project-list-active');
  const archivedWrap = $('#project-list-archived');
  activeWrap.textContent = '';
  archivedWrap.textContent = '';

  const active = state.projects.filter(p => !p.archived);
  const archived = state.projects.filter(p => p.archived);

  if (active.length === 0) {
    activeWrap.appendChild(el('div', { class: 'empty', text: 'No active projects.' }));
  }
  for (const p of active.filter(isTopLevel)) {
    activeWrap.appendChild(projectRow(p));
    for (const c of active.filter(x => x.parentId === p.id)) {
      activeWrap.appendChild(projectRow(c));
    }
    if (addingSubFor === p.id) activeWrap.appendChild(subAddForm(p));
  }
  // Active subprojects whose parent is archived surface at top level.
  for (const p of active.filter(x => x.parentId && projectById(x.parentId) && projectById(x.parentId).archived)) {
    activeWrap.appendChild(projectRow(p));
  }

  $('#archived-title').hidden = archived.length === 0;
  for (const p of archived) archivedWrap.appendChild(projectRow(p));
}

function subAddForm(parent) {
  let color = firstUnusedSlot();
  const nameInput = el('input', {
    type: 'text', placeholder: 'New Subproject Name', maxlength: '60',
    'aria-label': `New subproject of ${parent.name}`,
  });
  const swatchRowEl = el('div', { class: 'swatch-row', role: 'radiogroup', 'aria-label': 'Subproject colour' });
  const rebuild = () => buildSwatchRow(swatchRowEl, state.palette, color, c => { color = c; rebuild(); });
  rebuild();

  const add = () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    state.projects.push({ id: uid(), name, color, archived: false, createdAt: Date.now(), parentId: parent.id });
    addingSubFor = null;
    saveState();
    renderProjects();
  };
  nameInput.addEventListener('keydown', ev => { if (ev.key === 'Enter') add(); });

  return el('div', { class: 'card sub-card' }, [
    el('div', { class: 'form-row' }, [
      nameInput,
      el('button', { class: 'btn-primary', text: 'Add Subproject', onclick: add }),
      el('button', { class: 'btn-ghost', text: 'Cancel', onclick: () => { addingSubFor = null; renderProjects(); } }),
    ]),
    swatchRowEl,
  ]);
}

function projectRow(p) {
  if (editingProjectId === p.id) return projectEditRow(p);

  const sub = isSub(p);
  const row = el('div', {
    class: 'project-row' + (p.archived ? ' archived' : '') + (sub && !p.archived ? ' sub' : ''),
  }, [
    el('span', { class: 'swatch', style: { background: displayColor(p.color) } }),
    el('span', { class: 'name', text: p.archived ? projectLabel(p) : p.name }),
    el('span', { class: 'total', text: fmtDur(sub ? projectTotal(p.id) : projectTotalRollup(p)) }),
  ]);
  row.appendChild(el('button', {
    class: 'btn-icon', title: 'Edit', 'aria-label': `Edit ${p.name}`, text: '✎',
    onclick: () => { editingProjectId = p.id; renderProjects(); },
  }));
  if (!p.archived && !sub) {
    row.appendChild(el('button', {
      class: 'btn-ghost', text: '+ Sub', title: `Add a subproject to ${p.name}`,
      onclick: () => { addingSubFor = addingSubFor === p.id ? null : p.id; renderProjects(); },
    }));
  }
  row.appendChild(el('button', {
    class: 'btn-ghost', text: p.archived ? 'Restore' : 'Archive',
    onclick: () => {
      const val = !p.archived;
      p.archived = val;
      for (const c of childrenOf(p.id)) c.archived = val; // cascade to subprojects
      saveState();
      renderProjects();
    },
  }));
  if (p.archived) {
    row.appendChild(el('button', {
      class: 'btn-ghost btn-danger', 'aria-label': `Delete ${p.name}`, text: 'Delete',
      onclick: async () => {
        const ids = [p.id, ...childrenOf(p.id).map(c => c.id)];
        const n = state.entries.filter(e => ids.includes(e.projectId)).length;
        const subs = ids.length - 1;
        const what = subs > 0 ? `"${p.name}" and its ${subs} ${subs === 1 ? 'subproject' : 'subprojects'}` : `"${p.name}"`;
        const msg = n > 0
          ? `Delete ${what} with ${n} tracked ${n === 1 ? 'entry' : 'entries'}? This cannot be undone.`
          : `Delete ${what}?`;
        if (!(await confirmDialog(msg))) return;
        state.projects = state.projects.filter(x => !ids.includes(x.id));
        state.entries = state.entries.filter(e => !ids.includes(e.projectId));
        saveState();
        renderProjects();
      },
    }));
  }
  return row;
}

function projectEditRow(p) {
  let editColor = p.color;
  const nameInput = el('input', { type: 'text', value: p.name, maxlength: '60', 'aria-label': 'Project name' });
  const swatchRow = el('div', { class: 'swatch-row', role: 'radiogroup', 'aria-label': 'Project colour' });
  const rebuild = () => buildSwatchRow(swatchRow, state.palette, editColor, c => { editColor = c; rebuild(); });
  rebuild();

  const save = () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    p.name = name;
    p.color = editColor;
    editingProjectId = null;
    saveState();
    renderProjects();
  };

  const card = el('div', { class: 'card', style: { marginBottom: '6px' } }, [
    el('div', { class: 'form-row' }, [
      nameInput,
      el('button', { class: 'btn-primary', text: 'Save', onclick: save }),
      el('button', { class: 'btn-ghost', text: 'Cancel', onclick: () => { editingProjectId = null; renderProjects(); } }),
    ]),
    swatchRow,
  ]);
  nameInput.addEventListener('keydown', ev => { if (ev.key === 'Enter') save(); });
  return card;
}

$('#project-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const input = $('#project-name');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  state.projects.push({ id: uid(), name, color: pickedColor, archived: false, createdAt: Date.now() });
  saveState();
  input.value = '';
  pickedColor = firstUnusedSlot();
  renderProjects();
});

/* ============================ Reports tab ============================ */

const BUCKETS_FOR_RANGE = { week: ['day'], month: ['day', 'week'], year: ['week', 'month'] };
const BUCKET_LABEL = { day: 'Bar per Day', week: 'Bar per Week', month: 'Bar per Month' };

const reportView = {
  range: state.settings.defaultRange,
  bucket: state.settings.defaultBucket,
  groupBy: state.settings.defaultGroupBy === 'sub' ? 'sub' : 'project',
  offset: 0, // 0 = current period, -1 = previous, ...
};
if (!BUCKETS_FOR_RANGE[reportView.range]) reportView.range = 'week';
if (!BUCKETS_FOR_RANGE[reportView.range].includes(reportView.bucket)) {
  reportView.bucket = BUCKETS_FOR_RANGE[reportView.range][0];
}

function periodBounds() {
  const now = Date.now();
  if (reportView.range === 'week') {
    const start = addDays(startOfWeek(now), reportView.offset * 7);
    return { start, end: addDays(start, 7) };
  }
  if (reportView.range === 'month') {
    const start = addMonths(startOfMonth(now), reportView.offset);
    return { start, end: addMonths(start, 1) };
  }
  const start = new Date(new Date(startOfYear(now)).getFullYear() + reportView.offset, 0, 1).getTime();
  return { start, end: new Date(new Date(start).getFullYear() + 1, 0, 1).getTime() };
}

function periodLabel({ start, end }) {
  const s = new Date(start);
  if (reportView.range === 'week') {
    const e = new Date(end - 1);
    const sameMonth = s.getMonth() === e.getMonth();
    const left = s.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const right = e.toLocaleDateString([], sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
    return `${left} – ${right}, ${e.getFullYear()}`;
  }
  if (reportView.range === 'month') {
    return s.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }
  return String(s.getFullYear());
}

function makeBuckets({ start, end }) {
  const buckets = [];
  if (reportView.bucket === 'day') {
    for (let t = start; t < end; t = addDays(t, 1)) {
      const d = new Date(t);
      buckets.push({
        start: t,
        end: addDays(t, 1),
        label: reportView.range === 'week'
          ? d.toLocaleDateString([], { weekday: 'short' })
          : String(d.getDate()),
        title: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
      });
    }
  } else if (reportView.bucket === 'week') {
    for (let t = startOfWeek(start); t < end; t = addDays(t, 7)) {
      const bStart = Math.max(t, start);
      const bEnd = Math.min(addDays(t, 7), end);
      const d = new Date(t);
      const isMonthStart = reportView.range === 'year' ? d.getDate() <= 7 : true;
      buckets.push({
        start: bStart,
        end: bEnd,
        label: reportView.range === 'year'
          ? (isMonthStart ? d.toLocaleDateString([], { month: 'short' }) : '')
          : d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        title: `Week of ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`,
      });
    }
  } else { // month
    for (let t = start; t < end; t = addMonths(t, 1)) {
      const d = new Date(t);
      buckets.push({
        start: t,
        end: addMonths(t, 1),
        label: d.toLocaleDateString([], { month: 'short' }),
        title: d.toLocaleDateString([], { month: 'long', year: 'numeric' }),
      });
    }
  }
  return buckets;
}

// Sum each project's time inside each bucket, clipping entries to the bucket.
function bucketTotals(buckets) {
  const now = Date.now();
  for (const b of buckets) b.perProject = new Map();
  for (const e of state.entries) {
    const eEnd = e.end === null ? now : e.end;
    for (const b of buckets) {
      const overlap = Math.min(eEnd, b.end) - Math.max(e.start, b.start);
      if (overlap > 0) {
        b.perProject.set(e.projectId, (b.perProject.get(e.projectId) || 0) + overlap);
      }
    }
  }
  for (const b of buckets) {
    b.total = [...b.perProject.values()].reduce((a, v) => a + v, 0);
  }
}

// The chart's series depend on the grouping: by project (subproject time
// rolls up into its parent) or by subproject (every project stands alone).
function buildSeries() {
  const out = [];
  for (const p of state.projects.filter(isTopLevel)) {
    if (reportView.groupBy === 'project') {
      out.push({ key: p.id, name: p.name, color: p.color, ids: [p.id, ...childrenOf(p.id).map(c => c.id)] });
    } else {
      out.push({ key: p.id, name: p.name, color: p.color, ids: [p.id] });
      for (const c of childrenOf(p.id)) {
        out.push({ key: c.id, name: `${p.name} › ${c.name}`, color: c.color, ids: [c.id] });
      }
    }
  }
  return out;
}

function renderReports() {
  // Range segments
  document.querySelectorAll('#range-seg button').forEach(btn => {
    btn.setAttribute('aria-checked', String(btn.dataset.range === reportView.range));
  });
  document.querySelectorAll('#group-seg button').forEach(btn => {
    btn.setAttribute('aria-checked', String(btn.dataset.group === reportView.groupBy));
  });

  // Bucket segments (options depend on range)
  const bucketSeg = $('#bucket-seg');
  bucketSeg.textContent = '';
  for (const b of BUCKETS_FOR_RANGE[reportView.range]) {
    bucketSeg.appendChild(el('button', {
      'aria-checked': String(b === reportView.bucket),
      text: BUCKET_LABEL[b],
      onclick: () => { reportView.bucket = b; renderReports(); },
    }));
  }

  const bounds = periodBounds();
  const label = periodLabel(bounds);
  $('#range-label').textContent = label;
  $('#range-next').disabled = reportView.offset >= 0;
  $('#chart-heading').textContent = `Time Tracking for ${label}`;
  $('#breakdown-heading').textContent = `Time Tracking for ${label}`;

  const isDefault = state.settings.defaultRange === reportView.range
    && state.settings.defaultBucket === reportView.bucket
    && (state.settings.defaultGroupBy || 'project') === reportView.groupBy;
  const defBtn = $('#set-default');
  defBtn.textContent = isDefault ? 'Default View ✓' : 'Set as Default View';
  defBtn.disabled = isDefault;

  const buckets = makeBuckets(bounds);
  bucketTotals(buckets);

  // Aggregate raw per-project time into the grouping's series. Series stay in
  // stable creation order — colour follows the series, order never reshuffles.
  const series = buildSeries();
  for (const b of buckets) {
    b.perSeries = new Map();
    let sum = 0;
    for (const s of series) {
      let v = 0;
      for (const id of s.ids) v += b.perProject.get(id) || 0;
      if (v > 0) { b.perSeries.set(s.key, v); sum += v; }
    }
    b.orphan = Math.max(0, b.total - sum); // time on deleted projects
  }
  const inRange = series.filter(s => buckets.some(b => (b.perSeries.get(s.key) || 0) > 0));
  const orphanTime = buckets.some(b => b.orphan > 0);

  const grand = buckets.reduce((a, b) => a + b.total, 0);
  $('#report-total').textContent = grand > 0 ? fmtDur(grand) : '0h';

  drawChart(buckets, inRange, orphanTime);
  drawLegend(inRange);
  drawBreakdown(buckets, inRange, grand);
}

/* ---------- Chart ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function niceTicks(maxHours) {
  const steps = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 24, 48, 100, 200, 500];
  for (const s of steps) {
    if (maxHours / s <= 4.5) {
      const top = Math.ceil(maxHours / s) * s;
      const ticks = [];
      for (let v = 0; v <= top + 1e-9; v += s) ticks.push(+v.toFixed(2));
      return { top, ticks };
    }
  }
  return { top: maxHours, ticks: [0, maxHours] };
}

function fmtTick(hours) {
  if (hours === 0) return '0';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours}h`;
}

function roundedTopBar(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  const bottom = y + h;
  return `M ${x} ${bottom} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} ` +
    `L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${bottom} Z`;
}

function drawChart(buckets, series, orphanTime) {
  const wrap = $('#chart-wrap');
  wrap.textContent = '';
  hideTooltip();

  const grand = buckets.reduce((a, b) => a + b.total, 0);
  if (grand === 0) {
    wrap.appendChild(el('div', { class: 'empty', text: 'No time tracked in this period.' }));
    return;
  }

  const width = Math.max(wrap.clientWidth || 640, 320);
  const height = 260;
  const margin = { top: 10, right: 6, bottom: 24, left: 40 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const baseY = margin.top + plotH;

  const maxHours = Math.max(...buckets.map(b => b.total)) / MS_HOUR;
  const { top, ticks } = niceTicks(maxHours);
  const yFor = hours => baseY - (hours / top) * plotH;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width, height,
    role: 'img',
    'aria-label': 'Tracked time per period, stacked by project',
  });

  // Gridlines + tick labels (recessive, hairline)
  for (const t of ticks) {
    const y = yFor(t);
    svg.appendChild(svgEl('line', {
      x1: margin.left, x2: width - margin.right, y1: y, y2: y,
      class: t === 0 ? 'baseline' : 'gridline',
    }));
    const label = svgEl('text', { x: margin.left - 8, y: y + 4, 'text-anchor': 'end' });
    label.textContent = fmtTick(t);
    svg.appendChild(label);
  }

  const n = buckets.length;
  const slot = plotW / n;
  const barW = Math.min(24, Math.max(3, slot * 0.72));
  const GAP = 2;

  // X labels — thin out when slots get narrow.
  const minLabelPx = reportView.bucket === 'day' && reportView.range === 'month' ? 22 : 44;
  const labelEvery = Math.max(1, Math.ceil(minLabelPx / slot));

  buckets.forEach((b, i) => {
    const cx = margin.left + slot * i + slot / 2;

    if (b.label && (reportView.range === 'year' && reportView.bucket === 'week' ? true : i % labelEvery === 0)) {
      const label = svgEl('text', { x: cx, y: baseY + 16, 'text-anchor': 'middle' });
      label.textContent = b.label;
      svg.appendChild(label);
    }

    const group = svgEl('g', { class: 'col-hit', tabindex: b.total > 0 ? 0 : -1 });

    // Hover wash behind the column
    group.appendChild(svgEl('rect', {
      x: margin.left + slot * i, y: margin.top, width: slot, height: plotH,
      class: 'hover-wash', rx: 6,
    }));

    // Stacked segments, bottom → top, 2px surface gap between them.
    const segs = [];
    for (const s of series) {
      const v = b.perSeries.get(s.key) || 0;
      if (v > 0) segs.push({ color: displayColor(s.color), v });
    }
    if (orphanTime && b.orphan > 0) segs.push({ color: 'var(--baseline)', v: b.orphan });
    segs.sort((a, b2) => b2.v - a.v); // most time at the bottom of the bar

    let cursor = baseY;
    const x = cx - barW / 2;
    segs.forEach((seg, si) => {
      const h = (seg.v / MS_HOUR / top) * plotH;
      const isTop = si === segs.length - 1;
      const y = cursor - h;
      if (isTop) {
        // Topmost segment: full height, 4px rounded data-end, square base.
        if (h >= 3) {
          group.appendChild(svgEl('path', { d: roundedTopBar(x, y, barW, h, 4), fill: seg.color }));
        } else {
          group.appendChild(svgEl('rect', { x, y: cursor - Math.max(h, 1), width: barW, height: Math.max(h, 1), fill: seg.color }));
        }
      } else {
        // 2px surface gap at the segment's top, separating it from the one above.
        group.appendChild(svgEl('rect', { x, y: y + Math.min(GAP, h - 1), width: barW, height: Math.max(1, h - GAP), fill: seg.color }));
      }
      cursor = y;
    });

    // Transparent hit target covering the whole column
    const hit = svgEl('rect', {
      x: margin.left + slot * i, y: margin.top, width: slot, height: plotH,
      fill: 'transparent',
    });
    hit.addEventListener('pointermove', ev => showBarTooltip(ev, b, series, orphanTime));
    hit.addEventListener('pointerleave', hideTooltip);
    group.addEventListener('focus', () => {
      const r = hit.getBoundingClientRect();
      showBarTooltip({ clientX: r.left + r.width / 2, clientY: r.top + 40 }, b, series, orphanTime);
    });
    group.addEventListener('blur', hideTooltip);
    group.appendChild(hit);
    svg.appendChild(group);
  });

  wrap.appendChild(svg);
}

function drawLegend(series) {
  const legend = $('#chart-legend');
  legend.textContent = '';
  if (series.length < 2) return; // single series: the breakdown names it
  for (const s of [...series].sort((a, b) => a.name.localeCompare(b.name))) {
    legend.appendChild(el('span', { class: 'legend-item' }, [
      el('span', { class: 'swatch', style: { background: displayColor(s.color) } }),
      el('span', { text: s.name }),
    ]));
  }
}

let selectedSliceKey = null;

function drawBreakdown(buckets, series, grand) {
  const wrap = $('#report-breakdown');
  wrap.textContent = '';
  hideTooltip();
  if (grand === 0) {
    wrap.appendChild(el('div', { class: 'empty', text: 'Nothing to show yet.' }));
    return;
  }
  const rows = series.map(s => ({
    key: s.key,
    name: s.name,
    color: displayColor(s.color),
    total: buckets.reduce((a, b) => a + (b.perSeries.get(s.key) || 0), 0),
  }));
  const orphan = grand - rows.reduce((a, r) => a + r.total, 0);
  if (orphan > 0) rows.push({ key: '__orphan', name: 'Deleted projects', color: 'var(--baseline)', total: orphan });
  rows.sort((a, b) => b.total - a.total);

  if (selectedSliceKey !== null && !rows.some(r => r.key === selectedSliceKey)) {
    selectedSliceKey = null;
  }
  const redraw = () => drawBreakdown(buckets, series, grand);

  // ----- Pie chart -----
  const size = 200, cx = size / 2, cy = size / 2, radius = 88;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${size} ${size}`,
    role: 'img',
    'aria-label': 'Share of tracked time by project',
  });

  const sliceAttrs = r => ({
    fill: r.color,
    stroke: 'var(--surface)',
    'stroke-width': 2,
    class: 'pie-slice' + (r.key === selectedSliceKey ? ' selected' : ''),
    tabindex: 0,
    role: 'button',
    'aria-pressed': String(r.key === selectedSliceKey),
    'aria-label': `${r.name}: ${Math.round((r.total / grand) * 100)}%`,
  });

  const wireSlice = (node, r) => {
    const toggle = () => {
      selectedSliceKey = selectedSliceKey === r.key ? null : r.key;
      redraw();
    };
    node.addEventListener('click', toggle);
    node.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
    });
    node.addEventListener('pointermove', ev => showSliceTooltip(ev, r, grand));
    node.addEventListener('pointerleave', hideTooltip);
    node.addEventListener('blur', hideTooltip);
  };

  // The selected slice keeps its shape but gets a uniformly wider ring.
  const radiusFor = r => (r.key === selectedSliceKey ? radius + 5 : radius);

  if (rows.length === 1) {
    const circle = svgEl('circle', Object.assign({ cx, cy, r: radiusFor(rows[0]) }, sliceAttrs(rows[0])));
    wireSlice(circle, rows[0]);
    svg.appendChild(circle);
  } else {
    let angle = -Math.PI / 2; // start at 12 o'clock, clockwise
    for (const r of rows) {
      const frac = r.total / grand;
      const end = angle + frac * 2 * Math.PI;
      const rad = radiusFor(r);
      const x1 = cx + rad * Math.cos(angle), y1 = cy + rad * Math.sin(angle);
      const x2 = cx + rad * Math.cos(end), y2 = cy + rad * Math.sin(end);
      const largeArc = frac > 0.5 ? 1 : 0;
      const path = svgEl('path', Object.assign({
        d: `M ${cx} ${cy} L ${x1} ${y1} A ${rad} ${rad} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      }, sliceAttrs(r)));
      wireSlice(path, r);
      svg.appendChild(path);
      angle = end;
    }
  }
  // Hollow centre with the period's total hours inside.
  svg.appendChild(svgEl('circle', { cx, cy, r: 56, fill: 'var(--surface)' }));
  const centreValue = svgEl('text', { x: cx, y: cy + 2, 'text-anchor': 'middle', class: 'pie-total' });
  centreValue.textContent = fmtDur(grand);
  svg.appendChild(centreValue);
  const centreLabel = svgEl('text', { x: cx, y: cy + 22, 'text-anchor': 'middle', class: 'pie-total-label' });
  centreLabel.textContent = 'Total';
  svg.appendChild(centreLabel);

  wrap.appendChild(el('div', { class: 'pie-wrap' }, [svg]));

  // ----- Percentage list beneath -----
  for (const r of rows) {
    const rowEl = el('div', { class: 'bd-row' + (r.key === selectedSliceKey ? ' selected' : '') }, [
      el('span', { class: 'swatch', style: { background: r.color } }),
      el('span', { class: 'bd-name', text: r.name }),
      el('span', { class: 'bd-pct', text: `${Math.round((r.total / grand) * 100)}%` }),
      el('span', { class: 'bd-dur', text: fmtDur(r.total) }),
    ]);
    wrap.appendChild(rowEl);
  }
}

function showSliceTooltip(ev, r, grand) {
  const tip = $('#tooltip');
  tip.textContent = '';
  tip.appendChild(el('div', { class: 'tt-title', text: r.name }));
  tip.appendChild(el('div', { class: 'tt-row' }, [
    el('span', { class: 'tt-key', style: { background: r.color } }),
    el('span', { class: 'tt-val', text: fmtDur(r.total) }),
    el('span', { class: 'tt-name', text: `${Math.round((r.total / grand) * 100)}%` }),
  ]));
  positionTooltip(ev, tip);
}

/* ---------- Tooltip ---------- */

function showBarTooltip(ev, bucket, series, orphanTime) {
  const tip = $('#tooltip');
  tip.textContent = '';
  tip.appendChild(el('div', { class: 'tt-title', text: bucket.title }));

  const rows = series
    .map(s => ({ name: s.name, color: displayColor(s.color), v: bucket.perSeries.get(s.key) || 0 }))
    .filter(r => r.v > 0);
  if (orphanTime && bucket.orphan > 0) {
    rows.push({ name: 'Deleted projects', color: 'var(--baseline)', v: bucket.orphan });
  }

  if (rows.length === 0) {
    tip.appendChild(el('div', { class: 'tt-row' }, [el('span', { class: 'tt-name', text: 'No time tracked' })]));
  }
  for (const r of rows) {
    tip.appendChild(el('div', { class: 'tt-row' }, [
      el('span', { class: 'tt-key', style: { background: r.color } }),
      el('span', { class: 'tt-val', text: fmtDur(r.v) }),
      el('span', { class: 'tt-name', text: r.name }),
    ]));
  }
  if (rows.length > 1) {
    tip.appendChild(el('div', { class: 'tt-row tt-total' }, [
      el('span', { class: 'tt-key', style: { background: 'transparent' } }),
      el('span', { class: 'tt-val', text: fmtDur(bucket.total) }),
      el('span', { class: 'tt-name', text: 'Total' }),
    ]));
  }

  positionTooltip(ev, tip);
}

function positionTooltip(ev, tip) {
  tip.hidden = false;
  const pad = 12;
  const rect = tip.getBoundingClientRect();
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  if (x + rect.width > window.innerWidth - 8) x = ev.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = ev.clientY - rect.height - pad;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function hideTooltip() {
  $('#tooltip').hidden = true;
}

/* ============================ Settings tab ============================ */

/* ---------- Project Order ---------- */

// Swap a project with its neighbouring sibling (dir −1 = up, +1 = down).
// Order within state.projects drives lists, dropdowns, and chart stacking.
function moveProject(p, dir) {
  const sibs = state.projects.filter(x => !x.archived
    && (isSub(p) ? x.parentId === p.parentId : isTopLevel(x) && !x.archived));
  const idx = sibs.indexOf(p);
  const other = sibs[idx + dir];
  if (!other) return;
  const i = state.projects.indexOf(p);
  const j = state.projects.indexOf(other);
  state.projects[i] = other;
  state.projects[j] = p;
  saveState();
  renderSettings();
}

function renderSettings() {
  const wrap = $('#order-list');
  wrap.textContent = '';
  const active = state.projects.filter(x => !x.archived);
  const tops = active.filter(isTopLevel);
  if (tops.length === 0) {
    wrap.appendChild(el('div', { class: 'empty', text: 'No active projects.' }));
    return;
  }
  const rowFor = (p, sibs) => {
    const idx = sibs.indexOf(p);
    const up = el('button', { class: 'btn-icon', text: '▲', 'aria-label': `Move ${p.name} up`, onclick: () => moveProject(p, -1) });
    const down = el('button', { class: 'btn-icon', text: '▼', 'aria-label': `Move ${p.name} down`, onclick: () => moveProject(p, 1) });
    up.disabled = idx === 0;
    down.disabled = idx === sibs.length - 1;
    return el('div', { class: 'order-row' + (isSub(p) ? ' sub' : '') }, [
      el('span', { class: 'swatch', style: { background: displayColor(p.color) } }),
      el('span', { class: 'name', text: p.name }),
      up,
      down,
    ]);
  };
  for (const p of tops) {
    wrap.appendChild(rowFor(p, tops));
    const subs = active.filter(x => x.parentId === p.id);
    for (const c of subs) wrap.appendChild(rowFor(c, subs));
  }
}

/* ---------- Backup & Export ---------- */

function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

$('#backup-download').addEventListener('click', () => {
  const data = Object.assign({ app: 'time-tracking', version: 1, exportedAt: new Date().toISOString() }, state);
  downloadBlob(`time-tracking-backup-${todayStamp()}.json`,
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
});

$('#backup-restore').addEventListener('change', ev => {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const errEl = $('#backup-error');
  errEl.textContent = '';
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.projects) || !Array.isArray(data.entries)) throw new Error('not a backup');
      const when = data.exportedAt ? new Date(data.exportedAt).toLocaleDateString() : 'an unknown date';
      if (!(await confirmDialog(
        `Replace all current data with this backup from ${when}? Current projects and entries will be overwritten.`,
        'Restore'))) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        projects: data.projects,
        entries: data.entries,
        palette: Array.isArray(data.palette) ? data.palette : undefined,
        settings: data.settings || {},
      }));
      location.reload();
    } catch {
      errEl.textContent = 'That file is not a valid backup.';
    }
  };
  reader.onerror = () => { errEl.textContent = 'Could not read that file.'; };
  reader.readAsText(file);
});

/* ----- Minimal .xlsx writer (a zip of XML parts, stored uncompressed) ----- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(files) {
  const enc = new TextEncoder();
  const u16 = v => [v & 255, (v >>> 8) & 255];
  const u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameB = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const header = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0),
    ]);
    parts.push(header, nameB, data);
    central.push({ nameB, crc, size: data.length, offset });
    offset += header.length + nameB.length + data.length;
  }
  const centralParts = [];
  let centralSize = 0;
  for (const c of central) {
    const rec = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(c.crc), ...u32(c.size), ...u32(c.size), ...u16(c.nameB.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(c.offset),
    ]);
    centralParts.push(rec, c.nameB);
    centralSize += rec.length + c.nameB.length;
  }
  const eocd = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);
  return new Blob([...parts, ...centralParts, eocd],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colName(i) {
  let s = '';
  i++;
  while (i > 0) {
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function sheetXml(rows, extra = '') {
  let out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>';
  rows.forEach((row, ri) => {
    out += `<row r="${ri + 1}">`;
    row.forEach((cell, ci) => {
      const ref = colName(ci) + (ri + 1);
      if (typeof cell === 'number') out += `<c r="${ref}"><v>${cell}</v></c>`;
      else out += `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
    });
    out += '</row>';
  });
  return out + '</sheetData>' + extra + '</worksheet>';
}

function exportExcel() {
  const rows = [['Date', 'Project', 'Subproject', 'Start', 'End', 'Duration (Hours)']];
  const done = state.entries.filter(e => e.end !== null).sort((a, b) => a.start - b.start);
  for (const e of done) {
    const p = projectById(e.projectId);
    const parent = p && p.parentId ? projectById(p.parentId) : null;
    const d = new Date(e.start);
    rows.push([
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      parent ? parent.name : (p ? p.name : 'Deleted project'),
      parent && p ? p.name : '',
      fmtTime(e.start),
      fmtTime(e.end),
      Math.round(((e.end - e.start) / MS_HOUR) * 100) / 100,
    ]);
  }
  const files = [
    {
      name: '[Content_Types].xml',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets><sheet name="Time Tracking" sheetId="1" r:id="rId1"/></sheets>'
        + '</workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        + '</Relationships>',
    },
    { name: 'xl/worksheets/sheet1.xml', text: sheetXml(rows) },
  ];
  downloadBlob(`time-tracking-${todayStamp()}.xlsx`, makeZip(files));
}

$('#export-excel').addEventListener('click', exportExcel);

/* ----- Report view export: data table + native stacked Excel chart ----- */

function exportReportExcel() {
  const errEl = $('#report-error');
  errEl.textContent = '';

  const bounds = periodBounds();
  const buckets = makeBuckets(bounds);
  bucketTotals(buckets);
  const all = buildSeries();
  for (const b of buckets) {
    b.perSeries = new Map();
    let sum = 0;
    for (const s of all) {
      let v = 0;
      for (const id of s.ids) v += b.perProject.get(id) || 0;
      if (v > 0) { b.perSeries.set(s.key, v); sum += v; }
    }
    b.orphan = Math.max(0, b.total - sum);
  }
  const series = all.filter(s => buckets.some(b => (b.perSeries.get(s.key) || 0) > 0));
  if (buckets.some(b => b.orphan > 0)) {
    series.push({ key: '__orphan', name: 'Deleted Projects', color: '#898781', orphan: true });
  }
  const grand = buckets.reduce((a, b) => a + b.total, 0);
  if (grand === 0) {
    errEl.textContent = 'Nothing tracked in the period selected in the Reports tab.';
    return;
  }

  const hrs = ms => Math.round((ms / MS_HOUR) * 100) / 100;
  const label = periodLabel(bounds);
  const valueOf = (b, s) => (s.orphan ? b.orphan : (b.perSeries.get(s.key) || 0));

  const rows = [
    ['Period', label],
    ['Grouping', reportView.groupBy === 'sub' ? 'By Subproject' : 'By Project'],
    ['Total (Hours)', hrs(grand)],
    [],
    [{ day: 'Day', week: 'Week', month: 'Month' }[reportView.bucket], ...series.map(s => s.name), 'Total'],
  ];
  for (const b of buckets) {
    rows.push([b.title, ...series.map(s => hrs(valueOf(b, s))), hrs(b.total)]);
  }
  rows.push(['Total', ...series.map(s => hrs(buckets.reduce((a, b) => a + valueOf(b, s), 0))), hrs(grand)]);

  const dataStart = 6; // first bucket row (1-based); row 5 is the header
  const dataEnd = dataStart + buckets.length - 1;
  const catRef = `Report!$A$${dataStart}:$A$${dataEnd}`;
  const catPts = buckets.map((b, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(b.title)}</c:v></c:pt>`).join('');

  const serXml = series.map((s, si) => {
    const col = colName(si + 1);
    const vals = buckets.map((b, i) => `<c:pt idx="${i}"><c:v>${hrs(valueOf(b, s))}</c:v></c:pt>`).join('');
    return '<c:ser>'
      + `<c:idx val="${si}"/><c:order val="${si}"/>`
      + `<c:tx><c:strRef><c:f>Report!$${col}$5</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEscape(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`
      + `<c:spPr><a:solidFill><a:srgbClr val="${String(s.color).replace('#', '').toUpperCase()}"/></a:solidFill></c:spPr>`
      + `<c:cat><c:strRef><c:f>${catRef}</c:f><c:strCache><c:ptCount val="${buckets.length}"/>${catPts}</c:strCache></c:strRef></c:cat>`
      + `<c:val><c:numRef><c:f>Report!$${col}$${dataStart}:$${col}$${dataEnd}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${buckets.length}"/>${vals}</c:numCache></c:numRef></c:val>`
      + '</c:ser>';
  }).join('');

  // Match the app's typeface. The app uses the system font (San Francisco on
  // macOS), which Excel can't select by name — Helvetica Neue is its closest
  // widely available relative.
  const FONT = '<a:latin typeface="Helvetica Neue"/>';
  const chartFontXml = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr>${FONT}</a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
  // Chart area: white fill with a hairline border, like the app's cards.
  const chartBorderXml = '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="C3C2B7"/></a:solidFill></a:ln></c:spPr>';
  const titleXml = text => `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr>${FONT}</a:defRPr></a:pPr><a:r><a:rPr lang="en-US">${FONT}</a:rPr><a:t>${xmlEscape(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;

  const chartXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<c:chart>'
    + titleXml('Time Tracked (Hours) — ' + label)
    + '<c:autoTitleDeleted val="0"/>'
    + '<c:plotArea><c:layout/>'
    + '<c:barChart><c:barDir val="col"/><c:grouping val="stacked"/><c:varyColors val="0"/>'
    + serXml
    + '<c:gapWidth val="60"/><c:overlap val="100"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart>'
    + '<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="222222222"/></c:catAx>'
    + '<c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:tickLblPos val="nextTo"/><c:crossAx val="111111111"/></c:valAx>'
    + '</c:plotArea>'
    + '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>'
    + '<c:plotVisOnly val="1"/>'
    + '</c:chart>'
    + chartBorderXml
    + chartFontXml
    + '</c:chartSpace>';

  // Doughnut chart of each series' share of the period — mirrors the pie
  // shown on the Reports tab. Reads the header names and the totals row.
  const lastCol = colName(series.length);
  const totalsRow = dataEnd + 1;
  const dPts = series.map((s, i) =>
    `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${String(s.color).replace('#', '').toUpperCase()}"/></a:solidFill></c:spPr></c:dPt>`).join('');
  const pieCatPts = series.map((s, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(s.name)}</c:v></c:pt>`).join('');
  const pieValPts = series.map((s, i) => `<c:pt idx="${i}"><c:v>${hrs(buckets.reduce((a, b) => a + valueOf(b, s), 0))}</c:v></c:pt>`).join('');
  const pieChartXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<c:chart>'
    + titleXml('Share of Time — ' + label)
    + '<c:autoTitleDeleted val="0"/>'
    + '<c:plotArea><c:layout/>'
    + '<c:doughnutChart><c:varyColors val="1"/>'
    + '<c:ser><c:idx val="0"/><c:order val="0"/>'
    + `<c:tx><c:strRef><c:f>Report!$A$3</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Total (Hours)</c:v></c:pt></c:strCache></c:strRef></c:tx>`
    + dPts
    + `<c:cat><c:strRef><c:f>Report!$B$5:$${lastCol}$5</c:f><c:strCache><c:ptCount val="${series.length}"/>${pieCatPts}</c:strCache></c:strRef></c:cat>`
    + `<c:val><c:numRef><c:f>Report!$B$${totalsRow}:$${lastCol}$${totalsRow}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${series.length}"/>${pieValPts}</c:numCache></c:numRef></c:val>`
    + '</c:ser>'
    + '<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>'
    + '</c:plotArea>'
    + '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>'
    + '<c:plotVisOnly val="1"/>'
    + '</c:chart>'
    + chartBorderXml
    + chartFontXml
    + '</c:chartSpace>';

  const chartFromCol = series.length + 3;
  const anchorXml = (fromRow, toRow, id, rid) =>
    `<xdr:twoCellAnchor><xdr:from><xdr:col>${chartFromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
    + `<xdr:to><xdr:col>${chartFromCol + 13}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
    + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="Chart ${id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`
    + '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>'
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/></a:graphicData></a:graphic>`
    + '</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
  const drawingXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + anchorXml(4, 32, 2, 'rId1')
    + anchorXml(34, 62, 3, 'rId2')
    + '</xdr:wsDr>';

  const files = [
    {
      name: '[Content_Types].xml',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
        + '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>'
        + '<Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>'
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>'
        + '</workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        + '</Relationships>',
    },
    { name: 'xl/worksheets/sheet1.xml', text: sheetXml(rows, '<drawing r:id="rId1"/>') },
    {
      name: 'xl/worksheets/_rels/sheet1.xml.rels',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>'
        + '</Relationships>',
    },
    { name: 'xl/drawings/drawing1.xml', text: drawingXml },
    {
      name: 'xl/drawings/_rels/drawing1.xml.rels',
      text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>'
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/>'
        + '</Relationships>',
    },
    { name: 'xl/charts/chart1.xml', text: chartXml },
    { name: 'xl/charts/chart2.xml', text: pieChartXml },
  ];
  downloadBlob(`time-tracking-report-${todayStamp()}.xlsx`, makeZip(files));
}

$('#export-report').addEventListener('click', exportReportExcel);

/* ----- Report view export: PDF of the two report cards as shown ----- */

// Capture a whole card — border, headings, chart, legend, list — by cloning
// it with every element's computed style inlined (external CSS and var()
// colours don't survive standalone rendering) and rasterizing it through an
// SVG foreignObject.
function elementToJpeg(elm, scale = 2) {
  const rect = elm.getBoundingClientRect();
  const w = Math.ceil(rect.width);
  const h = Math.ceil(rect.height);
  const clone = elm.cloneNode(true);
  const src = [elm, ...elm.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((s, i) => {
    const cs = getComputedStyle(s);
    let css = '';
    for (const prop of cs) css += `${prop}:${cs.getPropertyValue(prop)};`;
    dst[i].setAttribute('style', css);
  });
  clone.style.margin = '0';
  const wrapper = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  wrapper.appendChild(clone);
  const xhtml = new XMLSerializer().serializeToString(wrapper);
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const pageBg = getComputedStyle(document.body).getPropertyValue('--page').trim() || '#ffffff';
  return renderSvgString(svgStr, w, h, scale, pageBg);
}

function renderSvgString(svgStr, w, h, scale, bg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = bg || '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const bin = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve({ bytes, w: canvas.width, h: canvas.height });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Could not render chart'));
    // A data: URL, not a blob URL — Chrome taints the canvas when a blob-URL
    // SVG containing a foreignObject is drawn to it.
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  });
}

// Minimal one-or-more-page PDF: each image is a JPEG XObject drawn to fit.
function buildPdf(images) {
  const pageW = 595, pageH = 842, margin = 40, gap = 18; // A4 portrait
  const pages = [];
  let page = [], y = pageH - margin;
  images.forEach((im, i) => {
    const w = Math.min(pageW - margin * 2, im.w / 2);
    const h = im.h * (w / im.w);
    if (y - h < margin && page.length > 0) { pages.push(page); page = []; y = pageH - margin; }
    y -= h;
    page.push({ i, x: (pageW - w) / 2, y, w, h });
    y -= gap;
  });
  if (page.length > 0) pages.push(page);

  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const offsets = [];
  const push = b => { chunks.push(b); offset += b.length; };
  const pushTxt = s => push(enc.encode(s));
  const obj = s => { offsets.push(offset); pushTxt(s); };

  pushTxt('%PDF-1.4\n');
  const imgBase = 3 + pages.length * 2;
  obj('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n');
  obj(`2 0 obj << /Type /Pages /Kids [${pages.map((_, k) => `${3 + 2 * k} 0 R`).join(' ')}] /Count ${pages.length} >> endobj\n`);
  pages.forEach((pg, k) => {
    const res = pg.map(pl => `/Im${pl.i} ${imgBase + pl.i} 0 R`).join(' ');
    obj(`${3 + 2 * k} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << ${res} >> >> /Contents ${4 + 2 * k} 0 R >> endobj\n`);
    const content = pg.map(pl =>
      `q ${pl.w.toFixed(2)} 0 0 ${pl.h.toFixed(2)} ${pl.x.toFixed(2)} ${pl.y.toFixed(2)} cm /Im${pl.i} Do Q`).join('\n');
    obj(`${4 + 2 * k} 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj\n`);
  });
  images.forEach((im, i) => {
    offsets.push(offset);
    pushTxt(`${imgBase + i} 0 obj << /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >> stream\n`);
    push(im.bytes);
    pushTxt('\nendstream endobj\n');
  });
  const xrefStart = offset;
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += String(o).padStart(10, '0') + ' 00000 n \n';
  pushTxt(xref);
  pushTxt(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}

async function exportReportPdf() {
  const errEl = $('#report-error');
  errEl.textContent = '';
  // The PDF always uses the default light look — white card backgrounds and
  // dark ink — regardless of the browser's dark mode.
  const lightStyle = document.createElement('style');
  lightStyle.textContent = ':root{'
    + '--page:#f9f9f7 !important;--surface:#ffffff !important;'
    + '--text-primary:#0b0b0b !important;--text-secondary:#52514e !important;'
    + '--text-muted:#898781 !important;--gridline:#e1e0d9 !important;'
    + '--baseline:#c3c2b7 !important;--border:rgba(11,11,11,0.10) !important;'
    + '--ghost-hover:rgba(11,11,11,0.05) !important;}';
  document.head.appendChild(lightStyle);
  exportLightMode = true;
  // The report cards need layout to be captured; if the Reports panel is
  // hidden (we're on Settings), lay it out off-screen for the snapshot.
  const panel = $('#panel-reports');
  const wasHidden = panel.hidden;
  if (wasHidden) {
    panel.hidden = false;
    Object.assign(panel.style, { position: 'absolute', left: '-10000px', top: '0', width: '728px' });
  }
  renderReports();
  try {
    if (!document.querySelector('#chart-wrap svg')) {
      errEl.textContent = 'Nothing tracked in the period selected in the Reports tab.';
      return;
    }
    const chartCard = panel.querySelector('.card');
    const pieCard = $('#report-breakdown-card');
    const images = [await elementToJpeg(chartCard), await elementToJpeg(pieCard)];
    downloadBlob(`time-tracking-report-${todayStamp()}.pdf`, buildPdf(images));
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Could not build the PDF — try again from the Reports tab.';
  } finally {
    lightStyle.remove();
    exportLightMode = false;
    if (wasHidden) {
      panel.hidden = true;
      Object.assign(panel.style, { position: '', left: '', top: '', width: '' });
    }
    renderReports(); // restore the on-screen theme's rendering
  }
}

$('#export-report-pdf').addEventListener('click', exportReportPdf);

/* ---------- Report controls ---------- */

document.querySelectorAll('#range-seg button').forEach(btn => {
  btn.addEventListener('click', () => {
    const range = btn.dataset.range;
    if (range === reportView.range) return;
    reportView.range = range;
    reportView.offset = 0;
    if (!BUCKETS_FOR_RANGE[range].includes(reportView.bucket)) {
      const preferred = state.settings.defaultRange === range ? state.settings.defaultBucket : null;
      reportView.bucket = BUCKETS_FOR_RANGE[range].includes(preferred)
        ? preferred
        : BUCKETS_FOR_RANGE[range][0];
    }
    renderReports();
  });
});

document.querySelectorAll('#group-seg button').forEach(btn => {
  btn.addEventListener('click', () => {
    if (reportView.groupBy === btn.dataset.group) return;
    reportView.groupBy = btn.dataset.group;
    selectedSliceKey = null;
    renderReports();
  });
});

$('#range-prev').addEventListener('click', () => { reportView.offset -= 1; renderReports(); });
$('#range-next').addEventListener('click', () => {
  if (reportView.offset < 0) { reportView.offset += 1; renderReports(); }
});

$('#set-default').addEventListener('click', () => {
  state.settings.defaultRange = reportView.range;
  state.settings.defaultBucket = reportView.bucket;
  state.settings.defaultGroupBy = reportView.groupBy;
  saveState();
  renderReports();
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  if (activeTab !== 'reports') return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderReports, 150);
});

darkQuery.addEventListener('change', () => switchTab(activeTab));

/* ============================ Init ============================ */

// Offline support on the hosted app (skipped during local development).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ });
}

switchTab('timer');

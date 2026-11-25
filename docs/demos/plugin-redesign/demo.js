(() => {
  'use strict';

  const TODAY = '2026-11-24';
  const STORAGE_KEY = 'omw-plugin-redesign-v1';
  const concept = document.body.dataset.concept;
  const app = document.getElementById('app');
  const overlay = document.getElementById('overlay-root');
  let serial = 20;
  let toastTimer;
  let calendarResizeObserver;
  const transient = { zoom: null, expandedEvent: null, expandedTask: null, newTaskPane: null, calendarDaysByPane: {}, query: '', searchIndex: 0, menuAnchor: null };

  const paths = {
    workbench: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M10 3v18M10 12h11"/>',
    workspace: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18"/>',
    todo: '<path d="M4 7l2 2 4-5M12 7h8M4 16l2 2 4-5M12 16h8"/>',
    launcher: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    folder: '<path d="M3 7V5a2 2 0 012-2h5l2 3h7a2 2 0 012 2v10a3 3 0 01-3 3H6a3 3 0 01-3-3V7z"/>',
    app: '<rect x="4" y="3" width="16" height="18" rx="4"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    splitX: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
    splitY: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/>',
    maximize: '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',
    restore: '<path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    plugins: '<path d="M9 3h6v5h5v6h-5v6H9v-5H4V9h5V3z"/>',
    jobs: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M16 16l5 5"/>',
    check: '<path d="M5 12l4 4L19 6"/>',
    flag: '<path d="M6 21V4M6 5h11l-2 4 2 4H6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    location: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1114 0z"/><circle cx="12" cy="10" r="2"/>',
    note: '<path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h6"/>',
    inbox: '<path d="M4 4h16v16H4zM4 14h5l2 3h2l2-3h5"/>',
    file: '<path d="M6 3h8l4 4v14H6zM14 3v5h4"/>',
    reset: '<path d="M4 10a8 8 0 111 7M4 4v6h6"/>'
  };

  function icon(name, className = '') {
    return `<span class="icon ${className}" aria-hidden="true"><svg viewBox="0 0 24 24">${paths[name] || paths.app}</svg></span>`;
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function uid(prefix) { return `${prefix}${++serial}`; }
  function leaf(kind) { return { id: uid('p'), kind }; }
  function branch(axis, a, b, ratio = 0.5) { return { id: uid('n'), axis, a, b, ratio }; }

  const initialEvents = [
    { id: 'e1', date: TODAY, title: '产品同步', start: '09:30', end: '10:15', location: '三楼会议室', calendar: '工作', color: '#ff3b30', notes: '确认首版范围与评审顺序。' },
    { id: 'e2', date: TODAY, title: '用户访谈', start: '11:00', end: '12:00', location: '线上会议', calendar: '设计', color: '#af52de', notes: '关注工作区切换与窗格恢复。' },
    { id: 'e3', date: TODAY, title: '设计走查', start: '11:30', end: '12:15', location: '设计工作室', calendar: '工作', color: '#ff9500', notes: '检查窄窗格与键盘焦点。' },
    { id: 'e4', date: TODAY, title: '交互方案评审', start: '14:00', end: '15:30', location: '二楼讨论区', calendar: '设计', color: '#af52de', notes: '比较四版原型，记录需要合并的细节。' },
    { id: 'e5', date: TODAY, title: '整理评审结论', start: '16:00', end: '16:30', location: '', calendar: '个人', color: '#0a84ff', notes: '' },
    { id: 'e6', date: '2026-11-25', title: '开发对齐', start: '10:00', end: '11:00', location: '线上会议', calendar: '工作', color: '#ff3b30', notes: '' },
    { id: 'e7', date: '2026-11-25', title: '组件走查', start: '15:00', end: '16:00', location: '设计工作室', calendar: '设计', color: '#af52de', notes: '' },
    { id: 'e8', date: '2026-11-26', title: '发布检查', allDay: true, calendar: '工作', color: '#ff3b30', location: '', notes: '' },
    { id: 'e9', date: '2026-11-26', title: '视觉回归检查', start: '13:30', end: '14:30', location: '', calendar: '工作', color: '#ff9500', notes: '' },
    { id: 'e10', date: '2026-11-27', title: '周报', start: '16:00', end: '16:30', location: '', calendar: '工作', color: '#ff3b30', notes: '' },
    { id: 'e11', date: '2026-11-23', title: '需求整理', start: '09:00', end: '10:00', location: '', calendar: '个人', color: '#0a84ff', notes: '' },
    { id: 'e12', date: '2026-11-28', title: '周末阅读', start: '10:30', end: '12:00', location: '家', calendar: '个人', color: '#0a84ff', notes: '' },
    { id: 'e13', date: '2026-11-20', title: '原型讨论', start: '14:00', end: '15:00', location: '线上会议', calendar: '设计', color: '#af52de', notes: '' },
    { id: 'e14', date: '2026-12-02', title: '版本回顾', start: '15:00', end: '16:00', location: '三楼会议室', calendar: '工作', color: '#ff3b30', notes: '' }
  ];
  const initialTasks = [
    { id: 't1', title: '整理用户访谈摘录', list: '设计', due: TODAY, priority: 'high', completed: false, notes: '归类为导航、分屏和恢复三个主题。' },
    { id: 't2', title: '确认工作区导航方案', list: '设计', due: TODAY, priority: 'medium', completed: false, notes: '' },
    { id: 't3', title: '分享周会纪要', list: '协作', due: TODAY, priority: 'none', completed: true, notes: '' },
    { id: 't4', title: '预约图书馆座位', list: '个人', due: '2026-11-25', priority: 'low', completed: false, notes: '' },
    { id: 't5', title: '补充键盘操作说明', list: '设计', due: '2026-11-27', priority: 'medium', completed: false, notes: '覆盖分隔线、窗格切换与搜索。' },
    { id: 't6', title: '备份本地数据', list: '个人', due: '', priority: 'none', completed: false, notes: '' },
    { id: 't7', title: '清理下载文件夹', list: '个人', due: '', priority: 'none', completed: false, notes: '' }
  ];
  const initialPins = [
    { id: 'pin1', kind: 'folder', label: '项目资料', detail: '文件夹', color: '#0a84ff' },
    { id: 'pin2', kind: 'folder', label: '设计手稿', detail: '文件夹', color: '#ff9500' },
    { id: 'pin3', kind: 'app', label: '备忘录', detail: '应用', color: '#e6b800' },
    { id: 'pin4', kind: 'app', label: 'VS Code', detail: '应用', color: '#007aff' }
  ];
  const pluginItems = [
    { id: 'calendar', kind: 'calendar', label: '日程', detail: '插件', color: '#ff3b30' },
    { id: 'todo', kind: 'todo', label: '待办', detail: '插件', color: '#0a84ff' },
    { id: 'launcher', kind: 'launcher', label: '快捷入口', detail: '插件', color: '#ff9500' }
  ];

  function defaultLayout(which, workspace = 'daily') {
    if (workspace !== 'daily') return branch('x', leaf('launcher'), leaf('todo'), 0.46);
    if (which === 'planner') return branch('x', leaf('calendar'), branch('x', leaf('todo'), leaf('launcher'), 0.56), 0.54);
    if (which === 'compact') return branch('y', leaf('launcher'), branch('x', leaf('calendar'), leaf('todo'), 0.53), 0.23);
    return branch('x', leaf('calendar'), branch('y', leaf('todo'), leaf('launcher'), which === 'today' || which === 'workbench' ? 0.59 : 0.56), which === 'today' || which === 'workbench' ? 0.60 : 0.63);
  }
  function defaults() {
    const layouts = {};
    for (const ws of ['daily', 'design']) for (const c of ['native', 'today', 'planner', 'compact', 'workbench']) layouts[`${ws}:${c}`] = defaultLayout(c, ws);
    return {
      workspaces: [{ id: 'daily', name: '日常工作' }, { id: 'design', name: '设计评审' }],
      workspace: 'daily', layouts, events: structuredClone(initialEvents), tasks: structuredClone(initialTasks), pins: structuredClone(initialPins), pluginPins: ['calendar', 'todo'],
      selectedDate: TODAY, calendarDays: 7, todoFilter: 'open', hiddenCalendars: [], sidebarWidth: 216
    };
  }
  function loadState() {
    const base = defaults();
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!stored || !Array.isArray(stored.events) || !Array.isArray(stored.tasks)) return base;
      return { ...base, ...stored, layouts: { ...base.layouts, ...(stored.layouts || {}) } };
    } catch { return base; }
  }
  let state = loadState();
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* file:// storage may be unavailable */ }
  }
  function treeKey() { return `${state.workspace}:${concept}`; }
  function tree() {
    if (!state.layouts[treeKey()]) state.layouts[treeKey()] = defaultLayout(concept, state.workspace);
    return state.layouts[treeKey()];
  }
  function setTree(next) { state.layouts[treeKey()] = next; save(); }
  function workspace() { return state.workspaces.find(item => item.id === state.workspace) || state.workspaces[0]; }

  function findNode(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    return node.axis ? findNode(node.a, id) || findNode(node.b, id) : null;
  }
  function updateNode(node, id, update) {
    if (node.id === id) return update(node);
    if (!node.axis) return node;
    return { ...node, a: updateNode(node.a, id, update), b: updateNode(node.b, id, update) };
  }
  function removeNode(node, id) {
    if (node.id === id) return null;
    if (!node.axis) return node;
    const a = removeNode(node.a, id);
    const b = removeNode(node.b, id);
    if (!a) return b;
    if (!b) return a;
    return { ...node, a, b };
  }
  function leaves(node) { return node.axis ? [...leaves(node.a), ...leaves(node.b)] : [node]; }

  const dateObj = value => new Date(`${value}T12:00:00Z`);
  const iso = date => date.toISOString().slice(0, 10);
  function shift(value, amount, unit = 'days') {
    const date = dateObj(value);
    if (unit === 'months') { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + amount); }
    else date.setUTCDate(date.getUTCDate() + amount);
    return iso(date);
  }
  const weekdayIndex = value => (dateObj(value).getUTCDay() + 6) % 7;
  const weekdayName = value => `星期${'日一二三四五六'[dateObj(value).getUTCDay()]}`;
  function monthLabel(value) { const d = dateObj(value); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`; }
  function fullDateLabel(value) { const d = dateObj(value); return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${weekdayName(value)}`; }
  function minutes(time) { return Number(time.slice(0, 2)) * 60 + Number(time.slice(3)); }
  function visibleEvents() { return state.events.filter(event => !state.hiddenCalendars.includes(event.calendar)); }
  function eventsFor(date) { return visibleEvents().filter(event => event.date === date).sort((a, b) => (a.start || '').localeCompare(b.start || '')); }

  function notify(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function closeMenu(restoreFocus = false) {
    const menu = overlay.querySelector('.context-menu');
    if (menu) menu.remove();
    if (restoreFocus && transient.menuAnchor?.isConnected) transient.menuAnchor.focus();
    transient.menuAnchor = null;
  }
  function openMenu(anchor, label, items) {
    closeMenu();
    transient.menuAnchor = anchor;
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', label);
    menu.innerHTML = `<div class="menu-label">${esc(label)}</div>` + items.map((item, index) => item.separator
      ? '<div class="menu-separator" role="separator"></div>'
      : `<button type="button" role="menuitem" data-menu-index="${index}" class="${item.danger ? 'danger' : ''}">${item.icon ? icon(item.icon) : ''}<span>${esc(item.label)}</span></button>`).join('');
    overlay.append(menu);
    const rect = anchor.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - width - 8, rect.right - width));
    const top = Math.max(8, Math.min(innerHeight - height - 8, rect.bottom + 5));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.setProperty('--menu-origin', `${rect.left - left + rect.width / 2}px ${top > rect.bottom ? 'top' : 'bottom'}`);
    menu.querySelectorAll('[data-menu-index]').forEach(button => button.addEventListener('click', () => {
      const item = items[Number(button.dataset.menuIndex)];
      closeMenu();
      item.action();
    }));
    menu.querySelector('button')?.focus();
  }

  function closeDialog() {
    const dialog = overlay.querySelector('dialog');
    if (dialog?.open) dialog.close();
  }
  function showDialog(title, body, options = {}) {
    closeMenu();
    closeDialog();
    const dialog = document.createElement('dialog');
    dialog.className = 'editor-dialog';
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    dialog.innerHTML = `<div class="dialog-header"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" type="button" data-close-dialog aria-label="关闭">${icon('close')}</button></div>${body}`;
    overlay.append(dialog);
    dialog.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('close', () => { dialog.remove(); options.onClose?.(); });
    dialog.showModal();
    dialog.querySelector('input:not([type="hidden"]), textarea, select')?.focus();
    return dialog;
  }
  function confirmAction(title, message, confirmLabel, action) {
    const dialog = showDialog(title, `<form class="dialog-form" id="confirm-form"><p class="dialog-hint">${esc(message)}</p><div class="form-actions"><button type="button" class="secondary-button" data-close-dialog>取消</button><button class="primary-button" type="submit">${esc(confirmLabel)}</button></div></form>`);
    dialog.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.querySelector('#confirm-form').addEventListener('submit', event => {
      event.preventDefault();
      dialog.close();
      action();
    });
  }

  function eventForm(event) {
    const item = event || { title: '', date: state.selectedDate, start: '09:00', end: '10:00', location: '', calendar: '工作', notes: '', allDay: false };
    return `<form class="dialog-form" data-form="event" data-id="${esc(event?.id || '')}">
      <label>标题<input name="title" required maxlength="160" value="${esc(item.title)}" placeholder="日程名称"></label>
      <div class="form-row"><label>日期<input name="date" type="date" required value="${esc(item.date)}"></label><label>日历<select name="calendar">${['工作', '设计', '个人'].map(name => `<option ${item.calendar === name ? 'selected' : ''}>${name}</option>`).join('')}</select></label></div>
      ${item.allDay ? '<input type="hidden" name="allDay" value="true"><p class="dialog-hint">全天日程</p>' : `<div class="form-row"><label>开始<input name="start" type="time" required value="${esc(item.start)}"></label><label>结束<input name="end" type="time" required value="${esc(item.end)}"></label></div>`}
      <label>地点<input name="location" value="${esc(item.location)}" placeholder="可选"></label>
      <label>备注<textarea name="notes" maxlength="4000" placeholder="可选">${esc(item.notes)}</textarea></label>
      <p class="form-error" role="alert" style="color:var(--red);font-size:11px"></p>
      <div class="form-actions">${event ? `<button class="delete-button" type="button" data-delete-event="${esc(event.id)}">删除日程</button>` : ''}<button class="secondary-button" type="button" data-close-dialog>取消</button><button class="primary-button" type="submit">保存</button></div>
    </form>`;
  }
  function openEvent(id = null) {
    const event = state.events.find(item => item.id === id);
    showDialog(event ? '编辑日程' : '新建日程', eventForm(event));
  }
  function openTask(id) {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    showDialog('待办详情', `<form class="dialog-form" data-form="task" data-id="${esc(id)}">
      <label>标题<input name="title" required maxlength="160" value="${esc(task.title)}"></label>
      <div class="form-row"><label>到期日期<input name="due" type="date" value="${esc(task.due)}"></label><label>优先级<select name="priority">${[['none','无'],['low','低'],['medium','中'],['high','高']].map(([value,label]) => `<option value="${value}" ${task.priority === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
      <label>备注<textarea name="notes" maxlength="4000">${esc(task.notes)}</textarea></label>
      <div class="form-actions"><button class="delete-button" type="button" data-delete-task="${esc(id)}">删除待办</button><button class="secondary-button" type="button" data-close-dialog>取消</button><button class="primary-button" type="submit">保存</button></div>
    </form>`);
  }
  function deleteEvent(id) {
    const event = state.events.find(item => item.id === id);
    if (!event) return;
    confirmAction('删除日程？', `「${event.title}」将从所有工作区的日程中移除。`, '删除日程', () => {
      state.events = state.events.filter(item => item.id !== id);
      save(); render(); notify('日程已删除');
    });
  }
  function deleteTask(id) {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    confirmAction('删除待办？', `「${task.title}」将从所有工作区的待办中移除。`, '删除待办', () => {
      state.tasks = state.tasks.filter(item => item.id !== id);
      save(); render(); notify('待办已删除');
    });
  }

  function inlineEventForm(event) {
    return `<form class="inline-detail" data-form="event-inline" data-id="${esc(event.id)}">
      <label>标题<input name="title" required value="${esc(event.title)}"></label>
      <label>日期<input name="date" type="date" required value="${esc(event.date)}"></label>
      ${event.allDay ? '<input type="hidden" name="allDay" value="true">' : `<label>开始<input name="start" type="time" required value="${esc(event.start)}"></label><label>结束<input name="end" type="time" required value="${esc(event.end)}"></label>`}
      <div class="form-actions"><button type="button" class="text-button" data-action="collapse-event">取消</button><button class="primary-button" type="submit">保存</button></div>
    </form>`;
  }
  function inlineTaskForm(task) {
    return `<form class="inline-detail" data-form="task-inline" data-id="${esc(task.id)}">
      <label>备注<textarea name="notes">${esc(task.notes)}</textarea></label>
      <label>到期日期<input name="due" type="date" value="${esc(task.due)}"></label>
      <label>优先级<select name="priority">${[['none','无'],['low','低'],['medium','中'],['high','高']].map(([value,label]) => `<option value="${value}" ${task.priority === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <div class="form-actions"><button type="button" class="text-button" data-action="collapse-task">取消</button><button class="primary-button" type="submit">保存详情</button></div>
    </form>`;
  }

  function paneHeader(node) {
    const labels = { calendar: '日程', todo: '待办', launcher: '快捷入口', empty: '空窗格' };
    const icons = { calendar: 'calendar', todo: 'todo', launcher: 'launcher', empty: 'workspace' };
    const zoomed = transient.zoom === node.id;
    return `<header class="pane-chrome">
      <div class="pane-identity">${icon(icons[node.kind])}<strong>${labels[node.kind]}</strong></div>
      <div class="pane-actions">
        <button class="icon-button" type="button" data-action="split-x" data-id="${node.id}" aria-label="在右侧切分窗格" title="在右侧切分">${icon('splitX')}</button>
        <button class="icon-button split-vertical-control" type="button" data-action="split-y" data-id="${node.id}" aria-label="在下方切分窗格" title="在下方切分">${icon('splitY')}</button>
        <button class="icon-button" type="button" data-action="zoom" data-id="${node.id}" aria-label="${zoomed ? '还原窗格' : '最大化窗格'}" title="${zoomed ? '还原' : '最大化'}">${icon(zoomed ? 'restore' : 'maximize')}</button>
        <button class="icon-button" type="button" data-action="pane-menu" data-id="${node.id}" aria-label="窗格操作" title="窗格操作">${icon('more')}</button>
        <button class="icon-button" type="button" data-action="close-pane" data-id="${node.id}" aria-label="关闭窗格" title="关闭窗格">${icon('close')}</button>
      </div>
    </header>`;
  }
  function renderTree(node) {
    if (node.axis) {
      return `<div class="split ${node.axis}" data-node-id="${node.id}" style="--ratio:${Math.round(node.ratio * 1000) / 10}%">
        ${renderTree(node.a)}
        <div class="divider ${node.axis}" role="separator" tabindex="0" data-divider-id="${node.id}" aria-label="调整${node.axis === 'x' ? '左右' : '上下'}窗格比例" aria-orientation="${node.axis === 'x' ? 'vertical' : 'horizontal'}" aria-valuemin="15" aria-valuemax="85" aria-valuenow="${Math.round(node.ratio * 100)}" title="拖动调整比例；方向键微调，双击均分"></div>
        ${renderTree(node.b)}
      </div>`;
    }
    return `<section class="pane pane-${node.kind}" data-pane-id="${node.id}" aria-label="${{ calendar: '日程', todo: '待办', launcher: '快捷入口', empty: '空窗格' }[node.kind]}">
      ${paneHeader(node)}<div class="pane-body">${renderPlugin(node)}</div>
    </section>`;
  }
  function renderPlugin(node) {
    if (node.kind === 'calendar') return renderCalendar(node);
    if (node.kind === 'todo') return renderTodo(node);
    if (node.kind === 'launcher') return renderLauncher(node);
    return `<div class="empty-pane"><div><h2>选择一个插件</h2><p>窗格只保存呈现，不复制业务数据。</p></div><div class="empty-choices">${pluginItems.map(item => `<button type="button" data-action="replace-pane" data-id="${node.id}" data-kind="${item.kind}">${icon(item.kind)}${item.label}</button>`).join('')}</div></div>`;
  }

  function calendarToolbar() {
    if (concept === 'planner') return '';
    const selected = dateObj(state.selectedDate);
    return `<div class="plugin-toolbar">
      <div class="date-heading"><p>${monthLabel(state.selectedDate)}</p><h2>${selected.getUTCDate()}日 ${weekdayName(state.selectedDate)}</h2></div>
      ${concept === 'native' ? `<div class="toolbar-end"><div class="segmented" aria-label="日程范围">${[[1,'日'],[3,'3日'],[7,'周']].map(([days,label]) => `<button type="button" data-action="calendar-days" data-days="${days}" aria-pressed="${state.calendarDays === days}">${label}</button>`).join('')}</div><button class="icon-button" type="button" data-action="new-event" aria-label="新建日程" title="新建日程">${icon('plus')}</button></div>` : concept === 'workbench' ? `<div class="toolbar-end"><button class="icon-button" type="button" data-action="new-event" aria-label="新建日程" title="新建日程">${icon('plus')}</button></div>` : ''}
    </div>`;
  }
  function layoutEvents(events) {
    const sorted = events.filter(event => !event.allDay).sort((a, b) => a.start.localeCompare(b.start));
    const result = [];
    const lanesById = new Map();
    let cluster = [];
    let clusterEnd = -1;
    function finish() {
      if (!cluster.length) return;
      const laneEnds = [];
      for (const event of cluster) {
        let lane = laneEnds.findIndex(end => end <= minutes(event.start));
        if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
        laneEnds[lane] = minutes(event.end);
        lanesById.set(event.id, lane);
      }
      for (const event of cluster) result.push({ event, lane: lanesById.get(event.id), lanes: laneEnds.length });
      cluster = [];
    }
    for (const event of sorted) {
      if (cluster.length && minutes(event.start) >= clusterEnd) finish();
      if (!cluster.length) clusterEnd = minutes(event.end);
      else clusterEnd = Math.max(clusterEnd, minutes(event.end));
      cluster.push(event);
    }
    finish();
    return result;
  }
  function calendarDaysFor(node) {
    return concept === 'workbench' ? transient.calendarDaysByPane[node.id] || 7 : state.calendarDays;
  }
  function renderTimeCalendar(node) {
    const days = calendarDaysFor(node);
    const start = days === 7 ? shift(state.selectedDate, -weekdayIndex(state.selectedDate)) : state.selectedDate;
    const dates = Array.from({ length: days }, (_, index) => shift(start, index));
    const hours = Array.from({ length: 12 }, (_, index) => index + 8);
    return `<div class="calendar-native" data-visible-days="${days}">${calendarToolbar()}
      <div class="date-navigation" style="padding:0 17px 8px"><button type="button" data-action="calendar-prev" aria-label="向前${days}天" title="向前${days}天">${icon('left')}</button><button type="button" data-action="calendar-today">今天</button><button type="button" data-action="calendar-next" aria-label="向后${days}天" title="向后${days}天">${icon('right')}</button></div>
      <div class="week-strip" style="--days:${days}">${dates.map(date => `<button type="button" class="day-select" data-action="select-date" data-date="${date}" aria-pressed="${date === state.selectedDate}" aria-label="${fullDateLabel(date)}"><small>周${'一二三四五六日'[weekdayIndex(date)]}</small><b>${dateObj(date).getUTCDate()}</b></button>`).join('')}</div>
      <div class="all-day-row" style="--days:${days}"><span>全天</span>${dates.map(date => { const event = eventsFor(date).find(item => item.allDay); return event ? `<button type="button" class="all-day-event" style="--event:${event.color}" data-action="edit-event" data-id="${event.id}">${esc(event.title)}</button>` : '<i></i>'; }).join('')}</div>
      <div class="time-scroll"><div class="time-grid" style="--days:${days}">
        <div class="time-axis">${hours.map(hour => `<span style="top:${(hour - 8) * 62}px">${String(hour).padStart(2, '0')}:00</span>`).join('')}</div>
        ${dates.map(date => `<div class="day-column ${date === state.selectedDate ? 'is-selected' : ''}" data-date="${date}">${layoutEvents(eventsFor(date)).map(({ event, lane, lanes }) => {
          const top = (minutes(event.start) - 480) / 60 * 62;
          const height = Math.max(18, (minutes(event.end) - minutes(event.start)) / 60 * 62 - 2);
          return `<button type="button" class="time-event ${height < 40 ? 'is-short' : ''}" style="--event:${event.color};top:${top}px;height:${height}px;left:calc(${lane / lanes * 100}% + 2px);width:calc(${100 / lanes}% - 5px)" data-action="edit-event" data-id="${event.id}" title="${esc(event.title)}，${event.start}–${event.end}"><strong>${esc(event.title)}</strong><small>${event.start}–${event.end}${event.location ? `<br>${esc(event.location)}` : ''}</small></button>`;
        }).join('')}</div>`).join('')}
      </div></div>
    </div>`;
  }
  function renderAgendaCalendar() {
    const monday = shift(state.selectedDate, -weekdayIndex(state.selectedDate));
    const dates = Array.from({ length: 7 }, (_, index) => shift(monday, index));
    const events = eventsFor(state.selectedDate);
    return `<div class="agenda-view">
      <header class="agenda-header"><div><p class="date-kicker">${weekdayName(state.selectedDate)}</p><h2>${dateObj(state.selectedDate).getUTCMonth() + 1}月${dateObj(state.selectedDate).getUTCDate()}日</h2></div><div class="header-actions"><div class="date-navigation"><button type="button" data-action="calendar-prev" aria-label="前一天">${icon('left')}</button><button type="button" data-action="calendar-today">今天</button><button type="button" data-action="calendar-next" aria-label="后一天">${icon('right')}</button></div><button class="icon-button" type="button" data-action="new-event" aria-label="新建日程">${icon('plus')}</button></div></header>
      <div class="agenda-date-strip">${dates.map(date => `<button type="button" class="${eventsFor(date).length ? 'has-events' : ''}" data-action="select-date" data-date="${date}" aria-pressed="${date === state.selectedDate}"><small>周${'一二三四五六日'[weekdayIndex(date)]}</small><b>${dateObj(date).getUTCDate()}</b><i></i></button>`).join('')}</div>
      <div class="agenda-list">${events.length ? events.map(event => event.allDay ? `<div class="agenda-item"><time>全天</time><div class="agenda-track" style="--event:${event.color}"></div><div><button type="button" class="agenda-card" style="--event:${event.color}" data-action="edit-event" data-id="${event.id}"><strong>${esc(event.title)}</strong><small>${esc(event.calendar)}</small></button>${transient.expandedEvent === event.id ? inlineEventForm(event) : ''}</div></div>` : `<div class="agenda-item"><time>${event.start}</time><div class="agenda-track" style="--event:${event.color}"></div><div><button type="button" class="agenda-card" style="--event:${event.color}" data-action="edit-event" data-id="${event.id}" aria-expanded="${transient.expandedEvent === event.id}"><strong>${esc(event.title)}</strong><small>${event.start}–${event.end}${event.location ? ` · ${esc(event.location)}` : ''}</small></button>${transient.expandedEvent === event.id ? inlineEventForm(event) : ''}</div></div>`).join('') : '<p class="agenda-empty">这一天没有日程。点右上角加号添加。</p>'}</div>
    </div>`;
  }
  function compactEventRow(event) {
    return `<div class="compact-event-wrap"><button type="button" class="compact-event" style="--event:${event.color}" data-action="edit-event" data-id="${event.id}" aria-expanded="${transient.expandedEvent === event.id}"><i></i><time>${event.allDay ? '全天' : event.start}</time><span><strong>${esc(event.title)}</strong><small>${event.allDay ? esc(event.calendar) : `${event.start}–${event.end}${event.location ? ` · ${esc(event.location)}` : ''}`}</small></span></button>${transient.expandedEvent === event.id && concept === 'compact' ? inlineEventForm(event) : ''}</div>`;
  }
  function renderMonthCalendar() {
    const selected = dateObj(state.selectedDate);
    const first = iso(new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1, 12)));
    const start = shift(first, -weekdayIndex(first));
    const dates = Array.from({ length: 42 }, (_, index) => shift(start, index));
    const events = eventsFor(state.selectedDate);
    return `<div class="planner-calendar">
      <header class="planner-month-header"><h2>${selected.getUTCFullYear()}年 <span>${selected.getUTCMonth() + 1}月</span></h2><div class="date-navigation"><button type="button" data-action="calendar-prev" aria-label="上一月">${icon('left')}</button><button type="button" data-action="calendar-today">今天</button><button type="button" data-action="calendar-next" aria-label="下一月">${icon('right')}</button><button type="button" data-action="new-event" aria-label="新建日程">${icon('plus')}</button></div></header>
      <div class="month-weekdays">${[...'一二三四五六日'].map(day => `<span>周${day}</span>`).join('')}</div>
      <div class="month-grid">${dates.map(date => {
        const dayEvents = eventsFor(date);
        return `<button type="button" class="month-day ${date.slice(0,7) !== state.selectedDate.slice(0,7) ? 'other-month' : ''} ${dayEvents.length ? 'has-events' : ''}" data-action="select-date" data-date="${date}" aria-pressed="${date === state.selectedDate}" aria-label="${fullDateLabel(date)}，${dayEvents.length}项日程"><b>${dateObj(date).getUTCDate()}</b>${dayEvents.slice(0,2).map(event => `<span class="month-event-chip" style="--event:${event.color}">${esc(event.title)}</span>`).join('')}${dayEvents.length > 2 ? `<span class="month-more">还有 ${dayEvents.length - 2} 项</span>` : ''}</button>`;
      }).join('')}</div>
      <div class="calendar-filter">${[['工作','#ff453a'],['设计','#af52de'],['个人','#0a84ff']].map(([name,color]) => `<label style="--calendar-color:${color}"><input type="checkbox" data-calendar-filter="${name}" ${!state.hiddenCalendars.includes(name) ? 'checked' : ''}>${name}</label>`).join('')}</div>
      <section class="selected-day-agenda"><h3>${fullDateLabel(state.selectedDate)}</h3>${events.length ? events.map(compactEventRow).join('') : '<p class="todo-empty">当天暂无日程</p>'}</section>
    </div>`;
  }
  function renderCompactCalendar() {
    const events = eventsFor(state.selectedDate);
    return `<div class="calendar-native">${calendarToolbar()}<div class="date-navigation" style="padding:0 13px 7px"><button type="button" data-action="calendar-prev" aria-label="前一天">${icon('left')}</button><button type="button" data-action="calendar-today">今天</button><button type="button" data-action="calendar-next" aria-label="后一天">${icon('right')}</button><button type="button" data-action="new-event" aria-label="新建日程" style="margin-left:auto">${icon('plus')}</button></div><div class="calendar-list">${events.length ? events.map(compactEventRow).join('') : '<p class="todo-empty">当天暂无日程</p>'}</div></div>`;
  }
  function renderCalendar(node) {
    if (concept === 'today') return renderAgendaCalendar();
    if (concept === 'planner') return renderMonthCalendar();
    if (concept === 'compact') return renderCompactCalendar();
    return renderTimeCalendar(node);
  }

  function filteredTasks() {
    return state.tasks.filter(task => {
      if (state.todoFilter === 'completed') return task.completed;
      if (task.completed) return false;
      if (state.todoFilter === 'today') return task.due && task.due <= TODAY;
      if (state.todoFilter === 'planned') return Boolean(task.due);
      return true;
    });
  }
  function taskGroup(task) {
    if (task.completed) return '已完成';
    if (!task.due) return '未安排';
    if (task.due <= TODAY) return '今天';
    return '已计划';
  }
  function renderTask(task) {
    const flag = { high: '!!!', medium: '!!', low: '!' }[task.priority] || '';
    return `<li class="todo-row ${task.completed ? 'is-complete' : ''}" data-task-id="${task.id}">
      <button type="button" class="check-button" data-action="toggle-task" data-id="${task.id}" aria-label="${task.completed ? '恢复' : '完成'}${esc(task.title)}" aria-pressed="${task.completed}"><span class="check-circle">${icon('check')}</span></button>
      <button type="button" class="todo-title" data-action="edit-task" data-id="${task.id}" aria-expanded="${transient.expandedTask === task.id}"><strong>${esc(task.title)}</strong><small>${esc(task.list)}${task.due ? ` · ${task.due === TODAY ? '今天' : task.due.slice(5).replace('-', '月') + '日'}` : ''}</small></button>
      ${flag ? `<span class="priority-flag" aria-label="${{high:'高',medium:'中',low:'低'}[task.priority]}优先级">${flag}</span>` : `<button type="button" class="row-more" data-action="task-menu" data-id="${task.id}" aria-label="${esc(task.title)}的操作">${icon('more')}</button>`}
      ${transient.expandedTask === task.id ? inlineTaskForm(task) : ''}
    </li>`;
  }
  function renderTodo(node) {
    const tasks = filteredTasks();
    const groups = [];
    for (const task of tasks) {
      const name = taskGroup(task);
      if (!groups.includes(name)) groups.push(name);
    }
    const remaining = state.tasks.filter(task => !task.completed).length;
    const composing = concept === 'workbench' && transient.newTaskPane === node.id;
    return `<div class="todo-view">
      <div class="todo-heading"><h2>待办</h2><span class="count">${remaining} 项</span><button class="icon-button new-task-toggle" type="button" data-action="focus-new-task" data-id="${node.id}" aria-label="${composing ? '取消新建待办' : '新建待办'}" aria-expanded="${composing}">${icon(composing ? 'close' : 'plus')}</button></div>
      <div class="todo-filters" aria-label="待办筛选">${[['open','待完成'],['today','今天'],['planned','计划内'],['completed','已完成']].map(([filter,label]) => `<button type="button" data-action="todo-filter" data-filter="${filter}" aria-pressed="${state.todoFilter === filter}">${label}</button>`).join('')}</div>
      ${concept === 'workbench' ? composing ? `<form class="todo-composer" data-form="new-task" data-pane-id="${node.id}"><span class="new-task-marker" aria-hidden="true"></span><input name="title" required maxlength="160" aria-label="新待办名称" placeholder="待办事项" autocomplete="off"><button class="composer-submit" type="submit">添加</button></form>` : '' : `<form class="quick-add" data-form="new-task"><input name="title" required maxlength="160" aria-label="新待办名称" placeholder="添加待办事项" autocomplete="off"><button type="submit" aria-label="添加待办">${icon('plus')}</button></form>`}
      <div class="todo-items">${tasks.length ? groups.map(group => `<section><h3 class="todo-group-title">${group}<span>${tasks.filter(task => taskGroup(task) === group).length}</span></h3><ul>${tasks.filter(task => taskGroup(task) === group).map(renderTask).join('')}</ul></section>`).join('') : `<p class="todo-empty">${state.todoFilter === 'completed' ? '还没有已完成事项。' : state.todoFilter === 'today' ? '今天没有到期事项。' : '这里暂时没有待办。'}</p>`}</div>
    </div>`;
  }

  function launcherIcon(item) {
    return icon(item.kind === 'folder' ? 'folder' : item.kind === 'app' ? 'app' : item.kind);
  }
  function renderTile(item, source, list = false) {
    const isPlugin = source === 'plugin';
    return `<button type="button" class="tile" style="--tile-color:${item.color}" data-action="launch" data-source="${source}" data-id="${item.id}" data-context="launcher" title="${esc(item.label)}${isPlugin ? '，单击原位打开，右键更多操作' : ''}"><span class="tile-icon">${launcherIcon(item)}</span><span>${esc(item.label)}</span></button>`;
  }
  function searchItems() {
    const query = transient.query.trim().toLocaleLowerCase();
    return [...pluginItems, ...state.pins].filter(item => !query || `${item.label} ${item.detail}`.toLocaleLowerCase().includes(query));
  }
  function renderSearchResults() {
    const results = searchItems();
    if (transient.searchIndex >= results.length) transient.searchIndex = Math.max(0, results.length - 1);
    const container = document.getElementById('search-results');
    if (!container) return;
    container.innerHTML = results.length ? results.map((item, index) => {
      const source = pluginItems.some(plugin => plugin.id === item.id) ? 'plugin' : 'pin';
      return `<button type="button" class="search-result ${index === transient.searchIndex ? 'is-active' : ''}" data-action="launch" data-source="${source}" data-id="${item.id}" data-search-index="${index}"><span class="tile-icon" style="--tile-color:${item.color}">${launcherIcon(item)}</span><span><strong>${esc(item.label)}</strong><small>${esc(item.detail)}${source === 'plugin' ? ' · 回车原位打开' : ''}</small></span></button>`;
    }).join('') : '<p class="search-empty">没有匹配的入口。试试“日程”或“项目”。</p>';
  }
  function renderSearchLauncher() {
    return `<div class="search-launcher"><div class="search-box">${icon('search')}<input id="launcher-search" type="search" value="${esc(transient.query)}" placeholder="打开插件、应用或文件夹" aria-label="搜索快捷入口" autocomplete="off"><kbd>/</kbd><button class="icon-button" type="button" data-action="add-pin" aria-label="添加快捷入口">${icon('plus')}</button></div><div class="search-results" id="search-results"></div></div>`;
  }
  function pinnedPlugins() {
    if (concept !== 'workbench') return pluginItems.filter(item => item.kind !== 'launcher');
    const ids = Array.isArray(state.pluginPins) ? state.pluginPins : ['calendar', 'todo'];
    return ids.map(id => pluginItems.find(item => item.id === id)).filter(Boolean);
  }
  function renderLauncher() {
    if (concept === 'compact') return renderSearchLauncher();
    const list = concept === 'planner';
    const plugins = pinnedPlugins();
    return `<div class="launcher-view"><div class="launcher-heading"><h2>快捷入口</h2><button class="icon-button" type="button" data-action="add-pin" aria-label="添加快捷入口">${icon('plus')}</button></div>
      <section><h3 class="launcher-section-title">常用位置</h3><div class="${list ? 'launch-list' : 'launch-grid'}">${state.pins.map(item => renderTile(item, 'pin', list)).join('')}</div></section>
      <section><h3 class="launcher-section-title">插件</h3><div class="${list ? 'launch-list' : 'launch-grid'} plugin-grid">${plugins.map(item => renderTile(item, 'plugin', list)).join('')}${plugins.length ? '' : '<p class="launcher-empty">尚未添加插件入口，可从右上角添加入口选择。</p>'}</div></section>
      <p class="launcher-note">插件单击原位打开 · 右键可在旁边打开</p>
    </div>`;
  }

  function renderSidebar() {
    if (concept === 'compact') return '';
    return `<aside class="host-sidebar" style="width:${state.sidebarWidth || 216}px" aria-label="工作区导航">
      <div class="traffic-lights" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="host-brand"><span class="app-mark">${icon('workbench')}</span>Workbench</div>
      <div class="nav-section-label">工作区<button type="button" data-action="new-workspace" aria-label="新建工作区">${icon('plus')}</button></div>
      <nav class="workspace-list">${state.workspaces.map(item => `<button type="button" class="workspace-item" data-action="switch-workspace" data-id="${item.id}" aria-current="${item.id === state.workspace ? 'page' : 'false'}">${icon('workspace')}<span>${esc(item.name)}</span></button>`).join('')}</nav>
      <div class="sidebar-spacer"></div>
      <nav class="host-services workspace-list" aria-label="应用服务"><button type="button" class="workspace-item" data-action="host-service" data-service="plugins">${icon('plugins')}<span>插件管理</span></button><button type="button" class="workspace-item" data-action="host-service" data-service="jobs">${icon('jobs')}<span>任务中心</span></button><button type="button" class="workspace-item" data-action="host-service" data-service="settings">${icon('settings')}<span>桌面设置</span></button></nav>
      <div class="local-status"><i></i>已保存到本机</div>
    </aside><div class="sidebar-resize" role="separator" tabindex="0" aria-label="调整侧栏宽度" aria-orientation="vertical" aria-valuemin="160" aria-valuemax="300" aria-valuenow="${state.sidebarWidth || 216}"></div>`;
  }
  function renderToolbar() {
    if (concept === 'compact') return `<header class="host-toolbar"><div class="host-brand-compact"><span class="app-mark">${icon('workbench')}</span>Workbench</div><select class="workspace-select" aria-label="当前工作区" data-workspace-select>${state.workspaces.map(item => `<option value="${item.id}" ${item.id === state.workspace ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select><div class="host-actions"><button class="host-button" type="button" data-action="add-pane">${icon('splitX')}<span>添加窗格</span></button><button class="icon-button" type="button" data-action="workspace-menu" aria-label="工作区操作">${icon('more')}</button></div></header>`;
    return `<header class="host-toolbar"><button class="icon-button sidebar-toggle" type="button" data-action="sidebar-info" aria-label="工作区导航">${icon('workspace')}</button><div class="host-title"><h1>${esc(workspace().name)}</h1><span class="save-state">布局自动保存</span></div><div class="host-actions">${concept === 'workbench' ? '' : `<button class="host-button" type="button" data-action="add-pane">${icon('splitX')}<span>添加窗格</span></button>`}<button class="icon-button" type="button" data-action="workspace-menu" aria-label="工作区操作">${icon('more')}</button></div></header>`;
  }
  function render() {
    closeMenu();
    calendarResizeObserver?.disconnect();
    const current = transient.zoom ? findNode(tree(), transient.zoom) : null;
    if (transient.zoom && !current) transient.zoom = null;
    app.innerHTML = `<div class="workbench">${renderSidebar()}<section class="host-main">${renderToolbar()}<div class="workspace-tree">${renderTree(current || tree())}</div></section></div>`;
    if (concept === 'compact') renderSearchResults();
    bindDividers();
    bindSidebarResize();
    bindCalendarResize();
  }

  function bindCalendarResize() {
    if (concept !== 'workbench') return;
    const bodies = [...app.querySelectorAll('.pane-calendar .pane-body')];
    if (!bodies.length) return;
    calendarResizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const body = entry.target;
        if (!body.isConnected) continue;
        const pane = body.closest('[data-pane-id]');
        const id = pane?.dataset.paneId;
        const node = findNode(tree(), id);
        if (!node || node.kind !== 'calendar') continue;
        const days = entry.contentRect.width >= 760 ? 7 : entry.contentRect.width >= 440 ? 3 : 1;
        if (transient.calendarDaysByPane[id] === days) continue;
        transient.calendarDaysByPane[id] = days;
        const scrollTop = body.querySelector('.time-scroll')?.scrollTop || 0;
        body.innerHTML = renderCalendar(node);
        const nextScroll = body.querySelector('.time-scroll');
        if (nextScroll) nextScroll.scrollTop = scrollTop;
      }
    });
    for (const body of bodies) calendarResizeObserver.observe(body);
  }

  function splitPane(id, axis, kind) {
    const target = findNode(tree(), id);
    if (!target || target.axis) return;
    setTree(updateNode(tree(), id, node => branch(axis, node, leaf(kind), 0.5)));
    transient.zoom = null;
    render();
    notify(`已在${axis === 'x' ? '右侧' : '下方'}打开${pluginItems.find(item => item.kind === kind)?.label}`);
  }
  function choosePlugin(anchor, label, callback) {
    openMenu(anchor, label, pluginItems.map(item => ({ label: item.label, icon: item.kind, action: () => callback(item.kind) })));
  }
  function paneMenu(anchor, id) {
    openMenu(anchor, '窗格操作', [
      { label: '在右侧打开插件…', icon: 'splitX', action: () => choosePlugin(anchor, '在右侧打开', kind => splitPane(id, 'x', kind)) },
      { label: '在下方打开插件…', icon: 'splitY', action: () => choosePlugin(anchor, '在下方打开', kind => splitPane(id, 'y', kind)) },
      { label: '替换当前插件…', icon: 'plugins', action: () => choosePlugin(anchor, '替换为', kind => { setTree(updateNode(tree(), id, node => ({ ...node, kind }))); render(); }) },
      { separator: true },
      { label: transient.zoom === id ? '还原窗格' : '最大化窗格', icon: 'maximize', action: () => { transient.zoom = transient.zoom === id ? null : id; render(); } },
      { label: '关闭窗格', icon: 'close', action: () => closePane(id) }
    ]);
  }
  function closePane(id) {
    const next = tree().id === id ? null : removeNode(tree(), id);
    setTree(next || leaf('empty'));
    transient.zoom = null;
    render();
    notify('窗格已关闭，插件数据保留');
  }
  function openPlugin(paneId, kind, beside = false) {
    if (beside) return splitPane(paneId, 'x', kind);
    setTree(updateNode(tree(), paneId, node => ({ ...node, kind })));
    transient.zoom = null;
    render();
    notify(`已在原窗格打开${pluginItems.find(item => item.kind === kind)?.label}`);
  }
  function launcherMenu(anchor, source, id, paneId) {
    const item = source === 'plugin' ? pluginItems.find(entry => entry.id === id) : state.pins.find(entry => entry.id === id);
    if (!item) return;
    const items = [{ label: '打开', icon: 'external', action: () => launch(source, id, paneId) }];
    if (source === 'plugin') {
      items.push({ label: '在旁边打开', icon: 'splitX', action: () => openPlugin(paneId, id, true) });
      if (concept === 'workbench') items.push({ label: '从快捷入口移除', icon: 'close', action: () => {
        state.pluginPins = state.pluginPins.filter(entry => entry !== id);
        save(); render(); notify('插件入口已移除，插件和数据未更改');
      } });
    } else items.push({ label: '从快捷入口移除', icon: 'close', action: () => { state.pins = state.pins.filter(entry => entry.id !== id); save(); render(); notify('入口已移除，原目标未更改'); } });
    openMenu(anchor, item.label, items);
  }
  function launch(source, id, paneId) {
    if (source === 'plugin') return openPlugin(paneId, id);
    const pin = state.pins.find(item => item.id === id);
    if (pin) notify(`已请求打开「${pin.label}」；HTML demo 不启动系统目标`);
  }

  function newWorkspace() {
    const dialog = showDialog('新建工作区', `<form class="dialog-form" id="workspace-form"><label>名称<input name="name" required maxlength="80" placeholder="例如：写作"></label><p class="dialog-hint">新工作区从快捷入口开始，插件业务数据保持共享。</p><div class="form-actions"><button type="button" class="secondary-button" data-close-dialog>取消</button><button class="primary-button" type="submit">创建</button></div></form>`);
    dialog.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.querySelector('#workspace-form').addEventListener('submit', event => {
      event.preventDefault();
      const name = new FormData(event.target).get('name').trim();
      if (!name) return;
      if (state.workspaces.some(item => item.name === name)) { notify('工作区名称已存在'); return; }
      const id = uid('ws');
      state.workspaces.push({ id, name });
      state.layouts[`${id}:${concept}`] = leaf('launcher');
      state.workspace = id;
      save(); dialog.close(); render(); notify('工作区已创建');
    });
  }
  function workspaceMenu(anchor) {
    openMenu(anchor, workspace().name, [
      { label: '新建工作区', icon: 'plus', action: newWorkspace },
      { label: '重命名工作区', icon: 'note', action: renameWorkspace },
      { label: '复制工作区布局', icon: 'workspace', action: duplicateWorkspace },
      { separator: true },
      { label: '删除工作区', icon: 'close', danger: true, action: removeWorkspace }
    ]);
  }
  function renameWorkspace() {
    const dialog = showDialog('重命名工作区', `<form class="dialog-form" id="rename-form"><label>名称<input name="name" required maxlength="80" value="${esc(workspace().name)}"></label><div class="form-actions"><button type="button" class="secondary-button" data-close-dialog>取消</button><button class="primary-button" type="submit">保存</button></div></form>`);
    dialog.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.querySelector('#rename-form').addEventListener('submit', event => {
      event.preventDefault();
      const name = new FormData(event.target).get('name').trim();
      if (!name) return;
      workspace().name = name; save(); dialog.close(); render();
    });
  }
  function duplicateWorkspace() {
    const id = uid('ws');
    const copy = { id, name: `${workspace().name} 副本` };
    state.workspaces.push(copy);
    state.layouts[`${id}:${concept}`] = structuredClone(tree());
    state.workspace = id;
    save(); render(); notify('已复制布局，业务数据仍共享');
  }
  function removeWorkspace() {
    if (state.workspaces.length === 1) { notify('至少保留一个工作区'); return; }
    confirmAction('删除工作区？', `仅删除「${workspace().name}」的布局，插件数据和后台任务保留。`, '删除工作区', () => {
      const removed = state.workspace;
      state.workspaces = state.workspaces.filter(item => item.id !== removed);
      for (const key of Object.keys(state.layouts)) if (key.startsWith(`${removed}:`)) delete state.layouts[key];
      state.workspace = state.workspaces[0].id;
      save(); render(); notify('工作区布局已删除，业务数据保留');
    });
  }
  function showHostService(service) {
    const content = {
      plugins: ['插件管理', `<div class="dialog-form"><p class="dialog-hint">三个随包插件均通过公开服务接口运行。窗格布局与业务数据分开保存。</p>${pluginItems.map(item => `<div class="compact-event" style="--event:${item.color}"><i></i><span><strong>${item.label}</strong><small>已启用 · 本地插件</small></span></div>`).join('')}<div class="form-actions"><button class="primary-button" data-close-dialog>完成</button></div></div>`],
      jobs: ['任务中心', `<div class="dialog-form"><p class="dialog-hint">当前没有后台任务。视图关闭不会取消正在运行的 Job；取消操作需要再次确认。</p><div class="form-actions"><button class="primary-button" data-close-dialog>完成</button></div></div>`],
      settings: ['桌面设置', `<div class="dialog-form"><p class="dialog-hint">此 HTML 仅展示界面方案，不修改登录启动、菜单栏或系统快捷键。产品默认仍为关闭窗口不退出。</p><div class="form-actions"><button class="primary-button" data-close-dialog>完成</button></div></div>`]
    }[service];
    const dialog = showDialog(content[0], content[1]);
    dialog.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => dialog.close()));
  }
  function addPin() {
    const dialog = showDialog('添加快捷入口', `<form class="dialog-form" id="pin-form"><label>名称<input name="label" required maxlength="80" placeholder="应用或文件夹名称"></label><label>类型<select name="kind"><option value="folder">文件夹</option><option value="app">应用</option></select></label><p class="dialog-hint">正式应用通过系统选择器添加；这里只创建演示入口。</p><div class="form-actions"><button type="button" class="secondary-button" data-close-dialog>取消</button><button class="primary-button" type="submit">添加</button></div></form>`);
    dialog.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.querySelector('#pin-form').addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(event.target);
      const kind = data.get('kind');
      state.pins.push({ id: uid('pin'), kind, label: data.get('label').trim(), detail: kind === 'folder' ? '文件夹' : '应用', color: kind === 'folder' ? '#0a84ff' : '#ff9500' });
      save(); dialog.close(); render(); notify('快捷入口已添加');
    });
  }

  function bindDividers() {
    app.querySelectorAll('[data-divider-id]').forEach(handle => {
      const node = findNode(tree(), handle.dataset.dividerId);
      if (!node) return;
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        const box = handle.parentElement.getBoundingClientRect();
        handle.setPointerCapture(event.pointerId);
        handle.dataset.dragging = 'true';
        const move = moveEvent => {
          const ratio = node.axis === 'x' ? (moveEvent.clientX - box.left - 4) / (box.width - 8) : (moveEvent.clientY - box.top - 4) / (box.height - 8);
          node.ratio = Math.max(0.15, Math.min(0.85, ratio));
          handle.parentElement.style.setProperty('--ratio', `${node.ratio * 100}%`);
          handle.setAttribute('aria-valuenow', String(Math.round(node.ratio * 100)));
        };
        const end = () => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', end);
          handle.removeEventListener('pointercancel', end);
          delete handle.dataset.dragging;
          save();
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
      });
      handle.addEventListener('dblclick', () => { node.ratio = 0.5; save(); render(); });
      handle.addEventListener('keydown', event => {
        const negative = node.axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
        const positive = node.axis === 'x' ? 'ArrowRight' : 'ArrowDown';
        if (![negative, positive, 'Home', 'End', 'Enter'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Home') node.ratio = 0.15;
        else if (event.key === 'End') node.ratio = 0.85;
        else if (event.key === 'Enter') node.ratio = 0.5;
        else node.ratio = Math.max(0.15, Math.min(0.85, node.ratio + (event.key === negative ? -0.03 : 0.03)));
        save(); render();
        app.querySelector(`[data-divider-id="${node.id}"]`)?.focus();
      });
    });
  }
  function bindSidebarResize() {
    const handle = app.querySelector('.sidebar-resize');
    const sidebar = app.querySelector('.host-sidebar');
    if (!handle || !sidebar) return;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sidebar.offsetWidth;
      handle.setPointerCapture(event.pointerId);
      handle.dataset.dragging = 'true';
      const move = moveEvent => {
        const width = Math.max(160, Math.min(300, startWidth + moveEvent.clientX - startX));
        sidebar.style.width = `${width}px`;
        handle.setAttribute('aria-valuenow', String(width));
        state.sidebarWidth = width;
      };
      const end = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        delete handle.dataset.dragging;
        save();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
    handle.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      state.sidebarWidth = event.key === 'Home' ? 160 : event.key === 'End' ? 300 : Math.max(160, Math.min(300, state.sidebarWidth + (event.key === 'ArrowLeft' ? -8 : 8)));
      save(); render(); app.querySelector('.sidebar-resize')?.focus();
    });
  }

  app.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === 'select-date') { state.selectedDate = button.dataset.date; transient.expandedEvent = null; save(); render(); }
    else if (action === 'calendar-prev' || action === 'calendar-next') {
      const direction = action === 'calendar-prev' ? -1 : 1;
      const paneId = button.closest('[data-pane-id]')?.dataset.paneId;
      const amount = concept === 'native' ? state.calendarDays : concept === 'workbench' ? calendarDaysFor({ id: paneId }) : 1;
      state.selectedDate = shift(state.selectedDate, direction * amount, concept === 'planner' ? 'months' : 'days');
      transient.expandedEvent = null; save(); render();
    }
    else if (action === 'calendar-today') { state.selectedDate = TODAY; save(); render(); }
    else if (action === 'calendar-days') { state.calendarDays = Number(button.dataset.days); save(); render(); }
    else if (action === 'new-event') openEvent();
    else if (action === 'edit-event') {
      if (concept === 'native' || concept === 'planner') openEvent(id);
      else { transient.expandedEvent = transient.expandedEvent === id ? null : id; transient.expandedTask = null; render(); }
    }
    else if (action === 'collapse-event') { transient.expandedEvent = null; render(); }
    else if (action === 'toggle-task') {
      const task = state.tasks.find(item => item.id === id);
      task.completed = !task.completed; save(); render();
      app.querySelector(`[data-action="toggle-task"][data-id="${id}"]`)?.focus({ preventScroll: true });
      notify(task.completed ? '已完成，可在“已完成”中恢复' : '已恢复为待完成');
    }
    else if (action === 'edit-task') {
      if (concept === 'native' || concept === 'planner') openTask(id);
      else { transient.expandedTask = transient.expandedTask === id ? null : id; transient.expandedEvent = null; render(); }
    }
    else if (action === 'collapse-task') { transient.expandedTask = null; render(); }
    else if (action === 'todo-filter') { state.todoFilter = button.dataset.filter; transient.expandedTask = null; transient.newTaskPane = null; save(); render(); }
    else if (action === 'focus-new-task') {
      if (concept !== 'workbench') { app.querySelector('[data-form="new-task"] input')?.focus(); }
      else {
        const opening = transient.newTaskPane !== id;
        transient.newTaskPane = opening ? id : null;
        if (opening && state.todoFilter === 'completed') state.todoFilter = 'open';
        save(); render();
        if (opening) app.querySelector(`[data-form="new-task"][data-pane-id="${id}"] input`)?.focus();
        else app.querySelector(`[data-action="focus-new-task"][data-id="${id}"]`)?.focus();
      }
    }
    else if (action === 'cancel-new-task') {
      const paneId = id;
      transient.newTaskPane = null; render();
      app.querySelector(`[data-action="focus-new-task"][data-id="${paneId}"]`)?.focus();
    }
    else if (action === 'task-menu') {
      const task = state.tasks.find(item => item.id === id);
      openMenu(button, task.title, [{ label: '编辑详情', icon: 'note', action: () => openTask(id) }, { label: task.completed ? '恢复待办' : '完成待办', icon: 'check', action: () => { task.completed = !task.completed; save(); render(); } }, { label: '删除待办', icon: 'close', danger: true, action: () => deleteTask(id) }]);
    }
    else if (action === 'launch') launch(button.dataset.source, id, button.closest('[data-pane-id]')?.dataset.paneId);
    else if (action === 'add-pin') addPin();
    else if (action === 'split-x' || action === 'split-y') choosePlugin(button, action === 'split-x' ? '在右侧打开' : '在下方打开', kind => splitPane(id, action === 'split-x' ? 'x' : 'y', kind));
    else if (action === 'pane-menu') paneMenu(button, id);
    else if (action === 'close-pane') closePane(id);
    else if (action === 'zoom') { transient.zoom = transient.zoom === id ? null : id; render(); }
    else if (action === 'replace-pane') { setTree(updateNode(tree(), id, node => ({ ...node, kind: button.dataset.kind }))); render(); }
    else if (action === 'add-pane') choosePlugin(button, '在右侧添加窗格', kind => { setTree(branch('x', tree(), leaf(kind), 0.64)); transient.zoom = null; render(); });
    else if (action === 'new-workspace') newWorkspace();
    else if (action === 'switch-workspace') { state.workspace = id; transient.zoom = null; save(); render(); }
    else if (action === 'workspace-menu') workspaceMenu(button);
    else if (action === 'host-service') showHostService(button.dataset.service);
    else if (action === 'sidebar-info') notify('窄屏下可通过顶部工作区菜单切换；桌面版显示完整侧栏');
  });

  app.addEventListener('contextmenu', event => {
    const tile = event.target.closest('[data-context="launcher"]');
    if (!tile) return;
    event.preventDefault();
    launcherMenu(tile, tile.dataset.source, tile.dataset.id, tile.closest('[data-pane-id]')?.dataset.paneId);
  });
  app.addEventListener('change', event => {
    if (event.target.matches('[data-workspace-select]')) { state.workspace = event.target.value; transient.zoom = null; save(); render(); }
    if (event.target.matches('[data-calendar-filter]')) {
      const name = event.target.dataset.calendarFilter;
      state.hiddenCalendars = event.target.checked ? state.hiddenCalendars.filter(item => item !== name) : [...new Set([...state.hiddenCalendars, name])];
      save(); render();
    }
  });
  app.addEventListener('input', event => {
    if (event.target.id === 'launcher-search') {
      transient.query = event.target.value;
      transient.searchIndex = 0;
      renderSearchResults();
    }
  });
  app.addEventListener('keydown', event => {
    if (event.target.id !== 'launcher-search') return;
    const results = searchItems();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      transient.searchIndex = results.length ? (transient.searchIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0;
      renderSearchResults();
    } else if (event.key === 'Enter' && results.length) {
      event.preventDefault();
      const item = results[transient.searchIndex];
      const source = pluginItems.some(plugin => plugin.id === item.id) ? 'plugin' : 'pin';
      launch(source, item.id, event.target.closest('[data-pane-id]')?.dataset.paneId);
    }
  });

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!form.dataset.form) return;
    event.preventDefault();
    const data = new FormData(form);
    const type = form.dataset.form;
    if (type === 'new-task') {
      const title = data.get('title').trim();
      if (!title) return;
      state.tasks.push({ id: uid('t'), title, list: '个人', due: state.todoFilter === 'today' ? TODAY : '', priority: 'none', completed: false, notes: '' });
      save(); render();
      if (concept === 'workbench') app.querySelector(`[data-form="new-task"][data-pane-id="${form.dataset.paneId}"] input`)?.focus();
      else app.querySelector('[data-form="new-task"] input')?.focus();
      notify('待办已添加');
    } else if (type === 'event' || type === 'event-inline') {
      const id = form.dataset.id;
      const existing = state.events.find(item => item.id === id);
      const allDay = data.get('allDay') === 'true';
      if (!data.get('title')?.trim()) { notify('请填写日程标题'); return; }
      if (!allDay && data.get('end') <= data.get('start')) {
        const error = form.querySelector('.form-error');
        if (error) error.textContent = '结束时间需要晚于开始时间。';
        else notify('结束时间需要晚于开始时间');
        return;
      }
      const colors = { 工作: '#ff3b30', 设计: '#af52de', 个人: '#0a84ff' };
      const calendarName = data.get('calendar') || existing?.calendar || '工作';
      const next = {
        id: existing?.id || uid('e'), title: data.get('title').trim(), date: data.get('date'),
        allDay, calendar: calendarName, color: colors[calendarName],
        location: data.get('location') !== null ? data.get('location').trim() : existing?.location || '',
        notes: data.get('notes') !== null ? data.get('notes').trim() : existing?.notes || ''
      };
      if (!allDay) { next.start = data.get('start'); next.end = data.get('end'); }
      if (existing) Object.assign(existing, next); else state.events.push(next);
      state.selectedDate = next.date;
      transient.expandedEvent = null;
      save(); closeDialog(); render(); notify('日程已保存');
    } else if (type === 'task' || type === 'task-inline') {
      const task = state.tasks.find(item => item.id === form.dataset.id);
      if (!task) return;
      if (data.get('title') !== null) {
        const title = data.get('title').trim();
        if (!title) { notify('请填写待办标题'); return; }
        task.title = title;
      }
      task.due = data.get('due');
      task.priority = data.get('priority');
      task.notes = data.get('notes').trim();
      transient.expandedTask = null;
      save(); closeDialog(); render(); notify('待办详情已保存');
    }
  });

  overlay.addEventListener('click', event => {
    const deleteEventButton = event.target.closest('[data-delete-event]');
    const deleteTaskButton = event.target.closest('[data-delete-task]');
    if (deleteEventButton) { const id = deleteEventButton.dataset.deleteEvent; closeDialog(); deleteEvent(id); }
    if (deleteTaskButton) { const id = deleteTaskButton.dataset.deleteTask; closeDialog(); deleteTask(id); }
  });
  document.addEventListener('pointerdown', event => {
    document.body.dataset.input = 'pointer';
    if (overlay.querySelector('.context-menu') && !event.target.closest('.context-menu') && !event.target.closest('[data-action="pane-menu"], [data-action="workspace-menu"], [data-action="split-x"], [data-action="split-y"]')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    document.body.dataset.input = 'keyboard';
    const menu = overlay.querySelector('.context-menu');
    if (event.key === 'Escape' && menu) { event.preventDefault(); closeMenu(true); return; }
    if (menu && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();
      const buttons = [...menu.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
      return;
    }
    if (event.key === '/' && concept === 'compact' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.target.matches('input, textarea, select') && !overlay.querySelector('dialog')) {
      event.preventDefault();
      document.getElementById('launcher-search')?.focus();
    }
  });
  document.querySelector('[data-reset]')?.addEventListener('click', () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* no persistent storage */ }
    state = defaults();
    transient.zoom = null; transient.expandedEvent = null; transient.expandedTask = null; transient.newTaskPane = null; transient.calendarDaysByPane = {}; transient.query = '';
    render(); notify('已还原全部演示数据与布局');
  });
  window.addEventListener('beforeunload', save);
  window.__demo = { get state() { return state; }, get transient() { return transient; }, render, splitPane, openPlugin, reset() { state = defaults(); render(); } };
  render();
})();

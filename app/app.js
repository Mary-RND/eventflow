let db = null;

const state = {
  participants: [],
  activity: [],
  searchQuery: '',
  filterStatus: 'all',
  filterTicket: 'all',
  sortBy: 'name-asc',
  editingId: null,
  lastFocused: null,
  emailUnavailable: false,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showLoading() {
  $('#loading-state').hidden = false;
  $('#empty-state').hidden = true;
  $('#participants-table').hidden = true;
  $('#search-empty').hidden = true;
}

function showEmpty() {
  $('#loading-state').hidden = true;
  $('#empty-state').hidden = false;
  $('#participants-table').hidden = true;
  $('#search-empty').hidden = true;
}

function showTable() {
  $('#loading-state').hidden = true;
  $('#empty-state').hidden = true;
  $('#participants-table').hidden = false;
  $('#search-empty').hidden = true;
}

function showSearchEmpty() {
  $('#loading-state').hidden = true;
  $('#empty-state').hidden = true;
  $('#participants-table').hidden = true;
  $('#search-empty').hidden = false;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusLabel(status) {
  const map = { new: 'Новый', confirmed: 'Подтверждён', waitlist: 'Лист ожидания', cancelled: 'Отменён' };
  return map[status] || status;
}

function ticketLabel(ticket) {
  const map = { standard: 'Стандартный', business: 'Бизнес', vip: 'VIP' };
  return map[ticket] || ticket;
}

function renderParticipants() {
  let items = [...state.participants];

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    items = items.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.company && p.company.toLowerCase().includes(q))
    );
  }

  if (state.filterStatus !== 'all') {
    items = items.filter((p) => p.status === state.filterStatus);
  }

  if (state.filterTicket !== 'all') {
    items = items.filter((p) => p.ticket === state.filterTicket);
  }

  const [sortField, sortDir] = state.sortBy.split('-');
  items.sort((a, b) => {
    let cmp = 0;
    if (sortField === 'name') {
      cmp = a.name.localeCompare(b.name, 'ru');
    } else if (sortField === 'date') {
      cmp = a.registeredAt.localeCompare(b.registeredAt);
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  if (items.length === 0 && (state.searchQuery || state.filterStatus !== 'all' || state.filterTicket !== 'all')) {
    showSearchEmpty();
    return;
  }

  if (items.length === 0) {
    showEmpty();
    return;
  }

  showTable();

  const tbody = $('#participants-tbody');
  tbody.innerHTML = '';

  for (const p of items) {
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;
    tr.innerHTML = `
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(p.email)}</td>
      <td>${escapeHtml(p.company || '—')}</td>
      <td><span class="badge badge--${p.ticket}">${ticketLabel(p.ticket)}</span></td>
      <td><span class="badge badge--${p.status}">${statusLabel(p.status)}</span></td>
      <td>${formatDate(p.registeredAt)}</td>
      <td>
        <div class="participants-table__actions">
          <button type="button" class="btn btn--sm btn--ghost" data-action="view" data-id="${p.id}" title="Просмотр">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.5 5.5 0.5 8c1 2.5 4 5 7.5 5s6.5-2.5 7.5-5c-1-2.5-4-5-7.5-5zm0 8a3 3 0 110-6 3 3 0 010 6zm0-5a1 1 0 100-2 1 1 0 000 2z"/></svg>
          </button>
          <button type="button" class="btn btn--sm btn--ghost" data-action="edit" data-id="${p.id}" title="Изменить">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M12.1 1.9a1.5 1.5 0 012.1 2.1L5.7 12.5 1 14l1.5-4.7L12.1 1.9z"/></svg>
          </button>
          ${p.status === 'confirmed' && !p.checkedIn
            ? `<button type="button" class="btn btn--sm btn--success" data-action="checkin" data-id="${p.id}" title="Отметить приход">✓</button>`
            : ''
          }
          <button type="button" class="btn btn--sm btn--ghost" data-action="archive" data-id="${p.id}" title="Архивировать">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v2H2V3zm1 3h10l-1 8H4L3 6zm4 2v4h2V8H7z"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  updateSortIndicators();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateMetrics() {
  const active = state.participants.filter((p) => !p.archivedAt);
  const confirmed = active.filter((p) => p.status === 'confirmed');
  const checkedIn = confirmed.filter((p) => p.checkedIn);
  const waitlist = active.filter((p) => p.status === 'waitlist');

  $('#metric-active').textContent = active.length;
  $('#metric-confirmed').textContent = confirmed.length;
  $('#metric-checkedIn').textContent = checkedIn.length;
  $('#metric-waitlist').textContent = waitlist.length;
}

function updateSortIndicators() {
  const [sortField, sortDir] = state.sortBy.split('-');
  $$('.participants-table__th').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
  });
  const target = $(`.participants-table__th[data-sort="${sortField}"]`);
  if (target) {
    target.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
  }
}

function showToast(message, type = 'info', undoCallback = null) {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__text">${escapeHtml(message)}</span>
    ${undoCallback ? '<button type="button" class="toast__action">Отменить</button>' : ''}
    <button type="button" class="toast__close" aria-label="Закрыть">&times;</button>
  `;

  if (undoCallback) {
    toast.querySelector('.toast__action').addEventListener('click', () => {
      undoCallback();
      toast.remove();
    });
  }

  toast.querySelector('.toast__close').addEventListener('click', () => {
    toast.remove();
  });

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 6000);
}

function openParticipantModal(participant = null) {
  state.editingId = participant ? participant.id : null;
  state.lastFocused = document.activeElement;
  const modal = $('#modal-overlay');
  const title = $('#modal-title');
  const form = $('#form-participant');

  title.textContent = participant ? 'Редактировать участника' : 'Новый участник';
  form.reset();

  if (participant) {
    $('#field-name').value = participant.name;
    $('#field-email').value = participant.email;
    $('#field-company').value = participant.company || '';
    $('#field-ticket').value = participant.ticket;
    $('#field-status').value = participant.status;
    $('#field-checked-in').checked = participant.checkedIn;
  } else {
    $('#field-status').value = 'new';
    $('#field-checked-in').checked = false;
  }

  updateCheckInDisabled();
  clearFormErrors();
  state.emailUnavailable = false;
  updateSaveButtonState();
  modal.hidden = false;
  $('#field-name').focus();
}

function closeParticipantModal() {
  $('#modal-overlay').hidden = true;
  state.editingId = null;
  state.emailUnavailable = false;
  $('#btn-modal-save').disabled = false;
  if (state.lastFocused && typeof state.lastFocused.focus === 'function') {
    state.lastFocused.focus();
  }
}

function updateCheckInDisabled() {
  const status = $('#field-status').value;
  const checkbox = $('#field-checked-in');
  if (status !== 'confirmed') {
    checkbox.checked = false;
    checkbox.disabled = true;
  } else {
    checkbox.disabled = false;
  }
}

function clearFormErrors() {
  $$('.form-error').forEach((el) => (el.textContent = ''));
  $$('.input--error').forEach((el) => el.classList.remove('input--error'));
}

function setFieldError(fieldId, message) {
  const input = $(`#${fieldId}`);
  const error = $(`#error-${fieldId.replace('field-', '')}`);
  if (input) input.classList.add('input--error');
  if (error) error.textContent = message;
}

function validateFieldRules() {
  let valid = true;

  const name = $('#field-name').value.trim();
  const email = $('#field-email').value.trim();

  if (!name) valid = false;

  if (!email) {
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    valid = false;
  }

  return valid;
}

function updateSaveButtonState() {
  const saveBtn = $('#btn-modal-save');
  saveBtn.disabled = !validateFieldRules() || state.emailUnavailable;
}

async function checkEmailUniqueness() {
  const email = $('#field-email').value.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    state.emailUnavailable = false;
    $('#error-email').textContent = '';
    updateSaveButtonState();
    return;
  }

  const existing = await getOneByIndex(db, 'participants', 'email', email);
  if (existing && existing.id !== state.editingId) {
    state.emailUnavailable = true;
    setFieldError('field-email', 'Участник с таким email уже существует');
    updateSaveButtonState();
    return;
  }

  state.emailUnavailable = false;
  if ($('#error-email').textContent === 'Участник с таким email уже существует') {
    $('#field-email').classList.remove('input--error');
    $('#error-email').textContent = '';
  }
  updateSaveButtonState();
}

function validateParticipantForm() {
  clearFormErrors();

  const name = $('#field-name').value.trim();
  const email = $('#field-email').value.trim();
  let valid = true;

  if (!name) {
    setFieldError('field-name', 'Имя не может быть пустым');
    valid = false;
  }

  if (!email) {
    setFieldError('field-email', 'Email обязателен');
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError('field-email', 'Введите корректный email');
    valid = false;
  }

  return valid;
}

async function handleSaveParticipant() {
  if (!validateParticipantForm()) {
    updateSaveButtonState();
    return;
  }

  const data = {
    name: $('#field-name').value.trim(),
    email: $('#field-email').value.trim(),
    company: $('#field-company').value.trim(),
    ticket: $('#field-ticket').value,
    status: $('#field-status').value,
    checkedIn: $('#field-checked-in').checked,
  };

  try {
    if (state.editingId) {
      const existing = await getOneByIndex(db, 'participants', 'email', data.email.toLowerCase());
      if (existing && existing.id !== state.editingId) {
        state.emailUnavailable = true;
        setFieldError('field-email', 'Участник с таким email уже существует');
        updateSaveButtonState();
        return;
      }
      data.id = state.editingId;
      const updated = await updateParticipantWithLog(db, data);
      showToast(`«${updated.name}» обновлён`, 'success');
    } else {
      const existing = await getOneByIndex(db, 'participants', 'email', data.email.toLowerCase());
      if (existing) {
        setFieldError('field-email', 'Участник с таким email уже существует');
        return;
      }
      const record = await addParticipantWithLog(db, data);
      showToast('Участник добавлен', 'success');
    }

    await refreshData();
    closeParticipantModal();
  } catch (err) {
    showToast('Ошибка сохранения: ' + err.message, 'error');
  }
}

async function handleArchiveParticipant(id) {
  try {
    const record = await archiveParticipantWithLog(db, id);
    await refreshData();
    showToast(`«${record.name}» архивирован`, 'success', async () => {
      await unarchiveParticipantWithLog(db, id);
      await refreshData();
    });
  } catch (err) {
    showToast('Ошибка архивации: ' + err.message, 'error');
  }
}

async function handleCheckIn(id) {
  try {
    await checkInParticipantWithLog(db, id);
    await refreshData();
    showToast('Отметка о прибытии установлена', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function refreshData() {
  state.participants = await getActiveParticipants(db);
  state.activity = await getActivityLog(db);
  updateMetrics();
  renderParticipants();
  renderActivityLog();
}

function renderActivityLog() {
  const list = $('#activity-list');
  const empty = $('#activity-empty');

  if (state.activity.length === 0) {
    list.hidden = true;
    empty.hidden = false;
    return;
  }

  list.hidden = false;
  empty.hidden = true;
  list.innerHTML = '';

  for (const entry of state.activity) {
    const li = document.createElement('li');
    const time = new Date(entry.timestamp).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    li.innerHTML = `
      <span class="activity-log__time">${escapeHtml(time)}</span>
      <span>${escapeHtml(entry.action)}</span>
    `;
    list.appendChild(li);
  }
}

async function handleExportJSON() {
  const allParticipants = await getAllFromStore(db, 'participants');
  const allActivity = await getAllFromStore(db, 'activity');
  const data = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    participants: allParticipants,
    activity: allActivity,
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eventflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Резервная копия скачана', 'success');
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < lines[i].length; j++) {
      const ch = lines[i][j];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

function validateCSVRow(row, rowNum, seenEmails) {
  const errors = [];

  const name = row.name || '';
  if (!name.trim()) {
    errors.push('Имя не может быть пустым');
  }

  const email = (row.email || '').trim();
  if (!email) {
    errors.push('Email обязателен');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Некорректный формат email');
  } else {
    const lower = email.toLowerCase();
    if (seenEmails.has(lower)) {
      errors.push('Дубликат email в файле');
    }
    seenEmails.add(lower);
  }

  const validStatuses = ['new', 'confirmed', 'waitlist', 'cancelled'];
  const status = (row.status || '').trim().toLowerCase();
  if (status && !validStatuses.includes(status)) {
    errors.push(`Неизвестный статус "${row.status}"`);
  }

  const validTickets = ['standard', 'business', 'vip'];
  const ticket = (row.ticket || '').trim().toLowerCase();
  if (ticket && !validTickets.includes(ticket)) {
    errors.push(`Неизвестный тип билета "${row.ticket}"`);
  }

  const checkedIn = (row.checked_in || '').trim().toLowerCase();
  if (checkedIn === 'true' && status !== 'confirmed') {
    errors.push('Отметка о прибытии доступна только для подтверждённых участников');
  }

  const regDate = (row.registered_at || '').trim();
  if (regDate && isNaN(new Date(regDate).getTime())) {
    errors.push('Дата регистрации некорректна');
  }

  return errors;
}

let csvParsedRows = [];
let csvValidRecords = [];

function openCSVPreview(rows) {
  const existingEmails = new Set(state.participants.map((p) => p.email.toLowerCase()));
  const seenEmails = new Set();
  csvParsedRows = rows;
  csvValidRecords = [];

  let validCount = 0;
  let errorCount = 0;
  const tbody = $('#csv-preview-tbody');
  tbody.innerHTML = '';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const email = (row.email || '').trim().toLowerCase();

    const errors = validateCSVRow(row, rowNum, seenEmails);

    if (existingEmails.has(email)) {
      errors.push('Email уже существует в базе');
    }

    const tr = document.createElement('tr');
    const hasErrors = errors.length > 0;

    if (hasErrors) {
      errorCount++;
      tr.classList.add('row-error');
    } else {
      validCount++;
      csvValidRecords.push({ ...row, _rowNum: rowNum });
      tr.classList.add('row-ok');
    }

    tr.innerHTML = `
      <td>${rowNum}</td>
      <td>${escapeHtml(row.name || '')}</td>
      <td>${escapeHtml(row.email || '')}</td>
      <td>${escapeHtml(row.ticket || '')}</td>
      <td>${escapeHtml(row.status || '')}</td>
      <td>${hasErrors ? escapeHtml(errors.join('; ')) : '<span class="row-ok">✓ OK</span>'}</td>
    `;
    tbody.appendChild(tr);
  }

  const total = rows.length;
  $('#csv-summary').innerHTML = `
    Найдено строк: <strong>${total}</strong>.
    Корректных: <strong style="color: var(--color-success)">${validCount}</strong>.
    С ошибками: <strong style="color: var(--color-danger)">${errorCount}</strong>.
  `;

  const importBtn = $('#btn-csv-import');
  importBtn.disabled = validCount === 0;
  importBtn.textContent = validCount > 0 ? `Импортировать (${validCount})` : 'Нет корректных строк';

  $('#modal-csv-overlay').hidden = false;
}

async function handleCSVImport() {
  if (csvValidRecords.length === 0) return;

  const records = csvValidRecords.map((row) => ({
    name: (row.name || '').trim(),
    email: (row.email || '').trim().toLowerCase(),
    company: (row.company || '').trim(),
    ticket: (row.ticket || 'standard').trim().toLowerCase() || 'standard',
    status: (row.status || 'new').trim().toLowerCase() || 'new',
    checkedIn: (row.checked_in || '').trim().toLowerCase() === 'true',
    registeredAt: row.registered_at || new Date().toISOString(),
  }));

  const participants = records.map((r) => ({
    id: generateUUID(),
    name: r.name,
    email: r.email,
    company: r.company,
    ticket: r.ticket,
    status: r.status,
    checkedIn: r.status === 'confirmed' ? r.checkedIn : false,
    registeredAt: r.registeredAt,
    archivedAt: null,
  }));

  try {
    await addParticipantsBatch(db, participants);
    await refreshData();
    closeCSVModal();
    showToast(`Импортировано участников: ${participants.length}`, 'success');
  } catch (err) {
    showToast('Ошибка импорта: ' + err.message, 'error');
  }
}

function closeCSVModal() {
  $('#modal-csv-overlay').hidden = true;
  csvParsedRows = [];
  csvValidRecords = [];
  $('#csv-preview-tbody').innerHTML = '';
}

function handleCSVFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const { headers, rows } = parseCSV(evt.target.result);
      if (rows.length === 0) {
        showToast('Файл CSV пуст или не содержит данных', 'error');
        return;
      }
      openCSVPreview(rows);
    } catch (err) {
      showToast('Ошибка чтения файла: ' + err.message, 'error');
    }
  };
  reader.onerror = () => showToast('Не удалось прочитать файл', 'error');
  reader.readAsText(file);
  e.target.value = '';
}

function handleFileCSV() {
  $('#file-csv').click();
}

function handleFileRestore() {
  $('#file-restore').click();
}

let pendingRestoreData = null;

function handleRestoreFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);

      if (!data || typeof data !== 'object') {
        showToast('Файл не является валидным JSON', 'error');
        return;
      }
      if (data.schemaVersion !== 1) {
        showToast(`Несовместимая версия схемы: ${data.schemaVersion} (ожидается 1)`, 'error');
        return;
      }
      if (!Array.isArray(data.participants)) {
        showToast('Файл не содержит массив participants', 'error');
        return;
      }

      pendingRestoreData = data;
      const pCount = data.participants.length;
      const aCount = (data.activity || []).length;
      $('#restore-info').innerHTML = `Найдено участников: <strong>${pCount}</strong>, записей журнала: <strong>${aCount}</strong>.`;
      $('#modal-restore-overlay').hidden = false;
    } catch (err) {
      showToast('Ошибка чтения JSON: ' + err.message, 'error');
    }
  };
  reader.onerror = () => showToast('Не удалось прочитать файл', 'error');
  reader.readAsText(file);
  e.target.value = '';
}

async function handleRestoreConfirm() {
  if (!pendingRestoreData) return;

  try {
    await replaceAllData(db, pendingRestoreData);
    pendingRestoreData = null;
    $('#modal-restore-overlay').hidden = true;
    await refreshData();
    showToast('Данные восстановлены из резервной копии', 'success');
  } catch (err) {
    showToast('Ошибка восстановления: ' + err.message, 'error');
  }
}

function closeRestoreModal() {
  $('#modal-restore-overlay').hidden = true;
  pendingRestoreData = null;
}

function setSortBy(sortBy) {
  state.sortBy = sortBy;
  $('#sort-select').value = sortBy;
  renderParticipants();
}

function initEventListeners() {
  $('#btn-add-participant').addEventListener('click', () => openParticipantModal());
  $('#btn-empty-add').addEventListener('click', () => openParticipantModal());
  $('#btn-empty-import').addEventListener('click', handleFileCSV);
  $('#btn-modal-close').addEventListener('click', closeParticipantModal);
  $('#btn-modal-cancel').addEventListener('click', closeParticipantModal);
  $('#btn-modal-save').addEventListener('click', (e) => {
    e.preventDefault();
    handleSaveParticipant();
  });

  $('#field-status').addEventListener('change', updateCheckInDisabled);

  $$('#field-name, #field-email').forEach((el) => {
    el.addEventListener('input', updateSaveButtonState);
  });

  let emailCheckTimer = null;
  $('#field-email').addEventListener('input', () => {
    clearTimeout(emailCheckTimer);
    emailCheckTimer = setTimeout(checkEmailUniqueness, 400);
  });

  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeParticipantModal();
  });

  $$('.participants-table__th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      const isSameField = state.sortBy.startsWith(field);
      const currentDir = state.sortBy.split('-')[1];
      if (isSameField) {
        setSortBy(`${field}-${currentDir === 'asc' ? 'desc' : 'asc'}`);
      } else {
        setSortBy(`${field}-asc`);
      }
    });
  });

  $('#search-input').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderParticipants();
  });

  $('#filter-status').addEventListener('change', (e) => {
    state.filterStatus = e.target.value;
    renderParticipants();
  });

  $('#filter-ticket').addEventListener('change', (e) => {
    state.filterTicket = e.target.value;
    renderParticipants();
  });

  $('#sort-select').addEventListener('change', (e) => {
    setSortBy(e.target.value);
  });

  $('#btn-reset-filters').addEventListener('click', () => {
    state.searchQuery = '';
    state.filterStatus = 'all';
    state.filterTicket = 'all';
    $('#search-input').value = '';
    $('#filter-status').value = 'all';
    $('#filter-ticket').value = 'all';
    renderParticipants();
  });

  $('#btn-export-json').addEventListener('click', handleExportJSON);
  $('#btn-import-csv').addEventListener('click', handleFileCSV);
  $('#btn-restore').addEventListener('click', handleFileRestore);

  $('#btn-csv-import').addEventListener('click', handleCSVImport);
  $('#btn-csv-close').addEventListener('click', closeCSVModal);
  $('#btn-csv-cancel').addEventListener('click', closeCSVModal);
  $('#modal-csv-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCSVModal();
  });

  $('#btn-restore-confirm').addEventListener('click', handleRestoreConfirm);
  $('#btn-restore-close').addEventListener('click', closeRestoreModal);
  $('#btn-restore-cancel').addEventListener('click', closeRestoreModal);
  $('#modal-restore-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeRestoreModal();
  });

  $('#file-csv').addEventListener('change', handleCSVFileSelect);
  $('#file-restore').addEventListener('change', handleRestoreFileSelect);

  $('#participants-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'view' || action === 'edit') {
      const participant = state.participants.find((p) => p.id === id);
      if (participant) openParticipantModal(participant);
    } else if (action === 'archive') {
      handleArchiveParticipant(id);
    } else if (action === 'checkin') {
      handleCheckIn(id);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#modal-overlay').hidden) closeParticipantModal();
    else if (!$('#modal-csv-overlay').hidden) closeCSVModal();
    else if (!$('#modal-restore-overlay').hidden) closeRestoreModal();
  });
}

async function init() {
  showLoading();
  try {
    db = await openDB();
    await refreshData();
    initEventListeners();
  } catch (err) {
    console.error('Ошибка инициализации:', err);
    $('#loading-state').innerHTML = `<p style="color: var(--color-danger)">Ошибка загрузки: ${escapeHtml(err.message)}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', init);

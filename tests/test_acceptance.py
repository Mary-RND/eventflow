"""Приёмочные тесты для EventFlow (Lesson 7).

Проверяют критерии из docs/technical-specification.md:
AC-01..AC-29 для статического веб-приложения eventflow.
"""
import re
import subprocess
import csv
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
DATA = ROOT / "data"


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def _app_read(name: str) -> str:
    return (APP / name).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def appjs():
    return _app_read("app.js")


@pytest.fixture(scope="module")
def dbjs():
    return _app_read("db.js")


@pytest.fixture(scope="module")
def indexhtml():
    return _app_read("index.html")


@pytest.fixture(scope="module")
def stylescss():
    return _app_read("styles.css")


# --- AC-01: app files exist ---

def test_app_files_exist():
    """AC-01: app/index.html, styles.css, db.js, app.js существуют."""
    for name in ("index.html", "styles.css", "db.js", "app.js"):
        assert (APP / name).is_file(), f"app/{name} не найден"


# --- AC-02: IndexedDB вместо массива/localStorage ---

def test_indexeddb_used(dbjs, appjs):
    """AC-02: данные хранятся в IndexedDB eventflow-db, а не в массиве/localStorage."""
    assert "indexedDB" in dbjs
    assert "eventflow-db" in dbjs
    assert "openDB" in appjs
    # localStorage допустим только для небольших настроек интерфейса,
    # но не должен хранить участников
    assert "localStorage" not in dbjs


# --- AC-03: хранилища participants/settings/activity ---

def test_db_stores(dbjs):
    """AC-03: создаются хранилища participants, settings, activity."""
    assert "createObjectStore('participants'" in dbjs
    assert "createObjectStore('settings'" in dbjs
    assert "createObjectStore('activity'" in dbjs


def test_db_participants_keypath(dbjs):
    """AC-03: participants использует keyPath id, автоинкремент не используется."""
    assert "createObjectStore('participants', { keyPath: 'id' })" in dbjs


def test_db_indexes(dbjs):
    """AC-03: индексы email (unique), status, registeredAt, archivedAt."""
    assert "createIndex('email', 'email', { unique: true })" in dbjs
    for index in ("status", "registeredAt", "archivedAt"):
        assert f"createIndex('{index}'" in dbjs or f"createIndex(\"{index}\"" in dbjs


# --- AC-04: email уникален без учёта регистра ---

def test_email_unique_ci(dbjs, appjs):
    """AC-04: email нормализуется в нижний регистр, есть уникальный индекс."""
    assert "unique: true" in dbjs
    assert ".trim().toLowerCase()" in dbjs
    assert "email.toLowerCase()" in appjs


# --- AC-05: архивные не входят в показатели и выдачу ---

def test_archived_filtered(dbjs, appjs):
    """AC-05: архивные записи исключаются из показателей и обычной выдачи."""
    assert "archivedAt === null" in dbjs
    assert "!p.archivedAt" in appjs


# --- AC-06: CRUD + отмена архивации ---

def test_crud_functions(dbjs):
    """AC-06: функции add / open / update / archive / unarchive / check-in."""
    for fn in ("addParticipantWithLog", "updateParticipantWithLog",
               "archiveParticipantWithLog", "unarchiveParticipantWithLog",
               "checkInParticipantWithLog"):
        assert f"function {fn}" in dbjs, f"{fn} не найдена в db.js"


def test_archive_undo(appjs):
    """AC-06: архивацию можно отменить из уведомления."""
    assert "toast__action" in appjs
    assert "unarchiveParticipantWithLog" in appjs


# --- AC-07: имя и корректный email обязательны ---

def test_form_required_fields(appjs, indexhtml):
    """AC-07: имя и email обязательны, ошибки показываются рядом с полями."""
    assert ".trim()" in appjs
    assert "validateParticipantForm" in appjs
    assert "setFieldError('field-name'" in appjs
    assert "setFieldError('field-email'" in appjs
    assert 'id="error-name"' in indexhtml
    assert 'id="error-email"' in indexhtml


# --- AC-08: допустимые статусы и билеты ---

def test_valid_statuses(appjs):
    """AC-08: допустимые статусы new/confirmed/waitlist/cancelled."""
    assert "['new', 'confirmed', 'waitlist', 'cancelled']" in appjs


def test_valid_tickets(appjs):
    """AC-08: допустимые билеты standard/business/vip."""
    assert "['standard', 'business', 'vip']" in appjs


# --- AC-09: check-in недоступен для неподтверждённого ---

def test_checkin_guard(dbjs, appjs):
    """AC-09: checkedIn только для confirmed (код и форма)."""
    assert "existing.status !== 'confirmed'" in dbjs
    assert "status !== 'confirmed'" in appjs
    assert "checkbox.disabled = true" in appjs


# --- AC-10: поиск по имени, email и компании ---

def test_search_fields(appjs):
    """AC-10: поиск по name, email и company."""
    assert "p.name.toLowerCase().includes(q)" in appjs
    assert "p.email.toLowerCase().includes(q)" in appjs
    assert "p.company.toLowerCase().includes(q)" in appjs


# --- AC-11: фильтры статуса и билета ---

def test_filters(appjs):
    """AC-11: фильтры по статусу и типу билета."""
    assert "state.filterStatus" in appjs
    assert "state.filterTicket" in appjs


# --- AC-12: сортировка по имени и дате ---

def test_sort(appjs):
    """AC-12: сортировка по имени и дате регистрации."""
    assert "state.sortBy" in appjs
    assert "sortField === 'name'" in appjs
    assert "sortField === 'date'" in appjs


# --- AC-13: показатели пересчитываются ---

def test_metrics_recalc(appjs):
    """AC-13: пересчёт показателей active/confirmed/checkedIn/waitlist."""
    assert "function updateMetrics" in appjs
    assert "metric-active" in appjs
    assert "metric-confirmed" in appjs
    assert "metric-checkedIn" in appjs
    assert "metric-waitlist" in appjs


# --- AC-14: пустой результат объясняет сброс ---

def test_search_empty_reset(indexhtml, appjs):
    """AC-14: пустой результат + кнопка сброса фильтров."""
    assert 'id="search-empty"' in indexhtml
    assert 'id="btn-reset-filters"' in indexhtml
    assert "Сбросить фильтры" in indexhtml
    assert "$('#btn-reset-filters')" in appjs


# --- AC-15/AC-16: демонстрационные CSV ---

def _parse_csv(rel: str) -> list:
    with (DATA / rel).open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def test_csv_participants_12_valid():
    """AC-15: data/participants.csv содержит 12 валидных строк."""
    rows = _parse_csv("participants.csv")
    assert len(rows) == 12
    for r in rows:
        assert r["name"].strip(), "пустое имя"
        assert re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", r["email"].strip()), f'bad email: {r["email"]}'
        assert r["status"] in ("new", "confirmed", "waitlist", "cancelled"), r["status"]
        assert r["ticket"] in ("standard", "business", "vip"), r["ticket"]
    emails = [r["email"].strip().lower() for r in rows]
    assert len(emails) == len(set(emails)), "есть дубликаты email в participants.csv"


def _validate_csv_rows(rows, existing_emails):
    """Зеркало логики openCSVPreview: возвращает (valid, errors, seen)."""
    seen = set()
    valid, errors = [], []
    for r in rows:
        errs = []
        if not r["name"].strip():
            errs.append("Имя не может быть пустым")
        email = r["email"].strip()
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
            errs.append("Некорректный формат email")
        elif email.lower() in seen:
            errs.append("Дубликат email в файле")
        elif email.lower() in existing_emails:
            errs.append("Email уже существует в базе")
        else:
            seen.add(email.lower())
        if r["status"] and r["status"] not in ("new", "confirmed", "waitlist", "cancelled"):
            errs.append("Неизвестный статус")
        if r["ticket"] and r["ticket"] not in ("standard", "business", "vip"):
            errs.append("Неизвестный тип билета")
        if r["checked_in"].lower() == "true" and r["status"].lower() != "confirmed":
            errs.append("Отметка о прибытии только для confirmed")
        if errs:
            errors.append((r, errs))
        else:
            valid.append(r)
    return valid, errors


def test_csv_with_errors_2_valid_6_invalid():
    """AC-16: data/participants-with-errors.csv: 2 корректные и 6 ошибочных."""
    existing = {r["email"].strip().lower() for r in _parse_csv("participants.csv")}
    rows = _parse_csv("participants-with-errors.csv")
    valid, errors = _validate_csv_rows(rows, existing)
    assert len(valid) == 2, f"ожидалось 2 корректные, получено {len(valid)}"
    assert len(errors) == 6, f"ожидалось 6 ошибочных, получено {len(errors)}"


# --- AC-17: до подтверждения строки не попадают в IndexedDB ---

def test_csv_preview_before_import(appjs):
    """AC-17: импорт только через предпросмотр; запись только после подтверждения."""
    assert "openCSVPreview" in appjs
    assert "handleCSVImport" in appjs
    assert "csvValidRecords" in appjs
    # предпросмотр не вызывает запись; запись — только в handleCSVImport
    assert appjs.index("function openCSVPreview") < appjs.index("addParticipantsBatch")
    assert "async function handleCSVImport" in appjs


# --- AC-18: номер строки и причина ошибки ---

def test_csv_error_rows(appjs):
    """AC-18: в предпросмотре показываются номер строки и причина."""
    assert "rowNum = i + 2" in appjs
    assert "errors.join('; ')" in appjs


# --- AC-19: корректные строки одной транзакцией ---

def test_batch_transaction(dbjs):
    """AC-19: addParticipantsBatch пишет одной транзакцией."""
    assert "function addParticipantsBatch" in dbjs
    assert "db.transaction(['participants', 'activity'], 'readwrite')" in dbjs


# --- AC-20: дубликаты по email не создаются ---

def test_no_email_duplicates(appjs, dbjs):
    """AC-20: защита от дубликатов email в форме и CSV-импорте."""
    assert "Участник с таким email уже существует" in appjs
    assert "Email уже существует в базе" in appjs
    assert "Дубликат email в файле" in appjs
    assert "unique: true" in dbjs


# --- AC-21: экспорт JSON schemaVersion 1 ---

def test_export_json(appjs):
    """AC-21: экспорт JSON c schemaVersion, exportedAt, participants, activity."""
    assert "schemaVersion: 1" in appjs
    assert "exportedAt" in appjs
    assert "participants: allParticipants" in appjs
    assert "activity: allActivity" in appjs


# --- AC-22: восстановление сначала показывает предпросмотр ---

def test_restore_preview(appjs, indexhtml):
    """AC-22: восстановление через предпросмотр с предупреждением."""
    assert "handleRestoreFileSelect" in appjs
    assert "modal-restore-overlay" in appjs
    assert "Текущие данные будут заменены" in indexhtml


# --- AC-23: неверный/несовместимый JSON не меняет базу ---

def test_restore_guard(appjs):
    """AC-23: проверка структуры JSON до записи."""
    assert "schemaVersion !== 1" in appjs
    assert "!Array.isArray(data.participants)" in appjs
    assert "replaceAllData" in appjs


# --- AC-24: восстановленные данные переживают перезагрузку ---

def test_restore_persisted(dbjs):
    """AC-24: восстановление пишет в IndexedDB (participants/activity/settings)."""
    assert "function replaceAllData" in dbjs
    assert "db.transaction(['participants', 'activity', 'settings'], 'readwrite')" in dbjs
    assert "pStore.clear()" in dbjs


# --- AC-25: состояния loading / empty / error / success ---

def test_ui_states(indexhtml, appjs, stylescss):
    """AC-25: состояния loading, empty, error, success реализованы."""
    for element_id in ("loading-state", "empty-state", "search-empty"):
        assert f'id="{element_id}"' in indexhtml, f"Нет элемента id={element_id}"
    assert "showToast" in appjs
    assert "toast--success" in stylescss
    assert "toast--error" in stylescss
    assert "Ошибка" in appjs


# --- AC-26: читаемость на 1440 / 768 / 390 px ---

def test_responsive_css(stylescss):
    """AC-26: media-запросы планшета (768px) и мобильного (не шире 480px)."""
    assert "@media" in stylescss
    assert "(max-width: 768px)" in stylescss
    assert "480px" in stylescss


# --- AC-27: действия доступны с клавиатуры, фокус видим ---

def test_keyboard_focus(stylescss, indexhtml):
    """AC-27: :focus-visible у кнопок, sr-only элементы, фокус не отключён глобально."""
    assert "focus-visible" in stylescss
    assert ":focus" in stylescss
    assert "outline" in stylescss
    assert ".sr-only" in stylescss


# --- AC-28: нет сетевых запросов, внешних библиотек и CDN ---

def test_no_external_network(indexhtml, appjs, dbjs, stylescss):
    """AC-28: нет внешних ресурсов/CDN/API (кроме SVG namespace)."""
    for src in (indexhtml, appjs, dbjs, stylescss):
        external = re.findall(r'https?://(?!www\.w3\.org/2000/svg)\S+', src)
        assert external == [], f"Обнаружены внешние ссылки: {external}"
    assert "<script" in indexhtml or "script src" in indexhtml
    assert "db.js" in indexhtml and "app.js" in indexhtml


# --- AC-29: синтаксис JS ---

def test_node_syntax_check():
    """AC-29: node --check app/db.js и app/app.js без ошибок."""
    for name in ("db.js", "app.js"):
        result = subprocess.run(
            ["node", "--check", str(APP / name)],
            capture_output=True, text=True, encoding="utf-8",
        )
        assert result.returncode == 0, f"node --check {name}: {result.stderr}"
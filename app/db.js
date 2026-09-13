const DB_NAME = 'eventflow-db';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('participants')) {
        const store = db.createObjectStore('participants', { keyPath: 'id' });
        store.createIndex('email', 'email', { unique: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('registeredAt', 'registeredAt', { unique: false });
        store.createIndex('archivedAt', 'archivedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('activity')) {
        db.createObjectStore('activity', { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function generateUUID() {
  return crypto.randomUUID();
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromStore(db, storeName) {
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return promisifyRequest(store.getAll());
}

function getFromStore(db, storeName, key) {
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return promisifyRequest(store.get(key));
}

function putToStore(db, storeName, value) {
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  const req = store.put(value);
  return promisifyRequest(req);
}

function deleteFromStore(db, storeName, key) {
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  const req = store.delete(key);
  return promisifyRequest(req);
}

function clearStore(db, storeName) {
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  const req = store.clear();
  return promisifyRequest(req);
}

function getByIndex(db, storeName, indexName, value) {
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const index = store.index(indexName);
  return promisifyRequest(index.getAll(value));
}

function getOneByIndex(db, storeName, indexName, value) {
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const index = store.index(indexName);
  return promisifyRequest(index.get(value));
}

async function addParticipant(db, participant) {
  const record = {
    id: generateUUID(),
    name: participant.name.trim(),
    email: participant.email.trim().toLowerCase(),
    company: (participant.company || '').trim(),
    ticket: participant.ticket,
    status: participant.status,
    checkedIn: participant.status === 'confirmed' ? (participant.checkedIn || false) : false,
    registeredAt: participant.registeredAt || new Date().toISOString(),
    archivedAt: null,
  };
  await putToStore(db, 'participants', record);
  return record;
}

async function updateParticipant(db, participant) {
  const existing = await getFromStore(db, 'participants', participant.id);
  if (!existing) throw new Error('Участник не найден');

  const record = {
    ...existing,
    name: participant.name.trim(),
    email: participant.email.trim().toLowerCase(),
    company: (participant.company || '').trim(),
    ticket: participant.ticket,
    status: participant.status,
    checkedIn: participant.status === 'confirmed' ? (participant.checkedIn || false) : false,
  };
  await putToStore(db, 'participants', record);
  return record;
}

async function archiveParticipant(db, id) {
  const existing = await getFromStore(db, 'participants', id);
  if (!existing) throw new Error('Участник не найден');

  const record = { ...existing, archivedAt: new Date().toISOString() };
  await putToStore(db, 'participants', record);
  return record;
}

async function unarchiveParticipant(db, id) {
  const existing = await getFromStore(db, 'participants', id);
  if (!existing) throw new Error('Участник не найден');

  const record = { ...existing, archivedAt: null };
  await putToStore(db, 'participants', record);
  return record;
}

async function checkInParticipant(db, id) {
  const existing = await getFromStore(db, 'participants', id);
  if (!existing) throw new Error('Участник не найден');
  if (existing.status !== 'confirmed') {
    throw new Error('Отметка о прибытии доступна только для подтверждённых участников');
  }

  const record = { ...existing, checkedIn: true };
  await putToStore(db, 'participants', record);
  return record;
}

function makeActivityEntry(action, participantName, participantId) {
  return {
    action,
    participantName: participantName || '',
    participantId: participantId || null,
    timestamp: new Date().toISOString(),
  };
}

async function addParticipantWithLog(db, participant) {
  const record = {
    id: generateUUID(),
    name: participant.name.trim(),
    email: participant.email.trim().toLowerCase(),
    company: (participant.company || '').trim(),
    ticket: participant.ticket,
    status: participant.status,
    checkedIn: participant.status === 'confirmed' ? (participant.checkedIn || false) : false,
    registeredAt: participant.registeredAt || new Date().toISOString(),
    archivedAt: null,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['participants', 'activity'], 'readwrite');
    tx.objectStore('participants').put(record);
    tx.objectStore('activity').put(makeActivityEntry(`Добавлен: ${record.name}`, record.name, record.id));
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

async function updateParticipantWithLog(db, participant) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['participants', 'activity'], 'readwrite');
    const pStore = tx.objectStore('participants');
    const getReq = pStore.get(participant.id);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        reject(new Error('Участник не найден'));
        return;
      }

      const record = {
        ...existing,
        name: participant.name.trim(),
        email: participant.email.trim().toLowerCase(),
        company: (participant.company || '').trim(),
        ticket: participant.ticket,
        status: participant.status,
        checkedIn: participant.status === 'confirmed' ? (participant.checkedIn || false) : false,
      };

      pStore.put(record);
      tx.objectStore('activity').put(makeActivityEntry(`Обновлён: ${record.name}`, record.name, record.id));
      tx.oncomplete = () => resolve(record);
    };

    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

async function archiveParticipantWithLog(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['participants', 'activity'], 'readwrite');
    const pStore = tx.objectStore('participants');
    const getReq = pStore.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        reject(new Error('Участник не найден'));
        return;
      }

      const record = { ...existing, archivedAt: new Date().toISOString() };
      pStore.put(record);
      tx.objectStore('activity').put(makeActivityEntry(`Архивирован: ${record.name}`, record.name, record.id));
      tx.oncomplete = () => resolve(record);
    };

    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

async function unarchiveParticipantWithLog(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['participants', 'activity'], 'readwrite');
    const pStore = tx.objectStore('participants');
    const getReq = pStore.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        reject(new Error('Участник не найден'));
        return;
      }

      const record = { ...existing, archivedAt: null };
      pStore.put(record);
      tx.objectStore('activity').put(makeActivityEntry(`Отмена архивации: ${record.name}`, record.name, record.id));
      tx.oncomplete = () => resolve(record);
    };

    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

async function checkInParticipantWithLog(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['participants', 'activity'], 'readwrite');
    const pStore = tx.objectStore('participants');
    const getReq = pStore.get(id);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        reject(new Error('Участник не найден'));
        return;
      }
      if (existing.status !== 'confirmed') {
        reject(new Error('Отметка о прибытии доступна только для подтверждённых участников'));
        return;
      }

      const record = { ...existing, checkedIn: true };
      pStore.put(record);
      tx.objectStore('activity').put(makeActivityEntry(`Отметка о прибытии: ${record.name}`, record.name, record.id));
      tx.oncomplete = () => resolve(record);
    };

    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

async function logActivity(db, action, participantName, participantId) {
  const entry = {
    action,
    participantName: participantName || '',
    participantId: participantId || null,
    timestamp: new Date().toISOString(),
  };
  await putToStore(db, 'activity', entry);
}

async function getActiveParticipants(db) {
  const all = await getAllFromStore(db, 'participants');
  return all.filter((p) => p.archivedAt === null);
}

async function addParticipantsBatch(db, participants) {
  const tx = db.transaction(['participants', 'activity'], 'readwrite');
  const pStore = tx.objectStore('participants');
  const aStore = tx.objectStore('activity');

  for (const p of participants) {
    pStore.put(p);
  }

  aStore.put({
    action: `Импорт CSV: добавлено ${participants.length} участников`,
    participantName: '',
    participantId: null,
    timestamp: new Date().toISOString(),
  });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function replaceAllData(db, data) {
  const tx = db.transaction(['participants', 'activity', 'settings'], 'readwrite');
  const pStore = tx.objectStore('participants');
  const aStore = tx.objectStore('activity');
  const sStore = tx.objectStore('settings');

  pStore.clear();
  aStore.clear();
  sStore.clear();

  for (const p of data.participants) {
    pStore.put(p);
  }
  if (data.activity) {
    for (const a of data.activity) {
      aStore.put(a);
    }
  }

  aStore.put({
    action: 'Восстановление из резервной копии',
    participantName: '',
    participantId: null,
    timestamp: new Date().toISOString(),
  });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getSetting(db, key) {
  const result = await getFromStore(db, 'settings', key);
  return result ? result.value : null;
}

async function setSetting(db, key, value) {
  await putToStore(db, 'settings', { key, value });
}

async function getActivityLog(db, limit = 20) {
  const all = await getAllFromStore(db, 'activity');
  return all
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

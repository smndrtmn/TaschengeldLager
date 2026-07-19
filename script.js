// =============== TaschengeldLager – Firestore‑Version ===================
// Dieses Skript ersetzt die lokale Array‑Datenbank vollständig durch
// Cloud Firestore. Alle Änderungen werden geräteübergreifend in Echtzeit
// synchronisiert.
// -------------------------------------------------------------------------
// Voraussetzungen in index.html (siehe Schritt 3 des Guides):
// 1. Firebase SDK & initializeApp(firebaseConfig)
// 2. const db  = getFirestore(app);          →  window.db = db;
// 3. signInAnonymously(auth);
// -------------------------------------------------------------------------
// Die DOM‑Elemente bleiben unverändert:
const searchForm         = document.querySelector('#search-form');
const searchInput        = document.querySelector('#search-input');
const searchResults      = document.querySelector('#search-results');
const childDetailsDiv    = document.querySelector('#child-details');
const moneyForm          = document.querySelector('#money-form');
const depositBtn         = document.querySelector('#deposit-btn');
const withdrawBtn        = document.querySelector('#withdraw-btn');
const moneyInput         = document.querySelector('#money-input');
const childNameElement   = document.querySelector('#child-name');
const balanceElement     = document.querySelector('#balance');
const transactionsTBody = document.querySelector('#transactions tbody');
const addChildButton     = document.querySelector('#add-child');
const importChildrenButton = document.querySelector('#import-children');
const csvFileInput       = document.querySelector('#csv-file-input');
const importStatus       = document.querySelector('#import-status');
const deleteAllButton    = document.querySelector('#delete-all');

// -------------------------------------------------------------------------
// Firebase – nur die Module, die wir benötigen:
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, increment, writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Das Firestore‑Handle kommt aus index.html (window.db)
const db = window.db;

// -------------------------------------------------------------------------
// Interner State
let childrenCache = [];        // Alle Kinder aus der DB (für Suchen etc.)
let selectedChildId = null;    // Aktuell geöffnetes Kind (Dokumenten‑ID)
let unsubscribeTransactions;   // Funktion zum Abbestellen des Tx‑Listeners

// Kleinere Abweichungen als ein halber Cent sind Rundungsreste von Fließkommazahlen.
const BALANCE_EPSILON = 0.005;

// -------------------------------------------------------------------------
// Hilfsfunktionen
function getDayOfWeek(date) {
  const d = new Date(date);
  return ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][d.getDay()];
}

function formatCurrency(value) {
  return `€${value.toFixed(2)}`;
}

function setImportStatus(message, type = '') {
  importStatus.textContent = message;
  importStatus.className = type;
}

function normalizeHeader(value) {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase('de')
    .replace(/[\s_-]+/g, '');
}

function normalizeDuplicatePart(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de');
}

function normalizeBirthDate(value) {
  const input = String(value || '').trim();
  let match = input.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);

  if (!match) {
    const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) match = [isoMatch[0], isoMatch[3], isoMatch[2], isoMatch[1]];
  }

  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid = date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;

  if (!isValid) return null;
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}

function createDuplicateKey(firstName, lastName, birthDate) {
  return [firstName, lastName, birthDate].map(normalizeDuplicatePart).join('|');
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && line[i] === delimiter) {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(csvText) {
  const firstLine = csvText.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
  const candidates = [';', ',', '\t'];
  const counts = candidates.map(delimiter => ({
    delimiter,
    count: countDelimiter(firstLine, delimiter)
  }));
  counts.sort((a, b) => b.count - a.count);

  if (counts[0].count === 0) {
    throw new Error('Kein gültiges CSV-Trennzeichen gefunden.');
  }

  return counts[0].delimiter;
}

function parseCsv(csvText, delimiter) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];

    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && csvText[i + 1] === '\n') i += 1;
      row.push(value);
      if (row.some(cell => cell.trim() !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (inQuotes) throw new Error('Die CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.');

  row.push(value);
  if (row.some(cell => cell.trim() !== '')) rows.push(row);
  return rows;
}

function findHeaderIndex(headers, aliases) {
  return headers.findIndex(header => aliases.includes(normalizeHeader(header)));
}

function parseChildrenCsv(csvText) {
  const delimiter = detectDelimiter(csvText);
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ''), delimiter);

  if (rows.length < 2) {
    throw new Error('Die CSV-Datei enthält keine Kinder.');
  }

  const headers = rows[0];
  const firstNameIndex = findHeaderIndex(headers, ['vorname', 'firstname']);
  const lastNameIndex = findHeaderIndex(headers, ['nachname', 'familienname', 'lastname']);
  const birthDateIndex = findHeaderIndex(headers, ['geburtsdatum', 'geburtstag', 'birthdate']);

  if ([firstNameIndex, lastNameIndex, birthDateIndex].includes(-1)) {
    throw new Error('Benötigte Spalten: Vorname, Nachname und Geburtsdatum.');
  }

  const knownChildren = new Set(childrenCache.map(child => createDuplicateKey(
    child.firstName,
    child.lastName,
    normalizeBirthDate(child.birthDate) || child.birthDate
  )));
  const children = [];
  const invalidRows = [];
  let duplicateCount = 0;

  rows.slice(1).forEach((columns, index) => {
    const rowNumber = index + 2;
    const firstName = String(columns[firstNameIndex] || '').trim();
    const lastName = String(columns[lastNameIndex] || '').trim();
    const birthDate = normalizeBirthDate(columns[birthDateIndex]);

    if (!firstName || !lastName || !birthDate) {
      invalidRows.push(rowNumber);
      return;
    }

    const duplicateKey = createDuplicateKey(firstName, lastName, birthDate);
    if (knownChildren.has(duplicateKey)) {
      duplicateCount += 1;
      return;
    }

    knownChildren.add(duplicateKey);
    children.push({ firstName, lastName, birthDate, balance: 0 });
  });

  return { children, duplicateCount, invalidRows };
}

async function saveImportedChildren(children) {
  // Firestore erlaubt höchstens 500 Schreibvorgänge pro Batch.
  const batchSize = 450;
  for (let start = 0; start < children.length; start += batchSize) {
    const batch = writeBatch(db);
    children.slice(start, start + batchSize).forEach(child => {
      batch.set(doc(childrenRef), child);
    });
    await batch.commit();
  }
}

// -------------------------------------------------------------------------
// 1 | Globaler Listener auf die Sammlung "children" (live)
const childrenRef = collection(db, 'children');
onSnapshot(childrenRef, (snapshot) => {
  // Cache aktualisieren + nach Nachname sortieren
  childrenCache = snapshot.docs
    .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
    .sort((a, b) =>
      a.lastName.localeCompare(b.lastName, 'de', { sensitivity: 'base' })
  );
  
  const totalBalance = childrenCache.reduce((sum, c) => sum + (c.balance || 0), 0);
  document.getElementById('total-balance').textContent = `Gesamtsumme: ${formatCurrency(totalBalance)}`;

  // Wenn ein Kind offen ist, dessen Saldo aktualisieren
  if (selectedChildId) {
    const current = childrenCache.find(c => c.id === selectedChildId);
    if (current) {
      childNameElement.textContent = `${current.firstName} ${current.lastName}`;
      balanceElement.textContent  = `Guthaben: ${formatCurrency(current.balance)}`;
    }
  }

  // Suchergebnisse ggf. neu rendern
  if (!selectedChildId) {
    renderSearchResults(searchInput.value.trim().toLowerCase());
  }
});

// -------------------------------------------------------------------------
// 2 | Suche
function renderSearchResults(term) {
  searchResults.innerHTML = '';
  if (!term) term = '';
  const results = childrenCache
    .filter(c => (`${c.firstName} ${c.lastName}`.toLowerCase().includes(term)))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

  results.forEach(child => {
    const div  = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = ` ${child.lastName}, ${child.firstName}`;
    const birth = document.createElement('span');
    const balance = document.createElement('strong');
    birth.textContent = child.birthDate;
    balance.textContent = formatCurrency(child.balance).replace('.', ',');
    div.append(name, birth, balance);

    div.addEventListener('click', () => openChild(child.id));
    searchResults.append(div);
  });
}

searchInput.addEventListener('input', () => {
  const term = searchInput.value.trim().toLowerCase();
  // Beim Tippen Kind‑Ansicht ausblenden
  selectedChildId = null;
  if (unsubscribeTransactions) unsubscribeTransactions();
  childDetailsDiv.hidden = true;
  renderSearchResults(term);
});

// -------------------------------------------------------------------------
// 3 | Kind öffnen + Transaktionen listener
function openChild(childId) {
  selectedChildId = childId;

  const childDoc  = doc(db, 'children', childId);
  const transRef  = collection(childDoc, 'transactions');
  const transQ    = query(transRef, orderBy('date', 'desc'));

  // 3a: Live‑Saldo & Name (Dokument‑Listener)
  onSnapshot(childDoc, (snap) => {
    const data = snap.data();
    childNameElement.textContent = `${data.firstName} ${data.lastName}`;
    balanceElement.textContent  = `Guthaben: ${formatCurrency(data.balance)}`;
  });

  // 3b: Live‑Transaktionen
  if (unsubscribeTransactions) unsubscribeTransactions();
  unsubscribeTransactions = onSnapshot(transQ, (snapshot) => {
    transactionsTBody.innerHTML = '';
    snapshot.forEach(txDoc => {
      const tx   = txDoc.data();
      const date = new Date(tx.date);
      const tr   = document.createElement('tr');
      tr.innerHTML = `<td>${getDayOfWeek(date)}</td><td>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</td><td>${formatCurrency(tx.amount)}</td>`;
      transactionsTBody.append(tr);
    });
  });

  // UI anpassen
  childDetailsDiv.hidden = false;
  searchInput.value      = '';
  searchResults.innerHTML = '';
}

// -------------------------------------------------------------------------
// 4 | Buchungen (Ein‑ & Auszahlung)
async function book(amount) {
  if (!selectedChildId || isNaN(amount) || amount === 0) return;
  const childRef = doc(db, 'children', selectedChildId);
  // Saldo ändern
  await updateDoc(childRef, { balance: increment(amount) });
  // Transaktion anlegen
  const transRef = collection(childRef, 'transactions');
  await addDoc(transRef, {
    amount,
    date: new Date().toISOString()
  });
}

depositBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const value = parseFloat(moneyInput.value.replace(',', '.'));
  if (!isNaN(value) && value > 0) book(value).then(() => moneyInput.value = '');
});

withdrawBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const value = parseFloat(moneyInput.value.replace(',', '.'));
  if (!isNaN(value) && value > 0) book(-value).then(() => moneyInput.value = '');
});

// -------------------------------------------------------------------------
// 5 | Kind hinzufügen
addChildButton.addEventListener('click', async () => {
  const firstName = prompt('Vorname des Kindes:');
  if (!firstName) return;
  const lastName  = prompt('Nachname des Kindes:');
  if (!lastName) return;
  const birthDate = prompt('Geburtsdatum (DD.MM.YYYY):');

  await addDoc(childrenRef, {
    firstName,
    lastName,
    birthDate,
    balance: 0
  });
});

// -------------------------------------------------------------------------
// 6 | Kinder aus CSV importieren
importChildrenButton.addEventListener('click', () => {
  csvFileInput.click();
});

csvFileInput.addEventListener('change', async () => {
  const file = csvFileInput.files[0];
  if (!file) return;

  importChildrenButton.disabled = true;
  setImportStatus('CSV-Datei wird geprüft …');

  try {
    const csvText = await file.text();
    const { children, duplicateCount, invalidRows } = parseChildrenCsv(csvText);

    if (!children.length) {
      const details = duplicateCount
        ? 'Alle Einträge sind bereits vorhanden.'
        : 'Es wurden keine gültigen Kinder gefunden.';
      throw new Error(details);
    }

    const warnings = [];
    if (duplicateCount) warnings.push(`${duplicateCount} Dublette(n)`);
    if (invalidRows.length) warnings.push(`${invalidRows.length} ungültige Zeile(n)`);
    const warningText = warnings.length ? `\n\nÜbersprungen: ${warnings.join(', ')}.` : '';

    const confirmed = confirm(
      `${children.length} Kind(er) mit einem Guthaben von 0 € importieren?${warningText}`
    );
    if (!confirmed) {
      setImportStatus('Import abgebrochen.');
      return;
    }

    setImportStatus(`${children.length} Kind(er) werden importiert …`);
    await saveImportedChildren(children);

    const summary = [`${children.length} Kind(er) importiert.`];
    if (duplicateCount) summary.push(`${duplicateCount} Dublette(n) übersprungen.`);
    if (invalidRows.length) {
      summary.push(`Ungültige Zeilen übersprungen: ${invalidRows.join(', ')}.`);
    }
    setImportStatus(summary.join(' '), 'success');
  } catch (error) {
    console.error('CSV-Import fehlgeschlagen:', error);
    setImportStatus(`Import fehlgeschlagen: ${error.message}`, 'error');
    alert(`CSV-Import fehlgeschlagen:\n${error.message}`);
  } finally {
    importChildrenButton.disabled = false;
    csvFileInput.value = '';
  }
});

// -------------------------------------------------------------------------
// 7 | Alle Kinder löschen (nur wenn alle Salden = 0)
deleteAllButton.addEventListener('click', async () => {
  const childrenWithBalance = childrenCache.filter(
    c => Math.abs(Number(c.balance) || 0) >= BALANCE_EPSILON
  );
  if (childrenWithBalance.length) {
    let msg = 'Fehler: Diese Kinder haben noch Guthaben:\n';
    childrenWithBalance.forEach(c => { msg += `\n${c.firstName} ${c.lastName}: ${formatCurrency(c.balance)}`; });
    alert(msg);
    return;
  }
  if (!confirm('Sind Sie sicher, dass Sie alle Kinder löschen möchten?')) return;

  const deletes = childrenCache.map(c => deleteDoc(doc(db, 'children', c.id)));
  await Promise.all(deletes);
  alert('Alle Kinder wurden gelöscht.');
});

// -------------------------------------------------------------------------
// 8 | Formular‑Submit (verhindern Standard‑Reload)
searchForm?.addEventListener('submit', (e) => e.preventDefault());
moneyForm?.addEventListener('submit', (e) => e.preventDefault());

// Fertig – alle Aktionen laufen jetzt über Firestore und synchronisieren
// live zwischen allen geöffneten Geräten oder Browser‑Tabs.

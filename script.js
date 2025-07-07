// =============== TaschengeldLager – Firestore‑Version ===================
// Dieses Skript ersetzt die lokale Array‑Datenbank vollständig durch
// Cloud Firestore.  Alle Änderungen werden geräteübergreifend in Echtzeit
// synchronisiert.
// -------------------------------------------------------------------------
// Voraussetzungen in index.html (siehe Schritt 3 des Guides):
// 1. Firebase SDK & initializeApp(firebaseConfig)
// 2. const db  = getFirestore(app);          →  window.db = db;
// 3. signInAnonymously(auth);
// -------------------------------------------------------------------------
// Die DOM‑Elemente bleiben unverändert:
const searchForm        = document.querySelector('#search-form');
const searchInput       = document.querySelector('#search-input');
const searchResults     = document.querySelector('#search-results');
const childDetailsDiv   = document.querySelector('#child-details');
const moneyForm         = document.querySelector('#money-form');
const depositBtn        = document.querySelector('#deposit-btn');
const withdrawBtn       = document.querySelector('#withdraw-btn');
const moneyInput        = document.querySelector('#money-input');
const childNameElement  = document.querySelector('#child-name');
const balanceElement    = document.querySelector('#balance');
const transactionsTBody = document.querySelector('#transactions tbody');
const addChildButton    = document.querySelector('#add-child');
const deleteAllButton   = document.querySelector('#delete-all');

// -------------------------------------------------------------------------
// Firebase – nur die Module, die wir benötigen:
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, increment
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Das Firestore‑Handle kommt aus index.html (window.db)
const db = window.db;

// -------------------------------------------------------------------------
// Interner State
let childrenCache = [];        // Alle Kinder aus der DB (für Suchen etc.)
let selectedChildId = null;    // Aktuell geöffnetes Kind (Dokumenten‑ID)
let unsubscribeTransactions;   // Funktion zum Abbestellen des Tx‑Listeners

// -------------------------------------------------------------------------
// Hilfsfunktionen
function getDayOfWeek(date) {
  const d = new Date(date);
  return ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][d.getDay()];
}

function formatCurrency(value) {
  return `€${value.toFixed(2)}`;
}

// -------------------------------------------------------------------------
// 1 | Globaler Listener auf die Sammlung \"children\" (live)
const childrenRef = collection(db, 'children');
onSnapshot(childrenRef, (snapshot) => {
  // Cache aktualisieren
  childrenCache = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

  // Wenn ein Kind offen ist, dessen Saldo aktualisieren
  if (selectedChildId) {
    const current = childrenCache.find(c => c.id === selectedChildId);
    if (current) {
      childNameElement.textContent = `${current.firstName} ${current.lastName}`;
      balanceElement.textContent  = `Guthaben: ${formatCurrency(current.balance)}`;
    }
  }

  // Suchergebnisse ggf. neu rendern
  renderSearchResults(searchInput.value.trim().toLowerCase());
});

// -------------------------------------------------------------------------
// 2 | Suche
function renderSearchResults(term) {
  searchResults.innerHTML = '';
  if (!term) return;
  const results = childrenCache
    .filter(c => (`${c.firstName} ${c.lastName}`.toLowerCase().includes(term)))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

  results.forEach(child => {
    const div  = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = `${child.firstName} ${child.lastName}`;
    const birth = document.createElement('span');
    birth.textContent = child.birthDate;
    div.append(name, birth);

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
// 6 | Alle Kinder löschen (nur wenn alle Salden = 0)
deleteAllButton.addEventListener('click', async () => {
  const childrenWithBalance = childrenCache.filter(c => c.balance > 0);
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
// 7 | Formular‑Submit (verhindern Standard‑Reload)
searchForm?.addEventListener('submit', (e) => e.preventDefault());
moneyForm?.addEventListener('submit', (e) => e.preventDefault());

// Fertig – alle Aktionen laufen jetzt über Firestore und synchronisieren
// live zwischen allen geöffneten Geräten oder Browser‑Tabs.

const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const searchResults = document.querySelector('#search-results');
const childDetailsDiv = document.querySelector('#child-details');
const moneyForm = document.querySelector('#money-form');
const depositBtn = document.querySelector('#deposit-btn');
const withdrawBtn = document.querySelector('#withdraw-btn');
const moneyInput = document.querySelector('#money-input');
const childNameElement = document.querySelector('#child-name');
const balanceElement = document.querySelector('#balance');
const transactionsTBody = document.querySelector('#transactions tbody');
const addChildButton = document.querySelector('#add-child');
const deleteAllButton = document.querySelector('#delete-all');

// Simulierte Datenbank
const database = [
  { firstName: 'Max', lastName: 'Mustermann', birthDate: '2011-01-01', balance: 10.50, transactions: [
    { date: '2023-07-01 09:00', amount: 5.00 },
    { date: '2023-07-02 09:00', amount: -1.50 },
    // Weitere Transaktionen...
  ] },
  { firstName: 'Max', lastName: 'Meier', birthDate: '2010-05-12', balance: 20.75, transactions: [
    { date: '2023-07-01 09:00', amount: 10.00 },
    { date: '2023-07-02 09:00', amount: -1.00 },
    // Weitere Transaktionen...
  ] },
  { firstName: 'Lena', lastName: 'Schmidt', birthDate: '2009-09-20', balance: 15.00, transactions: [
    { date: '2023-07-01 09:00', amount: 7.00 },
    { date: '2023-07-02 09:00', amount: -2.50 },
    // Weitere Transaktionen...
  ] },
  { firstName: 'Tom', lastName: 'Muller', birthDate: '2009-04-25', balance: 12.00, transactions: [
    { date: '2023-07-01 09:00', amount: 6.00 },
    { date: '2023-07-02 09:00', amount: -2.00 },
    { date: '2023-07-02 09:01', amount: -2.50 },
    // Weitere Transaktionen...
  ] },
  // Weitere Kinder hinzufügen...
];

let selectedChild = null;

function getDayOfWeek(dateString) {
  const date = new Date(dateString);
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  return days[date.getDay()];
}

searchInput.addEventListener('input', () => {
  const searchValue = searchInput.value.toLowerCase();
  if (searchValue === '') {
    searchResults.innerHTML = '';
    return;
  }
  // Wenn die Suche beginnt, schließen Sie das Register und setzen Sie das ausgewählte Kind zurück.
  selectedChild = null;
  childDetailsDiv.hidden = true;

  const results = database.filter(child => {
    const name = child.firstName.toLowerCase() + ' ' + child.lastName.toLowerCase();
    return name.includes(searchValue);
  }).sort((a, b) => a.lastName.localeCompare(b.lastName));
  searchResults.innerHTML = '';
  results.forEach(child => {
    const div = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = `${child.firstName} ${child.lastName}`;
    const birthDate = document.createElement('span');
    birthDate.textContent = child.birthDate;
    div.append(name, birthDate);
    div.addEventListener('click', () => {
      selectedChild = child;
      childNameElement.textContent = `${child.firstName} ${child.lastName}`;
      balanceElement.textContent = `Guthaben: €${child.balance.toFixed(2)}`;
      transactionsTBody.innerHTML = '';
      child.transactions.forEach(transaction => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${getDayOfWeek(transaction.date)}</td><td>${transaction.date}</td><td>€${transaction.amount.toFixed(2)}</td>`;
        transactionsTBody.append(tr);
      });
      childDetailsDiv.hidden = false;
      searchInput.value = '';
      searchResults.innerHTML = '';
    });
    searchResults.append(div);
  });
});

depositBtn.addEventListener('click', (e) => {
  e.preventDefault();
  if (selectedChild) {
    const amount = parseFloat(moneyInput.value.replace(',', '.'));
    if (!isNaN(amount)) {
      selectedChild.balance += amount;
      const date = new Date();
      const dateTimeString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      selectedChild.transactions.push({
        date: dateTimeString,
        amount: amount
      });
      balanceElement.textContent = `Guthaben: €${selectedChild.balance.toFixed(2)}`;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${getDayOfWeek(dateTimeString)}</td><td>${dateTimeString}</td><td>€${amount.toFixed(2)}</td>`;
      transactionsTBody.prepend(tr);
      moneyInput.value = '';
    }
  }
});

withdrawBtn.addEventListener('click', (e) => {
  e.preventDefault();
  if (selectedChild) {
    const amount = -parseFloat(moneyInput.value.replace(',', '.'));
    if (!isNaN(amount) && (selectedChild.balance + amount) >= 0) {
      selectedChild.balance += amount;
      const date = new Date();
      const dateTimeString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      selectedChild.transactions.push({
        date: dateTimeString,
        amount: amount
      });
      balanceElement.textContent = `Guthaben: €${selectedChild.balance.toFixed(2)}`;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${getDayOfWeek(dateTimeString)}</td><td>${dateTimeString}</td><td>€${amount.toFixed(2)}</td>`;
      transactionsTBody.prepend(tr);
      moneyInput.value = '';
    }
  }
});

addChildButton.addEventListener('click', () => {
  console.log("click");
  const firstName = prompt('Vorname des Kindes:');
  const lastName = prompt('Nachname des Kindes:');
  const birthDate = prompt('Geburtsdatum des Kindes (YYYY-MM-DD):');
  database.push({
    firstName,
    lastName,
    birthDate,
    balance: 0,
    transactions: []
  });
  alert(`Kind ${firstName} ${lastName} wurde hinzugefügt.`);
});

deleteAllButton.addEventListener('click', () => {
  const childrenWithBalance = database.filter(child => child.balance > 0);
  if (childrenWithBalance.length > 0) {
    let errorMessage = 'Fehler: Die folgenden Kinder haben noch Guthaben:\n';
    childrenWithBalance.forEach(child => {
      errorMessage += `\n${child.firstName} ${child.lastName}: €${child.balance.toFixed(2)}`;
    });
    alert(errorMessage);
  } else {
    if (confirm('Sind Sie sicher, dass Sie alle Kinder löschen möchten?')) {
      database.length = 0;
      alert('Alle Kinder wurden gelöscht.');
    }
  }
});
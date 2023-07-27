const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const searchResults = document.querySelector('#search-results');
const childDetailsDiv = document.querySelector('#child-details');
const moneyForm = document.querySelector('#money-form');
const moneyInput = document.querySelector('#money-input');
const childNameElement = document.querySelector('#child-name');
const balanceElement = document.querySelector('#balance');
const transactionsTBody = document.querySelector('#transactions tbody');

// Simulierte Datenbank
const database = [
  { firstName: 'Max', lastName: 'Mustermann', birthDate: '2011-01-01', balance: 10.50, transactions: [] },
  { firstName: 'Max', lastName: 'Meier', birthDate: '2010-05-12', balance: 20.75, transactions: [] },
  { firstName: 'Lena', lastName: 'Schmidt', birthDate: '2009-09-20', balance: 15.00, transactions: [] },
  // Weitere Kinder hinzufügen...
];

let selectedChild = null;

searchInput.addEventListener('input', () => {
  const searchValue = searchInput.value.toLowerCase();
  const results = database.filter(child => {
    const name = child.firstName.toLowerCase() + ' ' + child.lastName.toLowerCase();
    return name.includes(searchValue);
  });
  searchResults.innerHTML = '';
  results.forEach(child => {
    const div = document.createElement('div');
    div.textContent = `${child.firstName} ${child.lastName}, geb. am ${child.birthDate}`;
    div.addEventListener('click', () => {
      selectedChild = child;
      childNameElement.textContent = `${child.firstName} ${child.lastName}`;
      balanceElement.textContent = `Guthaben: €${child.balance.toFixed(2)}`;
      transactionsTBody.innerHTML = '';
      child.transactions.forEach(transaction => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${transaction.date}</td><td>€${transaction.amount.toFixed(2)}</td>`;
        transactionsTBody.append(tr);
      });
      childDetailsDiv.hidden = false;
    });
    searchResults.append(div);
  });
});

moneyForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (selectedChild) {
    const amount = parseFloat(moneyInput.value);
    if (!isNaN(amount)) {
      selectedChild.balance += amount;
      const date = new Date();
      selectedChild.transactions.push({
        date: date.toLocaleDateString() + ' ' + date.toLocaleTimeString(),
        amount: amount
      });
      balanceElement.textContent = `Guthaben: €${selectedChild.balance.toFixed(2)}`;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</td><td>€${amount.toFixed(2)}</td>`;
      transactionsTBody.prepend(tr);
      moneyInput.value = '';
    }
  }
});

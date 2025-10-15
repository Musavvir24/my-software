// dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const transactions = document.getElementById("transactions-list");
  const parties = document.getElementById("parties-list");
  const items = document.getElementById("items-list");
  const sales = document.getElementById("sales-list");

  if (transactions) transactions.innerHTML = "<p>No transactions yet.</p>";
  if (parties) parties.innerHTML = "<p>No upcoming parties.</p>";
  if (items) items.innerHTML = "<p>No upcoming items.</p>";
  if (sales) sales.innerHTML = "<p>No sales yet.</p>";
});

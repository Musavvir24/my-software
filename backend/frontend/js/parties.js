// public/js/parties.js
const API_BASE = window.location.hostname.includes('localhost')
  ? 'http://localhost:3000'
  : 'https://my-software.onrender.com';
const userEmail = localStorage.getItem("userEmail"); // MUST be set by login

// DOM
const partyForm = document.getElementById("partyForm");
const partiesList = document.getElementById("partiesList");
const searchInput = document.getElementById("search");

// small helper
const fmtDateVal = (d) => d ? new Date(d).toISOString().slice(0,10) : "";
const fmtDatePretty = (d) => d ? new Date(d).toLocaleDateString() : "-";

if (!userEmail) {
  // quick friendly message in UI
  partiesList.innerHTML = `<div class="card small">No userEmail found in localStorage. Run <code>localStorage.setItem("userEmail","you@example.com")</code> in console and reload.</div>`;
}

// Load parties
async function loadParties() {
  if (!userEmail) return;
  try {
    const res = await fetch(`${API_BASE}/parties?userEmail=${encodeURIComponent(userEmail)}`);
    const parties = await res.json();
    renderParties(parties || []);
  } catch (err) {
    console.error("loadParties error", err);
  }
}

function renderParties(parties) {
  const term = (searchInput?.value || "").toLowerCase();
  partiesList.innerHTML = "";
  parties
    .filter(p => [p.partyName, p.partyNumber, p.partyGST].join(" ").toLowerCase().includes(term))
    .forEach(p => {
      const wrapper = document.createElement("div");
      wrapper.className = "party";

      // header
      const head = document.createElement("div");
      head.className = "party-head";
      head.innerHTML = `
        <div class="chev">▸</div>
        <div>
          <div class="party-title">${escapeHtml(p.partyName)}</div>
          <div class="party-sub">GST: ${escapeHtml(p.partyGST || "-")}</div>
        </div>
        <div class="party-sub"># ${escapeHtml(p.partyNumber || "-")}</div>
        <div class="actions">
          <button class="btn ghost add-bill">Add Bill</button>
          <button class="btn danger del-party">Delete</button>
        </div>
      `;

      // body
      const body = document.createElement("div");
      body.className = "party-body";

      const billsBox = document.createElement("div");
      billsBox.className = "bills";

      // inline add/edit form (hidden by default)
      const inlineForm = document.createElement("div");
      inlineForm.className = "inline-form";
      inlineForm.style.display = "none";
      inlineForm.innerHTML = `
        <input type="text" class="bf-inv" placeholder="Invoice # *" />
        <input type="number" class="bf-amt" placeholder="Amount *" />
        <input type="date" class="bf-bdate" />
        <input type="date" class="bf-due" />
        <button class="btn primary bf-save">Save</button>
      `;

      // render bills list
      function renderBillsList(party) {
        // clear old bill rows
        billsBox.innerHTML = "";
        if (!party.bills || party.bills.length === 0) {
          const e = document.createElement("div");
          e.className = "small";
          e.textContent = "No bills yet.";
          billsBox.appendChild(e);
        } else {
          // each bill row
          party.bills.slice().reverse().forEach(b => {
            const row = document.createElement("div");
            row.className = "bill-row";
            const statusClass = b.status === "paid" ? "status-paid" : "status-unpaid";
            row.innerHTML = `
              <div><strong>₹${Number(b.amount).toFixed(2)}</strong></div>
              <div class="meta">#${escapeHtml(b.invoiceNumber)}</div>
              <div class="meta">${fmtDatePretty(b.billDate)} → ${fmtDatePretty(b.dueDate)}</div>
              <div style="display:flex;gap:8px;align-items:center">
                <span class="badge ${statusClass}">${b.status.toUpperCase()}</span>
                <button class="btn ghost edit-bill">Edit</button>
                <button class="btn danger del-bill">Delete</button>
                <button class="btn ${b.status==='paid' ? 'ghost' : 'primary'} toggle-status">
                  ${b.status === "paid" ? "Mark Unpaid" : "Mark Paid"}
                </button>
              </div>
            `;

            // handlers
            row.querySelector(".edit-bill").onclick = (ev) => {
              ev.stopPropagation();
              inlineForm.style.display = "grid";
              inlineForm.querySelector(".bf-inv").value = b.invoiceNumber;
              inlineForm.querySelector(".bf-amt").value = b.amount;
              inlineForm.querySelector(".bf-bdate").value = fmtDateVal(b.billDate);
              inlineForm.querySelector(".bf-due").value = fmtDateVal(b.dueDate);
              inlineForm.dataset.editing = b._id;
              inlineForm.querySelector(".bf-inv").focus();
            };

            row.querySelector(".del-bill").onclick = async (ev) => {
              ev.stopPropagation();
              if (!confirm("Delete this bill?")) return;
              await fetch(`${API_BASE}/parties/${p._id}/bills/${b._id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userEmail })
              });
              const latest = await refetchParty(p._id);
              renderBillsList(latest);
            };

            row.querySelector(".toggle-status").onclick = async (ev) => {
              ev.stopPropagation();
              const newStatus = b.status === "paid" ? "unpaid" : "paid";
              await fetch(`${API_BASE}/parties/${p._id}/bills/${b._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userEmail, status: newStatus })
              });
              const latest = await refetchParty(p._id);
              renderBillsList(latest);
            };

            billsBox.appendChild(row);
          });
        }
        // append hr and inlineForm
        const hr = document.createElement("div");
        hr.className = "hr";
        billsBox.appendChild(document.createElement("div")); // spacer
        billsBox.appendChild(inlineForm);
      }

      // add bill button shows inline form and sets editing empty
      head.querySelector(".add-bill").onclick = (ev) => {
        ev.stopPropagation();
        wrapper.classList.add("open");
        renderBillsList(p);
        inlineForm.style.display = "grid";
        inlineForm.dataset.editing = "";
        inlineForm.querySelector(".bf-inv").value = "";
        inlineForm.querySelector(".bf-amt").value = "";
        inlineForm.querySelector(".bf-bdate").value = fmtDateVal(new Date());
        inlineForm.querySelector(".bf-due").value = fmtDateVal(new Date());
        inlineForm.querySelector(".bf-inv").focus();
      };

      // delete party
      head.querySelector(".del-party").onclick = async (ev) => {
        ev.stopPropagation();
        if (!confirm("Delete this party and all its bills?")) return;
        await fetch(`${API_BASE}/parties/${p._1? p._1: p._id}?userEmail=${encodeURIComponent(userEmail)}`, { method: "DELETE" })
          .catch(err => console.error(err));
        await loadParties();
      };

      // inline save (create or edit)
      inlineForm.querySelector(".bf-save").onclick = async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const invoiceNumber = inlineForm.querySelector(".bf-inv").value.trim();
        const amount = parseFloat(inlineForm.querySelector(".bf-amt").value);
        const billDate = inlineForm.querySelector(".bf-bdate").value;
        const dueDate = inlineForm.querySelector(".bf-due").value;
        const editingId = inlineForm.dataset.editing;

        if (!invoiceNumber || !amount || !billDate || !dueDate) {
          alert("Fill invoice number, amount, bill date and due date");
          return;
        }

        if (editingId) {
          // update
          await fetch(`${API_BASE}/parties/${p._id}/bills/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userEmail, invoiceNumber, amount, billDate, dueDate })
          });
        } else {
          // create
          await fetch(`${API_BASE}/parties/${p._id}/bills`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userEmail, invoiceNumber, amount, billDate, dueDate })
          });
        }

        inlineForm.dataset.editing = "";
        inlineForm.style.display = "none";
        const latest = await refetchParty(p._id);
        renderBillsList(latest);
      };

      // toggle expand on header click
      head.onclick = (ev) => {
        // don't toggle when clicking buttons inside header
        if (ev.target.closest(".actions")) return;
        const open = wrapper.classList.toggle("open");
        if (open) {
          renderBillsList(p);
        } else {
          // hide
          inlineForm.style.display = "none";
        }
      };

      body.appendChild(billsBox);
      wrapper.appendChild(head);
      wrapper.appendChild(body);
      partiesList.appendChild(wrapper);
    });
}

// refetch single party
async function refetchParty(id) {
  const res = await fetch(`${API_BASE}/parties?userEmail=${encodeURIComponent(userEmail)}`);
  const arr = await res.json();
  return arr.find(x => x._id === id);
}

// add party form submit
partyForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!userEmail) return alert("userEmail missing in localStorage");

  const partyName = document.getElementById("partyName").value.trim();
  const partyNumber = document.getElementById("partyNumber").value.trim();
  const partyGST = document.getElementById("partyGST").value.trim();

  if (!partyName) return alert("Party Name is required");

  try {
    await fetch(`${API_BASE}/parties`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail, partyName, partyNumber, partyGST })
    });
    partyForm.reset();
    await loadParties();
  } catch (err) {
    console.error("add party error", err);
    alert("Error adding party");
  }
});

// search
if (searchInput) searchInput.addEventListener("input", loadParties);

// escape helper to avoid injection into DOM
function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// init
loadParties();

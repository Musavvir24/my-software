/* js/invoice.js
   Full invoice logic matching the provided invoice HTML.
   Endpoints used:
     GET  /api/invoices/new-number
     GET  /api/products/search/:q
     GET  /api/products/code/:code
     GET  /api/profile
     POST /api/profile
     POST /api/invoices
   Notes:
     - Sends purchasePrice (cost price) for each item before saving so profits can be calculated.
     - Uses explicit API_BASE to avoid dev-server port problems.
*/
// Track last visited page
// Debug page reload causes


document.addEventListener("DOMContentLoaded", () => {
  localStorage.setItem("lastPage", window.location.pathname.split("/").pop());
});

(function () {
  'use strict';

  /* ------------------------
     Small helpers
     ------------------------ */
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }
  function fmtCurrency(n) { return `₹ ${Number(n || 0).toFixed(2)}`; }
  function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function debounce(fn, wait = 300) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }
  function showMessage(text, isError = false, timeout = 4000) {
    let el = qs('#invoiceMessage');
    if (!el) {
      el = document.createElement('div');
      el.id = 'invoiceMessage';
      el.style.position = 'fixed';
      el.style.right = '20px';
      el.style.top = '20px';
      el.style.zIndex = '99999';
      el.style.padding = '10px 14px';
      el.style.borderRadius = '8px';
      el.style.boxShadow = '0 6px 20px rgba(10,20,40,0.15)';
      document.body.appendChild(el);
    }
    el.innerText = text;
    el.style.background = isError ? '#ffe7e7' : '#e9fff0';
    el.style.color = isError ? '#9b1e1e' : '#0b6b2f';
    if (timeout > 0) setTimeout(() => { if (el) el.innerText = ''; }, timeout);
  }

  // Get user email from localStorage (adjust if you use a different method)
  const userEmail = localStorage.getItem('userEmail') || '';

  /* ------------------------
     DOM refs (match your HTML)
     ------------------------ */
  const tbodyId = '#invoice-items'; // your HTML uses this id
  const itemsTbody = qs(tbodyId);

  const addItemBtn = qs('#add-item-btn');
  const scanBarcodeBtn = qs('#scan-barcode-btn');
  let scannerActive = false;
  let barcodeBuffer = '';
  let barcodeTimer = null;

 

  const invoiceNumberDisplay = qs('#invoiceNumberDisplay');
  const invoiceDateDisplay = qs('#invoiceDateDisplay');
  const paymentTermsInput = qs('#paymentTerms');
  const dueDateDisplay = qs('#dueDateDisplay');

  const customerNameInput = qs('#customerName');
  const customerPhoneInput = qs('#customerPhone');

  const subtotalEl = qs('#subtotal');
  const totalDiscountEl = qs('#total-discount');
  const totalTaxEl = qs('#total-tax');
  const grandTotalEl = qs('#grand-total');

  const editProfileBtn = qs('#editProfileBtn');
  const profileModal = qs('#profileModal');
  const profileNameInput = qs('#profile_name');
  const profileAddressInput = qs('#profile_address');
  const profilePhoneInput = qs('#profile_phone');
  const profileLogoInput = qs('#profile_logo');
  const saveProfileBtn = qs('#saveProfileBtn');
  const cancelProfileBtn = qs('#cancelProfileBtn');
  const companyLogoImg = qs('#companyLogo');
  const companyLogoWrap = qs('#companyLogoWrap');
  const companyNameEl = qs('#companyName');
  const companyAddressEl = qs('#companyAddress');
  const companyPhoneEl = qs('#companyPhone');

  /* API endpoints (explicit origin to avoid dev server confusion) */
 const API_BASE = window.location.hostname.includes('localhost')
  ? 'http://localhost:3000'
  : 'https://my-software.onrender.com';


const API = {
  newNumber: `${API_BASE}/api/invoices/new-number?email=${encodeURIComponent(userEmail)}`,
  searchProducts: q => `${API_BASE}/api/products/search/${encodeURIComponent(q)}?email=${encodeURIComponent(userEmail)}`,
  productByCode: code => `${API_BASE}/api/products/code/${encodeURIComponent(code)}?email=${encodeURIComponent(userEmail)}`,
  profile: `${API_BASE}/api/profile?email=${encodeURIComponent(userEmail)}`,
  saveInvoice: `${API_BASE}/api/invoices?email=${encodeURIComponent(userEmail)}`
};


  if (!itemsTbody) {
    console.error('invoice.js: missing tbody with id "invoice-items". Please add <tbody id="invoice-items"></tbody> to your table.');
    showMessage('Script error: invoice items tbody not found', true, 8000);
    return;
  }

/* -------------------------
   Row Creation & Binding
   ------------------------- */
function createRow() {
  const tr = document.createElement('tr');
  tr.classList.add('invoice-row');

  tr.innerHTML = `
    <td>
      <div style="position:relative;">
        <input type="text" class="item-name" placeholder="Item name or search..." autocomplete="off" />
      </div>
    </td>
    <td><input type="hidden" class="item-code" /></td> <!-- ✅ hidden code -->
    <td><input type="number" class="item-qty" step="1" min="0" value="1" /></td>
    <td><input type="number" class="item-price" step="0.01" /></td>
    <td><input type="number" class="item-discount" step="0.01" value="0" /></td>
    <td><input type="number" class="item-cgst" step="0.01" value="0" /></td>
    <td><input type="number" class="item-sgst" step="0.01" value="0" /></td>
    <td><input type="number" class="item-amount" step="0.01" /></td> <!-- ✅ editable -->
    <td><button type="button" class="row-remove">Remove</button></td>
  `;

  tr.dataset.productCode = '';
  tr.dataset.costPrice = '0';

  bindRowEvents(tr);
  return tr;
}

/* -------------------------
   Bind Events to Row
   ------------------------- */
function bindRowEvents(row) {
  const nameInput = row.querySelector('.item-name');
  const codeInput = row.querySelector('.item-code');
  const qtyInput = row.querySelector('.item-qty');
  const priceInput = row.querySelector('.item-price');
  const discountInput = row.querySelector('.item-discount');
  const cgstInput = row.querySelector('.item-cgst');
  const sgstInput = row.querySelector('.item-sgst');
  const amountInput = row.querySelector('.item-amount');
  const removeBtn = row.querySelector('.row-remove');

  let suggestionBox = null;

  function removeSuggestions() {
    if (suggestionBox && suggestionBox.parentNode) suggestionBox.parentNode.removeChild(suggestionBox);
    suggestionBox = null;
  }

  // -------------------------
  // Autocomplete
  // -------------------------
  const doSearch = debounce(async () => {
    const q = (nameInput.value || '').trim();
    removeSuggestions();
    if (!q) return;

    try {
      const res = await fetch(API.searchProducts(q));
      if (!res.ok) return;
      const list = await res.json();
      if (!list || !list.length) return;

      suggestionBox = document.createElement('ul');
      suggestionBox.className = 'suggestions';
      suggestionBox.style.cssText = `
        list-style:none; margin:0; padding:6px; border:1px solid #ddd;
        background:#fff; max-height:220px; overflow-y:auto; box-shadow:0 6px 16px rgba(0,0,0,0.08);
      `;

      list.forEach(prod => {
        const li = document.createElement('li');
        li.style.cssText = 'padding:6px 8px; cursor:pointer;';
        li.innerText = `${prod.name || ''} — ${prod.code || ''} — ₹${prod.price?.toFixed(2) || ''}`;

        li.addEventListener('click', () => {
          nameInput.value = prod.name || '';
          codeInput.value = prod.code || '';
          row.dataset.productCode = prod.code || '';
          priceInput.value = prod.price ?? 0;
          row.dataset.costprice = prod.costPrice ?? 0;

          if (prod.cgst !== undefined) cgstInput.value = prod.cgst;
          if (prod.sgst !== undefined) sgstInput.value = prod.sgst;
          if (prod.discount !== undefined) discountInput.value = prod.discount;

          updateRowAmount(row);
          removeSuggestions();
        });

        suggestionBox.appendChild(li);
      });

      const rect = nameInput.getBoundingClientRect();
      suggestionBox.style.position = 'absolute';
      suggestionBox.style.left = rect.left + 'px';
      suggestionBox.style.top = (rect.bottom + window.scrollY + 2) + 'px';
      suggestionBox.style.width = rect.width + 'px';
      document.body.appendChild(suggestionBox);
    } catch (err) {
      console.error(err);
    }
  }, 250);

  nameInput.addEventListener('input', doSearch);

  document.addEventListener('click', ev => {
    if (!suggestionBox) return;
    if (ev.target === nameInput || (suggestionBox && suggestionBox.contains(ev.target))) return;
    removeSuggestions();
  });

  // -------------------------
  // Update row amount
  // -------------------------
  [qtyInput, priceInput, discountInput, cgstInput, sgstInput].forEach(inp => {
    inp.addEventListener('input', () => {
      row.dataset.manualAmount = 'false';
      updateRowAmount(row);
    });
  });

  // Handle manual amount input (back-calc discount)
  amountInput.addEventListener('input', () => {
    row.dataset.manualAmount = 'true';
    updateRowDiscountFromAmount(row);
  });

  // -------------------------
  // Remove row
  // -------------------------
  removeBtn.addEventListener('click', () => {
    if (row.parentNode) row.parentNode.removeChild(row);
    updateTotals();
  });
}

/* -------------------------
   Update row amount
   ------------------------- */
function updateRowAmount(row) {
  const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
  const mrp = parseFloat(row.querySelector('.item-price')?.value) || 0;
  const discountPct = parseFloat(row.querySelector('.item-discount')?.value) || 0;
  const cgstPct = parseFloat(row.querySelector('.item-cgst')?.value) || 0;
  const sgstPct = parseFloat(row.querySelector('.item-sgst')?.value) || 0;
  const totalGstPct = cgstPct + sgstPct;

  let finalAmount;

  if (row.dataset.manualAmount === 'true') {
    finalAmount = parseFloat(row.querySelector('.item-amount')?.value) || 0;
  } else {
    const gross = mrp * qty;
    const discountAmount = (gross * discountPct) / 100;
    const afterDiscount = gross - discountAmount;

    const gstAmount = (afterDiscount * totalGstPct) / (100 + totalGstPct);
    const basePrice = afterDiscount - gstAmount;

    row.dataset.basePrice = basePrice;
    row.dataset.gstAmount = gstAmount;
    row.dataset.cgstAmount = (gstAmount / 2).toFixed(2);
    row.dataset.sgstAmount = (gstAmount / 2).toFixed(2);

    finalAmount = afterDiscount;
  }

  const amountInput = row.querySelector('.item-amount');
  if (amountInput) amountInput.value = Number(finalAmount.toFixed(2));

  updateTotals();
}

/* -------------------------
   Update row discount from manual amount
   ------------------------- */
function updateRowDiscountFromAmount(row) {
  const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
  const price = parseFloat(row.querySelector('.item-price')?.value) || 0;
  const cgstPct = parseFloat(row.querySelector('.item-cgst')?.value) || 0;
  const sgstPct = parseFloat(row.querySelector('.item-sgst')?.value) || 0;
  const enteredAmount = parseFloat(row.querySelector('.item-amount')?.value) || 0;

  const base = price * qty;
  if (base <= 0) return;

  const taxPct = (cgstPct + sgstPct) / 100;
  const amountWithoutTax = enteredAmount / (1 + taxPct);

  const discountPct = ((base - amountWithoutTax) / base) * 100;
  const discountInput = row.querySelector('.item-discount');
  discountInput.value = Math.max(0, discountPct).toFixed(2);

  updateTotals();
}

/* -------------------------
   Update totals and profit
   ------------------------- */
function updateTotals() {
  const rows = document.querySelectorAll('.invoice-row');
  let subtotal = 0, totalDiscount = 0, totalCGST = 0, totalSGST = 0, grandTotal = 0, totalProfit = 0;

  rows.forEach(row => {
    const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
    const mrp = parseFloat(row.querySelector('.item-price')?.value) || 0;
    const discount = parseFloat(row.querySelector('.item-discount')?.value) || 0;
    const cgstPct = parseFloat(row.querySelector('.item-cgst')?.value) || 0;
    const sgstPct = parseFloat(row.querySelector('.item-sgst')?.value) || 0;
    const totalGstPct = cgstPct + sgstPct;
    const costPrice = parseFloat(row.dataset.costprice || 0);

    const gross = mrp * qty;
    const discountAmt = (gross * discount) / 100;
    const afterDiscount = gross - discountAmt;

    const gstAmt = (afterDiscount * totalGstPct) / (100 + totalGstPct);
    const cgstAmt = gstAmt / 2;
    const sgstAmt = gstAmt / 2;

    subtotal += gross;
    totalDiscount += discountAmt;
    totalCGST += cgstAmt;
    totalSGST += sgstAmt;
    grandTotal += afterDiscount;

    const sellingPriceExclGST = afterDiscount / (1 + totalGstPct / 100);
    totalProfit += (sellingPriceExclGST - costPrice) * qty;
  });

  document.getElementById("subtotal").textContent = `₹ ${subtotal.toFixed(2)}`;
  document.getElementById("total-discount").textContent = `₹ ${totalDiscount.toFixed(2)}`;
  document.getElementById("total-tax").textContent = `₹ ${(totalCGST + totalSGST).toFixed(2)}`;
  document.getElementById("grand-total").textContent = `₹ ${grandTotal.toFixed(2)}`;
}

/* -------------------------
   Add row & focus
   ------------------------- */
function addRowAndFocus() {
  const row = createRow();
  itemsTbody.appendChild(row);
  row.querySelector('.item-name')?.focus();
  updateTotals();
  return row;
}

/* -------------------------
   Barcode scanner integration
   ------------------------- */
if (scanBarcodeBtn) {
  scanBarcodeBtn.addEventListener("click", () => {
    scannerActive = !scannerActive;
    barcodeBuffer = "";
    scanBarcodeBtn.textContent = scannerActive ? "Scanning..." : "Scan Barcode";
    scanBarcodeBtn.classList.toggle("active", scannerActive);
  });
}

document.addEventListener("keydown", async (e) => {
  if (!scannerActive) return;
  if (barcodeTimer) clearTimeout(barcodeTimer);

  if (e.key === "Enter") {
    const scannedCode = barcodeBuffer.trim();
    barcodeBuffer = "";
    if (!scannedCode) return;

    const row = itemsTbody.lastElementChild || addRowAndFocus();
    const codeInput = row.querySelector(".item-code");
    if (codeInput) codeInput.value = scannedCode;

    try {
      const res = await fetch(`/api/products/code/${encodeURIComponent(scannedCode)}`);
      if (!res.ok) throw new Error("Invalid product code");
      const prod = await res.json();

      if (prod) {
        row.querySelector(".item-name").value = prod.name || "";
        row.querySelector(".item-price").value = prod.price || 0;
        row.querySelector(".item-cgst").value = prod.cgst || 0;
        row.querySelector(".item-sgst").value = prod.sgst || 0;

        row.dataset.costprice = prod.costPrice ?? 0;
        row.dataset.productCode = prod.code ?? '';

        updateRowAmount(row);
      }
    } catch (err) {
      console.error("Barcode fetch failed:", err);
      alert("Product not found for scanned code!");
    }
  } else {
    barcodeBuffer += e.key;
    barcodeTimer = setTimeout(() => (barcodeBuffer = ""), 100);
  }
});





  /* ------------------------
     Invoice number / date / due date
     ------------------------ */
 async function loadInvoiceNumberAndDate() {
  try {
    const userEmail = localStorage.getItem("userEmail");
    if (!userEmail) throw new Error("No user email found in localStorage");

    // Correct fetch URL with only one query param
    const res = await fetch(`/api/invoices/new-number?userEmail=${encodeURIComponent(userEmail)}`);
    const data = await res.json();

    if (res.ok && data && data.invoiceNumber) {
      if (invoiceNumberDisplay) invoiceNumberDisplay.innerText = data.invoiceNumber;
      if (document.querySelector("#invoice-number"))
        document.querySelector("#invoice-number").value = data.invoiceNumber;
    } else {
      console.error("Error fetching invoice number:", data);
    }

    if (data && data.invoiceDate && invoiceDateDisplay) {
      invoiceDateDisplay.innerText = new Date(data.invoiceDate).toLocaleDateString();
      if (document.querySelector("#invoice-date"))
        document.querySelector("#invoice-date").value = data.invoiceDate;
    }

  } catch (err) {
    console.error("Failed to load invoice number and date:", err);
  }

  // Fallback to today's date if API fails
  if (invoiceDateDisplay && !invoiceDateDisplay.innerText) {
    const today = new Date();
    invoiceDateDisplay.innerText = today.toLocaleDateString();
    if (document.querySelector("#invoice-date"))
      document.querySelector("#invoice-date").value = today.toISOString().split("T")[0];
  }

  updateDueDate();
}

function updateDueDate() {
  const days = Number(paymentTermsInput ? paymentTermsInput.value : 0);
  const base = new Date();
  const due = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  if (dueDateDisplay) dueDateDisplay.innerText = due.toLocaleDateString();
  if (document.querySelector("#due-date")) document.querySelector("#due-date").value = due.toISOString().split("T")[0];
}

// Call on DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
  await loadProfile();
  await loadInvoiceNumberAndDate();
});


  /* ------------------------
     Profile load/save
     ------------------------ */
  async function loadProfile() {
  try {
    const userEmail = localStorage.getItem("userEmail");
    if (!userEmail) return;

    const res = await fetch(`/api/profile?userEmail=${encodeURIComponent(userEmail)}`);
    if (!res.ok) throw new Error("Failed to load profile");

    const profile = await res.json();
    if (!profile) return;

    // Populate modal inputs
    const profileNameInput = document.querySelector("#profile_name");
    const profileAddressInput = document.querySelector("#profile_address");
    const profilePhoneInput = document.querySelector("#profile_phone");
    const profileLogoPreview = document.querySelector("#profile_logoPreview");

    if (profileNameInput) profileNameInput.value = profile.companyName || "";
    if (profileAddressInput) profileAddressInput.value = profile.companyAddress || "";
    if (profilePhoneInput) profilePhoneInput.value = profile.companyPhone || "";
    if (profileLogoPreview && profile.companyLogo) {
      profileLogoPreview.src = profile.companyLogo;
      profileLogoPreview.style.display = "block";
    }

    // Populate invoice header
    const companyNameEl = document.querySelector("#companyName");
    const companyAddressEl = document.querySelector("#companyAddress");
    const companyPhoneEl = document.querySelector("#companyPhone");
    const companyLogoImg = document.querySelector("#companyLogo");

    if (companyNameEl) companyNameEl.textContent = profile.companyName || "Your Business Name";
    if (companyAddressEl) companyAddressEl.innerHTML = profile.companyAddress || "Address line 1<br/>City, Country";
    if (companyPhoneEl) companyPhoneEl.textContent = "Phone: " + (profile.companyPhone || "000-000-000");
    if (companyLogoImg && profile.companyLogo) {
      companyLogoImg.src = profile.companyLogo;
      companyLogoImg.style.display = "block";
    } else if (companyLogoImg) {
      companyLogoImg.style.display = "none";
    }
  } catch (err) {
    console.error("Load profile error:", err);
  }
}

// Call on page load
document.addEventListener("DOMContentLoaded", loadProfile);


 async function saveProfile() {
  try {
    const userEmail = localStorage.getItem("userEmail");
    if (!userEmail) {
      alert("No user email found!");
      return;
    }

    const companyName = document.querySelector("#profile_name")?.value || "";
    const companyAddress = document.querySelector("#profile_address")?.value || "";
    const companyPhone = document.querySelector("#profile_phone")?.value || "";

    // ✅ Grab the current previewed logo
    const companyLogo = document.querySelector("#profile_logoPreview")?.src || "";

    const payload = { userEmail, companyName, companyAddress, companyPhone, companyLogo };

    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Failed to save profile");
    alert("Profile saved!");

    // ✅ Update invoice page header immediately
    if (companyName) document.querySelector("#companyName").textContent = companyName;
    if (companyAddress) document.querySelector("#companyAddress").textContent = companyAddress;
    if (companyPhone) document.querySelector("#companyPhone").textContent = companyPhone;

    const companyLogoImg = document.querySelector("#companyLogo");
    if (companyLogoImg && companyLogo) {
      companyLogoImg.src = companyLogo;
      companyLogoImg.style.display = "block";
    }

    // ✅ Also keep modal preview intact
    const logoPreview = document.querySelector("#profile_logoPreview");
    if (logoPreview && companyLogo) {
      logoPreview.src = companyLogo;
      logoPreview.style.display = "block";
    }

    // Close modal after save
    document.querySelector("#profileModal").style.display = "none";

  } catch (err) {
    console.error("Save profile error:", err);
    alert("Error saving profile");
  }
}



  /* ------------------------
     Prepare purchasePrice for each item (ensures cost is present)
     ------------------------ */
  async function ensurePurchasePrices(items) {
    // items: [{ name, code, quantity, price, discountPct, cgstPct, sgstPct, amount }]
    // returns items with purchasePrice property
    const out = [];
    for (const it of items) {
      const item = Object.assign({}, it);
      // normalize fields
      item.quantity = item.quantity || item.qty || 0;
      item.price = item.price || 0;
      // if purchasePrice already present (perhaps from selection), use it
      if (item.purchasePrice !== undefined && item.purchasePrice !== null) {
        out.push(item);
        continue;
      }
      // try dataset purchasePrice (if row stored it)
      // fallback to fetching product by code
      let purchasePrice = 0;
      try {
        if (item.code) {
          const res = await fetch(API.productByCode(item.code));
          if (res.ok) {
            const prod = await res.json();
            if (prod) {
              purchasePrice = prod.costPrice !== undefined ? prod.costPrice : (prod.purchasePrice !== undefined ? prod.purchasePrice : 0);
            }
          }
        }
      } catch (e) {
        // ignore network error, keep purchasePrice = 0
      }
      item.purchasePrice = purchasePrice;
      out.push(item);
    }
    return out;
  }

  // === Profile & Logo DOM elements ===
const logoFileInput   = document.getElementById("profile_logoFile");
const logoPreview     = document.getElementById("profile_logoPreview");



// === Add logo upload/preview handler ===
if (logoFileInput) {
  logoFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        logoPreview.src = ev.target.result;
        logoPreview.style.display = "block";

        if (companyLogoImg) {
          companyLogoImg.src = ev.target.result;
          companyLogoImg.style.display = "block";
        }
      };
      reader.readAsDataURL(file);
    }
  });
}
 // ===== invoice.js =====

// Attach save button event
const saveInvoiceBtn = document.getElementById("save-invoice-btn");
if (saveInvoiceBtn) {
  saveInvoiceBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    await saveInvoice();
  });
}

function collectItems() {
  const rows = document.querySelectorAll("#invoice-items tr");
  let items = [];

  rows.forEach((row, idx) => {
    const name = row.querySelector(".item-name")?.value || "";
    const code = row.querySelector(".item-code")?.value || null;
    const mrp = parseFloat(row.querySelector(".item-price")?.value) || 0;
    const qty = parseFloat(row.querySelector(".item-qty")?.value) || 0;
    const discount = parseFloat(row.querySelector(".item-discount")?.value) || 0;
    const cgst = parseFloat(row.querySelector(".item-cgst")?.value) || 0;
    const sgst = parseFloat(row.querySelector(".item-sgst")?.value) || 0;
    const totalGstPct = cgst + sgst;

    const costPrice = parseFloat(row.dataset.costprice || 0);

    const gross = mrp * qty;
    const discountAmt = (gross * discount) / 100;
    const afterDiscount = gross - discountAmt;

    const gstAmount = (afterDiscount * totalGstPct) / (100 + totalGstPct);
    const baseValue = afterDiscount - gstAmount;
    const cgstAmount = gstAmount / 2;
    const sgstAmount = gstAmount / 2;

    const total = afterDiscount;

    const sellingPriceExclGST = afterDiscount / (1 + totalGstPct / 100);
    

    items.push({
      sno: idx + 1,
      name,
      code,
      qty,
      price: mrp,
      costPrice,
      discount,
      cgst,
      sgst,
      baseValue: baseValue.toFixed(2),
      cgstAmount: cgstAmount.toFixed(2),
      sgstAmount: sgstAmount.toFixed(2),
      amount: total.toFixed(2),
     
    });
  });

  return items;
}




function updateSummary() {
  const rows = document.querySelectorAll("#invoice-items tr");
  let subtotal = 0, totalDiscount = 0, totalTax = 0, grandTotal = 0;

  rows.forEach((row) => {
    const qty = parseFloat(row.querySelector(".item-qty")?.value) || 0;
    const price = parseFloat(row.querySelector(".item-price")?.value) || 0;
    const code = row.querySelector(".item-code")?.value || null;
    const discount = parseFloat(row.querySelector(".item-discount")?.value) || 0;
    const cgst = parseFloat(row.querySelector(".item-cgst")?.value) || 0;
    const sgst = parseFloat(row.querySelector(".item-sgst")?.value) || 0;

    const base = qty * price;
    const discAmt = (base * discount) / 100;
    const taxable = base - discAmt;
    const taxAmt = (taxable * (cgst + sgst)) / 100;
    const total = taxable + taxAmt;

    subtotal += base;
    totalDiscount += discAmt;
    totalTax += taxAmt;
    grandTotal += total;
  });

  document.getElementById("subtotal").textContent = `₹ ${subtotal.toFixed(2)}`;
  document.getElementById("total-discount").textContent = `₹ ${totalDiscount.toFixed(2)}`;
  document.getElementById("total-tax").textContent = `₹ ${totalTax.toFixed(2)}`;
  document.getElementById("grand-total").textContent = `₹ ${grandTotal.toFixed(2)}`;

  return { subtotal, totalDiscount, totalTax, grandTotal };
}

async function saveInvoice() {
  try {
    saveInvoiceBtn.disabled = true;

    const userEmail = localStorage.getItem("userEmail");
    if (!userEmail) { alert("No user email found!"); return; }
const invoiceNumber = document.querySelector("#invoiceNumberDisplay")?.textContent?.trim();
const invoiceDate = document.querySelector("#invoiceDateDisplay")?.textContent?.trim() || new Date().toISOString().split("T")[0];

    const dueDate = document.querySelector("#due-date")?.value || null;
    const paymentTerms = document.querySelector("#payment-terms")?.value || null;

    const customerName = document.querySelector("#customerName")?.value || "Unknown";
    const customerPhone = document.querySelector("#customerPhone")?.value || "";
    const companyName   = document.querySelector("#companyName")?.textContent.trim() || "";
const companyAddress = document.querySelector("#companyAddress")?.textContent.trim() || "";
const companyPhone  = document.querySelector("#companyPhone")?.textContent.trim() || "";
const companyLogoImg = document.querySelector("#companyLogo");
const companyLogo = companyLogoImg?.src || "";





    const items = collectItems();
    const { subtotal, totalDiscount, totalTax, grandTotal } = updateSummary();

    const payload = { invoiceNumber, invoiceDate, dueDate, paymentTerms, customerName, customerPhone, companyName, 
  companyAddress, 
  companyPhone, 
  companyLogo, items, subtotal, totalDiscount, totalTax, totalAmount: grandTotal };

    const res = await fetch("http://localhost:3000/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-email": String(userEmail) },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
    alert("Invoice saved successfully");
    const pdfUrl = data.pdfUrl;
 // 🔹 Update dashboard metrics and product list
    if (typeof loadDashboardData === "function") loadDashboardData();
    if (typeof loadProductList === "function") loadProductList();
    // Only create WhatsApp link if customerPhone exists
    if (customerPhone && customerPhone.trim() !== "") {
        const whatsappUrl = `https://wa.me/91${customerPhone}?text=${encodeURIComponent(
            `Hello ${customerName}, your invoice (#${invoiceNumber}) is ready. Total: ₹${grandTotal.toFixed(2)}. Download PDF: ${pdfUrl}`
        )}`;

        let shareBtn = document.querySelector("#whatsapp-share-btn");
        if (!shareBtn) {
            shareBtn = document.createElement("a");
            shareBtn.id = "whatsapp-share-btn";
            shareBtn.innerText = "Share to WhatsApp";
            shareBtn.href = whatsappUrl;
            shareBtn.target = "_blank";
            document.querySelector("#invoice-actions")?.appendChild(shareBtn);
        } else {
            shareBtn.href = whatsappUrl;
        }
    }
}

  } catch (err) {
    alert("Network error saving invoice");
    console.error(err);
  } finally { saveInvoiceBtn.disabled = false; }
}


// Run when invoice page loads
document.addEventListener("DOMContentLoaded", async () => {
  await loadProfile();

  const userEmail = localStorage.getItem("userEmail");
  if (userEmail) {
    try {
      const res = await fetch(`http://localhost:3000/api/invoices/new-number?userEmail=${encodeURIComponent(userEmail)}`);
      const data = await res.json();

      const invoiceNumberDisplay = document.querySelector("#invoiceNumberDisplay");
      const invoiceDateDisplay = document.querySelector("#invoiceDateDisplay");

      if (res.ok && data.invoiceNumber) {
        if (invoiceNumberDisplay) invoiceNumberDisplay.textContent = data.invoiceNumber;
        if (invoiceDateDisplay) invoiceDateDisplay.textContent = data.invoiceDate;
      } else {
        console.error("Error fetching invoice number:", data);
      }
    } catch (err) {
      console.error("Failed to fetch new invoice number", err);
    }
  }

  updateDueDate(); // make sure due date is calculated
});






  /* ------------------------
     Event bindings
     ------------------------ */
  if (addItemBtn) {
    addItemBtn.addEventListener('click', () => {
      addRowAndFocus();
    });
  }

  

  if (paymentTermsInput) {
    paymentTermsInput.addEventListener('input', () => {
      updateDueDate();
    });
  }

  if (editProfileBtn && profileModal) {
    editProfileBtn.addEventListener('click', () => {
      profileModal.style.display = 'block';
      loadProfile();
    });
  }
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', saveProfile);
  }
  if (cancelProfileBtn) {
    cancelProfileBtn.addEventListener('click', () => {
      profileModal.style.display = 'none';
    });
  }

  /* ------------------------
     Initialize
     ------------------------ */
  (async function init() {
    await loadInvoiceNumberAndDate();
    addRowAndFocus();
})();


})();


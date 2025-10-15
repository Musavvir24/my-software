const express = require('express');
const router = express.Router();
const Invoice = require('../models/invoice');
const Product = require('../models/Product');

// Save a new sales invoice
router.post('/', async (req, res) => {
  try {
    const invoice = new Invoice(req.body);
    await invoice.save();

    // Update stock and sold count
    for (const item of invoice.items) {
      const product = await Product.findOne({ code: item.code });

      if (product) {
        product.quantity = Math.max(0, product.quantity - item.qty); // fixed here
        product.sold += item.qty; // fixed here
        await product.save();
      }
    }

    res.status(201).json({ message: 'Invoice saved successfully' });
  } catch (err) {
    console.error('Error saving invoice:', err.message);
    res.status(500).json({ error: 'Failed to save invoice' });
  }
});
router.post('/', async (req, res) => {
  try {
    const { customerName, customerPhone } = req.body;

    if (!customerName || !customerPhone) {
      return res.status(400).json({ error: 'Customer name and phone are required' });
    }

    const invoice = new Invoice(req.body);
    await invoice.save();

    // Update stock
    for (const item of invoice.items) {
      const product = await Product.findOne({ code: item.code });
      if (product) {
        product.quantity = Math.max(0, product.quantity - item.qty);
        product.sold += item.qty;
        await product.save();
      }
    }

    res.status(201).json({ message: 'Invoice saved successfully' });
  } catch (err) {
    console.error('Error saving invoice:', err.message);
    res.status(500).json({ error: 'Failed to save invoice' });
  }
});
// inside routes/invoice.js (or server.js where invoices routes are defined)
const Invoice = require('../models/invoice'); // ensure correct casing and path

// helper to create candidate numbers (same format as frontend)
function makeCandidateInvoiceNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0,10).replace(/-/g,'');
  const rand = Math.floor(1000 + Math.random()*9000);
  return `INV-${datePart}-${rand}`;
}

async function generateUniqueInvoiceNumber(attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    const cand = makeCandidateInvoiceNumber();
    const exists = await Invoice.exists({ invoiceNumber: cand });
    if (!exists) return cand;
  }
  // fallback
  return `INV-${Date.now()}-${Math.floor(Math.random()*10000)}`;
}

// route
router.get('/new-number', async (req, res) => {
  try {
    const num = await generateUniqueInvoiceNumber();
    res.json({ invoiceNumber: num });
  } catch (err) {
    console.error('GET /api/invoices/new-number error', err);
    res.status(500).json({ error: 'Failed to generate invoice number' });
  }
});


module.exports = router;

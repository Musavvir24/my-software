// models/invoice.js
const mongoose = require('mongoose');

const InvoiceItemSchema = new mongoose.Schema({
  code: String,
  item: String,
  hsn: String,
  qty: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  amount: { type: Number, default: 0 }
}, { _id: false });

const InvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, index: true, required: true },
  invoiceDate: { type: Date, default: Date.now },
  dueDate: Date,
  paymentTerms: { type: Number, default: 0 },
  party: String,
  customerName: String,
  customerPhone: String,
  company: Object,
  items: [InvoiceItemSchema],
  subtotal: { type: Number, default: 0 },
  totalTax: { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = InvoiceSchema;

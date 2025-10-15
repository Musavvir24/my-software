// models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true, required: true },
  hsn: { type: String },
  price: { type: Number, required: true },
  costPrice: { type: Number },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  quantity: { type: Number, default: 0 },
  sold: { type: Number, default: 0 },
  supplier: { type: String },
  image: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = productSchema;

const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const multer = require('multer');

// Setup Multer for image uploads
const upload = multer({ dest: 'uploads/' });

// =============================
// POST /api/products - Create product with optional image
// =============================
router.post('/', upload.single('image'), async (req, res) => {
  const { name, code, price, costPrice, quantity, supplier } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const product = new Product({
      name,
      code,
      price,
      costPrice,
      quantity,
      sold: 0, // Default to 0 sold
      supplier,
      image
    });

    const saved = await product.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================
// GET /api/products - Get all products (latest first)
// =============================
router.get('/', async (req, res) => {
  try {
    console.log("➡️ GET /api/products called");
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    console.error('❌ Error fetching products:', err);
    res.status(500).json({ error: 'Server error fetching products' });
  }
});

// =============================
// GET /api/products/code/:codeOrName
// Supports lookup by either code or name (case-insensitive)
// =============================
router.get('/code/:codeOrName', async (req, res) => {
  try {
    const key = req.params.codeOrName.trim();

    const product = await Product.findOne({
      $or: [
        { code: new RegExp(`^${key}$`, 'i') }, // exact match (case-insensitive)
        { name: new RegExp(`^${key}$`, 'i') }
      ]
    });

    if (!product) return res.status(404).json({ error: 'Product not found' });

    res.json(product);
  } catch (err) {
    console.error("❌ Error fetching product:", err.message);
    res.status(500).json({ error: 'Server error' });
  }
});
// GET /api/products/search/:query - Partial match by code or name
// ✅ 1. Search route first
router.get('/search/:query', async (req, res) => {
  const query = req.params.query.trim();
  try {
    const results = await Product.find({
      $or: [
        { code: new RegExp(query, 'i') },
        { name: new RegExp(query, 'i') }
      ]
    }).limit(10);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// ✅ 2. Code lookup route AFTER search
router.get('/code/:codeOrName', async (req, res) => {
  try {
    const key = req.params.codeOrName.trim();

    const product = await Product.findOne({
      $or: [
        { code: new RegExp(`^${key}$`, 'i') },
        { name: new RegExp(`^${key}$`, 'i') }
      ]
    });

    if (!product) return res.status(404).json({ error: 'Product not found' });

    res.json(product);
  } catch (err) {
    console.error("❌ Error fetching product:", err.message);
    res.status(500).json({ error: 'Server error' });
  }
});


module.exports = router;

const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Invoice = require('../models/invoice');


router.get('/dashboard-metrics', async (req, res) => {
  try {
    const products = await Product.find();

    let sales = 0, revenue = 0, profit = 0, inventoryCount = 0;
    const lowStock = [];
    const topSelling = [];

    products.forEach(p => {
      const sold = p.sold || 0;
      const price = p.price || 0;
      const costPrice = p.costPrice || 0;
      const quantity = p.quantity || 0;

      const totalSell = sold * price;
      const cost = sold * costPrice;

      sales += totalSell;
      revenue += totalSell;
      profit += (totalSell - cost);
      inventoryCount += quantity;

      if (quantity <= 3) lowStock.push(p);
      if (sold > 0) topSelling.push(p);
    });

    topSelling.sort((a, b) => b.sold - a.sold);

    res.json({
      sales,
      revenue,
      profit,
      inventoryCount,
      lowStock,
      topSelling: topSelling.slice(0, 3)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/summary', async (req, res) => {
  try {
    const invoices = await Invoice.find();

    let totalSales = invoices.length;
    let totalRevenue = 0;
    let totalItemsSold = 0;

    invoices.forEach(inv => {
      totalRevenue += inv.grandTotal || 0;

      inv.items.forEach(item => {
        totalItemsSold += item.quantity || 0;
      });
    });

    res.json({
      totalSales,
      totalRevenue,
      totalItemsSold
    });

  } catch (err) {
    console.error('Error fetching summary:', err.message);
    res.status(500).json({ error: 'Summary fetch failed' });
  }
});

module.exports = router;

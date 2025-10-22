const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require("fs");
const fsp = require("fs").promises;
const puppeteer = require('puppeteer');
const bcrypt = require('bcrypt');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    'https://my-software-707y.onrender.com',
    'https://my-software.onrender.com',  // add this!
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));


// Allow larger JSON + form-data payloads
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/invoices', express.static(path.join(__dirname, 'invoices')));

// Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

// ===== MongoDB Connection =====
const MONGO_URI = 'mongodb+srv://webnetic78:raUCTMSxqOucXz1X@cluster0.jxzsmsb.mongodb.net/myPrivateDB?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ===== Multi-tenant DB Helper =====
// ====== Tenant DB Helper ======
// ====== getUserEmail Helper ======
function getUserEmail(req) {
  // Try query parameter first
  if (req.query.userEmail) return req.query.userEmail;

  // Then try custom header
  if (req.headers["x-user-email"]) return req.headers["x-user-email"];

  // Then try body (for POST requests)
  if (req.body && req.body.userEmail) return req.body.userEmail;

  return null; // fallback if no email provided
}
 

function getTenantDB(email) {
  if (!email) throw new Error("Email is required for tenant DB");
  const cleanEmail = String(email).trim();
  const dbName = cleanEmail.replace(/[@.]/g, "_");
  console.log(`🗄️ Using DB: ${dbName}`);
  return mongoose.connection.useDb(dbName, { useCache: true });
}

// ====== getModel Helper ======
function getModel(email, name, schema) {
  if (!email) throw new Error("Email is required for tenant DB");
  const db = getTenantDB(email); // ✅ must call after getTenantDB is defined
  if (db.models[name]) return db.models[name];
  if (!schema) throw new Error(`Unknown model name: ${name}`);
  return db.model(name, schema);
}

// ===== Schemas =====
const purchaseSchema = new mongoose.Schema({
  userEmail: String,
  supplier: String,
  items: [
    {
      name: String,
      code: String,
      qty: Number,
      price: Number,
      discount: Number,
      cgst: Number,
      sgst: Number,
      amount: Number
    }
  ],
  subtotal: Number,
  totalDiscount: Number,
  totalTax: Number,
  totalAmount: Number,
  purchaseDate: { type: Date, default: Date.now } // ✅ Date type
});


const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  price: { type: Number, required: true },
  costPrice: { type: Number, default: 0 },
  quantity: { type: Number, default: 0 },
  sold: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  supplier: String,
  imageUrl: String,
  createdAt: { type: Date, default: Date.now }
});

const profileSchema = new mongoose.Schema({
  userEmail: { type: String, required: true }, // to link with account
  companyName: String,
  companyAddress: String,
  companyPhone: String,
  companyLogo: String,
});


// ===== Updated Invoice Schema =====
const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true },
  invoiceDate: { type: Date, required: true, default: Date.now }, // ✅ Date type
  dueDate: Date,
  paymentTerms: String,

  customerName: { type: String, required: true },
  customerPhone: String,

  companyName: String,
  companyAddress: String,
  companyPhone: String,
  companyLogo: String,

items: [
  {
    sno: Number,
    name: String,
    code: String,
    qty: Number,
    price: Number,
    costPrice: { type: Number, default: 0 }, // <-- Add this
    discount: Number,
    cgst: Number,
    sgst: Number,
    amount: Number,
    profit: { type: Number, default: 0 }
    
  },
  
],


  subtotal: { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  totalTax: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  totalProfit: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  
});

const billSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true },
  amount: { type: Number, required: true },
  billDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ["unpaid", "paid"], default: "unpaid" },
}, { timestamps: true });

const partySchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  partyName: { type: String, required: true },
  partyNumber: { type: String },
  partyGST: { type: String },
  bills: [billSchema],
}, { timestamps: true });

// helper to get model safely
function getPartyModel(db) {
  try {
    return db.model("Party");
  } catch {
    return db.model("Party", partySchema);
  }
}
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
});

const User = mongoose.model('User', userSchema);





// ===== API Routes =====
// ===== Signup Route =====
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required' });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = new User({ name, email, passwordHash });
    await newUser.save();

    res.json({ message: 'User created successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== Login Route =====
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Invalid email or password' });

    res.json({ message: 'Login successful', user: { name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Profile routes
// Fetch profile
app.get("/api/profile", async (req, res) => {
  try {
    const userEmail = req.query.userEmail;
    if (!userEmail) return res.status(400).json({ error: "No email provided" });

    const Profile = getModel(userEmail, "Profile"); // multi-tenant
    let profile = await Profile.findOne({ userEmail }); // ✅ filter by email
    if (!profile) profile = {};

    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.post("/api/profile", async (req, res) => {
  try {
    const { userEmail, companyName, companyAddress, companyPhone, companyLogo } = req.body;
    if (!userEmail) return res.status(400).json({ error: "userEmail is required" });

    const db = getTenantDB(userEmail);
    const Profile = getModel(userEmail, "Profile", profileSchema);

    const profile = await Profile.findOneAndUpdate(
      { userEmail },  // ✅ filter by email
      { userEmail, companyName, companyAddress, companyPhone, companyLogo },
      { upsert: true, new: true }
    );

    res.json(profile);
  } catch (err) {
    console.error("Error saving profile:", err);
    res.status(500).json({ error: "Failed to save profile" });
  }
});



// Products routes
app.get('/api/products', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const db = getTenantDB(email);
    const Product = db.model('Product', productSchema);
    const products = await Product.find({});
    res.json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Add product
// Add product
app.post('/api/products', async (req, res) => {
  try {
    const {
      email,
      name,
      code,
      costPrice = 0,
      quantity = 0,
      supplier,
      imageUrl,
      cgst = 0,
      sgst = 0,
      discount = 0,
      price // <-- selling MRP (already GST incl.)
    } = req.body;

    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!name || !code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }

    const db = getTenantDB(email);
    const Product = db.model('Product', productSchema);

    // ✅ Cost price with GST
    const gstRate = (cgst || 0) + (sgst || 0);
    const finalCostPrice = costPrice + (costPrice * gstRate / 100);

    const newProduct = new Product({
      name,
      code,
      price,              // final MRP incl. GST
      costPrice: finalCostPrice,  // ✅ cost price with GST
      quantity,
      sold: 0,
      supplier,
      imageUrl,
      cgst,
      sgst,
      discount
    });

    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) {
    console.error('Error saving product:', err);
    res.status(500).json({ error: 'Failed to save product' });
  }
});



// ✅ Get all products
app.get('/api/products', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const db = getTenantDB(email);
    const Product = db.model('Product', productSchema);

    const products = await Product.find();
    res.json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const db = getTenantDB(email);
    const Product = db.model('Product', productSchema);

    const { costPrice = 0, cgst = 0, sgst = 0 } = req.body;

    // ✅ Recalculate cost price with GST
    const gstRate = (cgst || 0) + (sgst || 0);
    const finalCostPrice = costPrice + (costPrice * gstRate / 100);

    const updateFields = {
      name: req.body.name,
      code: req.body.code,
      price: req.body.price,   // your entered MRP
      costPrice: finalCostPrice, // ✅ now includes GST
      quantity: req.body.quantity,
      supplier: req.body.supplier,
      imageUrl: req.body.imageUrl,
      cgst,
      sgst,
      discount: req.body.discount || 0
    };

    const updated = await Product.findByIdAndUpdate(req.params.id, updateFields, { new: true });
    if (!updated) return res.status(404).json({ error: 'Product not found' });

    res.json(updated);
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});


// ✅ Delete product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const db = getTenantDB(email);
    const Product = db.model('Product', productSchema);

    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Product not found' });

    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// ✅ Search product (by name/code)
app.get('/api/products/search/:query', async (req, res) => {
  try {
const email = req.query.userEmail || req.query.email;
    const { query } = req.params;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!query) return res.status(400).json({ error: 'Search query is required' });

    const db = getTenantDB(email);
    const Product = db.model('Product', productSchema);

    const products = await Product.find({
      $or: [
        { name: new RegExp(query, 'i') },
        { code: new RegExp(query, 'i') }
      ]
    });

    res.json(products);
  } catch (err) {
    console.error('Error searching products:', err);
    res.status(500).json({ error: 'Failed to search products' });
  }
});

// ✅ Get product by exact code
app.get('/api/products/code/:code', async (req, res) => {
  try {
    const { email } = req.query;
    const { code } = req.params;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!code) return res.status(400).json({ error: 'Product code is required' });

    const db = getTenantDB(email);
    const Product = db.model('Product', productSchema);

    const product = await Product.findOne({ code: new RegExp(`^${code}$`, 'i') });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    res.json(product);
  } catch (err) {
    console.error('Error fetching product by code:', err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Helper function to get model for a tenant (user)
function getModel(userEmail, modelName) {
  if (!userEmail) throw new Error("User email is required for tenant DB");

  // Get the tenant database based on email
  const db = getTenantDB(userEmail);

  // Load the correct schema
  let schema;
  switch (modelName) {
    case 'Invoice':
      schema = invoiceSchema;
      break;
    case 'Product':
      schema = productSchema;
      break;
    case 'Profile':
      schema = profileSchema;
      break;
    case 'Purchase':   // ✅ Add this line
      schema = purchaseSchema;
      break;
    default:
      throw new Error(`Unknown model name: ${modelName}`);
  }

  // Return the model from the tenant DB
  return db.model(modelName, schema);
}


// Invoices routes
// ========== INVOICE API ==========
// Get all invoices for sales page
// 📌 Get all invoices (for Sales page)
app.get('/api/invoices', async (req, res) => {
  try {
const userEmail = req.query.userEmail || req.query.email;


    if (!userEmail) {
      return res.status(400).json({ error: "Email is required" });
    }

    const db = getTenantDB(userEmail);
    const Invoice = db.model('Invoice', invoiceSchema);

    // Get all invoices, newest first
    const invoices = await Invoice.find().sort({ createdAt: -1 }).lean();

    // Normalize response to avoid missing fields
    const cleanInvoices = invoices.map(inv => ({
      _id: inv._id,
      invoiceNumber: inv.invoiceNumber || "-",
      invoiceDate: inv.invoiceDate || inv.createdAt || new Date(),
      customerName: inv.customerName || "Walk-in",
      items: Array.isArray(inv.items) ? inv.items : [],
      totalAmount: inv.totalAmount || 0,
    }));

    res.json(cleanInvoices);
  } catch (err) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({ error: "Server error fetching invoices" });
  }
});




app.post("/api/invoices", async (req, res) => {
  try {
const userEmail = req.query.userEmail || req.query.email;
    console.log("📩 Email header value:", userEmail, typeof userEmail);

    if (!userEmail || typeof userEmail !== "string") {
      return res.status(400).json({ error: "Valid user email is required" });
    }

    const {
      invoiceNumber,
      invoiceDate,
      dueDate,
      paymentTerms,
      customerName,
      customerPhone,
      companyName,
      companyAddress,
      companyPhone,
      companyLogo,
      items,
    } = req.body;

    console.log("📑 Invoice fields received from frontend:", {
      invoiceNumber,
      invoiceDate,
      dueDate,
      paymentTerms,
      customerName,
      customerPhone,
      companyName,
      companyAddress,
      companyPhone,
      companyLogo,
      items,
    });

    const tenantDB = getTenantDB(userEmail);
    const Invoice = tenantDB.model("Invoice", invoiceSchema);
    const Product = tenantDB.model("Product", productSchema);

    // ===== Calculate item-level values & totals in one pass =====
    let subTotal = 0,
      totalDiscount = 0,
      totalGST = 0,
      totalProfit = 0;

   const invoiceItems = await Promise.all(
  items.map(async (item) => {
    const product = await Product.findOne({ code: item.code });
    const costPrice = item.costPrice || (product ? product.costPrice : 0);

const qty = item.qty || 0;
const gstRate = (item.cgst || 0) + (item.sgst || 0);
const itemPrice = item.price || 0;

// 1️⃣ Gross before discount (MRP × qty, GST already included in MRP)
const gross = itemPrice * qty;

// 2️⃣ Apply discount
const discountAmt = (gross * (item.discount || 0)) / 100;
const afterDiscount = gross - discountAmt; // GST-inclusive

// 3️⃣ Extract GST (reverse calc, like frontend)
const gstAmt = (afterDiscount * gstRate) / (100 + gstRate);
const baseValue = afterDiscount - gstAmt;
const cgstAmt = gstAmt / 2;
const sgstAmt = gstAmt / 2;

// 4️⃣ Profit (exclude GST, after discount)
const sellingPriceExclGST = afterDiscount / (1 + gstRate / 100);
const profit = (sellingPriceExclGST - costPrice) * qty;

// 5️⃣ Totals
subTotal += gross;           // ✅ subtotal = before discount (gross)
totalDiscount += discountAmt;
totalGST += gstAmt;
totalProfit += profit;

const itemTotal = afterDiscount; // already GST-inclusive



return {
  ...item,
  price: itemPrice,
  costPrice,
  code: item.code || (product ? product.code : null),
  profit,
  gross,
  discountAmt,
  baseValue,
  cgstAmt,
  sgstAmt,
  itemTotal,
};


  })
);


    const grandTotal = subTotal;

    // ===== Build HTML table from enriched items =====
    const itemsHTML = invoiceItems
      .map(
        (item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${item.name || ""}</td>
          <td>${item.qty || 0}</td>
          <td>₹${(item.price || 0).toFixed(2)}</td>
          <td>${item.cgst || 0}%</td>
          <td>${item.sgst || 0}%</td>
          <td>${item.discount || 0}%</td>
          <td>₹${item.itemTotal.toFixed(2)}</td>
        </tr>
      `
      )
      .join("");

    // ===== Save invoice in DB =====

// 🩵 Safely parse DD/MM/YYYY or fallback to today
let parsedDate = new Date(invoiceDate);
if (isNaN(parsedDate)) {
  const parts = String(invoiceDate).split("/");
  if (parts.length === 3) {
    // Convert DD/MM/YYYY → YYYY-MM-DD
    parsedDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  } else {
    parsedDate = new Date();
  }
}

const newInvoice = new Invoice({
  invoiceNumber,
  invoiceDate: parsedDate,   // ✅ always valid Date
  dueDate,
  paymentTerms,
  customerName,
  customerPhone,
  items: invoiceItems,
  subtotal: subTotal,
  totalDiscount,
  totalTax: totalGST,
  totalAmount: grandTotal,
  totalProfit,
  companyName,
  companyAddress,
  companyPhone,
  companyLogo,
});
await newInvoice.save();


    // ===== Update product stock =====
    for (const item of invoiceItems) {
      if (!item.code) continue;

      const product = await Product.findOne({ code: item.code });
      if (product) {
        product.quantity = (product.quantity || 0) - item.qty;
        product.sold = (product.sold || 0) + item.qty;
        await product.save();
      }
    }

    // ===== Load invoice template =====
    const templatePath = path.join(__dirname, "invoice-template.html");
    let template = await fsp.readFile(templatePath, "utf8");

    const formattedDate = invoiceDate
      ? new Date(invoiceDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "-";

    template = template
      .replace(/{{companyName}}/g, companyName)
      .replace(/{{companyAddress}}/g, companyAddress)
      .replace(/{{companyPhone}}/g, companyPhone)
      .replace(/{{companyLogo}}/g, companyLogo)
      .replace(/{{invoiceNumber}}/g, invoiceNumber)
      .replace(/{{invoiceDate}}/g, formattedDate)
      .replace(/{{dueDate}}/g, dueDate || "-")
      .replace(/{{paymentTerms}}/g, paymentTerms || "-")
      .replace(/{{customerName}}/g, customerName || "Unknown")
      .replace(/{{customerPhone}}/g, customerPhone || "-")
      .replace(/{{itemsHTML}}/g, itemsHTML)
      .replace(/{{subTotal}}/g, subTotal.toFixed(2))
      .replace(/{{totalDiscount}}/g, totalDiscount.toFixed(2))
      .replace(/{{totalGST}}/g, totalGST.toFixed(2))
      .replace(/{{grandTotal}}/g, grandTotal.toFixed(2));

   // ===== Generate PDF =====
const pdfDir = path.join("/tmp", "invoices"); // ✅ Use /tmp (Render's writable dir)
if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir);

const pdfPath = path.join(pdfDir, `invoice-${invoiceNumber}.pdf`);

const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--single-process",
  ],
});

const page = await browser.newPage();
await page.setContent(template, { waitUntil: "networkidle0" });
await page.pdf({ path: pdfPath, format: "A4", printBackground: true });
await browser.close();

// ✅ Use the real Render URL dynamically
const baseUrl = req.get("origin") || `${req.protocol}://${req.get("host")}`;
const pdfUrl = `${baseUrl}/invoices/invoice-${invoiceNumber}.pdf`;

res.json({
  message: "Invoice saved and PDF generated successfully!",
  pdfUrl,
  invoice: newInvoice,
});
  } catch (err) {
    console.error("Error saving invoice:", err);
    res
      .status(500)
      .json({ error: "Failed to save invoice", details: err.message });
  }
});



app.get('/api/invoices/new-number', async (req, res) => {
  try {
const userEmail = req.query.userEmail || req.query.email;

    if (!userEmail) return res.status(400).json({ error: 'Email is required' });

    const db = getTenantDB(userEmail);
    const Invoice = db.model('Invoice', invoiceSchema);

    // Find last invoice and get its number
    const lastInvoice = await Invoice.findOne().sort({ createdAt: -1 }).lean();

    let newNumber;
    if (lastInvoice && lastInvoice.invoiceNumber) {
      // If last invoice was "INV-05", extract "05" and increment
      const match = lastInvoice.invoiceNumber.match(/\d+$/);
      const lastNum = match ? parseInt(match[0], 10) : 0;
      const nextNum = lastNum + 1;

      // Format with leading zeros (e.g., 01, 02, 03…)
      newNumber = `INV-${String(nextNum).padStart(2, "0")}`;
    } else {
      // First invoice starts with INV-01
      newNumber = "INV-01";
    }

    res.json({ 
      invoiceNumber: newNumber, 
      invoiceDate: new Date().toISOString().split('T')[0] 
    });

  } catch (err) {
    console.error('Error generating new invoice number:', err);
    res.status(500).json({ error: 'Server error generating invoice number' });
  }
});

// DELETE invoice by ID
app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.query.userEmail;
    if (!userEmail) return res.status(400).json({ error: "Email is required" });

    const db = getTenantDB(userEmail);
    const Invoice = db.model("Invoice", invoiceSchema);
    const Product = db.model("Product", productSchema);

    const invoice = await Invoice.findById(id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    // restore stock for each item
    for (const item of invoice.items) {
      if (item.code) {
        await Product.updateOne(
          { code: item.code },
          { $inc: { quantity: item.qty } }
        );
      }
    }

    await Invoice.findByIdAndDelete(id);

    res.json({ message: "Invoice deleted successfully" });
  } catch (err) {
    console.error("Delete invoice error:", err);
    res.status(500).json({ error: "Server error" });
  }
});



// Dashboard metrics route
// In your server.js or API routes file

// Dashboard main metrics
// ==================== DASHBOARD ROUTE ====================
app.get('/api/dashboard', async (req, res) => {
  try {
    const userEmail = req.query.email || req.query.userEmail;
    if (!userEmail) return res.status(400).json({ error: 'Email is required' });

    const Product = getModel(userEmail, "Product");
    const Invoice = getModel(userEmail, "Invoice");

    const products = await Product.find({});

    // 🕒 Today filter (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only today's invoices
    const invoices = await Invoice.find({ createdAt: { $gte: today } });

    // Total products
    const totalProducts = products.length;

    // Low stock items (quantity <= 5)
    const lowStockItems = products.filter(p => p.quantity <= 5);

    // Total sales (today only → number of invoices)
    const totalSales = invoices.length;

    // Total revenue (today only)
    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

    // Total profit (today only → use stored totalProfit)
    const totalProfit = invoices.reduce((sum, inv) => sum + (inv.totalProfit || 0), 0);

    // Top-selling products (all-time)
    const topSelling = [...products]
      .sort((a, b) => (b.sold || 0) - (a.sold || 0))
      .slice(0, 5)
      .map(p => ({
        name: p.name,
        sold: p.sold || 0,
        quantity: p.quantity || 0,
        price: p.price || 0
      }));

    res.json({
      totalProducts,
      lowStockItems,
      totalSales,
      totalRevenue,
      totalProfit,
      topSelling
    });

  } catch (err) {
    console.error('Error fetching dashboard data:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});


// ==================== SALES BY DATE ROUTE ====================
app.get("/api/sales/by-date", async (req, res) => {
  try {
    const userEmail = req.query.userEmail;
    if (!userEmail) return res.status(400).json({ error: "Email is required" });

    const Invoice = getModel(userEmail, "Invoice");

    const salesByDate = await Invoice.aggregate([
      // ensure invoiceDate is treated as Date
      {
        $addFields: {
          invoiceDateObj: { $toDate: "$invoiceDate" }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$invoiceDateObj",
              timezone: "Asia/Kolkata" // ✅ adjust to local midnight
            }
          },
          totalAmount: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$totalProfit" },
          invoices: { $push: "$$ROOT" }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    res.json(salesByDate);

  } catch (err) {
    console.error("Error in /api/sales/by-date:", err);
    res.status(500).json({ error: "Failed to fetch sales by date" });
  }
});





// Dashboard Sales & Parties chart
app.get("/api/dashboard/sales-parties", async (req, res) => {
  try {
    const userEmail = req.query.userEmail;
    const days = parseInt(req.query.days) || 31;
    if (!userEmail) return res.status(400).json({ error: "userEmail required" });

    const Invoice = getModel(userEmail, "Invoice", invoiceSchema);
    const db = getTenantDB(userEmail);
    const Party = getPartyModel(db);

    const now = new Date();
    const startDate = new Date(now.getTime() - (days - 1) * 24*60*60*1000);
    startDate.setHours(0, 0, 0, 0);

    // Generate labels in IST
    const labels = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate.getTime() + i * 24*60*60*1000);
      const ist = new Date(d.getTime() + 5.5*60*60*1000); // IST offset
      labels.push(ist.toISOString().split('T')[0]);
    }

    // Sales aggregation by IST date
    const salesAgg = await Invoice.aggregate([
      { $match: { invoiceDate: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$invoiceDate", timezone: "Asia/Kolkata" } },
          total: { $sum: "$totalAmount" }
        }
      }
    ]);

    // Bills aggregation by IST date
    const partiesAgg = await Party.aggregate([
      { $unwind: "$bills" },
      { $match: { "bills.billDate": { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$bills.billDate", timezone: "Asia/Kolkata" } },
          total: { $sum: "$bills.amount" }
        }
      }
    ]);

    const salesMap = {};
    salesAgg.forEach(s => { salesMap[s._id] = s.total; });
    const salesData = labels.map(d => salesMap[d] || 0);

    const billsMap = {};
    partiesAgg.forEach(p => { billsMap[p._id] = p.total; });
    const billsData = labels.map(d => billsMap[d] || 0);

    res.json({ labels, salesData, billsData });
  } catch (err) {
    console.error("Error in sales-parties chart:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/health", (req, res) => res.json({ ok: true }));

// Get all parties for user
app.get("/api/parties", async (req, res) => {
  try {
    const userEmail = req.query.userEmail;
    if (!userEmail) return res.status(400).json({ error: "userEmail required" });

    const db = getTenantDB(userEmail);
    const Party = getPartyModel(db);

    const parties = await Party.find().sort({ createdAt: -1 });
    res.json(parties);
  } catch (err) {
    console.error("GET /api/parties error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create party
app.post("/api/parties", async (req, res) => {
  try {
    const { userEmail, partyName, partyNumber, partyGST } = req.body;
    if (!userEmail) return res.status(400).json({ error: "userEmail required" });
    if (!partyName) return res.status(400).json({ error: "partyName required" });

    const db = getTenantDB(userEmail);
    const Party = getPartyModel(db);

    const newParty = new Party({ userEmail, partyName, partyNumber, partyGST, bills: [] });
    await newParty.save();
    res.json(newParty);
  } catch (err) {
    console.error("POST /api/parties error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete party
app.delete("/api/parties/:partyId", async (req, res) => {
  try {
    const { partyId } = req.params;
    const userEmail = req.query.userEmail || req.body.userEmail;
    if (!userEmail) return res.status(400).json({ error: "userEmail required" });

    const db = getTenantDB(userEmail);
    const Party = getPartyModel(db);

    const deleted = await Party.findByIdAndDelete(partyId);
    if (!deleted) return res.status(404).json({ error: "Party not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/parties/:partyId error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add bill to party
app.post("/api/parties/:partyId/bills", async (req, res) => {
  try {
    const { partyId } = req.params;
    const { userEmail, invoiceNumber, amount, billDate, dueDate } = req.body;

    if (!userEmail) return res.status(400).json({ error: "userEmail required" });
    if (!invoiceNumber || amount === undefined || !billDate || !dueDate)
      return res.status(400).json({ error: "invoiceNumber, amount, billDate and dueDate required" });

    const db = getTenantDB(userEmail);
    const Party = getPartyModel(db);

    const party = await Party.findById(partyId);
    if (!party) return res.status(404).json({ error: "Party not found" });

    party.bills.push({
      invoiceNumber,
      amount,
      billDate: new Date(billDate),
      dueDate: new Date(dueDate),
      status: "unpaid"
    });

    await party.save();
    const pushed = party.bills[party.bills.length - 1];
    res.json(pushed);
  } catch (err) {
    console.error("POST /api/parties/:partyId/bills error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Edit bill (update fields)
app.put("/api/parties/:partyId/bills/:billId", async (req, res) => {
  try {
    const { partyId, billId } = req.params;
    const { userEmail, invoiceNumber, amount, billDate, dueDate } = req.body;

    if (!userEmail) return res.status(400).json({ error: "userEmail required" });

    const db = getTenantDB(userEmail);
    const Party = getPartyModel(db);

    const party = await Party.findById(partyId);
    if (!party) return res.status(404).json({ error: "Party not found" });

    const bill = party.bills.id(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });

    if (invoiceNumber !== undefined) bill.invoiceNumber = invoiceNumber;
    if (amount !== undefined) bill.amount = amount;
    if (billDate) bill.billDate = new Date(billDate);
    if (dueDate) bill.dueDate = new Date(dueDate);

    await party.save();
    res.json(bill);
  } catch (err) {
    console.error("PUT /api/parties/:partyId/bills/:billId error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Toggle / update status or partial update (PATCH)
app.patch("/api/parties/:partyId/bills/:billId", async (req, res) => {
  try {
    const { partyId, billId } = req.params;
    const { userEmail, status } = req.body;

    if (!userEmail) return res.status(400).json({ error: "userEmail required" });
    if (status && !["paid", "unpaid"].includes(status)) return res.status(400).json({ error: "Invalid status" });

    const db = getTenantDB(userEmail);
    const Party = getPartyModel(db);

    const party = await Party.findById(partyId);
    if (!party) return res.status(404).json({ error: "Party not found" });

    const bill = party.bills.id(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });

    if (status) bill.status = status;
    await party.save();
    res.json(bill);
  } catch (err) {
    console.error("PATCH /api/parties/:partyId/bills/:billId error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete bill
app.delete("/api/parties/:partyId/bills/:billId", async (req, res) => {
  try {
    const { partyId, billId } = req.params;
    const userEmail = req.query.userEmail || req.body.userEmail;
    if (!userEmail) return res.status(400).json({ error: "userEmail required" });

    const db = getTenantDB(userEmail);
    const Party = getPartyModel(db);

    const party = await Party.findById(partyId);
    if (!party) return res.status(404).json({ error: "Party not found" });

    const bill = party.bills.id(billId);
    if (!bill) return res.status(404).json({ error: "Bill not found" });

    bill.deleteOne();
    await party.save();
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/parties/:partyId/bills/:billId error:", err);
    res.status(500).json({ error: err.message });
  }
});





// Serve frontend SPA safely
// ===== Fallback for non-API routes =====
// ===== Fallback route for frontend =====
// Fallback route for frontend pages
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();

  const requestedFile = path.join(__dirname, 'frontend', req.path);

  // Serve if the requested file exists
  if (fs.existsSync(requestedFile) && fs.statSync(requestedFile).isFile()) {
    return res.sendFile(requestedFile);
  }

  // Serve login.html for root route
  if (req.path === '/' || req.path === '/login.html') {
    return res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
  }

  // If file not found, return 404 (do NOT force dashboard)
  return res.status(404).send('Page not found');
});



// Start server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

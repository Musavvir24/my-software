// backend/models/profile.js
const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  logo: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = ProfileSchema;

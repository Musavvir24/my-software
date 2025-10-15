// backend/routes/profile.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Try to require the profile module (schema or model)
let profileModule = null;
try {
  profileModule = require('../models/profile'); // preferred lowercase path
} catch (e1) {
  try {
    profileModule = require('../models/profile'); // try capitalized fallback
  } catch (e2) {
    profileModule = null;
  }
}

let ProfileModel = null;

if (profileModule) {
  // If they exported a Schema instance
  if (profileModule instanceof mongoose.Schema) {
    ProfileModel = mongoose.models.Profile || mongoose.model('Profile', profileModule);
  } else if (profileModule && profileModule.schema && profileModule.modelName) {
    // Looks like a model
    ProfileModel = profileModule;
  } else if (typeof profileModule === 'object') {
    // If they exported a plain object definition, convert to schema
    try {
      const tmpSchema = new mongoose.Schema(profileModule);
      ProfileModel = mongoose.models.Profile || mongoose.model('Profile', tmpSchema);
    } catch (e) {
      console.warn('Could not convert profile module POJO to schema:', e.message);
      ProfileModel = null;
    }
  } else {
    ProfileModel = null;
  }
} else {
  ProfileModel = null;
}

let inMemoryProfile = null;

router.get('/', async (req, res) => {
  try {
    if (ProfileModel) {
      // use lean() to return plain object
      const p = await ProfileModel.findOne().lean();
      if (!p) return res.json({ name:'', address:'', phone:'', logo:'' });
      return res.json({ name: p.name || '', address: p.address || '', phone: p.phone || '', logo: p.logo || '' });
    } else {
      return res.json(inMemoryProfile || { name:'', address:'', phone:'', logo:'' });
    }
  } catch (err) {
    console.error('GET /api/profile error', err);
    res.status(500).json({ error: 'Failed to load profile', details: err.message || String(err) });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    if (ProfileModel) {
      let p = await ProfileModel.findOne();
      if (!p) {
        p = new ProfileModel({
          name: body.name || '',
          address: body.address || '',
          phone: body.phone || '',
          logo: body.logo || ''
        });
      } else {
        p.name = body.name || '';
        p.address = body.address || '';
        p.phone = body.phone || '';
        p.logo = body.logo || '';
        p.updatedAt = Date.now();
      }
      await p.save();
      return res.json({ ok: true, profile: p });
    } else {
      inMemoryProfile = { name: body.name||'', address: body.address||'', phone: body.phone||'', logo: body.logo||'' };
      return res.json({ ok:true, profile: inMemoryProfile });
    }
  } catch (err) {
    console.error('POST /api/profile error', err);
    res.status(500).json({ error: 'Failed to save profile', details: err.message || String(err) });
  }
});

module.exports = router;

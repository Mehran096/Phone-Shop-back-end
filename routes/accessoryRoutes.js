const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth.js');
const { 
  getAccessories, getAccessoryById, getAccessoryBySlug, createAccessory, updateAccessory, deleteAccessory 
} = require('../controllers/accessoryController.js');

router.route('/').get(getAccessories).post(protect, admin, createAccessory);

router.route('/slug/:slug').get(getAccessoryBySlug);

router.route('/:id').get(getAccessoryById).put(protect, admin, updateAccessory).delete(protect, admin, deleteAccessory);

module.exports = router;
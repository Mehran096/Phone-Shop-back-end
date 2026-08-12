const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/auth.js')
const { 
  getWishlist, 
  toggleWishlist, 
  removeWishlistItem,
  clearWishlist 
} = require('../controllers/wishlistController')

router.route('/').get(protect, getWishlist).delete(protect, clearWishlist)
router.post('/toggle', protect, toggleWishlist)
router.delete('/:itemId', protect, removeWishlistItem)

module.exports = router
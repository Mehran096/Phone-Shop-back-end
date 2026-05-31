const express = require('express')
const { protect, admin } = require('../middleware/auth')
const Product = require('../models/Product')
const Order = require('../models/orderModel')
const User = require('../models/User')

const router = express.Router()

// GET /api/admin/stats - Dashboard stats
router.get('/stats', protect, admin, async (req, res) => {
  try {
    const totalSales = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ])
    
    const productCount = await Product.countDocuments()
    const orderCount = await Order.countDocuments()
    const userCount = await User.countDocuments()
    
    res.json({
      totalSales: totalSales[0]?.total || 0,
      productCount,
      orderCount,
      userCount
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router
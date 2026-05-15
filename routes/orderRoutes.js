const express = require('express');
const Order = require('../models/orderModel.js');
const { protect, admin } = require('../middleware/auth.js'); // <-- Add this
const asyncHandler = require('express-async-handler');
const router = express.Router();

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
router.post('/', protect, async (req, res) => { // <-- Add protect here
  try {
    const {
      orderItems,
      shippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
    } = req.body;

    if (orderItems && orderItems.length === 0) {
      res.status(400).json({ message: 'No order items' });
      return;
    }

    const order = new Order({
      orderItems: orderItems.map((x) => ({
        ...x,
        product: x._id,
        _id: undefined,
      })),
      user: req.user._id, // <-- Use real user instead of hardcoded
      shippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
    });

    const createdOrder = await order.save();
    res.status(201).json(createdOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
router.get('/myorders', protect, async (req, res) => {
  const orders = await Order.find({ user: req.user._id });
  res.json(orders);
});

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {

  const order = await Order.findById(req.params.id).populate('user', 'name email')

  if (order) {
    res.json(order)
  } else {
    res.status(404)
    throw new Error('Order not found')
  }
}))

// @desc Update order to paid
// @route PUT /api/orders/:id/pay
// @access Private
router.put('/:id/pay', protect, asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (order) {
    order.isPaid = true;
    order.paidAt = Date.now();
    order.paymentResult = {
      id: req.body.id || '',
      status: req.body.status || '',
      update_time: req.body.update_time || Date.now(),
      email_address: req.body.email_address || '', // Default to empty string
    };

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } else {
    res.status(404)
    throw new Error('Order not found')
  }
}));

// Update order to delivered (admin only)
router.put('/:id/deliver', protect, admin, async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (order) {
    order.isDelivered = true;
    order.deliveredAt = Date.now();

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } else {
    res.status(404).json({ message: 'Order not found' });
  }
});
// @desc Get all orders
// @route GET /api/orders
// @access Private/Admin
router.get('/', protect, admin, async (req, res) => {
  const orders = await Order.find({}).populate('user', 'id name');
  res.json(orders);
});

module.exports = router;
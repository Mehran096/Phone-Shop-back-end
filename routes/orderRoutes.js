const express = require('express'); 
const mongoose = require ('mongoose')
const Order = require('../models/orderModel.js');
const User = require('../models/User');
const { protect, admin } = require('../middleware/auth.js'); // <-- Add this
const asyncHandler = require('express-async-handler');
const router = express.Router();
//import Stripe from 'stripe'
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)




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
        product: x.product,
        _id: undefined,
      })),
      user: req.user._id, // <-- Use real user instead of hardcoded
      shippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,

      isPaid: paymentMethod === 'Cash on Delivery' ? false : false,
      paidAt: paymentMethod === 'Cash on Delivery' ? undefined : undefined,
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
// @desc    Get all orders + pagination + search
// @route   GET /api/orders
// @access  Private/Admin
router.get('/', protect, admin, asyncHandler(async (req, res) => {
  const pageSize = 10
  const page = Number(req.query.pageNumber) || 1
  const keyword = req.query.keyword || ''

  let query = {}

  if (keyword) {
    // Check if keyword is valid ObjectId for _id search
    const isValidObjectId = mongoose.Types.ObjectId.isValid(keyword)
    
    // Find users matching the keyword first
    const users = await User.find({
      name: { $regex: keyword, $options: 'i' }
    }).select('_id')
    
    const userIds = users.map(user => user._id)

    query = {
      $or: [
        // Search by user if name matches
        { user: { $in: userIds } },
        // Search by _id only if it's a valid ObjectId
        ...(isValidObjectId ? [{ _id: keyword }] : [])
      ]
    }
  }

  const count = await Order.countDocuments(query)
  
  const orders = await Order.find(query)
    .populate('user', 'id name email')
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .sort({ createdAt: -1 })

  res.json({ orders, page, pages: Math.ceil(count / pageSize) })
}))

// DELETE order -- admin only
router.delete('/:id', protect, admin, async (req, res) => {
  const order = await Order.findById(req.params.id)
  
  if (order) {
    await order.deleteOne()
    res.json({ message: 'Order removed' })
  } else {
    res.status(404).json({ message: 'Order not found' })
  }

//   if (order && order.isDelivered) {
//   await order.deleteOne()
//   res.json({ message: 'Delivered order removed' })
// } else {
//   res.status(400).json({ message: 'Only delivered orders can be deleted' })
// }
})

// Stripe payment testing
router.post('/create-checkout-session', protect, async (req, res) => {
  try {
    const { orderItems, shippingAddress, paymentMethod, itemsPrice, taxPrice, shippingPrice, totalPrice } = req.body

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ message: 'No order items' })
    }

    // 1. Create order in DB first
    const order = await Order.create({
      user: req.user._id,
      orderItems,
      shippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
      isPaid: false,
    })

    // 2. Create Stripe session using the new order._id
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: order.orderItems.map(item => ({
        price_data: {
          currency: 'usd',
          product_data: { 
            name: item.name,
            images: [item.image], // Optional: shows product image on Stripe
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.qty,
      })),
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cart`,
      metadata: { orderId: order._id.toString() },
      customer_email: req.user.email,
    })

    res.json({ url: session.url })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})


router.get('/verify-session/:sessionId', protect, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId)
    
    if (session.payment_status === 'paid') {
      const order = await Order.findById(session.metadata.orderId)
      
      if (!order) {  // Fixed typo: was "lorder"
        return res.status(404).json({ message: 'Order not found' })
      }
      
      // Prevent double updates
      if (order.isPaid) {
        return res.json(order)
      }
      
      order.isPaid = true
      order.paidAt = Date.now()
      order.paymentResult = {
        id: session.id,
        status: session.payment_status,
        update_time: new Date().toISOString(),
        email_address: session.customer_email,
      }
      await order.save()
      
      // Clear user's cart in MongoDB after successful payment
      await User.findByIdAndUpdate(order.user, { cartItems: [] })
      
      res.json(order)
    } else {
      res.status(400).json({ message: 'Order not paid' })
    }
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})



module.exports = router;
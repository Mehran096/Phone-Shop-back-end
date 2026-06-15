const express = require('express'); 
const mongoose = require ('mongoose')
const Order = require('../models/orderModel.js');
const User = require('../models/User');
const sendEmail = require( '../utils/sendEmail.js')
const { protect, admin } = require('../middleware/auth.js'); // <-- Add this
const asyncHandler = require('express-async-handler');
const router = express.Router();
//import Stripe from 'stripe'
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)




// @desc    Create new order
// @route   POST /api/orders
// @access  Private
router.post('/', protect, async (req, res) => {  
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
     try {
      const user = await User.findById(req.user._id) // Get user for name/email
      
      await sendEmail({
        email: user.email,
        subject: `Order #${createdOrder._id} Received`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <h2>Thanks for your order, ${user.name}!</h2>
            <p>We've received your order and will process it shortly.</p>
            
            <h3>Order Summary</h3>
            <p><strong>Order ID:</strong> ${createdOrder._id}</p>
            <p><strong>Total:</strong> $${createdOrder.totalPrice}</p>
            <p><strong>Payment:</strong> ${createdOrder.paymentMethod}</p>
            
            <h3>Shipping To:</h3>
            <p>${shippingAddress.address}<br/>
            ${shippingAddress.city}, ${shippingAddress.postalCode}<br/>
            ${shippingAddress.country}</p>
            
            <a href="${process.env.CLIENT_URL}/order/${createdOrder._id}" 
               style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;margin-top:20px">
              View Order
            </a>
          </div>
        `,
      })
      console.log('Order email sent to:', user.email)
    } catch (error) {
      console.log('Email failed but order created:', error.message)
    }
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
  const order = await Order.findById(req.params.id).populate('user', 'name email');

  if (order) {
    order.isPaid = true;
    order.paidAt = Date.now();
    order.paymentResult = {
      id: req.body.id || '',
      status: req.body.status || '',
      update_time: req.body.update_time || Date.now(),
      email_address: req.body.email_address || '',
    };

    const updatedOrder = await order.save();
    
    // ADD THIS BLOCK - SEND "PAYMENT CONFIRMED" EMAIL
    try {
      await sendEmail({
        email: order.user.email,
        subject: `Payment Confirmed - Order #${order._id}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <h2>Payment Received, ${order.user.name}!</h2>
            <p>Your payment of <strong>$${order.totalPrice}</strong> for Order #${order._id} was successful.</p>
            
            <h3>What's Next?</h3>
            <p>We're now preparing your items for shipment. You'll receive another email with tracking info once it ships.</p>
            
            <h3>Order Details</h3>
            <p><strong>Items:</strong> ${order.orderItems.length}</p>
            <p><strong>Shipping To:</strong> ${order.shippingAddress.address}, ${order.shippingAddress.city}</p>
            
            <a href="${process.env.CLIENT_URL}/order/${order._id}" 
               style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;margin-top:20px">
              Track Your Order
            </a>
          </div>
        `,
      })
      console.log('Payment email sent to:', order.user.email)
    } catch (error) {
      console.log('Payment email failed:', error.message)
    }
    // END EMAIL BLOCK

    res.json(updatedOrder);
  } else {
    res.status(404)
    throw new Error('Order not found')
  }
}));

// Update order to delivered (admin only)
router.put('/:id/deliver', protect, admin, async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email'); // Add .populate()

  if (order) {
    order.isDelivered = true;
    order.deliveredAt = Date.now();

    const updatedOrder = await order.save();
    
    // ADD THIS BLOCK - SEND "ORDER SHIPPED/DELIVERED" EMAIL
    try {
      await sendEmail({
        email: order.user.email,
        subject: `Order #${order._id} Has Been Shipped`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <h2>Good News, ${order.user.name}!</h2>
            <p>Your order #${order._id} is on the way.</p>
            
            <h3>Shipping Details</h3>
            <p><strong>Delivered On:</strong> ${new Date(order.deliveredAt).toLocaleDateString()}</p>
            <p><strong>Shipping Address:</strong><br/>
            ${order.shippingAddress.address}<br/>
            ${order.shippingAddress.city}, ${order.shippingAddress.postalCode}<br/>
            ${order.shippingAddress.country}</p>
            
            <h3>Order Items</h3>
            ${order.orderItems.map(item => `
              <p>${item.name} x ${item.qty} - $${(item.qty * item.price).toFixed(2)}</p>
            `).join('')}
            
            <p style="margin-top:20px;"><strong>Total: $${order.totalPrice}</strong></p>
            
            <a href="${process.env.CLIENT_URL}/order/${order._id}" 
               style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;margin-top:20px">
              View Order Details
            </a>
            
            <p style="margin-top:30px;font-size:14px;color:#666">
              Thanks for shopping with Phone Products!
            </p>
          </div>
        `,
      })
      console.log('Delivery email sent to:', order.user.email)
    } catch (error) {
      console.log('Delivery email failed:', error.message)
    }
    // END EMAIL BLOCK

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
  // Block demo admin from destructive actions
const isDemoAdmin = req.user.email === 'demo@phonestore.com'
if (isDemoAdmin) {
  return res.status(403).json({ 
    message: 'Demo accounts have read-only access. Contact developer for full admin demo.' 
  })
}
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

    // ADD EMAIL HERE - AFTER ORDER CREATED, BEFORE STRIPE
    try {
      const user = await User.findById(req.user._id)
      
      await sendEmail({
        email: user.email,
        subject: `Order #${order._id} Received - Complete Payment`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
            <h2>Thanks for your order, ${user.name}!</h2>
            <p>We've received your order. Complete payment to confirm it.</p>
            
            <h3>Order ID: ${order._id}</h3>
            <p><strong>Total: $${order.totalPrice}</strong></p>
            
            <p>You'll be redirected to Stripe to complete payment. Once paid, you'll get a confirmation email.</p>
            
            <h3>Shipping To:</h3>
            <p>${shippingAddress.address}<br/>
            ${shippingAddress.city}, ${shippingAddress.postalCode}<br/>
            ${shippingAddress.country}</p>
          </div>
        `,
      })
      console.log('Order created email sent to:', user.email)
    } catch (error) {
      console.log('Email failed but order created:', error.message)
    }
    // END EMAIL BLOCK

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

//STRIPE WEBHOOK - Must use express.raw() for body
// router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
//   const sig = req.headers['stripe-signature']
//   let event

//   try {
//     event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
//   } catch (err) {
//     console.log('Webhook signature verification failed:', err.message)
//     return res.status(400).send(`Webhook Error: ${err.message}`)
//   }

//   // Respond immediately so Stripe doesn't timeout
//   res.status(200).send('ok')

//   // Handle the event
//   try {
//     if (event.type === 'checkout.session.completed') {
//       const session = event.data.object
//       // You used client_reference_id in checkout, not metadata
//       const orderId = session.client_reference_id 

//       const order = await Order.findByIdAndUpdate(
//         orderId,
//         {
//           isPaid: true,
//           paidAt: Date.now(),
//           paymentResult: {
//             id: session.payment_intent,
//             status: session.payment_status,
//             update_time: new Date().toISOString(),
//             email_address: session.customer_email,
//           },
//         },
//         { new: true } // Return updated doc
//       ).populate('user', 'name email')

//       // SEND "PAYMENT CONFIRMED" EMAIL HERE
//       if (order) {
//          console.log('Order found. User email:', order.user?.email)
//         try {
//           await sendEmail({
//             email: order.user.email,
//             subject: `Payment Confirmed - Order #${order._id}`,
//             html: `
//               <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
//                 <h2>Payment Received, ${order.user.name}!</h2>
//                 <p>Your payment of <strong>$${order.totalPrice}</strong> for Order #${order._id} was successful.</p>
                
//                 <h3>What's Next?</h3>
//                 <p>We're now preparing your items for shipment. You'll receive another email when it ships.</p>
                
//                 <a href="${process.env.CLIENT_URL}/order/${order._id}" 
//                    style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;margin-top:20px">
//                   Track Your Order
//                 </a>
//               </div>
//             `,
//           })
//           console.log('Payment confirmation email sent:', order.user.email)
//         } catch (emailError) {
//           console.log('Payment email failed:', emailError.message)
//         }
//       }
//     }
//   } catch (err) {
//     console.error('Webhook DB update failed:', err)
//   }
// })


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
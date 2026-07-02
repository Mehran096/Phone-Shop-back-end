const express = require('express');
const mongoose = require('mongoose')
const Order = require('../models/orderModel.js');
const User = require('../models/User');
const Product = require('../models/Product.js')
const sendEmail = require('../utils/sendEmail.js')
const { calcPrices } = require('../utils/calcPrices')
const { protect, admin } = require('../middleware/auth.js'); // <-- Add this
const asyncHandler = require('express-async-handler');
const router = express.Router();
//import Stripe from 'stripe'
const Stripe = require('stripe');
const axios = require('axios');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)




// @desc Create new order - COD ONLY
// @route POST /api/orders
// @access Private
router.post('/', protect, asyncHandler(async (req, res) => {
  const {
    orderItems,
    shippingAddress,
    paymentMethod,
  } = req.body

  if (!orderItems || orderItems.length === 0) {
    res.status(400)
    throw new Error('No order items')
  }

  // 1. COD country check - BYPASS IN DEMO MODE
  const isDemo = process.env.DEMO_MODE === 'true'

  if (paymentMethod === 'COD' && !isDemo) {
    const allowedCountries = ['Pakistan']
    const country = shippingAddress.country?.trim()
    if (!allowedCountries.includes(country)) {
      res.status(400)
      throw new Error('COD only available in Pakistan')
    }
  }

  const validOrderItems = orderItems.filter((x) => x.product != null)
  if (validOrderItems.length === 0) {
    res.status(400)
    throw new Error('All products in cart were deleted')
  }

  // V19.0 COD ONLY BLOCK
  const dbOrderItems = validOrderItems.map((itemFromClient) => ({
    name: itemFromClient.name,
    qty: itemFromClient.qty,
    image: itemFromClient.image,
    price: Number(itemFromClient.price),
    color: itemFromClient.color,
    storage: itemFromClient.storage,
    slug: itemFromClient.slug,
    product: itemFromClient.product,
  }))




  // 4. Calculate everything server-side
  const { itemsPrice, taxPrice, shippingPrice, totalPrice, currency } =
    calcPrices(dbOrderItems, shippingAddress, paymentMethod)

  const order = new Order({
    orderItems: dbOrderItems,
    user: req.user._id,
    shippingAddress,
    paymentMethod, // <-- Use variable, not hard-coded
    itemsPrice,
    taxPrice,
    shippingPrice,
    totalPrice,
    currency,
    isPaid: false,
  })

  const createdOrder = await order.save()

  if (paymentMethod === 'COD') {
    await User.findByIdAndUpdate(req.user._id, { cartItems: [] })
  }

  // 5. Send "Order Received" email
  try {
    const user = await User.findById(req.user._id)
    await sendEmail({
      email: user.email,
      subject: `Order #${createdOrder._id.toString().slice(-6)} Received`,
      html: `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
    <h2>Thanks for your order, ${user.name}</h2>
    <p>We've received your COD order and will process it shortly.</p>

    <h3>Order ID: ${createdOrder._id.toString().slice(-6)}</h3>
    
    <h3>Items:</h3> <!-- V21.8 KEY: SAME AS STRIPE -->
    ${createdOrder.orderItems.map(item => `
      <div style="display:flex;align-items:center;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:10px">
        <img src="${process.env.CLIENT_URL}${item.image}" width="60" style="border-radius:6px;margin-right:12px"/>
        <div style="flex:1">
          <div style="font-weight:600">${item.name}</div>
          <div style="font-size:13px;color:#666">Color: ${item.color} | Storage: ${item.storage}</div>
          <div style="font-size:13px">${item.qty} x ${createdOrder.currency} ${item.price}</div>
        </div>
      </div>
    `).join('')}
    
    <p><strong>Total:</strong> ${createdOrder.currency} ${createdOrder.totalPrice}</p>
    <p><strong>Payment:</strong> ${createdOrder.paymentMethod}</p>

    <h3>Shipping To:</h3>
    <p>
      <strong>Phone:</strong> ${shippingAddress.phone}<br/>
      ${shippingAddress.address}<br/>
      ${shippingAddress.city}, ${shippingAddress.postalCode}<br/>
      ${shippingAddress.country}
    </p>

    <a href="${process.env.FRONTEND_URL}/order/${createdOrder._id}" 
       style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-top:20px">
      View Order
    </a>
  </div>
`
    })
    console.log('Order email sent to:', user.email)
  } catch (error) {
    console.log('Email failed but order created:', error.message)
  }

  res.status(201).json(createdOrder)
}))


// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
router.get('/myorders', protect, async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .populate('user', 'name email')
    .populate({
      path: 'orderItems.product',
      select: 'name image' // Don't populate deleted products
    })

  // Filter out null products from old orders
  const safeOrders = orders.map(order => ({
    ...order.toObject(),
    orderItems: order.orderItems.filter(item => item.product !== null)
  }))

  res.json(safeOrders)
})

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email')
    .populate({
      path: 'orderItems.product',
      select: 'name image price colors'
    })

  if (order) {
    // Filter null products if product was deleted after order was placed
    const safeOrder = {
      ...order.toObject(),
      orderItems: order.orderItems.filter(item => item.product !== null)
    }
    res.json(safeOrder)
  } else {
    res.status(404)
    throw new Error('Order not found')
  }
}))

// @desc    Update order to paid - Stripe/PayPal/JazzCash
// @route   PUT /api/orders/:id/pay
// @access  Private
router.put('/:id/pay', protect, asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email')

  if (order) {
    if (order.isPaid) {
      res.status(400)
      throw new Error('Order is already paid')
    }

    order.isPaid = true
    order.paidAt = Date.now()
    order.paymentResult = {
      id: req.body.id || '',
      status: req.body.status || 'succeeded',
      update_time: req.body.update_time || new Date().toISOString(),
      email_address: req.body.email_address || order.user.email,
    }

    const updatedOrder = await order.save()

    // Send "Payment Confirmed" email
    try {
      await sendEmail({
        email: order.user.email,
        subject: `Payment Confirmed - Order #${order._id.toString().slice(-6)}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
            <h2>Payment Received, ${order.user.name}!</h2>
            <p>Your payment of <strong>${order.currency} ${order.totalPrice}</strong> for Order #${order._id.toString().slice(-6)} was successful.</p>
            
            <h3>What's Next?</h3>
            <p>We're now preparing your items for shipment. You'll receive another email with tracking info once it ships.</p>
            
            <h3>Order Details</h3>
            <p><strong>Items:</strong> ${order.orderItems.length}</p>
            <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
            
            <h3>Shipping To:</h3>
            <p>
              <strong>Phone:</strong> ${order.shippingAddress.phone}<br/>
              ${order.shippingAddress.address}<br/>
              ${order.shippingAddress.city}, ${order.shippingAddress.postalCode}<br/>
              ${order.shippingAddress.country}
            </p>
            
            <a href="${process.env.FRONTEND_URL}/order/${order._id}"
               style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-top:16px">
               Track Your Order
            </a>
          </div>
        `,
      })
      console.log('Payment email sent to:', order.user.email)
    } catch (error) {
      console.log('Payment email failed:', error.message)
    }

    res.json(updatedOrder)
  } else {
    res.status(404)
    throw new Error('Order not found')
  }
}))

// @desc    Update order to shipped - Admin adds tracking
// @route   PUT /api/orders/:id/deliver
// @access  Private/Admin
router.put('/:id/markasShipped', protect, admin, asyncHandler(async (req, res) => {
  const { trackingNumber, carrier } = req.body

  const order = await Order.findById(req.params.id).populate('user', 'name email')

  if (!order) {
    res.status(404)
    throw new Error('Order not found')
  }

  if (order.isShipped) {
    res.status(400)
    throw new Error('Order already shipped')
  }

  if (!trackingNumber || !carrier) {
    res.status(400)
    throw new Error('Tracking number and carrier are required')
  }

  order.isShipped = true
  order.shippedAt = Date.now()
  order.trackingNumber = trackingNumber
  order.carrier = carrier

  const updatedOrder = await order.save()

  try {
    await sendEmail({
      email: order.user.email,
      subject: `Order #${order._id.toString().slice(-6)} Has Been Shipped`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
          <h2>Good News, ${order.user.name}!</h2>
          <p>Your order #${order._id.toString().slice(-6)} is on the way.</p>
          
          <h3>Shipping Details</h3>
          <p><strong>Shipped On:</strong> ${new Date(order.shippedAt).toLocaleDateString()}</p>
          <p><strong>Carrier:</strong> ${carrier}</p>
          <p><strong>Tracking #:</strong> ${trackingNumber}</p>
          
          <h3>Order Items</h3>
          ${order.orderItems.map(item =>
        `<p>${item.name} x ${item.qty} - ${order.currency} ${(item.qty * item.price).toFixed(2)}</p>`
      ).join('')}
          
          <p style="margin-top:20px;"><strong>Total: ${order.currency} ${order.totalPrice}</strong></p>
          
          <h3>Shipping To:</h3>
          <p>
            <strong>Phone:</strong> ${order.shippingAddress.phone}<br/>
            ${order.shippingAddress.address}<br/>
            ${order.shippingAddress.city}, ${order.shippingAddress.postalCode}<br/>
            ${order.shippingAddress.country}
          </p>
          
          <a href="${process.env.FRONTEND_URL}/order/${order._id}"
             style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-top:16px">
             Track Your Order
          </a>
        </div>
      `,
    })
    console.log('Shipping email sent to:', order.user.email)
  } catch (error) {
    console.log('Shipping email failed:', error.message)
  }

  res.json(updatedOrder)
}))

// @desc    Update order to delivered - Courier confirmed
// @route   PUT /api/orders/:id/markasdelivered
// @access  Private/Admin
router.put('/:id/markasdelivered', protect, admin, asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email')

  if (!order) {
    res.status(404)
    throw new Error('Order not found')
  }

  if (!order.isShipped) {
    res.status(400)
    throw new Error('Order must be shipped before marking as delivered')
  }

  if (order.isDelivered) {
    res.status(400)
    throw new Error('Order already delivered')
  }

  order.isDelivered = true
  order.deliveredAt = Date.now()
  // Mark COD as paid on delivery
  if (order.paymentMethod === 'COD' && !order.isPaid) {
    order.isPaid = true
    order.paidAt = Date.now()
  }


  const updatedOrder = await order.save()

  try {
    await sendEmail({
      email: order.user.email,
      subject: `Order #${order._id.toString().slice(-6)} Has Been Delivered`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
          <h2>Delivered, ${order.user.name}!</h2>
          <p>Your order #${order._id.toString().slice(-6)} was successfully delivered.</p>
          
          <h3>Delivery Details</h3>
          <p><strong>Delivered On:</strong> ${new Date(order.deliveredAt).toLocaleDateString()}</p>
          <p><strong>Carrier:</strong> ${order.carrier || 'N/A'}</p>
          <p><strong>Tracking #:</strong> ${order.trackingNumber || 'N/A'}</p>
          
          <h3>Order Items</h3>
          ${order.orderItems.map(item =>
        `<p>${item.name} x ${item.qty} - ${order.currency} ${(item.qty * item.price).toFixed(2)}</p>`
      ).join('')}
          
          <p style="margin-top:20px;"><strong>Total: ${order.currency} ${order.totalPrice}</strong></p>
          
          <h3>Delivered To:</h3>
          <p>
            <strong>Phone:</strong> ${order.shippingAddress.phone}<br/>
            ${order.shippingAddress.address}<br/>
            ${order.shippingAddress.city}, ${order.shippingAddress.postalCode}<br/>
            ${order.shippingAddress.country}
          </p>
          
          <a href="${process.env.FRONTEND_URL}/order/${order._id}"
             style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-top:16px">
             View Order Details
          </a>
        </div>
      `,
    })
    console.log('Delivery email sent to:', order.user.email)
  } catch (error) {
    console.log('Delivery email failed:', error.message)
  }

  // 👇 WHATSAPP CODE START 👇
  // if (order.shippingAddress?.phone) {
  //   const phoneNumberId = process.env.WHATSAPP_PHONE_ID; // 1148062235058210
  //   const token = process.env.WHATSAPP_TOKEN; // Meta token

  //   // Pakistan number: 03xx... ko 923xx... bana do
  //   let customerPhone = order.shippingAddress.phone.replace(/[^0-9]/g, '');
  //   if (customerPhone.startsWith('0')) {
  //     customerPhone = '92' + customerPhone.slice(1);
  //   } else if (!customerPhone.startsWith('92')) {
  //     customerPhone = '92' + customerPhone;
  //   }

  //   const whatsappUrl = `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`;

  //   const messageData = {
  //   messaging_product: "whatsapp",
  //   to: customerPhone,
  //   type: "template",
  //   template: {
  //     name: "hello_world",
  //     language: { code: "en_US" }
  //   }
  // };

  //   try {
  //     await axios.post(whatsappUrl, messageData, {
  //       headers: { 
  //         'Authorization': `Bearer ${token}`,
  //         'Content-Type': 'application/json'
  //       }
  //     });
  //     console.log('WhatsApp sent to:', customerPhone);
  //   } catch (err) {
  //     console.error('WhatsApp error:', err.response?.data || err.message);
  //   }
  // }
  // 👆 WHATSAPP CODE END 👆

  res.json(updatedOrder)
}))


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

// @desc    Create Stripe checkout session
// @route   POST /api/orders/create-checkout-session
// @access  Private
router.post('/create-checkout-session', protect, asyncHandler(async (req, res) => {
  const { orderItems, shippingAddress } = req.body

  if (!orderItems || orderItems.length === 0) {
    res.status(400)
    throw new Error('No order items')
  }

  // 1. SECURITY: Get products from DB + use DB prices only
  const itemsFromDB = await Product.find({
    _id: { $in: orderItems.map(x => x.product) },
  })

  const dbProductIds = itemsFromDB.map(p => p._id.toString())
  const missingProducts = orderItems.filter(
    item => !dbProductIds.includes(item.product)
  )

  if (missingProducts.length > 0) {
    console.log('Missing product IDs:', missingProducts.map(i => i.product))
    res.status(404)
    throw new Error('Product not found')
  }


  const productMap = new Map(itemsFromDB.map(p => [p._id.toString(), p]));

 const dbOrderItems = orderItems.map((itemFromClient) => {
  const matchingItemFromDB = productMap.get(itemFromClient.product);

  // V24.1 KEY: Read from variants[0].colors
  const variantDoc = matchingItemFromDB.variants?.find(
    v => v.storage === (itemFromClient.storage || itemFromClient.variant)
  );
  if (!variantDoc) {
    res.status(400);
    throw new Error(`Variant "${itemFromClient.variant}" not available`);
  }

  const colorVariant = variantDoc.colors?.find(
    (c) => c.name === itemFromClient.color
  );
  if (!colorVariant) {
    res.status(400);
    throw new Error(`Color "${itemFromClient.color}" not available for ${matchingItemFromDB.name}`);
  }

  return {
    name: matchingItemFromDB.name,
    qty: itemFromClient.qty,
    image: colorVariant.images?.[0]?.url || '', // V24.1: First image
    price: colorVariant.price, // V24.1: from nested color
    product: itemFromClient.product,
    color: itemFromClient.color,
    storage: itemFromClient.storage,
    slug: matchingItemFromDB.slug,
  };
});

  // 2. Calculate prices - we still save shipping/tax to DB for records
  const { itemsPrice, shippingPrice, taxPrice, totalPrice } = calcPrices(
    dbOrderItems,
    shippingAddress.country
  )

  // 3. Set currency dynamically for Stripe

  //const currency = shippingAddress.country === 'PK' ? 'pkr' : 'usd'
  const currency = 'usd' // Always USD

  // 4. Create order in DB - keep shipping/tax for your records
  const order = await Order.create({
    user: req.user._id,
    orderItems: dbOrderItems,
    shippingAddress,
    paymentMethod: 'Stripe',
    itemsPrice,
    taxPrice, // Saved to DB but not charged on Stripe
    shippingPrice, // Saved to DB but not charged on Stripe
    totalPrice,
    currency: currency.toUpperCase(),
    isPaid: false,
  })

  // 5. Send "Order Received" email
  try {
    const user = await User.findById(req.user._id)
    await sendEmail({
      email: user.email,
      subject: `Order #${order._id.toString().slice(-6)} Received - Complete Payment`,
      html: `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
    <h2>Thanks for your order, ${user.name}</h2>
    <p>We've received your order. Complete payment to confirm it.</p>

    <h3>Order ID: ${order._id.toString().slice(-6)}</h3>
    
    <h3>Items:</h3>  <!-- V21.6 KEY: ADD THIS TABLE -->
    ${order.orderItems.map(item => `
      <div style="display:flex;align-items:center;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:10px">
        <img src="${process.env.CLIENT_URL}${item.image}" width="60" style="border-radius:6px;margin-right:12px"/>
        <div style="flex:1">
          <div style="font-weight:600">${item.name}</div>
          <div style="font-size:13px;color:#666">Color: ${item.color} | Storage: ${item.storage}</div>
          <div style="font-size:13px">${item.qty} x ${order.currency} ${item.price}</div>
        </div>
      </div>
    `).join('')}
    
    <p><strong>Items Total:</strong> ${order.currency} ${itemsPrice}</p>
    <p><strong>Shipping:</strong> Free</p>
    <p><strong>Tax:</strong> Not Included</p>
    <p><strong>Amount to Pay:</strong> ${order.currency} ${itemsPrice}</p>

    <p>You'll be redirected to Stripe to complete payment. Once paid, you'll get a confirmation email.</p>

    <h3>Shipping To:</h3>
    <p>
      <strong>Phone:</strong> ${shippingAddress.phone}<br/>
      ${shippingAddress.address}<br/>
      ${shippingAddress.city}, ${shippingAddress.postalCode}<br/>
      ${shippingAddress.country}
    </p>
  </div>
`
    })
    console.log('Order created email sent to:', user.email)
  } catch (error) {
    console.log('Email failed but order created:', error.message)
  }

  // 6. Create Stripe session - ONLY products, no shipping/tax
  const line_items = dbOrderItems.map(item => ({
    price_data: {
      currency: currency, // 'usd' or 'pkr'
      product_data: {
        name: `${item.name} - ${item.color} ${item.storage}`,
        images: [item.image],
      },
      unit_amount: Math.round(item.price * 100), // Only product price
    },
    quantity: item.qty,
  }))

  // REMOVED: shipping and tax line items

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items, // Only products now
    mode: 'payment',
    success_url: `${process.env.FRONTEND_URL}/order-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/cart`,
    customer_email: req.user.email,
    metadata: { orderId: order._id.toString() },
    payment_intent_data: {
      metadata: { orderId: order._id.toString() }
    }
  })

  res.json({ url: session.url })
}))


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

//                 <a href="${process.env.FRONTEND_URL}/order/${order._id}" 
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


router.get('/verify-session/:sessionId', protect, asyncHandler(async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId)

    if (session.payment_status === 'paid') {
      // FIX 1: Add .populate to get user email/name
      const order = await Order.findById(session.metadata.orderId).populate('user', 'name email')

      // FIX 2: Changed to !order
      if (!order) {
        return res.status(404).json({ message: 'Order not found' })
      }

      // Prevent double updates
      if (order.isPaid) {
        return res.json(order)
      }

      // Get email from Stripe - v12+ uses customer_details.email
      const customerEmail = session.customer_details?.email || session.customer_email

      order.isPaid = true
      order.paidAt = Date.now()
      order.paymentResult = {
        id: session.id,
        status: session.payment_status,
        update_time: new Date().toISOString(),
        email_address: customerEmail,
      }

      const updatedOrder = await order.save()

      // FIX 3: SEND "PAYMENT SUCCESSFUL" EMAIL
      await sendEmail({
        to: order.user.email,
        subject: `Payment Successful - Order ${order._id} | PhoneStore`,
        text: `Hi ${order.user.name},\n\nYour payment was successful!\n\nOrder ID: ${order._id}\nTotal Paid: $${order.totalPrice}\n\nWe'll ship your items soon. You can track your order here: ${process.env.CLIENT_URL}/order/${order._id}\n\nThanks for shopping with PhoneStore!`,
      })

      // Clear user's cart in MongoDB after successful payment
      await User.findByIdAndUpdate(order.user._id, { cartItems: [] })

      res.json(updatedOrder)
    } else {
      res.status(400).json({ message: 'Payment not completed' })
    }
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}))



module.exports = router;
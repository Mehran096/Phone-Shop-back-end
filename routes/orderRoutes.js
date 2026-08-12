const express = require('express');
const mongoose = require('mongoose')
const Order = require('../models/orderModel.js');
const User = require('../models/User');
const Product = require('../models/Product.js')
const Accessory = require('../models/Accessory.js')
const sendEmail = require('../utils/sendEmail.js')
const { calcPrices } = require('../utils/calcPrices')
const { protect, admin } = require('../middleware/auth.js'); // <-- Add this
const asyncHandler = require('express-async-handler');
const router = express.Router();
//import Stripe from 'stripe'
const Stripe = require('stripe');
const axios = require('axios');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)




// @desc Create new order - COD
// @route POST /api/orders
// @access Private
router.post('/', protect, asyncHandler(async (req, res) => {
  const { orderItems, shippingAddress, paymentMethod } = req.body

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

  // V20.0 FIX: Allow both product and accessory
  const validOrderItems = orderItems.filter((x) => x.product != null)
  if (validOrderItems.length === 0) {
    res.status(400)
    throw new Error('All items in cart were deleted')
  }

  // V20.0 FIX: Map items and set product OR accessory ref + variant fields
  const dbOrderItems = validOrderItems.map((itemFromClient) => ({
    name: itemFromClient.name,
    qty: itemFromClient.qty,
    image: itemFromClient.image,
    price: Number(itemFromClient.price),
    originalPrice: Number(itemFromClient.originalPrice),
    discountAmount: Number(itemFromClient.discountAmount || 0),
    color: itemFromClient.color,
    storage: itemFromClient.storage,
    slug: itemFromClient.slug,

    // NEW: Smart Link fields
    variantType: itemFromClient.variantType || 'product', // 'product' or 'accessory'
    variantName: itemFromClient.variantName,
    variantSubName: itemFromClient.variantSubName,
    model: itemFromClient.model,
    sku: itemFromClient.sku,

    // REFERENCE LOGIC: save to correct field
    product: itemFromClient.variantType === 'accessory' ? undefined : itemFromClient.product,
    accessory: itemFromClient.variantType === 'accessory' ? itemFromClient.product : undefined,
  }))

  // 4. Calculate everything server-side - UPDATED
  const { itemsPrice, taxPrice, shippingPrice, totalPrice } =
    calcPrices(dbOrderItems, shippingAddress, paymentMethod) // <-- now uses new version

  const currency = 'usd' // <-- Set manually, add to DB

  const order = new Order({
    orderItems: dbOrderItems,
    user: req.user._id,
    shippingAddress,
    paymentMethod,
    itemsPrice,
    taxPrice,
    shippingPrice,
    totalPrice,
    currency,
    isPaid: false,
  })

  const createdOrder = await order.save()

  // Clear cart for both COD and Stripe
  await User.findByIdAndUpdate(req.user._id, { cartItems: [] })

  // 5. Send "Order Received" email
  try {
    const user = await User.findById(req.user._id)
    await sendEmail({
      email: user.email,
      subject: `Order #${createdOrder._id.toString().slice(-6)} Received`,
      html: `
      <!DOCTYPE html>
      <html>
      <body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, sans-serif">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4">
          <tr>
            <td align="center" style="padding:20px 0">
              <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:8px">
                <tr>
                  <td style="padding:24px">
                    <h2 style="margin:0 0 12px; font-size:22px; color:#111">Thanks for your order, ${user.name}</h2>
                    <p style="margin:0 0 20px; font-size:14px; color:#555">We've received your ${paymentMethod} order and will process it shortly.</p>

                    <h3 style="margin:0 0 12px; font-size:16px; color:#111">Order ID: ${createdOrder._id.toString().slice(-6)}</h3>

                    <h3 style="margin:20px 0 12px; font-size:16px; color:#111">Items:</h3>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${createdOrder.orderItems.map(item => `
                        <tr style="border-bottom:1px solid #eee">
                          <td style="padding:12px 0; vertical-align:top; width:70px">
                            <img src="${item.image.startsWith('http') ? item.image : `${process.env.FRONTEND_URL || 'https://phone-store.asia'}${item.image}`}" width="60" height="60" style="display:block; border-radius:6px; border:1px solid #f3f3f3" />
                          </td>
                          <td style="padding:12px 0 12px 12px; vertical-align:top">
                            <div style="font-weight:600; font-size:14px; color:#111; line-height:1.4">${item.name}</div>
                            <div style="font-size:13px; color:#666; margin-top:4px">
                              ${item.model ? `Model: ${item.model} | ` : ''}
                              ${item.variantSubName ? `${item.variantSubName} | ` : ''}
                              Color: ${item.color} ${item.storage ? `| Storage: ${item.storage}` : ''}
                            </div>
                            <div style="font-size:13px; margin-top:4px; color:#111">
                              ${item.qty} x ${createdOrder.currency} ${Number(item.price).toFixed(2)}
                            </div>
                          </td>
                        </tr>
                      `).join('')}
                    </table>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px">
                      <tr><td style="padding:8px 0;font-size:14px;"><strong>Items:</strong></td><td align="right">${createdOrder.currency} ${createdOrder.itemsPrice.toFixed(2)}</td></tr>
                      <tr><td style="padding:8px 0;font-size:14px;"><strong>Shipping:</strong></td><td align="right">${createdOrder.currency} ${createdOrder.shippingPrice.toFixed(2)}</td></tr>
                      <tr><td style="padding:8px 0;font-size:14px;"><strong>Tax:</strong></td><td align="right">${createdOrder.currency} ${createdOrder.taxPrice.toFixed(2)}</td></tr>
                      <tr><td style="padding:8px 0;font-size:16px;font-weight:bold;">Total:</td><td align="right" style="font-size:16px;font-weight:bold;">${createdOrder.currency} ${createdOrder.totalPrice.toFixed(2)}</td></tr>
                      <tr><td style="padding:8px 0; font-size:14px"><strong>Payment:</strong></td><td align="right" style="padding:8px 0; font-size:14px">${createdOrder.paymentMethod}</td></tr>
                    </table>

                    <h3 style="margin:20px 0 12px; font-size:16px; color:#111">Shipping To:</h3>
                    <p style="margin:0; font-size:14px; line-height:1.6; color:#333">
                      <strong>Phone:</strong> ${shippingAddress.phone}<br/>
                      ${shippingAddress.address}<br/>
                      ${shippingAddress.city}, ${shippingAddress.postalCode}<br/>
                      ${shippingAddress.country}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
      `,
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
      path: 'orderItems.product', // populate products
      select: 'name image slug' // Don't populate deleted products
    })
    .populate({
      path: 'orderItems.accessory', // populate accessories too
      select: 'name image slug'
    })
    .sort({ createdAt: -1 }) // newest first

  // Don't filter anymore. Show both products and accessories
  const safeOrders = orders.map(order => ({
    ...order.toObject(),
    orderItems: order.orderItems.map(item => {
      const populatedData = item.product || item.accessory || {}
      return {
        ...item,
        name: populatedData.name || item.name, // fallback to saved name
        image: populatedData.image || item.image,
        price: populatedData.price || item.price,
      }
    })
  }))

  res.json(safeOrders)
})

// @desc    Get ALL orders for admin dashboard stats - NO PAGINATION
// @route   GET /api/orders/all
// @access  Private/Admin
router.get('/all', protect, admin, asyncHandler(async (req, res) => {
  const orders = await Order.find({})
    .populate('user', 'id name email')
    .populate({
      path: 'orderItems.product',
      select: 'name image'
    })
    .populate({
      path: 'orderItems.accessory',
      select: 'name image'
    })
    .sort({ createdAt: -1 })

  // Same merge logic as your paginated route so frontend gets name/image even if deleted
  const safeOrders = orders.map(order => ({
    ...order.toObject(),
    orderItems: order.orderItems.map(item => {
      const populatedData = item.product || item.accessory || {}
      return {
        ...item,
        name: populatedData.name || item.name,
        image: populatedData.image || item.image,
        price: populatedData.price || item.price,
      }
    })
  }))

  res.json(safeOrders)
}))

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email')
    .populate({
      path: 'orderItems.product', // populate products
      select: 'name image price colors slug'
    })
    .populate({
      path: 'orderItems.accessory', // populate accessories too
      select: 'name image price slug'
    })

  if (order) {
    // FIX: Merge populated data + Force all numbers for old orders
    const safeOrder = {
      ...order.toObject(),
      orderItems: order.orderItems.map(item => {
        const populatedData = item.product || item.accessory || {}

        // Priority: 1. Saved DB value 2. Populated value 3. Fallback
        const price = Number(item.price) || Number(populatedData.price) || 0
        const qty = Number(item.qty) || 1
        const originalPrice = Number(item.originalPrice) || price
        const discountAmount = Number(item.discountAmount) || 0

        return {
          ...item.toObject(),
          name: populatedData.name || item.name, // fallback to saved name
          image: populatedData.image || item.image,
          slug: populatedData.slug || item.slug,

          // FORCE NUMBERS
          price,
          qty,
          originalPrice,
          discountAmount,
        }
      }),
      // FORCE NUMBERS ON ORDER TOTALS TOO
      itemsPrice: Number(order.itemsPrice) || 0,
      taxPrice: Number(order.taxPrice) || 0,
      shippingPrice: Number(order.shippingPrice) || 0,
      totalPrice: Number(order.totalPrice) || 0,
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
// router.put('/:id/pay', protect, asyncHandler(async (req, res) => {
//   const order = await Order.findById(req.params.id).populate('user', 'name email')

//   if (order) {
//     if (order.isPaid) {
//       res.status(400)
//       throw new Error('Order is already paid')
//     }

//     order.isPaid = true
//     order.paidAt = Date.now()
//     order.paymentResult = {
//       id: req.body.id || '',
//       status: req.body.status || 'succeeded',
//       update_time: req.body.update_time || new Date().toISOString(),
//       email_address: req.body.email_address || order.user.email,
//     }

//     const updatedOrder = await order.save()

//     // Send "Payment Confirmed" email
//     try {
//       await sendEmail({
//         email: order.user.email,
//         subject: `Payment Confirmed - Order #${order._id.toString().slice(-6)}`,
//         html: `
//           <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
//             <h2>Payment Received, ${order.user.name}!</h2>
//             <p>Your payment of <strong>${order.currency} ${order.totalPrice}</strong> for Order #${order._id.toString().slice(-6)} was successful.</p>

//             <h3>What's Next?</h3>
//             <p>We're now preparing your items for shipment. You'll receive another email with tracking info once it ships.</p>

//             <h3>Order Details</h3>
//             <p><strong>Items:</strong> ${order.orderItems.length}</p>
//             <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>

//             <h3>Shipping To:</h3>
//             <p>
//               <strong>Phone:</strong> ${order.shippingAddress.phone}<br/>
//               ${order.shippingAddress.address}<br/>
//               ${order.shippingAddress.city}, ${order.shippingAddress.postalCode}<br/>
//               ${order.shippingAddress.country}
//             </p>

//             <a href="${process.env.FRONTEND_URL}/order/${order._id}"
//                style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-top:16px">
//                Track Your Order
//             </a>
//           </div>
//         `,
//       })
//       console.log('Payment email sent to:', order.user.email)
//     } catch (error) {
//       console.log('Payment email failed:', error.message)
//     }

//     res.json(updatedOrder)
//   } else {
//     res.status(404)
//     throw new Error('Order not found')
//   }
// }))

// @desc    Update order to shipped - Admin adds tracking
// @route   PUT /api/orders/:id/markasShipped
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
          
          <p style="margin-top:20px;"><strong>Total: ${order.currency} ${order.totalPrice.toFixed(2)}</strong></p>
          
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

  // Mark COD as paid on delivery + Update Sales
  if (order.paymentMethod === 'COD' && !order.isPaid) {
    order.isPaid = true
    order.paidAt = Date.now()

    // NEW: INCREASE allSales FOR PRODUCTS AND ACCESSORIES
    for (const item of order.orderItems) {
      if (item.product) { // It's a product
        await Product.findByIdAndUpdate(item.product, {
          $inc: { allSales: item.qty }
        })
      }
      if (item.accessory) { // It's an accessory
        await Accessory.findByIdAndUpdate(item.accessory, {
          $inc: { allSales: item.qty }
        })
      }
    }
  }

  // === NEW: INCREMENT FREQUENTLY BOUGHT TOGETHER ===
  const productsInOrder = order.orderItems.filter(i => i.product).map(i => i.product)
  const accessoriesInOrder = order.orderItems.filter(i => i.accessory).map(i => i.accessory)

  for (const productId of productsInOrder) {
    for (const accessoryId of accessoriesInOrder) {
      await Product.findOneAndUpdate(
        { _id: productId, "frequentlyBoughtWith.accessory": accessoryId },
        { $inc: { "frequentlyBoughtWith.$.count": 1 } }
      )

      // If FBT pair doesn't exist yet, push it
      await Product.findOneAndUpdate(
        { _id: productId, "frequentlyBoughtWith.accessory": { $ne: accessoryId } },
        { $push: { frequentlyBoughtWith: { accessory: accessoryId, count: 1 } } }
      )
    }
  }
  // === END FBT ===

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
          
          <p style="margin-top:20px;"><strong>Total: ${order.currency} ${order.totalPrice.toFixed(2)}</strong></p>
          
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
 

// @desc    Get all orders
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
        { user: { $in: userIds } }, // Search by user if name matches
        ...(isValidObjectId ? [{ _id: keyword }] : []) // Search by _id only if it's a valid ObjectId
      ]
    }
  }

  const count = await Order.countDocuments(query)

  const orders = await Order.find(query)
    .populate('user', 'id name email')
    .populate({
      path: 'orderItems.product',
      select: 'name image'
    })
    .populate({
      path: 'orderItems.accessory',
      select: 'name image'
    })
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .sort({ createdAt: -1 })

  // Merge populated data so frontend gets name/image even if product was deleted
  const safeOrders = orders.map(order => ({
    ...order.toObject(),
    orderItems: order.orderItems.map(item => {
      const populatedData = item.product || item.accessory || {}
      return {
        ...item,
        name: populatedData.name || item.name,
        image: populatedData.image || item.image,
        price: populatedData.price || item.price,
      }
    })
  }))

  res.json({ orders: safeOrders, page, pages: Math.ceil(count / pageSize) })
}))



// @desc    DELETE last 200 orders - admin only
// @route   DELETE /api/orders/bulk-delete
// @access  Private/Admin
// router.delete('/bulk-delete', protect, admin, asyncHandler(async (req, res) => {
//   // Block demo admin
//   const isDemoAdmin = req.user.email === 'demo@phonestore.com'
//   if (isDemoAdmin) {
//     res.status(403)
//     throw new Error('Demo accounts have read-only access. Contact developer for full admin demo.')
//   }

//   // 1. Get ALL orders - remove .limit(200) if you want to delete remaining
// const ordersToDelete = await Order.find({})
//   .sort({ createdAt: -1 })

// if (ordersToDelete.length === 0) {
//   res.status(404)
//   throw new Error('No orders found')
// }

// // 2. Revert allSales SAFELY - never goes below 0
// for (const order of ordersToDelete) {
//   for (const item of order.orderItems) {
//     if (item.accessory) {
//       await Accessory.updateOne(
//         { _id: item.accessory },
//         [{ $set: { allSales: { $max: [0, { $subtract: ["$allSales", item.qty] }] } }}]
//       )
//     }
//     if (item.product) {
//       await Product.updateOne(
//         { _id: item.product },
//         [{ $set: { allSales: { $max: [0, { $subtract: ["$allSales", item.qty] }] } }}]
//       )
//     }
//   }
// }

// // 3. Delete the orders
// const ids = ordersToDelete.map(o => o._id)
// const result = await Order.deleteMany({ _id: { $in: ids } })

// res.json({ message: `Successfully deleted ${result.deletedCount} orders and sales reverted` })
// }))

// @desc    Cancel/Refund order - Admin
// @route   PUT /api/orders/:id/cancel
// @access  Private/Admin
router.put('/:id/cancel', protect, admin, asyncHandler(async (req, res) => {
  const { cancelReason, cancelCode } = req.body || {}

  const order = await Order.findById(req.params.id).populate('user', 'name email')

  if (!order) {
    res.status(404)
    throw new Error('Order not found')
  }

  if (order.isCancelled) {
    res.status(400)
    throw new Error('Order already cancelled')
  }

  // RULE 1: Block non-COD orders if already delivered
  if (order.isDelivered && order.paymentMethod !== 'COD') {
    res.status(400)
    throw new Error('Cannot cancel delivered order. Use return/refund instead')
  }

  // RULE 2: Block COD orders if NOT delivered yet
  if (!order.isDelivered && order.paymentMethod === 'COD') {
    res.status(400)
    throw new Error('Cannot cancel COD order before delivery')
  }

  order.isCancelled = true
  order.cancelledAt = Date.now()
  order.cancelReason = cancelReason || 'Cancelled by admin'
  order.cancelCode = cancelCode || 'ADMIN_CANCEL_COD'

  // KEY: DECREASE allSales FOR PRODUCTS AND ACCESSORIES
  for (const item of order.orderItems) {
    if (item.product) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { allSales: -item.qty }
      })
    }
    if (item.accessory) {
      await Accessory.findByIdAndUpdate(item.accessory, {
        $inc: { allSales: -item.qty }
      })
    }
  }

  // === DECREMENT FREQUENTLY BOUGHT TOGETHER ===
  const productsInOrder = order.orderItems.filter(i => i.product).map(i => i.product)
  const accessoriesInOrder = order.orderItems.filter(i => i.accessory).map(i => i.accessory)

  for (const productId of productsInOrder) {
    for (const accessoryId of accessoriesInOrder) {
      await Product.updateOne(
        { _id: productId, "frequentlyBoughtWith.accessory": accessoryId },
        { $inc: { "frequentlyBoughtWith.$.count": -1 } }
      )
    }
  }

  // Safety: remove any FBT with count <= 0
  await Product.updateMany(
    {},
    { $pull: { frequentlyBoughtWith: { count: { $lte: 0 } } } }
  )
  // === END FBT ===

  // Safety: reset any negatives to 0
  await Accessory.updateMany({ allSales: { $lt: 0 } }, { $set: { allSales: 0 } })
  await Product.updateMany({ allSales: { $lt: 0 } }, { $set: { allSales: 0 } })

  // If it was paid, mark as refunded
  if (order.isPaid) {
    order.isRefunded = true
    order.refundedAt = Date.now()
    order.refundAmount = order.totalPrice
  }

  const updatedOrder = await order.save()

  // Send cancel email with reason
  try {
    await sendEmail({
      email: order.user.email,
      subject: `Order #${order._id.toString().slice(-6)} Cancelled`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
          <h2>Order Cancelled, ${order.user.name}</h2>
          <p>Your order #${order._id.toString().slice(-6)} has been cancelled.</p>
          <p><strong>Reason:</strong> ${order.cancelReason}</p>
          ${order.isPaid ? `<p>Refund will be processed in 3-5 business days.</p>` : `<p>No payment was made for COD order.</p>`}
          <p><strong>Total:</strong> ${order.currency} ${order.totalPrice.toFixed(2)}</p>
        </div>
      `,
    })
  } catch (error) {
    console.log('Cancel email failed:', error.message)
  }

  res.json({ message: 'Order cancelled and sales reverted', order: updatedOrder })
}))

// @desc    DELETE order
// @route   DELETE /api/orders/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, asyncHandler(async (req, res) => {
  // Block demo admin from destructive actions
  const isDemoAdmin = req.user.email === 'demo@phonestore.com'
  if (isDemoAdmin) {
    res.status(403)
    throw new Error('Demo accounts have read-only access. Contact developer for full admin demo.')
  }

  const order = await Order.findById(req.params.id)

  if (order) {
    // === KEY FIX: DECREMENT allSales SAFELY BEFORE DELETING ===
    for (const item of order.orderItems) {
      if (item.accessory) {
        await Accessory.updateOne(
          { _id: item.accessory },
          { $inc: { allSales: -item.qty } }
        )
      }
      if (item.product) {
        await Product.updateOne(
          { _id: item.product },
          { $inc: { allSales: -item.qty } }
        )
      }
    }

    // Safety: reset any negatives to 0 after decrement
    await Accessory.updateMany({ allSales: { $lt: 0 } }, { $set: { allSales: 0 } })
    await Product.updateMany({ allSales: { $lt: 0 } }, { $set: { allSales: 0 } })

    await order.deleteOne()
    res.json({ message: 'Order removed and sales reverted' })
  } else {
    res.status(404)
    throw new Error('Order not found')
  }
}))




// @desc Create Stripe checkout session
// @route POST /api/orders/create-checkout-session
// @access Private
router.post('/create-checkout-session', protect, asyncHandler(async (req, res) => {
  const { orderItems, shippingAddress } = req.body

  if (!orderItems || orderItems.length === 0) {
    res.status(400)
    throw new Error('No order items')
  }

  // V20.0 FIX: SECURITY: Get products AND accessories from DB + use DB prices only
  const productIds = orderItems.filter(i => i.variantType !== 'accessory').map(x => x.product)
  const accessoryIds = orderItems.filter(i => i.variantType === 'accessory').map(x => x.product)

  const itemsFromDB = await Product.find({ _id: { $in: productIds } })
  const accessoriesFromDB = await Accessory.find({ _id: { $in: accessoryIds } })

  const allDbItems = [...itemsFromDB, ...accessoriesFromDB]
  const dbItemIds = allDbItems.map(p => p._id.toString())

  const missingItems = orderItems.filter(item => !dbItemIds.includes(item.product))
  if (missingItems.length > 0) {
    console.log('Missing item IDs:', missingItems.map(i => i.product))
    res.status(404)
    throw new Error('Product/Accessory not found')
  }

  const itemMap = new Map(allDbItems.map(p => [p._id.toString(), p]));

  const dbOrderItems = orderItems.map((itemFromClient) => {
    const matchingItemFromDB = itemMap.get(itemFromClient.product);
    if (!matchingItemFromDB) {
      res.status(400);
      throw new Error(`Item not found`);
    }

    const isAccessory = itemFromClient.variantType === 'accessory';

    let image = itemFromClient.image;
    let price = Number(itemFromClient.price);
    if (!isAccessory) {
      const variantDoc = matchingItemFromDB.variants?.find(
        v => v.storage === (itemFromClient.storage || itemFromClient.variant)
      );
      if (!variantDoc) {
        res.status(400);
        throw new Error(`Variant "${itemFromClient.storage}" not available`);
      }
      const colorVariant = variantDoc.colors?.find(c => c.name === itemFromClient.color);
      if (!colorVariant) {
        res.status(400);
        throw new Error(`Color "${itemFromClient.color}" not available`);
      }
      image = colorVariant.images?.[0]?.url || image;
    }

    return {
      name: matchingItemFromDB.name,
      qty: itemFromClient.qty,
      image: image,
      price: price,
      originalPrice: Number(itemFromClient.originalPrice),
      discountAmount: Number(itemFromClient.discountAmount || 0),
      color: itemFromClient.color,
      storage: itemFromClient.storage,
      slug: matchingItemFromDB.slug,
      variantType: itemFromClient.variantType || 'product',
      variantName: itemFromClient.variantName,
      variantSubName: itemFromClient.variantSubName,
      model: itemFromClient.model,
      sku: itemFromClient.sku,
      product: isAccessory ? undefined : itemFromClient.product,
      accessory: isAccessory ? itemFromClient.product : undefined,
    };
  });

  // 2. Calculate prices - UPDATED
  const { itemsPrice, shippingPrice, taxPrice, totalPrice } = calcPrices(
    dbOrderItems,
    shippingAddress,
    'Stripe'
  )

  const currency = 'usd'

  // 3. Create order in DB
  const order = await Order.create({
    user: req.user._id,
    orderItems: dbOrderItems,
    shippingAddress,
    paymentMethod: 'Stripe',
    itemsPrice, taxPrice, shippingPrice, totalPrice,
    currency: currency.toUpperCase(),
    isPaid: false,
  })

  // 4. Send "Order Received" email
  try {
    const user = await User.findById(req.user._id)

    const itemsHtml = dbOrderItems.map(item => {
      const imgSrc = item.image?.startsWith('http')
        ? item.image
        : `${process.env.FRONTEND_URL || 'https://phone-store.asia'}${item.image || ''}`

      return `
      <div style="display:flex;align-items:center;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:10px">
        <img src="${imgSrc}" width="60" style="border-radius:6px;margin-right:12px"/>
        <div style="flex:1">
          <div style="font-weight:600">${item.name}</div>
          <div style="font-size:13px;color:#666">
            ${item.model ? `Model: ${item.model} | ` : ''}
            ${item.variantSubName ? `${item.variantSubName} | ` : ''}
            Color: ${item.color || 'N/A'} ${item.storage ? `| Storage: ${item.storage}` : ''}
          </div>
          <div style="font-size:13px">${item.qty} x ${order.currency} ${item.price.toFixed(2)}</div>
        </div>
      </div>
      `
    }).join('')

    await sendEmail({
      email: user.email,
      subject: `Order #${order._id.toString().slice(-6)} Received - Complete Payment`,
      html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
        <h2>Thanks for your order, ${user.name}</h2>
        <p>We've received your order. Complete payment to confirm it.</p>
        <h3>Order ID: ${order._id.toString().slice(-6)}</h3>
        <h3>Items:</h3>
        ${itemsHtml}
        <p><strong>Items Total:</strong> ${order.currency} ${itemsPrice.toFixed(2)}</p>
        <p><strong>Shipping:</strong> ${order.currency} ${shippingPrice.toFixed(2)}</p>
        <p><strong>Tax:</strong> ${order.currency} ${taxPrice.toFixed(2)}</p>
        <p><strong>Amount to Pay:</strong> ${order.currency} ${totalPrice.toFixed(2)}</p>
        <h3>Shipping To:</h3>
        <p>
          <strong>Phone:</strong> ${shippingAddress.phone}<br/>
          ${shippingAddress.address}<br/>
          ${shippingAddress.city}, ${shippingAddress.postalCode}<br/>
          ${shippingAddress.country}
        </p>
      </div>`
    })
    console.log('Order created email sent to:', user.email)
  } catch (error) {
    console.log('Email failed but order created:', error.message)
  }

  // 5. Create Stripe session
  const line_items = dbOrderItems.map(item => ({
    price_data: {
      currency: currency,
      product_data: {
        name: `${item.name} ${item.model ? `for ${item.model}` : ''} (${item.color} ${item.variantSubName || item.storage || ''})`,
        images: [item.image],
      },
      unit_amount: Math.round(item.price * 100),
    },
    quantity: item.qty,
  }))

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items,
    mode: 'payment',
    success_url: `${process.env.FRONTEND_URL}/order-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/cart`,
    customer_email: req.user.email,
    metadata: { orderId: order._id.toString() },
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
      // 1. Get order + populate user
      const order = await Order.findById(session.metadata.orderId).populate('user', 'name email')

      if (!order) {
        return res.status(404).json({ message: 'Order not found' })
      }


      // 2. NEW: INCREASE allSales FOR PRODUCTS AND ACCESSORIES
      // for (const item of order.orderItems) {
      //   if (item.product) { // It's a product
      //     await Product.findByIdAndUpdate(item.product, {
      //       $inc: { allSales: item.qty }
      //     })
      //   }
      //   if (item.accessory) { // It's an accessory
      //     await Accessory.findByIdAndUpdate(item.accessory, {
      //       $inc: { allSales: item.qty }
      //     })
      //   }
      // }

      // 3. Prevent double updates
      if (order.isPaid) {
        return res.json(order)
      }



      // 4. Get email from Stripe
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

      // 5. SEND "PAYMENT SUCCESSFUL" EMAIL - FIXED PAYLOAD
      await sendEmail({
        email: order.user.email, // <-- was 'to'
        subject: `Payment Successful - Order #${order._id.toString().slice(-6)} | PhoneStore`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
          <h2>Payment Received, ${order.user.name} 🎉</h2>
          <p>Your payment was successful. We're preparing your order now.</p>
          <h3>Order ID: ${order._id.toString().slice(-6)}</h3>
          <p><strong>Total Paid:</strong> ${order.currency} ${order.totalPrice.toFixed(2)}</p>
          <p><strong>Payment Method:</strong> Stripe</p>
          <p>Track your order here: <a href="${process.env.FRONTEND_URL}/order/${order._id}">${process.env.FRONTEND_URL}/order/${order._id}</a></p>
          <p>Thanks for shopping with PhoneStore!</p>
        </div>`
      })

      // 6. Clear user's cart in MongoDB after successful payment
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
const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
const cors = require('cors');
const connectDB = require('./config/db'); // we’ll make this
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const cookieParser = require('cookie-parser');
const jazzcashRoutes = require('./routes/jazzcashRoutes.js');
const multer = require('multer') 
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const { cloudinary } = require('./utils/cloudinary') 
const orderRoutes = require('./routes/orderRoutes'); 
const contactRoutes = require('./routes/contactRoutes.js');
const uploadRoutes = require('./routes/uploadRoutes.js');
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const Order = require('./models/orderModel.js');
  const adminRoutes = require('./routes/adminRoutes')
  const sendEmail = require( './utils/sendEmail.js')
connectDB(); // Connect to MongoDB Atlas

const app = express();
 
// console.log('Using url:', process.env.FRONTEND_URL)
// console.log('SMTP_HOST:', process.env.SMTP_HOST)
// 1. Put webhook route BEFORE express.json()
//app.use('/api/orders/webhook', express.raw({type: 'application/json'}), orderRoutes)
app.post('/api/orders/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']
  let event

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.log('Webhook signature verification failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  // Respond immediately so Stripe doesn't timeout
  res.status(200).send('ok')

  try {
    // 1. PAYMENT SUCCESS
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const orderId = session.metadata.orderId
      
      console.log('Webhook orderId from metadata:', orderId)

      // Idempotency check - skip if already paid
      const existingOrder = await Order.findById(orderId)
      if (existingOrder?.isPaid) {
        console.log('Order already paid, skipping duplicate webhook:', orderId)
        return
      }

      const order = await Order.findByIdAndUpdate(orderId, {
        isPaid: true,
        paidAt: Date.now(),
        paymentResult: {
          id: session.payment_intent,
          status: session.payment_status,
          update_time: new Date().toISOString(),
          email_address: session.customer_details?.email,
        },
        itemsPrice: (session.amount_subtotal || 0) / 100,
        taxPrice: (session.total_details?.amount_tax || 0) / 100,
        shippingPrice: (session.total_details?.amount_shipping || 0) / 100,
        totalPrice: (session.amount_total || 0) / 100,
      }, { returnDocument: 'after' }).populate('user', 'name email')

      console.log('Order updated:', order?._id)

      if (order && order.user?.email) {
        console.log('Order found. User email:', order.user.email)
        try {
          await sendEmail({
            email: order.user.email,
            subject: `Payment Confirmed - Order #${order._id}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
                <h2>Payment Received, ${order.user.name}</h2>
                <p>Your payment of <strong>$${order.totalPrice}</strong> for Order #${order._id} was successful.</p>
                <h3>What's Next?</h3>
                <p>We're now preparing your items for shipment. You'll receive another email when it ships.</p>
                <a href="${process.env.CLIENT_URL}/order/${order._id}"
                   style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-top:16px">
                   Track Your Order
                </a>
              </div>
            `,
          })
          console.log('Payment confirmation email sent:', order.user.email)
        } catch (emailError) {
          console.log('Payment email failed:', emailError.message)
        }
      }
    }

    // 2. PAYMENT FAILED
    else if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object
      const orderId = session.metadata.orderId
      
      console.log('Payment failed for orderId:', orderId)
      
      const order = await Order.findById(orderId).populate('user', 'name email')
      
      if (order && order.user?.email) {
        try {
          await sendEmail({
            email: order.user.email,
            subject: `Payment Failed - Order #${order._id}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
                <h2>Payment Failed</h2>
                <p>Hi ${order.user.name}, your payment for Order #${order._id} didn't go through.</p>
                <p>This can happen if your bank declined the charge or there were insufficient funds.</p>
                <a href="${process.env.CLIENT_URL}/order/${order._id}"
                   style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-top:16px">
                   Try Payment Again
                </a>
              </div>
            `
          })
          console.log('Payment failed email sent:', order.user.email)
        } catch (emailError) {
          console.log('Failed payment email error:', emailError.message)
        }
      }
    }

    // 3. REFUND PROCESSED
    else if (event.type === 'charge.refunded') {
      const charge = event.data.object
      const paymentIntentId = charge.payment_intent
      
      console.log('Refund for payment_intent:', paymentIntentId)
      
      const order = await Order.findOne({ 'paymentResult.id': paymentIntentId }).populate('user', 'name email')
      
      if (order) {
        order.isRefunded = true
        order.refundedAt = Date.now()
        await order.save()
        
        if (order.user?.email) {
          try {
            await sendEmail({
              email: order.user.email,
              subject: `Refund Processed - Order #${order._id}`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
                  <h2>Refund Processed</h2>
                  <p>Hi ${order.user.name}, your refund of <strong>$${(charge.amount_refunded / 100).toFixed(2)}</strong> for Order #${order._id} has been processed.</p>
                  <p>It may take 5-10 business days to appear on your statement.</p>
                </div>
              `
            })
            console.log('Refund email sent:', order.user.email)
          } catch (emailError) {
            console.log('Refund email error:', emailError.message)
          }
        }
      } else {
        console.log('Order not found for refunded payment_intent:', paymentIntentId)
      }
    }

  } catch (err) {
    console.error('Webhook handler failed:', err)
    // Don't send res here - Stripe already got 200
  }
})

// Middleware
app.use(cors({
  origin: ['https://phone-store.asia', 'https://www.phone-store.asia', 'https://phone-shop-front-end-woad.vercel.app', 'http://localhost:5173'],
   credentials: true  
}));

app.use(express.json()); // Body parser
app.use(express.urlencoded({ extended: true }))
//app.use('/api/jazzcash', jazzcashRoutes)

// Routes
app.get('/', (req, res) => {
  res.send('Phone Store API is running...');
});

app.use(cookieParser());
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);

app.use('/api/orders', orderRoutes);
app.use('/api/contact', contactRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/upload', uploadRoutes);

// Error handling middleware - must be last
app.use(notFound);
app.use(errorHandler);
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('MULTER ERROR:', err)
    return res.status(400).json({ message: err.message })
  }
  next(err)
})

//multer error
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  
  console.error('UPLOAD ERROR:', err)
  if (err) {
    return res.status(400).json({ message: err.message })
  }
  next(err)
})


app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err); // skip if response already sent
  }
  
  console.error('ERROR STACK:', err.stack)
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({ message: err.message })
})
// Catch multer + cloudinary errors
// app.use((err, req, res, next) => {
//   console.error('UPLOAD ERROR:', err)
//   if (err) {
//     return res.status(400).json({ message: err.message })
//   }
//   next(err)
// })
// app.use((err, req, res, next) => {
//   console.error('ERROR STACK:', err.stack)  // <-- this line is critical
//   res.status(500).json({ message: err.message })
// })

 

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
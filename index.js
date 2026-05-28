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
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const Order = require('./models/orderModel.js');
connectDB(); // Connect to MongoDB Atlas

const app = express();
// 1. Put webhook route BEFORE express.json()
//app.use('/api/orders/webhook', express.raw({type: 'application/json'}), orderRoutes)
app.post('/api/orders/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  //console.log('Using webhook secret:', process.env.STRIPE_WEBHOOK_SECRET)
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Respond immediately so Stripe doesn't timeout
  res.status(200).send('ok');

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata.orderId;

      await Order.findByIdAndUpdate(orderId, {
        isPaid: true,
        paidAt: Date.now(),
        paymentResult: {
          id: session.payment_intent,
          status: session.payment_status,
          update_time: new Date().toISOString(),
          email_address: session.customer_email,
        },
        itemsPrice: (session.amount_subtotal || 0) / 100,
        taxPrice: (session.total_details?.amount_tax || 0) / 100,
        shippingPrice: (session.total_details?.amount_shipping || 0) / 100,
        totalPrice: (session.amount_total || 0) / 100,
      });
    }
  } catch (err) {
    console.error('Webhook DB update failed:', err);
    // Don't send res here - Stripe already got 200
  }
});

// Middleware
app.use(cors({
  origin: ['https://phone-shop-front-end-woad.vercel.app', 'http://localhost:5173'] // Vercel URL + local
}));

app.use(express.json()); // Body parser
app.use(express.urlencoded({ extended: true }))
app.use('/api/jazzcash', jazzcashRoutes)

// Routes
app.get('/', (req, res) => {
  res.send('Phone Store API is running...');
});

app.use(cookieParser());
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);

app.use('/api/orders', orderRoutes);
app.use('/api/contact', contactRoutes)

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
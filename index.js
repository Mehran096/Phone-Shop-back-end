const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
const cors = require('cors');
const connectDB = require('./config/db'); // we’ll make this
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const cookieParser = require('cookie-parser');
const jazzcashRoutes = require('./routes/jazzcashRoutes.js');
const multer = require('multer')
//import jazzcashRoutes from './routes/jazzcashRoutes.js'

//const { protect } = require('./middleware/auth.js');

const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const { cloudinary } = require('./utils/cloudinary')
 
const orderRoutes = require('./routes/orderRoutes');

console.log('Cloudinary name:', process.env.CLOUDINARY_CLOUD_NAME)
connectDB(); // Connect to MongoDB Atlas

const app = express();

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
// Catch multer + cloudinary errors
app.use((err, req, res, next) => {
  console.error('UPLOAD ERROR:', err)
  if (err) {
    return res.status(400).json({ message: err.message })
  }
  next(err)
})
app.use((err, req, res, next) => {
  console.error('ERROR STACK:', err.stack)  // <-- this line is critical
  res.status(500).json({ message: err.message })
})

 

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
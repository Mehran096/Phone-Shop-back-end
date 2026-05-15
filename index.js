const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db'); // we’ll make this
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const cookieParser = require('cookie-parser');
//const { protect } = require('./middleware/auth.js');

const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
 
const orderRoutes = require('./routes/orderRoutes');

dotenv.config();
connectDB(); // Connect to MongoDB Atlas

const app = express();

// Middleware
app.use(cors({
  origin: [process.env.CLIENT_URL, 'http://localhost:5173'] // Vercel URL + local
}));

app.use(express.json()); // Body parser
app.use(express.urlencoded({ extended: true }))

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('express-async-handler');

const protect = asyncHandler(async (req, res, next) => {
  let token

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1]
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      req.user = await User.findById(decoded.id).select('-password')
      next()
    } catch (error) {
      console.error(error)
      res.status(401)
      throw new Error('Not authorized, token failed')
    }
  }

  if (!token) {
    res.status(401)
    throw new Error('Not authorized, no token')
  }
})

// You also tried to import 'admin' on line 4, so add this too:
const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(401).json({ message: 'Not authorized as admin' });
  }
};

module.exports = { protect, admin }; // <-- Must export both







// const jwt = require('jsonwebtoken');
// const User = require('../models/User.js');
// const asyncHandler = require('express-async-handler');

// // Define protect FIRST, then export it
// const protect = asyncHandler(async (req, res, next) => {
//   let token = req.headers.authorization?.split(' ')[1];
  
//   if (token) {
//     try {
//       const decoded = jwt.verify(token, process.env.JWT_SECRET);
//       req.user = await User.findById(decoded.id).select('-password');
//       next();
//     } catch (error) {
//       res.status(401);
//       throw new Error('Not authorized, token failed');
//     }
//   } else {
//     res.status(401);
//     throw new Error('Not authorized, no token');
//   }
// });

// // Define admin SECOND
// const admin = (req, res, next) => {
//   if (req.user && req.user.isAdmin) {
//     next();
//   } else {
//     res.status(401);
//     throw new Error('Not authorized as admin');
//   }
// };

// // Export LAST - after functions are defined
// module.exports = { protect, admin };
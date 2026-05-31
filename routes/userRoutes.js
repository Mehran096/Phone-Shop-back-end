const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
//const generateToken = require('../utils/generateToken.js')
const { protect} = require('../middleware/auth.js');
const { admin } = require('../middleware/adminMiddleware');
const asyncHandler = require('express-async-handler');
 
// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });

  res.cookie('jwt', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}
// const generateToken = (res, userId) => {
//   const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
//     expiresIn: '30d',
//   });

//   res.cookie('jwt', token, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV !== 'development',
//     sameSite: 'strict',
//     maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
//   });
// };

// @desc Register user
router.post('/', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400)
    throw new Error('User already exists')
  }

  const user = await User.create({ name, email, password })

  if (user) {
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      token: generateToken(user._id), // ← THIS LINE IS MISSING
    })
  } else {
    res.status(400)
    throw new Error('Invalid user data')
  }
}))

 // @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
// router.post('/login', asyncHandler(async (req, res) => {
//   const { email, password } = req.body
//   const user = await User.findOne({ email })

//   if (user && (await user.matchPassword(password))) {
//     res.json({
//       _id: user._id,
//       name: user.name,
//       email: user.email,
//       isAdmin: user.isAdmin,
//       token: generateToken(user._id), // ← THIS LINE IS MISSING
//     })
//   } else {
//     res.status(401)
//     throw new Error('Invalid email or password')
//   }
// }))

  



// Example admin route
router.get('/admin/users', protect, admin, async (req, res) => {
  const users = await User.find({});
  res.json(users);
  // const user = await User.create({ name, email, password });

  // if (user) {
  //   generateToken(res, user._id);
  //   res.status(201).json({
  //     _id: user._id,
  //     name: user.name,
  //     email: user.email,
  //     isAdmin: user.isAdmin,
  //   });
  // } else {
  //   res.status(400).json({ message: 'Invalid user data' });
  // }
});

//   const user = await User.create({ name, email, password });

//   if (user) {
//     generateToken(res, user._id);
//     res.status(201).json({
//       _id: user._id,
//       name: user.name,
//       email: user.email,
//       isAdmin: user.isAdmin,
//     });
//   } else {
//     res.status(400).json({ message: 'Invalid user data' });
//   }
// });

// @desc Auth user & get token
router.post('/auth', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

   if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      token: generateToken(user._id), // ← THIS LINE IS MISSING
    })
  } else {
    res.status(401)
    throw new Error('Invalid email or password')
  }
});

// @desc Logout user / clear cookie
router.post('/logout', (req, res) => {
  res.cookie('jwt', '', {
    httpOnly: true,
    expires: new Date(0),
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

// @desc Get user profile
router.get('/profile', protect,  async (req, res) => {
  // We'll add auth middleware next
  res.json({ message: 'User profile' });
});

//PUT PROFILE
router.put('/profile', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)

  if (user) {
    user.name = req.body.name || user.name
    user.email = req.body.email || user.email
    if (req.body.password) {
      user.password = req.body.password
    }

    const updatedUser = await user.save()

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
      token: generateToken(updatedUser._id),
    })
  } else {
    res.status(404)
    throw new Error('User not found')
  }
}))

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
router.get('/', protect, admin, asyncHandler(async (req, res) => {
  const pageSize = 10
  const page = Number(req.query.pageNumber) || 1

  const keyword = req.query.keyword
    ? {
        $or: [
          { name: { $regex: req.query.keyword, $options: 'i' } },
          { email: { $regex: req.query.keyword, $options: 'i' } },
        ],
      }
    : {}

  const count = await User.countDocuments({ ...keyword })
  const users = await User.find({ ...keyword })
    .select('-password')
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .sort({ createdAt: -1 })

  res.json({ users, page, pages: Math.ceil(count / pageSize) })
}))
// @desc Get user by ID
// @route GET /api/users/:id
// @access Private/Admin
router.get('/:id', protect, admin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password')
  if (user) {
    res.json(user)
  } else {
    res.status(404)
    throw new Error('User not found')
  }
}))

// @desc Update user
// @route PUT /api/users/:id
// @access Private/Admin
router.put('/:id', protect, admin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)

  if (user) {
    user.name = req.body.name || user.name
    user.email = req.body.email || user.email
    user.isAdmin = req.body.isAdmin !== undefined ? req.body.isAdmin : user.isAdmin

    const updatedUser = await user.save()

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
    })
  } else {
    res.status(404)
    throw new Error('User not found')
  }
}))

// @desc Delete user
// @route DELETE /api/users/:id
// @access Private/Admin
router.delete('/:id', protect, admin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)

  if (user) {
    if (user.isAdmin) {
      res.status(400)
      throw new Error('Cannot delete admin user')
    }
    await User.deleteOne({ _id: user._id })
    res.json({ message: 'User removed' })
  } else {
    res.status(404)
    throw new Error('User not found')
  }
}))

router.put('/:id/toggleAdmin', protect, admin, async (req, res) => {
  const user = await User.findById(req.params.id)
  
  if (user) {
    // Prevent self-demotion
    if (req.user._id.toString() === user._id.toString()) {
      res.status(400)
      throw new Error('Cannot demote yourself')
    }
    
    user.isAdmin = !user.isAdmin
    const updatedUser = await user.save()
    res.json({ 
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin
    })
  } else {
    res.status(404)
    throw new Error('User not found')
  }
})

module.exports = router;
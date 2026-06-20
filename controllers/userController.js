const asyncHandler = require('express-async-handler')
const User = require('../models/User')
const Product = require ('../models/Product')
 
const generateToken = require('../utils/generateToken')
const crypto = require('crypto')
 
const sendEmail = require('../utils/sendEmail')
 

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const authUser = asyncHandler(async (req, res) => {
  // ... your existing login code
})

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  // ... your existing register code
})

// @desc    Get user cart
// @route   GET /api/users/cart
// @access  Private
const getUserCart = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
  
  if (user) {
    res.json({ cartItems: user.cartItems || [] })
  } else {
    res.status(404)
    throw new Error('User not found')
  }
})

// @desc    Save user cart
// @route   POST /api/users/cart  
// @access  Private
const saveUserCart = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
  
  if (user) {
    user.cartItems = req.body.cartItems || []
    await user.save()
    res.status(200).json({ message: 'Cart saved successfully' })
  } else {
    res.status(404)
    throw new Error('User not found')
  }
})


// @desc    Forgot password
// @route   POST /api/users/forgotpassword
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body

  const user = await User.findOne({ email })

  if (!user) {
    // Security: Don't reveal if email exists. Send same response.
    return res.status(200).json({ message: 'Email sent if account exists' })
  }

  // Get reset token
  const resetToken = user.getResetPasswordToken()

  await user.save({ validateBeforeSave: false })

  // Create reset url
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>PhoneStore Password Reset</h2>
      <p>You requested a password reset for your account.</p>
      <p>Click the button below to reset your password:</p>
      <a href="${resetUrl}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
      <p>Or copy this link: ${resetUrl}</p>
      <p><strong>This link expires in 10 minutes.</strong></p>
      <p>If you didn't request this, ignore this email.</p>
    </div>
  `

  try {
    await sendEmail({
      email: user.email,
      subject: 'PhoneStore - Password Reset Request',
      html,
    })

    res.status(200).json({ message: 'Email sent' })
  } catch (err) {
    console.error('SEND EMAIL FAILED:', err)
    user.resetPasswordToken = undefined
    user.resetPasswordExpire = undefined
    await user.save({ validateBeforeSave: false })
    
    res.status(500)
    throw new Error('Email could not be sent')
  }
})

// @desc    Reset password
// @route   PUT /api/users/resetpassword/:resettoken
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  // Get hashed token from url param
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resettoken)
    .digest('hex')

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  })

  if (!user) {
    res.status(400)
    throw new Error('Invalid or expired token')
  }

  // Set new password
  user.password = req.body.password
  user.resetPasswordToken = undefined
  user.resetPasswordExpire = undefined
  await user.save()

  res.status(200).json({ message: 'Password reset successful' })
})

 
  
 

module.exports = { 
  authUser, 
  registerUser, 
  getUserCart, 
  saveUserCart,
   forgotPassword, 
  resetPassword,
  
}
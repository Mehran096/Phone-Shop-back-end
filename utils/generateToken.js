const jwt = require('jsonwebtoken')

const generateToken = (res, userId) => {
  // console.log('1. Inside generateToken, userId:', userId)
  // console.log('2. JWT_SECRET exists:', !!process.env.JWT_SECRET)
  
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  })
  
  //console.log('3. Token created:', token.substring(0, 20) + '...')

  res.cookie('jwt', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    domain: 'localhost'
  })
  
  //console.log('4. Cookie set')
}

module.exports = generateToken
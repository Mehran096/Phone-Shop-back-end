const express = require('express');
const crypto = require('crypto');
const asyncHandler = require('express-async-handler'); 
const Order = require('../models/orderModel.js');
 

const router = express.Router()

const generateHash = (data, salt) => {
  const sortedKeys = Object.keys(data).sort()
  let str = salt + '&'
  sortedKeys.forEach(key => {
    if (data[key]!== '' && data[key]!== undefined) {
      str += data[key] + '&'
    }
  })
  return crypto.createHash('sha256').update(str.slice(0, -1)).digest('hex')
}

// 1. Create payment request
router.post('/pay', asyncHandler(async (req, res) => {
  const { orderId } = req.body
  const order = await Order.findById(orderId)

  if (!order) {
    res.status(404)
    throw new Error('Order not found')
  }

  const txnDateTime = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const txnRefNo = `T${txnDateTime}${orderId.slice(-4)}`

  const postData = {
    pp_Version: '2.0',
    pp_TxnType: 'MWALLET',
    pp_Language: 'EN',
    pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID,
    pp_Password: process.env.JAZZCASH_PASSWORD,
    pp_TxnRefNo: txnRefNo,
    pp_Amount: Math.round(order.totalPrice * 100), // PKR to paisa
    pp_TxnCurrency: 'PKR',
    pp_TxnDateTime: txnDateTime,
    pp_BillReference: orderId,
    pp_Description: 'Order Payment',
    pp_ReturnURL: process.env.JAZZCASH_RETURN_URL,
  }

  postData.pp_SecureHash = generateHash(postData, process.env.JAZZCASH_SALT)

  res.json({ postData, url: process.env.JAZZCASH_API_URL })
}))

// 2. Callback from JazzCash
router.post('/callback', asyncHandler(async (req, res) => {
  const data = req.body
  const receivedHash = data.pp_SecureHash

  // Verify hash for security
  const { pp_SecureHash,...dataWithoutHash } = data
  const calculatedHash = generateHash(dataWithoutHash, process.env.JAZZCASH_SALT)

  if (receivedHash!== calculatedHash) {
    return res.redirect('/order/payment-failed?reason=invalid_hash')
  }

  if (data.pp_ResponseCode === '000') {
    const order = await Order.findById(data.pp_BillReference)
    if (order) {
      order.isPaid = true
      order.paidAt = Date.now()
      order.paymentResult = {
        id: data.pp_TxnRefNo,
        status: 'success',
        update_time: new Date().toISOString(),
        method: 'JazzCash',
      }
      await order.save()
      return res.redirect(`/order/${data.pp_BillReference}?status=success`)
    }
  }

  res.redirect(`/order/${data.pp_BillReference}?status=failed`)
}))

//export default router
module.exports = router;
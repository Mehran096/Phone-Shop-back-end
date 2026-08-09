const addDecimals = (num) => {
  return Number((Math.round(num * 100) / 100).toFixed(2)) // <-- Returns Number, not String
}

// Country-specific shipping rates - adjust these
const SHIPPING_RATES = {
  US: { standard: 10, freeThreshold: 75 }, // USD
  CA: { standard: 15, freeThreshold: 100 }, // CAD
  GB: { standard: 8, freeThreshold: 60 }, // GBP
  PK: { standard: 2, freeThreshold: 50 }, // USD equivalent
  DEFAULT: { standard: 10, freeThreshold: 100 } // USD for other countries
}

// ADD paymentMethod as 3rd param
const calcPrices = (orderItems, shippingAddress, paymentMethod) => {
  const itemsPrice = addDecimals(
    orderItems.reduce((acc, item) => acc + item.price * item.qty, 0)
  )

  const countryCode = shippingAddress.country || 'DEFAULT'
  const rates = SHIPPING_RATES[countryCode] || SHIPPING_RATES.DEFAULT

  // Free shipping if over threshold
  //const shippingPrice = itemsPrice >= rates.freeThreshold? 0 : rates.standard

  // FREE SHIPPING FOR BOTH COD AND STRIPE / commment this shippingPrice if you do not want to shipping 0 and comment out the above line if you want shippingPrice for both payment methods
  const shippingPrice = 0

  // FIX: Tax only for COD, 0 for Stripe
  const taxPrice = paymentMethod === 'COD'? addDecimals(0.05 * itemsPrice) : 0

  const totalPrice = addDecimals(itemsPrice + shippingPrice + taxPrice)

  return {
    itemsPrice, // Number
    shippingPrice, // Number
    taxPrice, // Number
    totalPrice, // Number
  }
}

module.exports = { addDecimals, calcPrices }
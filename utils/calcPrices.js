const addDecimals = (num) => {
  return (Math.round(num * 100) / 100).toFixed(2)
}

// Country-specific shipping rates - adjust these
const SHIPPING_RATES = {
  US: { standard: 10, freeThreshold: 75 }, // USD
  CA: { standard: 15, freeThreshold: 100 }, // CAD
  GB: { standard: 8, freeThreshold: 60 }, // GBP
  PK: { standard: 2, freeThreshold: 50 }, // USD equivalent
  DEFAULT: { standard: 20, freeThreshold: 100 } // USD for other countries
}

// ADD paymentMethod as 3rd param
const calcPrices = (orderItems, shippingAddress, paymentMethod) => {
  const itemsPrice = addDecimals(
    orderItems.reduce((acc, item) => acc + item.price * item.qty, 0)
  )

  const countryCode = shippingAddress.country || 'DEFAULT'
  const rates = SHIPPING_RATES[countryCode] || SHIPPING_RATES.DEFAULT

  // Free shipping if over threshold
  const shippingPrice = Number(itemsPrice) >= rates.freeThreshold
   ? 0
    : rates.standard

  // FIX: Tax only for COD, 0 for Stripe
  const taxPrice = addDecimals(
    paymentMethod === 'COD'? Number((0.15 * itemsPrice).toFixed(2)) : 0
  )

  const totalPrice = (
    Number(itemsPrice) +
    Number(shippingPrice) +
    Number(taxPrice)
  ).toFixed(2)

  return {
    itemsPrice,
    shippingPrice,
    taxPrice,
    totalPrice,
  }
} 

module.exports = { addDecimals, calcPrices }
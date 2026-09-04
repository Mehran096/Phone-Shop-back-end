const mongoose = require('mongoose');

const orderItemSchema = mongoose.Schema({
  name: { type: String, required: true },
  qty: { type: Number, required: true },
  tier: { type: Number, default: 1 },
  image: { type: String, required: true },
  price: { type: Number, required: true },
  originalPrice: { type: Number },
  discountAmount: { type: Number, default: 0 },
  slug: { type: String },

  // === VARIANT FIELDS FOR BOTH PRODUCT + ACCESSORY ===
  variantType: { type: String, default: 'product' }, // 'product' or 'accessory'
  variantName: { type: String }, // 'storage' or 'glass' or 'cable'
  variantSubName: { type: String }, // '256GB' or 'Clear 9H' or '3 Meter Cable'
  color: { type: String, default: '' }, // <- FIX: removed required
  storage: { type: String, default: '' }, // <- FIX: removed required
  model: { type: String, default: '' }, // 'iPhone 17 Pro Max' or 'Universal'
  sku: { type: String },

  // === REFERENCE: EITHER PRODUCT OR ACCESSORY ===
  product: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
  },
  accessory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Accessory",
  },
}, { _id: false })


const orderSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    orderItems: [orderItemSchema], // <-- using new schema
    shippingAddress: { 
      phone: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    paymentResult: {
      id: { type: String },
      status: { type: String },
      update_time: { type: String },
      email_address: { type: String },
    },
    itemsPrice: { type: Number, required: true, default: 0.0 },
    taxPrice: { type: Number, required: true, default: 0.0 },
    shippingPrice: { type: Number, required: true, default: 0.0 },
    totalPrice: { type: Number, required: true, default: 0.0 },
    currency: { type: String, required: true, default: 'USD' },
    isPaid: { type: Boolean, required: true, default: false },
    paidAt: { type: Date },
    isRefunded: { type: Boolean, default: false },
    refundAmount: { type: Number, default: 0 },
    refundedAt: { type: Date },
    isCancelled: { type: Boolean, default: false },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
    cancelCode: { type: String },
    isShipped: { type: Boolean, default: false },
    shippedAt: { type: Date },
    trackingNumber: { type: String },
    carrier: { type: String },
    isDelivered: { type: Boolean, required: true, default: false },
    deliveredAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
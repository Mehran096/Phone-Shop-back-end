const mongoose = require('mongoose')
const dotenv = require('dotenv')
const Product = require('../models/Product.js') // check if your file is productModel.js or Product.js
const Order = require('../models/orderModel.js')

dotenv.config()

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('DB Connected')

    const products = await Product.find({})
    const orders = await Order.find({})

    for (const product of products) {
      let totalSold = 0

      orders.forEach(order => {
        order.orderItems.forEach(item => {
          const itemProductId = typeof item.product === 'object' ? item.product._id : item.product
          if (itemProductId && itemProductId.toString() === product._id.toString()) {
            totalSold += item.qty
          }
        })
      })

      // Safety: never set negative
      product.allSales = Math.max(0, totalSold)
      await product.save()
      console.log(`Updated ${product.name}: ${totalSold} sales`)
    }

    // Extra safety: force any remaining negatives to 0
    await Product.updateMany(
      { allSales: { $lt: 0 } },
      { $set: { allSales: 0 } }
    )

    console.log('Product Migration Done!')
    process.exit()
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

migrate()
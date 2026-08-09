const mongoose = require('mongoose')
const dotenv = require('dotenv')
const Accessory = require('../models/Accessory.js')
const Order = require('../models/orderModel.js')

dotenv.config()

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('DB Connected')

    const accessories = await Accessory.find({})
    // only get orders that have accessories to make it faster
    const orders = await Order.find({ 'orderItems.accessory': { $ne: null } })

    for (const accessory of accessories) {
      // Count how many times this accessory was sold
      let totalSold = 0

      orders.forEach(order => {
        order.orderItems.forEach(item => {
          const itemAccessoryId = typeof item.accessory === 'object' ? item.accessory._id : item.accessory
          if (itemAccessoryId && itemAccessoryId.toString() === accessory._id.toString()) {
            totalSold += item.qty
          }
        })
      })

      // Safety: never set negative
      accessory.allSales = Math.max(0, totalSold)
      await accessory.save()
      console.log(`Updated ${accessory.name}: ${totalSold} sales`)
    }

    // Extra safety: force any remaining negatives to 0
    await Accessory.updateMany(
      { allSales: { $lt: 0 } },
      { $set: { allSales: 0 } }
    )

    console.log('Accessory Migration Done!')
    process.exit()
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

migrate()
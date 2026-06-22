require('dotenv').config();
const { MongoClient } = require('mongodb');

const cleanBrokenUserItems = async () => {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db();

    console.log('Cleaning broken cart items...');
    const cartResult = await db.collection('users').updateMany(
      {},
      { $pull: { cartItems: { product: null } } }
    );
    console.log(`Modified ${cartResult.modifiedCount} users - removed null cart items`);

    console.log('Cleaning broken wishlist items...');
    const wishlistResult = await db.collection('users').updateMany(
      {},
      { $pull: { wishlist: { product: null } } }
    );
    console.log(`Modified ${wishlistResult.modifiedCount} users - removed null wishlist items`);

    console.log('Cleanup completed');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    process.exit();
  }
};

cleanBrokenUserItems();



// const mongoose = require('mongoose');
// const dotenv = require('dotenv');
// const users = require('./data/users.js'); // we'll make this
// const products = require('./data/products.js');
// const User = require('./models/User.js');
// const Product = require('./models/Product.js');
// const connectDB = require('./config/db.js');

// dotenv.config();
// connectDB();

// const importData = async () => {
//   try {
//     await Product.deleteMany();
//     await User.deleteMany();

//     const createdUsers = await User.insertMany(users);
//     const adminUser = createdUsers[0]._id;

//     const sampleProducts = products.map((product) => {
//       return {...product, user: adminUser };
//     });

//     await Product.insertMany(sampleProducts);
//     console.log('Data Imported! 6 phones added.');
//     process.exit();
//   } catch (error) {
//     console.error(`${error}`);
//     process.exit(1);
//   }
// };

// const destroyData = async () => {
//   try {
//     await Product.deleteMany();
//     await User.deleteMany();
//     console.log('Data Destroyed!');
//     process.exit();
//   } catch (error) {
//     console.error(`${error}`);
//     process.exit(1);
//   }
// };

// if (process.argv[2] === '-d') {
//   destroyData();
// } else {
//   importData();
// }
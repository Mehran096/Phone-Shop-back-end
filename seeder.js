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
      { $pull: { wishlist: { product: null } }}
    );
    console.log(`Modified ${wishlistResult.modifiedCount} users - removed null wishlist items`);

    // NEW: ADD allSales FIELD TO ALL PRODUCTS
    console.log('Adding allSales field to products...');
    const productResult = await db.collection('products').updateMany(
      { allSales: { $exists: false } }, // only products that don't have it yet
      { $set: { allSales: 0 } }         // set default to 0
    );
    console.log(`Modified ${productResult.modifiedCount} products - added allSales: 0`);

    console.log('Cleanup completed');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    process.exit();
  }
};

cleanBrokenUserItems();
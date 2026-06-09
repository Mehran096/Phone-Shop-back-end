require('dotenv').config();
const { MongoClient } = require('mongodb');

const migrateReplyDates = async () => {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  
  const db = client.db(); // uses DB from your URI
  const result = await db.collection('products').updateMany(
    { "reviews.adminReply.repliedAt": { $exists: true } },
    [
      {
        $set: {
          "reviews": {
            $map: {
              input: "$reviews",
              as: "review",
              in: {
                $mergeObjects: [
                  "$$review",
                  {
                    adminReply: {
                      $cond: [
                        { $ne: ["$$review.adminReply", null] },
                        {
                          reply: "$$review.adminReply.reply",
                          name: "$$review.adminReply.name", 
                          user: "$$review.adminReply.user",
                          createdAt: "$$review.adminReply.repliedAt"
                        },
                        "$$review.adminReply"
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      }
    ]
  );

  console.log('Migration result:', result);
  await client.close();
  process.exit();
};

migrateReplyDates().catch(err => {
  console.error(err);
  process.exit(1);
});



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
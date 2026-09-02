const mongoose = require('mongoose');
const Accessory = require('../models/Accessory'); 
const dotenv = require('dotenv')
dotenv.config();

const MONGO_URI = process.env.MONGO_URI; 

// 30 American names - Male + Female mix
const americanNames = [
  "James Smith", "Mary Johnson", "Robert Williams", "Patricia Brown", "Michael Jones",
  "Jennifer Garcia", "William Miller", "Linda Davis", "David Rodriguez", "Elizabeth Martinez",
  "Richard Wilson", "Susan Anderson", "Joseph Taylor", "Jessica Thomas", "Thomas Moore",
  "Sarah Jackson", "Christopher Martin", "Karen Lee", "Daniel Perez", "Nancy Thompson",
  "Matthew White", "Lisa Harris", "Anthony Clark", "Betty Lewis", "Mark Robinson",
  "Dorothy Walker", "Donald Young", "Sandra Allen", "Steven King", "Ashley Wright"
];

const fakeComments = [
  "Excellent quality! Works exactly as described. Fast shipping too.",
  "Love this product. Fits perfectly and charges super fast.",
  "Great value for money. Highly recommend to everyone.",
  "Product arrived on time and works flawlessly.",
  "Super fast charging with no overheating issues at all.",
  "Screen protector is crystal clear and touch response is perfect.",
  "Bought 2 pack and it's totally worth it. Good protection.",
  "Easy installation, no bubbles. Looks professional.",
  "Works great with my phone. Very durable material.",
  "Self-healing film is amazing. Minor scratches disappear.",
  "Best accessory I bought this year. Solid build quality.",
  "Customer service was great and product exceeded expectations.",
  "Fast delivery and the item is 100% authentic.",
  "Using it for a week now and still works like new.",
  "Perfect fit. Doesn't interfere with case or fingerprint sensor."
];

const fakeTitles = [
  "Amazing Product!", "Works Perfectly", "Best Purchase Ever", 
  "Highly Recommend", "Perfect Fit", "Great Quality",
  "Fast Shipping", "Exactly What I Needed", "Exceeded Expectations",
  "Worth Every Penny"
];

// Sample review images - random unsplash placeholder
const reviewImages = [
  { url: "https://res.cloudinary.com/little-success/image/upload/v1788334732/accessories/1788334731428-ebo1f.jpg", imagePublicId: "review1" },
  { url: "https://res.cloudinary.com/little-success/image/upload/v1788333639/accessories/1788333638337-01zk4.jpg", imagePublicId: "review2" },
  { url: "https://res.cloudinary.com/little-success/image/upload/v1788091290/accessories/1788091290164-5guzc.jpg", imagePublicId: "review3" },
];

const seedReviews = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("DB Connected");

    const accessories = await Accessory.find().limit(15); // get first 15 accessories

    if(accessories.length === 0) {
      console.log("No accessories found. Add products first.");
      return;
    }

    for(let acc of accessories){
      acc.reviews = []; // Clear old reviews first
      const reviewsToAdd = [];
      
      // Add 30 reviews per accessory
      for(let i = 0; i < 30; i++){
        const name = americanNames[i]; // use all 30 names
        const model = acc.models[0]?.modelName || "Universal";
        const variant = acc.models[0]?.variants[0]?.name || "Default";
        
        // Add image to every 3rd review for realism
        const hasImage = i % 3 === 0; 
        const reviewImage = hasImage? [reviewImages[Math.floor(Math.random() * reviewImages.length)]] : [];
        
        reviewsToAdd.push({
          user: new mongoose.Types.ObjectId(), // fake user id
          name: name,
          title: fakeTitles[Math.floor(Math.random() * fakeTitles.length)],
          rating: Math.floor(Math.random() * 2) + 4, // 4 or 5 star
          model: model,
          variant: variant,
          comment: fakeComments[Math.floor(Math.random() * fakeComments.length)],
          verifiedPurchase: Math.random() > 0.2, // 80% verified
          images: reviewImage, // 1 image added
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000) // last 90 days
        });
      }

      acc.reviews.push(...reviewsToAdd);
      
      // Recalculate rating
      const totalRating = acc.reviews.reduce((sum, r) => sum + r.rating, 0);
      acc.rating = parseFloat((totalRating / acc.reviews.length).toFixed(1));
      acc.numReviews = acc.reviews.length;

      await acc.save();
      console.log(`Added 30 reviews to: ${acc.name}`);
    }

    console.log(`✅ ${accessories.length * 30} Reviews Added Successfully to 15 Accessories`);
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

seedReviews();
const axios = require('axios');
const Blog = require('../models/Blog');
const User = require('../models/User'); // FIXED: added for author

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "llama-3.1-8b-instant"];

const RANDOM_TOPICS = [
  "Best Samsung Phones Under 80000 in Pakistan 2026",
  "Infinix Hot 50 Pro Review - Price in Pakistan",
  "Tecno Camon 30 vs Infinix Note 40 - Full Comparison",
  "Best Camera Phones Under 100000 PKR in Pakistan",
  "Top 5 Gaming Phones Under 60000 PKR - Tested",
  "Realme C75 vs Oppo A3x - Budget Phone Battle Pakistan",
  "iPhone 15 PTA Approved Price Drop in Pakistan 2026",
  "Best Phones for PUBG Under 50000 PKR Pakistan",
  "Samsung A36 vs A56 - Which Should You Buy in Pakistan?",
  "Vivo V40 Review - Camera Test Price in Pakistan",
];

const CATEGORIES = ["Mobile Guide","Phone Review","Comparison","Buying Tips","News","Accessories"];

function getUniqueCoverImage(category, topic) {
  const uniqueSeed = `${category}-${topic}-${Date.now()}-${Math.floor(Math.random()*9999999)}`;
  const safeSeed = uniqueSeed.replace(/[^a-zA-Z0-9]/g, "-").substring(0,60);
  return `https://picsum.photos/seed/${safeSeed}/800/600`;
}

async function callGroq(prompt) {
  for (const model of GROQ_MODELS) {
    try {
      console.log(`🤖 Trying Groq model: ${model}`);
      const res = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.85,
          max_tokens: 4000,
        },
        {
          headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
          timeout: 30000,
        }
      );
      const raw = res.data.choices?.[0]?.message?.content?.trim();
      if (raw && raw.length > 300) {
        console.log(`✅ Groq success: ${model}`);
        return { raw: raw.replace(/<think>.*?<\/think>/gs, "").trim(), model };
      }
    } catch (e) {
      console.log(`❌ ${model} failed:`, e.response?.data?.error?.message || e.message);
    }
  }
  throw new Error("All Groq models failed");
}

async function generateAutoBlog(customTopic = "") {
  try {
    const topic = customTopic && customTopic.length > 10 ? customTopic : RANDOM_TOPICS[Math.floor(Math.random()*RANDOM_TOPICS.length)];
    const category = CATEGORIES[Math.floor(Math.random()*CATEGORIES.length)];
    const coverImageUrl = getUniqueCoverImage(category, topic);
    const uniqueId = Math.floor(Math.random()*9000)+1000;

    console.log(`\n🚀 AUTO BLOG START: ${topic} | ${category}`);
    console.log(`🖼️ ${coverImageUrl}`);

    const prompt = `Write blog for phone-store.asia. Topic:${topic} Category:${category} ID:${uniqueId}
RULES: Unique title with 2026, 800+ words, mention PKR prices with PTA approved, mention phone-store.asia 2 times naturally, SEO friendly.
Output exactly like:
TITLE: your unique title
EXCERPT: 150 char SEO excerpt
TAGS: tag1, tag2, tag3
CONTENT_START
<h2>Introduction</h2><p>...</p>
<h2>Price in Pakistan</h2><p>...</p>
<h2>Features</h2><p>...</p>
<h2>Why Buy from phone-store.asia</h2><p>...</p>
<h2>Final Verdict</h2><p>...</p>
CONTENT_END
`;

    const { raw, model } = await callGroq(prompt);

    const titleMatch = raw.match(/TITLE:\s*(.*)/i);
    const excerptMatch = raw.match(/EXCERPT:\s*(.*)/i);
    const tagsMatch = raw.match(/TAGS:\s*(.*)/i);
    const contentMatch = raw.match(/CONTENT_START\s*([\s\S]*?)\s*CONTENT_END/i);

    const title = titleMatch ? titleMatch[1].trim().substring(0,190) : topic;
    const excerpt = excerptMatch ? excerptMatch[1].trim().substring(0,290) : topic;
    const tagsRaw = tagsMatch ? tagsMatch[1].trim() : "Pakistan, Mobile, PTA";
    const content = contentMatch ? contentMatch[1].trim() : `<p>${raw.substring(0,3000)}</p>`;

    // FIXED: get admin user for required author field
    let adminUser = await User.findOne({ isAdmin: true }).select('_id');
    if (!adminUser) {
      adminUser = await User.findOne().select('_id');
    }
    if (!adminUser) {
      throw new Error("No user found in DB to set as blog author - create admin first");
    }

    const blog = await Blog.create({
      title,
      excerpt,
      content,
      coverImage: { url: coverImageUrl, publicId: "" },
      category,
      tags: tagsRaw.split(",").map(t=>t.trim().toLowerCase()).filter(Boolean).slice(0,5),
      metaTitle: title.substring(0,60),
      metaDescription: excerpt.substring(0,155),
      status: "published",
      aiGenerated: true,
      aiModel: model,
      author: adminUser._id, // FIXED: was null
    });

    console.log(`🎉 AUTO BLOG SAVED: ${blog.title} - ${blog.slug}`);
    return blog;

  } catch (err) {
    console.error("❌ Auto blog failed:", err.message);
    throw err;
  }
}

module.exports = { generateAutoBlog };
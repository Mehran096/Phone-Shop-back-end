const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, required: true, default: false },
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function () { // ← No 'next' parameter
  if (!this.isModified('password')) {
    return; // ← Just return, don't call next()
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  // Don't call next() at all with async
});

// ← Add this method to compare passwords during login
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
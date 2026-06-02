const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    picture: { type: String },
    phone: { type: String },
    province: { type: String },
    city: { type: String },
    joinedAt: { type: Date, default: Date.now },
    isDev: { type: Boolean, default: false },
    isPremium: { type: Boolean, default: false },
    premiumUntil: { type: Date },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    toAttempts: { type: Object, default: {} } // Store TO results per user
});

module.exports = mongoose.model('User', UserSchema);

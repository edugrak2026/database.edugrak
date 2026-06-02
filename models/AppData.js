const mongoose = require('mongoose');

const AppDataSchema = new mongoose.Schema({
    videos: { type: Array, default: [] },
    questionsBank: { type: Object, default: {} },
    latihanDetails: { type: Object, default: {} },
    subtesData: { type: Array, default: [] },
    leaderboards: { type: Object, default: {} },
    irtConfigs: { type: Object, default: {} },
    premiumPackages: { type: Array, default: [] },
    coupons: { type: Array, default: [] }
}, { timestamps: true });

module.exports = mongoose.model('AppData', AppDataSchema);

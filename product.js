const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    category: { type: String, default: 'General' },
    image_url: { type: String },
    stock: { type: Number, default: 0 },
    reviews: [{
        user_name: { type: String },
        rating: { type: Number, min: 1, max: 5 },
        comment: { type: String },
        date: { type: Date, default: Date.now }
    }],
    average_rating: { type: Number, default: 0 }
});

module.exports = mongoose.model('Product', productSchema);
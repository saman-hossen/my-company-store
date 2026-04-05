const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    customer_name: { type: String, required: true },
    customer_email: { type: String, required: true },
    customer_address: { type: String, required: true },
    shipping_area: { type: String },
    shipping_fee: { type: Number, default: 0 },
    total_amount: { type: Number, required: true },
    payment_method: { type: String, default: 'Cash on Delivery' },
    transaction_id: { type: String, default: 'N/A' },
    items: [{
        product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        price: Number,
        quantity: Number,
        size: String
    }],
    status: { type: String, default: 'Pending' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
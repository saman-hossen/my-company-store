require('dotenv').config();
const mongoose = require('mongoose');
const uri = process.env.MONGODB_URI;
mongoose.connect(uri).then(async () => {
    const Product = require('./models/Product');
    const searchQuery = 'E';
    let filter = {};
    if(searchQuery) {
        filter.$or = [
            { name: { $regex: searchQuery, $options: 'i' } },
            { category: { $regex: searchQuery, $options: 'i' } }
        ];
    }
    console.log('Filter:', JSON.stringify(filter));
    const products = await Product.find(filter);
    console.log('Result count:', products.length);
    if(products.length > 0) console.log(products[0].name, products[0].category);
    process.exit();
}).catch(console.error);

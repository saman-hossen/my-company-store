require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect('mongodb://samanhossen12_db_user:saman9694@ac-ghsjmbk-shard-00-00.sq6q2vj.mongodb.net:27017,ac-ghsjmbk-shard-00-01.sq6q2vj.mongodb.net:27017,ac-ghsjmbk-shard-00-02.sq6q2vj.mongodb.net:27017/my_company_db?ssl=true&replicaSet=atlas-115jkf-shard-0&authSource=admin&retryWrites=true&w=majority').then(async () => {
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
    if(products.length > 0) {
        console.log(products[0].name, '-', products[0].category);
    }
    process.exit();
}).catch(console.error);

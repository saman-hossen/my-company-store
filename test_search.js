const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect('mongodb+srv://admin:11111111@cluster0.bqu0b.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
const Product = require('./models/Product');
async function test() {
  const searchQuery = 't';
  let filter = {};
  if(searchQuery) {
      filter.$or = [
          { name: { $regex: searchQuery, $options: 'i' } },
          { category: { $regex: searchQuery, $options: 'i' } }
      ];
  }
  const products = await Product.find(filter);
  console.log(products.length);
  process.exit();
}
test();

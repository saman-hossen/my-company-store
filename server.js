require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcrypt');
const fs = require('fs');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

// Fix node DNS issues for MongoDB SRV URLs
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// Import Models
const User = require('./models/user');
const Product = require('./models/product');
const Order = require('./models/order');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB Cloud successfully!'))
    .catch(err => console.error('MongoDB connection error:', err));

// Middleware setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
    }
}));

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'my-store-uploads',
        allowed_formats: ['jpg', 'jpeg', 'png', 'avif', 'webp']
    }
});
const upload = multer({ storage: storage });

function checkCustomerAuth(req, res, next) {
    if (req.session.userId) return next();
    res.redirect('/login');
}

function checkAuth(req, res, next) {
    if (req.session.isAdmin) return next();
    res.redirect('/admin/login');
}

// Temporary settings for about and adminEmail since we moved from JSON
let siteSettings = {
    about: 'Welcome to our store! We provide the best quality products.',
    adminEmail: process.env.EMAIL_USER
};

// --- AUTH ROUTES ---
app.get('/login', (req, res) => res.render('shop/login', { error: null }));

app.post('/login', async(req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user && bcrypt.compareSync(password, user.password)) {
            req.session.userId = user._id;
            req.session.userEmail = user.email;
            req.session.userName = user.name;
            res.redirect('/');
        } else {
            res.render('shop/login', { error: 'Invalid email or password.' });
        }
    } catch (err) {
        console.error(err);
        res.render('shop/login', { error: 'An error occurred during login.' });
    }
});

app.get('/register', (req, res) => res.render('shop/register', { error: null }));

app.post('/register', async(req, res) => {
    const { name, email, password } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('shop/register', { error: 'Email already exists! Please log in.' });
        }
        const hashedPassword = bcrypt.hashSync(password, 10);
        const newUser = new User({ name, email, password: hashedPassword });
        await newUser.save();

        req.session.userId = newUser._id;
        req.session.userEmail = newUser.email;
        req.session.userName = newUser.name;
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.render('shop/register', { error: 'Error registering user.' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- SHOP ROUTES ---
app.get('/', async(req, res) => {
    try {
        const searchQuery = req.query.q || '';
        const categoryQuery = req.query.category || '';

        let filter = {};
        if (searchQuery) {
            filter.$or = [
                { name: { $regex: searchQuery, $options: 'i' } },
                { category: { $regex: searchQuery, $options: 'i' } }
            ];
        }
        if (categoryQuery) filter.category = categoryQuery;

        const products = await Product.find(filter);
        const allCategories = await Product.distinct('category');
        const categories = allCategories.filter(c => c);

        const user = req.session.userId ? { name: req.session.userName } : null;
        res.render('shop/index', { products, searchQuery, categoryQuery, categories, user });
    } catch (err) {
        console.error(err);
        res.send('Error loading page');
    }
});

app.get('/product/:id', checkCustomerAuth, async(req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).send('Product not found');

        let currentUser = await User.findById(req.session.userId);
        res.render('shop/product', { product, user: currentUser });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
});

app.post('/product/:id/review', checkCustomerAuth, async(req, res) => {
    try {
        console.log("--- REVIEW TRIGGERED ---");
        const { rating, comment } = req.body;
        console.log("Payload:", req.body);
        const product = await Product.findById(req.params.id);
        console.log("Found Product?", !!product);

        if (!product.reviews) product.reviews = [];

        product.reviews.push({
            user_name: req.session.userName || 'Anonymous',
            rating: parseInt(rating),
            comment: comment
        });

        // Calculate new average
        const totalRating = product.reviews.reduce((sum, review) => sum + review.rating, 0);
        product.average_rating = totalRating / product.reviews.length;

        await product.save();
        console.log("Product review saved.");
        res.redirect(`/product/${req.params.id}`);
    } catch (err) {
        console.error("REVIEW ERROR:", err);
        res.redirect('/');
    }
});

// Admin login routes
app.get('/admin/login', (req, res) => res.render('admin/login'));

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else {
        res.send('Invalid Credentials <a href="/admin/login">Try again</a>');
    }
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// --- ABOUT ROUTE ---
app.get('/about', (req, res) => {
    res.render('shop/about', { aboutText: siteSettings.about });
});

// --- PROFILE & CART ROUTES ---
app.get('/profile', checkCustomerAuth, async(req, res) => {
    try {
        const currentUser = await User.findById(req.session.userId).populate('wishlist');
        const myOrders = await Order.find({ customer_email: req.session.userEmail }).sort({ createdAt: -1 });

        let totalOrders = myOrders.length;
        let pendingOrders = 0;
        let itemsBought = 0;

        myOrders.forEach(o => {
            if (o.status === 'Pending') pendingOrders++;
            if (o.status === 'Accepted') {
                if (o.items && o.items.length > 0) {
                    itemsBought += o.items.reduce((sum, item) => sum + (parseInt(item.quantity) || 1), 0);
                } else {
                    itemsBought += parseInt(o.quantity) || 1;
                }
            }
        });

        res.render('shop/profile', {
            user: currentUser,
            orders: myOrders,
            stats: { totalOrders, pendingOrders, itemsBought }
        });
    } catch (err) {
        console.error(err);
        res.send('Error loading profile');
    }
});

app.post('/profile/upload', checkCustomerAuth, upload.single('profilePic'), async(req, res) => {
    if (!req.file) return res.redirect('/profile');
    try {
        await User.findByIdAndUpdate(req.session.userId, {
            profile_picture: req.file.path
        });
        res.redirect('/profile');
    } catch (err) {
        console.error(err);
        res.redirect('/profile');
    }
});

app.post('/cart/add', checkCustomerAuth, async(req, res) => {
    const { product_id, quantity, size } = req.body;
    const qty = parseInt(quantity) || 1;
    if (!req.session.cart) req.session.cart = [];

    try {
        const product = await Product.findById(product_id);
        if (!product) return res.redirect('/');
        if (product.stock > 0 && qty > product.stock) {
            console.log("Not enough stock!");
            // Can add flash message later for user feedback
        }
    } catch (err) {
        console.error(err);
    }

    const existingItem = req.session.cart.find(item => item.product_id == product_id && item.size === size);
    if (existingItem) {
        existingItem.quantity += qty;
    } else {
        req.session.cart.push({ product_id, quantity: qty, size: size || null });
    }
    res.redirect('/cart');
});

app.get('/cart', checkCustomerAuth, async(req, res) => {
    try {
        const cart = req.session.cart || [];
        let cartItems = [];
        let cartTotal = 0;

        for (let item of cart) {
            const product = await Product.findById(item.product_id);
            if (product) {
                const itemTotal = product.price * item.quantity;
                cartTotal += itemTotal;
                cartItems.push({
                    product_id: product._id,
                    name: product.name,
                    price: product.price,
                    quantity: item.quantity,
                    size: item.size,
                    image_url: product.image_url,
                    itemTotal
                });
            }
        }

        res.render('shop/cart', {
            cartItems,
            cartTotal,
            user: { name: req.session.userName, email: req.session.userEmail }
        });
    } catch (err) {
        console.error(err);
        res.send('Error loading cart');
    }
});

app.post('/cart/remove', checkCustomerAuth, (req, res) => {
    const { index } = req.body;
    if (req.session.cart) {
        req.session.cart.splice(index, 1);
    }
    res.redirect('/cart');
});

// --- WISHLIST ROUTES ---
app.post('/wishlist/toggle', checkCustomerAuth, async(req, res) => {
    try {
        console.log("--- WISHLIST TOGGLE TRIGGERED ---");
        const { product_id } = req.body;
        console.log("Product ID:", product_id);
        const user = await User.findById(req.session.userId);
        console.log("Found User?", !!user);

        if (!user.wishlist) user.wishlist = [];

        const wishlistIndex = user.wishlist.findIndex(id => id.toString() === product_id);
        if (wishlistIndex === -1) {
            user.wishlist.push(product_id);
            console.log("Added to wishlist.");
        } else {
            user.wishlist.splice(wishlistIndex, 1);
            console.log("Removed from wishlist.");
        }
        await user.save();
        console.log("User correctly saved.");
        res.redirect(req.get('Referrer') || '/');
    } catch (err) {
        console.error("WISHLIST ERROR:", err);
        res.redirect(req.get('Referrer') || '/');
    }
});

// --- CHECKOUT ROUTE ---
app.post('/order', checkCustomerAuth, async(req, res) => {
    const { name, email, address, shipping_area, payment_method, transaction_id } = req.body;
    try {
        const cart = req.session.cart || [];
        if (cart.length === 0) return res.status(400).send('Your cart is empty. <a href="/">Go back to shop</a>');

        let items = [];
        let baseTotal = 0;

        for (let item of cart) {
            const purchasedProduct = await Product.findById(item.product_id);
            if (purchasedProduct) {
                items.push({
                    product_id: purchasedProduct._id,
                    name: purchasedProduct.name,
                    price: purchasedProduct.price,
                    quantity: item.quantity,
                    size: item.size
                });
                baseTotal += (purchasedProduct.price * item.quantity);
            }
        }

        const productNamesStr = items.map(item => `${item.name} (${item.size ? item.size + ', ' : ''}x${item.quantity})`).join(', ');

        let shippingFee = 0;
        if (shipping_area === 'Inside Chittagong') shippingFee = 60;
        else if (shipping_area === 'Outside Chittagong') shippingFee = 150;

        const totalPrice = baseTotal + shippingFee;

        const newOrder = new Order({
            customer_name: name,
            customer_email: email,
            customer_address: address,
            shipping_area: shipping_area,
            shipping_fee: shippingFee,
            total_amount: totalPrice,
            items: items,
            payment_method: payment_method || 'Cash on Delivery',
            transaction_id: transaction_id || 'N/A',
            status: 'Pending'
        });

        await newOrder.save();
        req.session.cart = []; // Clear cart

        // Send Email using env config
        if (siteSettings.adminEmail) {
            let transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
                tls: { rejectUnauthorized: false }
            });

            let mailOptions = {
                from: `"Store Notification" <${process.env.EMAIL_USER}>`,
                to: siteSettings.adminEmail,
                subject: `New Order Pending! (#${newOrder._id})`,
                text: `You have received a new order with multiple items.\n\nProducts:\n${productNamesStr}\n\nDetails:\nName: ${name}\nEmail: ${email}\nShipping Area: ${shipping_area} (Fee: ৳${shippingFee})\nAddress: ${address}\nTotal Amount To Pay: ৳${totalPrice}\nPayment: ${newOrder.payment_method}\nTrxID: ${newOrder.transaction_id}\n\nPlease review it in the Admin Dashboard.`
            };
            transporter.sendMail(mailOptions, (err) => {
                if (err) console.log("Email error:", err.message);
            });
        }

        res.send('<h2>Order placed successfully! We will contact you soon.</h2><br><br><a href="/profile">View Orders</a> | <a href="/">Back to Shop</a>');
    } catch (err) {
        console.error(err);
        res.send('Error placing order');
    }
});

// --- ADMIN ROUTES ---
app.get('/admin', checkAuth, async(req, res) => {
    try {
        const products = await Product.find();
        const orders = await Order.find().sort({ createdAt: -1 });

        // Format payload to be friendly with our EJS templates
        const mappedOrders = orders.map(o => {
            let product_name = 'Unknown Product';
            if (o.items && o.items.length > 0) {
                product_name = o.items.map(item => `${item.name} ${item.size ? '(' + item.size + ')' : ''} (x${item.quantity})`).join(', ');
            }
            return {...o._doc, id: o._id, product_name };
        });
        const mappedProducts = products.map(p => ({...p._doc, id: p._id }));

        res.render('admin/dashboard', {
            products: mappedProducts,
            orders: mappedOrders,
            aboutText: siteSettings.about,
            adminEmail: siteSettings.adminEmail
        });
    } catch (err) {
        console.error(err);
        res.send('Error loading admin dashboard');
    }
});

app.post('/admin/email', checkAuth, (req, res) => {
    siteSettings.adminEmail = req.body.adminEmail;
    res.redirect('/admin');
});

app.post('/admin/about', checkAuth, (req, res) => {
    siteSettings.about = req.body.aboutText;
    res.redirect('/admin');
});

app.post('/admin/products/add', checkAuth, upload.single('image'), async(req, res) => {
    const { name, description, category, price } = req.body;
    let image_url = null;
    if (req.file) image_url = req.file.path;

    try {
        const newProduct = new Product({ name, description, category, price, image_url });
        await newProduct.save();
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.send('Error adding product');
    }
});

app.get('/admin/products/delete/:id', checkAuth, async(req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.redirect('/admin');
    }
});

// Function to send email to customer when order status changes
function sendCustomerOrderStatusEmail(order, status) {
    let productName = 'Unknown Product';
    if (order.items && order.items.length > 0) {
        productName = order.items.map(item => `${item.name} ${item.size ? '(' + item.size + ')' : ''} (x${item.quantity})`).join(', ');
    }

    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        tls: { rejectUnauthorized: false }
    });

    let mailOptions = {
        from: `"Store Notification" <${process.env.EMAIL_USER}>`,
        to: order.customer_email,
        subject: `Your Order is ${status}! (#${order._id})`,
        text: `Hello ${order.customer_name},\n\nWe wanted to let you know that your order for "${productName}" has been exactly ${status.toUpperCase()}.\n\nOrder Details:\nStatus: ${status}\nTotal Amount To Pay: ৳${order.total_amount || 'N/A'}\nPayment Method: ${order.payment_method}\n\nThank you for shopping with us!`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) console.log("Customer email error:", error.message);
    });
}

app.get('/admin/orders/accept/:id', checkAuth, async(req, res) => {
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, { status: 'Accepted' }, { new: true });
        if (order) sendCustomerOrderStatusEmail(order, 'Accepted');
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.redirect('/admin');
    }
});

app.get('/admin/orders/decline/:id', checkAuth, async(req, res) => {
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, { status: 'Declined' }, { new: true });
        if (order) sendCustomerOrderStatusEmail(order, 'Declined');
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.redirect('/admin');
    }
});

// Start Server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`MongoDB Server is running on http://localhost:${PORT}`);
});
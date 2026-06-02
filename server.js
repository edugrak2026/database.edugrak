require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const midtransClient = require('midtrans-client');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

const User = require('./user');
const AppData = require('./appdata');

const app = express();
app.use(express.json());

// CORS Configuration
app.use(cors({
    origin: function (origin, callback) {
        // Izinkan jika tidak ada origin (seperti mobile apps/curl) atau jika berasal dari domain edugrak
        if (!origin || origin.includes('vercel.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Cloudinary Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'edugrak_uploads',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp']
    }
});

const upload = multer({ storage: storage });

// Upload Route
app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
        res.json({ url: req.file.path });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// --- Auth Routes ---

// Setup Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Forgot Password
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'Email tidak ditemukan' });

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const resetUrl = `${process.env.FRONTEND_URL}/index.html?resetToken=${token}`;
        
        const mailOptions = {
            to: user.email,
            from: process.env.EMAIL_USER,
            subject: 'Reset Password EduGrak',
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #059669;">Reset Password EduGrak</h2>
                    <p>Halo ${user.name},</p>
                    <p>Kamu menerima email ini karena ada permintaan untuk reset password akun kamu.</p>
                    <p>Silakan klik tombol di bawah ini untuk mengatur ulang password kamu:</p>
                    <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #059669; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0;">Reset Password Saya</a>
                    <p>Jika kamu tidak merasa melakukan permintaan ini, silakan abaikan email ini.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #999;">Link ini akan kadaluwarsa dalam 1 jam.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: 'Email reset password telah dikirim' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset Password
app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    try {
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ message: 'Token tidak valid atau sudah kadaluwarsa' });

        user.password = newPassword; // Note: In production, hash this!
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ message: 'Password berhasil diperbarui' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });

        // If password is provided (local login)
        if (password) {
            if (user.password !== password) { // Note: in real app use bcrypt
                return res.status(401).json({ message: 'Invalid password' });
            }
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
        res.json({ token, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Register
app.post('/api/register', async (req, res) => {
    const { name, email, password, picture, phone, province, city } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'Email already registered' });

        const newUser = new User({ name, email, password, picture, phone, province, city });
        await newUser.save();
        res.status(201).json(newUser);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Profile
app.put('/api/users/:email', async (req, res) => {
    try {
        const user = await User.findOneAndUpdate(
            { email: req.params.email },
            { $set: req.body },
            { new: true }
        );
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save TO Attempt
app.post('/api/users/:email/attempts', async (req, res) => {
    const { packageName, attemptData } = req.body;
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.toAttempts) user.toAttempts = {};
        user.toAttempts[packageName] = attemptData;
        
        // Mark as modified for nested object
        user.markModified('toAttempts');
        await user.save();
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AppData Routes ---

// Get App Data
app.get('/api/appdata', async (req, res) => {
    try {
        let data = await AppData.findOne();
        if (!data) {
            // Initialize with empty structure if not exists
            data = new AppData({});
            await data.save();
        }
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Midtrans Payment Routes ---

const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Create Payment Transaction
app.post('/api/payment/create', async (req, res) => {
    const { email, packageId, couponCode } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const appData = await AppData.findOne();
        const pkg = appData.premiumPackages.find(p => p.id === packageId) || { name: 'Premium Membership', price: 49000 };
        
        let finalAmount = pkg.price;
        if (couponCode) {
            const coupon = appData.coupons.find(c => c.code === couponCode && c.isActive);
            if (coupon) {
                if (coupon.type === 'percentage') {
                    finalAmount = finalAmount - (finalAmount * (coupon.value / 100));
                } else {
                    finalAmount = Math.max(0, finalAmount - coupon.value);
                }
            }
        }

        const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        const parameter = {
            transaction_details: {
                order_id: orderId,
                gross_amount: finalAmount
            },
            customer_details: {
                first_name: user.name,
                email: user.email
            },
            item_details: [{
                id: packageId || 'PREMIUM_SUB',
                price: finalAmount,
                quantity: 1,
                name: pkg.name
            }],
            custom_field1: user.email,
            callbacks: {
                finish: `${process.env.FRONTEND_URL}/index.html?payment=success`
            }
        };

        const transaction = await snap.createTransaction(parameter);
        res.json(transaction);
    } catch (err) {
        console.error('Midtrans Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Midtrans Webhook Notification
app.post('/api/payment/webhook', async (req, res) => {
    const notification = req.body;
    try {
        const statusResponse = await snap.transaction.notification(notification);
        const orderId = statusResponse.order_id;
        const transactionStatus = statusResponse.transaction_status;
        const fraudStatus = statusResponse.fraud_status;

        if (transactionStatus == 'capture' || transactionStatus == 'settlement') {
            if (fraudStatus == 'accept' || transactionStatus == 'settlement') {
                // Payment success: Find user by email from customer details or metadata
                // Since Midtrans notification doesn't easily give customer email without custom field, 
                // we should have stored the orderId in a separate Transaction model or used metadata.
                // For simplicity here, let's assume we use metadata if supported or search by name (not ideal)
                // Better way: use custom_field1
                const userEmail = statusResponse.custom_field1; 
                if (userEmail) {
                    await User.findOneAndUpdate(
                        { email: userEmail },
                        { 
                            $set: { 
                                isPremium: true,
                                premiumUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
                            } 
                        }
                    );
                    console.log(`Payment Success for ${userEmail}`);
                }
            }
        }
        res.status(200).send('OK');
    } catch (err) {
        console.error('Webhook Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update App Data (Admin)
app.post('/api/appdata', async (req, res) => {
    try {
        let data = await AppData.findOne();
        if (data) {
            Object.assign(data, req.body);
            await data.save();
        } else {
            data = new AppData(req.body);
            await data.save();
        }
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get All Users (for IRT global calculation)
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, 'email toAttempts');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

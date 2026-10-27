import dotenv from 'dotenv';
import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

dotenv.config();
const app = express();

app.use(express.json());

app.use(cors({
    origin: ['http://localhost:5173', 'https://portfolio-by-chamod-nirmal.vercel.app']
}));

// --- 1. MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas! - server.js:21'))
    .catch((err) => console.error('❌ MongoDB Connection Error: - server.js:22', err));

// --- 2. Database Schemas & Models ---
const statsSchema = new mongoose.Schema({
    totalViews: { type: Number, default: 0 },
    activeProjects: { type: Number, default: 4 },
    newMessages: { type: Number, default: 0 },
    happyClients: { type: Number, default: 5 },
    techStackCount: { type: Number, default: 16 },
    cvDownloads: { type: Number, default: 0 },
    recentActivities: [
        {
            title: String,
            timestamp: { type: Date, default: Date.now },
            color: { type: String, default: 'teal' }
        }
    ]
});

const Stats = mongoose.model('Stats', statsSchema);

const messageSchema = new mongoose.Schema({
    user_name: { type: String, required: true },
    user_email: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Helper: Get or Create Stats Document
const getStatsDoc = async () => {
    let stats = await Stats.findOne();
    if (!stats) {
        stats = await Stats.create({
            recentActivities: [{ title: 'MongoDB tracking initialized', color: 'teal' }]
        });
    }
    return stats;
};

// Helper: Add Activity
const addActivity = async (stats, title, color = 'teal') => {
    stats.recentActivities.unshift({ title, timestamp: new Date(), color });
    if (stats.recentActivities.length > 8) {
        stats.recentActivities = stats.recentActivities.slice(0, 8);
    }
    await stats.save();
};

// --- JWT Middleware ---
const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized Access!' });
    }
    const token = authHeader.split(' ')[1];
    try {
        jwt.verify(token, process.env.JWT_SECRET || 'chamod_portfolio_secret_key');
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or Expired Token!' });
    }
};

// --- Nodemailer Setup ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- API ROUTES ---

// 1. Contact Form Email + Save to MongoDB
app.post('/api/send-email', async (req, res) => {
    const { user_name, user_email, message } = req.body;

    if (!user_name || !user_email || !message) {
        return res.status(400).json({ error: 'Please Fill All Fields!' });
    }

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        replyTo: user_email,
        subject: `New Portfolio Message from ${user_name}`,
        html: `
            <div style="padding: 20px; font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0d9488; border-bottom: 2px solid #0d9488; padding-bottom: 10px;">New Message from Portfolio</h2>
                <p style="font-size: 16px;"><strong>Name:</strong> ${user_name}</p>
                <p style="font-size: 16px;"><strong>Email:</strong> <a href="mailto:${user_email}" style="color: #0d9488; text-decoration: none;">${user_email}</a></p>
                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 20px; margin-bottom: 25px;">
                    <p style="margin: 0; white-space: pre-wrap; font-size: 15px;">${message}</p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        await Message.create({ user_name, user_email, message });

        const stats = await getStatsDoc();
        stats.newMessages = await Message.countDocuments({ isRead: false });
        await addActivity(stats, `New message received from ${user_name}`, 'blue');

        res.status(200).json({ success: true, message: 'Email Sent Successfully!' });
    } catch (error) {
        console.error('Error sending email: - server.js:134', error);
        res.status(500).json({ error: 'Failed to send email.' });
    }
});

// 2. Track Page View
app.post('/api/track/view', async (req, res) => {
    try {
        const stats = await getStatsDoc();
        stats.totalViews += 1;
        await stats.save();
        res.status(200).json({ success: true, totalViews: stats.totalViews });
    } catch (err) {
        res.status(500).json({ error: 'Failed to track view' });
    }
});

// 3. Track CV Download
app.post('/api/track/cv', async (req, res) => {
    try {
        const stats = await getStatsDoc();
        stats.cvDownloads += 1;
        await addActivity(stats, 'A visitor downloaded your CV', 'emerald');
        res.status(200).json({ success: true, cvDownloads: stats.cvDownloads });
    } catch (err) {
        res.status(500).json({ error: 'Failed to track CV download' });
    }
});

// 4. Admin Login
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

    if (username === adminUser && password === adminPass) {
        const token = jwt.sign(
            { username: adminUser },
            process.env.JWT_SECRET || 'chamod_portfolio_secret_key',
            { expiresIn: '2h' }
        );

        const stats = await getStatsDoc();
        await addActivity(stats, 'Admin logged into the dashboard', 'teal');

        return res.status(200).json({
            success: true,
            message: 'Login Successful!',
            token
        });
    }
    return res.status(401).json({
        success: false,
        message: 'Invalid Username or Password!'
    });
});

// 5. Get Dashboard Overview Data
app.get('/api/admin/overview', verifyAdmin, async (req, res) => {
    try {
        const stats = await getStatsDoc();
        res.status(200).json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch overview stats' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} - server.js:203`);
});
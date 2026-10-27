import dotenv from 'dotenv';
import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import dns from 'node:dns';

dotenv.config();

// ශ්‍රී ලංකාවේ ISP DNS වල SRV lookup ප්‍රශ්නය local එකේදී විතරක් විසඳන්න.
// Vercel එකේදී මේක අවශ්‍ය නැහැ.
if (!process.env.VERCEL) {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const app = express();

app.use(express.json());

app.use(cors({
    origin: ['http://localhost:5173', 'https://portfolio-by-chamod-nirmal.vercel.app']
}));

// --- 1. MongoDB Connection (Serverless-safe) ---
let isConnected = false;

const connectDB = async () => {
    if (isConnected && mongoose.connection.readyState === 1) return;

    await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 8000
    });
    isConnected = true;
    console.log('✅ Connected to MongoDB Atlas! - server.js:35');
};

// හැම request එකකටම කලින් DB connection එක ready බව තහවුරු කරනවා
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        isConnected = false;
        console.error('❌ MongoDB Connection Error: - server.js:45', err);
        res.status(500).json({ error: 'Database connection failed' });
    }
});

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

const Stats = mongoose.models.Stats || mongoose.model('Stats', statsSchema);

const messageSchema = new mongoose.Schema({
    user_name: { type: String, required: true },
    user_email: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

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

// Helper: HTML escape (email එකට user input දාද්දී ආරක්ෂාවට)
const escapeHtml = (str = '') =>
    String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

// --- JWT Middleware ---
const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized Access!' });
    }
    const token = authHeader.split(' ')[1];
    try {
        jwt.verify(token, process.env.JWT_SECRET);
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

    const safeName = escapeHtml(user_name);
    const safeEmail = escapeHtml(user_email);
    const safeMessage = escapeHtml(message);

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        replyTo: user_email,
        subject: `New Portfolio Message from ${user_name}`,
        html: `
            <div style="padding: 20px; font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0d9488; border-bottom: 2px solid #0d9488; padding-bottom: 10px;">New Message from Portfolio</h2>
                <p style="font-size: 16px;"><strong>Name:</strong> ${safeName}</p>
                <p style="font-size: 16px;"><strong>Email:</strong> <a href="mailto:${safeEmail}" style="color: #0d9488; text-decoration: none;">${safeEmail}</a></p>
                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 20px; margin-bottom: 25px;">
                    <p style="margin: 0; white-space: pre-wrap; font-size: 15px;">${safeMessage}</p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending email: - server.js:166', error);
        return res.status(500).json({ error: 'Failed to send email.' });
    }

    // Mail එක ගියා. DB save එක fail වුණත් user ට error එකක් පෙන්නන්නේ නැහැ.
    try {
        await Message.create({ user_name, user_email, message });
        const stats = await getStatsDoc();
        stats.newMessages = await Message.countDocuments({ isRead: false });
        await addActivity(stats, `New message received from ${user_name}`, 'blue');
    } catch (dbErr) {
        console.error('DB save failed (email was sent): - server.js:177', dbErr);
    }

    return res.status(200).json({ success: true, message: 'Email Sent Successfully!' });
});

// 2. Track Page View
app.post('/api/track/view', async (req, res) => {
    try {
        const stats = await getStatsDoc();
        stats.totalViews += 1;
        await stats.save();
        res.status(200).json({ success: true, totalViews: stats.totalViews });
    } catch (err) {
        console.error('Track view error: - server.js:191', err);
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
        console.error('Track CV error: - server.js:204', err);
        res.status(500).json({ error: 'Failed to track CV download' });
    }
});

// 4. Admin Login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const adminUser = process.env.ADMIN_USERNAME;
        const adminPass = process.env.ADMIN_PASSWORD;

        if (!adminUser || !adminPass || !process.env.JWT_SECRET) {
            console.error('ADMIN_USERNAME / ADMIN_PASSWORD / JWT_SECRET env variables missing - server.js:217');
            return res.status(500).json({ success: false, message: 'Server configuration error' });
        }

        if (username === adminUser && password === adminPass) {
            const token = jwt.sign(
                { username: adminUser },
                process.env.JWT_SECRET,
                { expiresIn: '2h' }
            );

            try {
                const stats = await getStatsDoc();
                await addActivity(stats, 'Admin logged into the dashboard', 'teal');
            } catch (dbErr) {
                console.error('Activity log failed: - server.js:232', dbErr);
            }

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
    } catch (err) {
        console.error('Login error: - server.js:247', err);
        return res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// 5. Get Dashboard Overview Data
app.get('/api/admin/overview', verifyAdmin, async (req, res) => {
    try {
        const stats = await getStatsDoc();
        res.status(200).json({ success: true, data: stats });
    } catch (err) {
        console.error('Overview error: - server.js:258', err);
        res.status(500).json({ error: 'Failed to fetch overview stats' });
    }
});

// --- Server Start ---
// Local: app.listen. Vercel: app එක export කරනවා.
const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT} - server.js:268`);
    });
}

export default app;
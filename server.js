import dotenv from 'dotenv';
import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import dns from 'node:dns';

dotenv.config();

// ශ්‍රී ලංකාවේ ISP DNS වල SRV lookup ප්‍රශ්නය local එකේදී විතරක් විසඳන්න.
if (!process.env.VERCEL) {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const app = express();

app.use(express.json({ limit: '4mb' }));

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
    console.log('✅ Connected to MongoDB Atlas! - server.js:34');
};

app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        isConnected = false;
        console.error('❌ MongoDB Connection Error: - server.js:43', err);
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

const PROJECT_CATEGORIES = [
    'Web App', 'E-Commerce', 'Desktop App', 'Mobile App',
    'IoT', 'AI / ML', 'Designing', 'Game', 'Other'
];

const projectSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, enum: PROJECT_CATEGORIES, default: 'Other' },
    technologies: [String],
    status: { type: String, default: 'Active' },
    githubLink: String,
    liveLink: String,
    imageUrl: String,
    createdAt: { type: Date, default: Date.now }
});

const ProjectModel = mongoose.models.Project || mongoose.model('Project', projectSchema);

// --- Skill Model & Schema ---
const SKILL_CATEGORIES = [
    'Web Based', 'Frontend', 'Backend', 'Mobile Dev',
    'Desktop App', 'Database', 'AI & ML', 'Robotics & IoT', 'Tools',
    'Management', 'Languages / Communication', 'Soft Skills'
];

const skillSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    categories: [{ type: String, enum: SKILL_CATEGORIES }],
    proficiency: { type: Number, default: 85, min: 0, max: 100 },
    icon: { type: String, default: 'FaCode' },
    color: { type: String, default: 'text-teal-500' },
    desc: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const SkillModel = mongoose.models.Skill || mongoose.model('Skill', skillSchema);

// --- Experience / Education Schema & Model ---
const timelineSchema = new mongoose.Schema({
    type: { type: String, enum: ['experience', 'education'], required: true },
    title: { type: String, required: true },
    organization: { type: String, required: true },
    startDate: { type: String, default: '' },
    endDate: { type: String, default: '' },
    duration: { type: String, default: '' },
    description: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const TimelineModel = mongoose.models.Timeline || mongoose.model('Timeline', timelineSchema);

// --- Certificate Schema & Model ---
const certificateSchema = new mongoose.Schema({
    title: { type: String, required: true },
    issuer: { type: String, required: true },
    date: { type: String, default: '' },
    category: { type: String, enum: ['Education', 'Professional', 'Language'], default: 'Professional' },
    status: { type: String, enum: ['Completed', 'In Progress'], default: 'Completed' },
    credentialId: { type: String, default: '' },
    credentials: [
        {
            label: String,
            url: String,
            type: { type: String, default: 'link' } // 'link' හෝ 'image'
        }
    ],
    createdAt: { type: Date, default: Date.now }
});

const CertificateModel = mongoose.models.Certificate || mongoose.model('Certificate', certificateSchema);

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

// --- Profile & Contact Settings Schema ---
const profileSchema = new mongoose.Schema({
    fullName: { type: String, default: 'Chamod Nirmal' },
    jobTitle: { type: String, default: 'Full Stack Developer' },
    contactEmail: { type: String, default: 'chamod@example.com' },
    avatarUrl: { type: String, default: '' },
    cvUrl: { type: String, default: '' }, // Dynamic CV file (Base64)
    // Hero Section Details
    heroTitlePrefix: { type: String, default: "Hello, I'm" },
    heroBio: { type: String, default: "Welcome to my portfolio! I am DMD Chamod Nirmal, a multi-disciplinary Full Stack Developer and Tech Enthusiast. From building robust web and desktop applications to developing hardware-integrated IoT systems with ESP32, Arduino, and other microcontrollers, and crafting high-quality video content, I deliver complete end-to-end digital solutions." },
    yearsExperience: { type: Number, default: 3 },
    projectsDone: { type: Number, default: 30 },
    happyClients: { type: Number, default: 10 },
    // About Section Details
    aboutTitle: { type: String, default: 'Turning Ideas Into' },
    aboutSubtitle: { type: String, default: 'Digital Reality' },
    aboutBio: { type: String, default: "Hi, I'm Chamod Nirmal, a Freelance Full-Stack Developer based in Sri Lanka, currently pursuing my BSc in Software Engineering at Birmingham City University. I specialize in building secure and scalable applications using React.js, Node.js, and Java, turning complex ideas into elegant digital solutions." },
    // Contact Section Details
    whatsappNumber: { type: String, default: '94711234567' },
    locationText: { type: String, default: 'Piliyandala, Sri Lanka' },
    mapCoordinates: { type: String, default: '6.769238,79.94509' },
    // Social Links
    socials: {
        linkedin: { type: String, default: 'https://www.linkedin.com/in/chamod-nirmal-79113528a' },
        github: { type: String, default: 'https://github.com/chamodNirmalDev' },
        youtube: { type: String, default: 'https://www.youtube.com/@chamodnirmal3476' },
        facebook: { type: String, default: 'https://www.facebook.com/chamod.nirmal.792' },
        instagram: { type: String, default: 'https://www.instagram.com/chamod.nirmal.792/' },
        tiktok: { type: String, default: 'https://www.tiktok.com/@chamod.nirmal90' },
        twitter: { type: String, default: '' }
    }
}, { timestamps: true });

const ProfileModel = mongoose.models.Profile || mongoose.model('Profile', profileSchema);

// Helper: Add Activity
const addActivity = async (stats, title, color = 'teal') => {
    stats.recentActivities.unshift({ title, timestamp: new Date(), color });
    if (stats.recentActivities.length > 8) {
        stats.recentActivities = stats.recentActivities.slice(0, 8);
    }
    await stats.save();
};

// Helper function: මුල් Profile Document එක ලබාගැනීම හෝ සාදාගැනීම
async function getProfileDoc() {
    let doc = await ProfileModel.findOne();
    if (!doc) doc = await ProfileModel.create({});
    return doc;
}

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
        console.error('Error sending email: - server.js:277', error);
        return res.status(500).json({ error: 'Failed to send email.' });
    }

    try {
        await Message.create({ user_name, user_email, message });
        const stats = await getStatsDoc();
        stats.newMessages = await Message.countDocuments({ isRead: false });
        await addActivity(stats, `New message received from ${user_name}`, 'blue');
    } catch (dbErr) {
        console.error('DB save failed (email was sent): - server.js:287', dbErr);
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
        console.error('Track view error: - server.js:301', err);
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
        console.error('Track CV error: - server.js:314', err);
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
            console.error('ADMIN_USERNAME / ADMIN_PASSWORD / JWT_SECRET env variables missing - server.js:327');
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
                console.error('Activity log failed: - server.js:342', dbErr);
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
        console.error('Login error: - server.js:357', err);
        return res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// 5. Get Dashboard Overview Data
app.get('/api/admin/overview', verifyAdmin, async (req, res) => {
    try {
        const stats = await getStatsDoc();
        res.status(200).json({ success: true, data: stats });
    } catch (err) {
        console.error('Overview error: - server.js:368', err);
        res.status(500).json({ error: 'Failed to fetch overview stats' });
    }
});

// --- PROJECTS ROUTES ---

// 6. Get All Projects (Public)
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await ProjectModel.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: projects });
    } catch (err) {
        console.error('Fetch projects error: - server.js:381', err);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

const toTechArray = (technologies) =>
    typeof technologies === 'string'
        ? technologies.split(',').map(t => t.trim()).filter(Boolean)
        : (technologies || []);

// 7. Add New Project (Admin Only)
app.post('/api/admin/projects', verifyAdmin, async (req, res) => {
    try {
        const { title, description, category, technologies, status, githubLink, liveLink, imageUrl } = req.body;

        const newProject = await ProjectModel.create({
            title,
            description,
            category: PROJECT_CATEGORIES.includes(category) ? category : 'Other',
            technologies: toTechArray(technologies),
            status,
            githubLink,
            liveLink,
            imageUrl
        });

        try {
            const stats = await getStatsDoc();
            stats.activeProjects = await ProjectModel.countDocuments();
            await addActivity(stats, `New project added: ${title}`, 'teal');
        } catch (e) {
            console.error('Stats update failed: - server.js:412', e);
        }

        res.status(201).json({ success: true, data: newProject });
    } catch (err) {
        console.error('Create project error: - server.js:417', err);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// 8. Update Project (Admin Only)
app.put('/api/admin/projects/:id', verifyAdmin, async (req, res) => {
    try {
        const { title, description, category, technologies, status, githubLink, liveLink, imageUrl } = req.body;

        const updated = await ProjectModel.findByIdAndUpdate(
            req.params.id,
            {
                title,
                description,
                category: PROJECT_CATEGORIES.includes(category) ? category : 'Other',
                technologies: toTechArray(technologies),
                status,
                githubLink,
                liveLink,
                imageUrl
            },
            { new: true, runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: 'Project not found' });

        try {
            const stats = await getStatsDoc();
            await addActivity(stats, `Project updated: ${updated.title}`, 'blue');
        } catch (e) {
            console.error('Stats update failed: - server.js:447', e);
        }

        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        console.error('Update project error: - server.js:452', err);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// 9. Delete Project (Admin Only)
app.delete('/api/admin/projects/:id', verifyAdmin, async (req, res) => {
    try {
        const project = await ProjectModel.findByIdAndDelete(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        try {
            const stats = await getStatsDoc();
            stats.activeProjects = await ProjectModel.countDocuments();
            await addActivity(stats, `Project deleted: ${project.title}`, 'red');
        } catch (e) {
            console.error('Stats update failed: - server.js:468', e);
        }

        res.status(200).json({ success: true, message: 'Project deleted successfully' });
    } catch (err) {
        console.error('Delete project error: - server.js:473', err);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// --- SKILLS ROUTES ---

const toCategoryArray = (categories) => {
    if (Array.isArray(categories)) return categories;
    if (typeof categories === 'string') {
        return categories.split(',').map(c => c.trim()).filter(Boolean);
    }
    return [];
};

// 10. Get All Skills (Public)
app.get('/api/skills', async (req, res) => {
    try {
        const skills = await SkillModel.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: skills });
    } catch (err) {
        console.error('Fetch skills error: - server.js:494', err);
        res.status(500).json({ error: 'Failed to fetch skills' });
    }
});

// 11. Add New Skill (Admin Only)
app.post('/api/admin/skills', verifyAdmin, async (req, res) => {
    try {
        const { name, categories, proficiency, icon, color, desc } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Skill name is required' });
        }

        const validCategories = toCategoryArray(categories).filter(c => SKILL_CATEGORIES.includes(c));

        const newSkill = await SkillModel.create({
            name,
            categories: validCategories.length ? validCategories : ['Tools'],
            proficiency: Number(proficiency) || 85,
            icon: icon || 'FaCode',
            color: color || 'text-teal-500',
            desc: desc || ''
        });

        try {
            const stats = await getStatsDoc();
            stats.techStackCount = await SkillModel.countDocuments();
            await addActivity(stats, `New skill added: ${name}`, 'teal');
        } catch (e) {
            console.error('Stats update failed: - server.js:524', e);
        }

        res.status(201).json({ success: true, data: newSkill });
    } catch (err) {
        console.error('Create skill error: - server.js:529', err);
        res.status(500).json({ error: 'Failed to create skill' });
    }
});

// 12. Update Skill (Admin Only)
app.put('/api/admin/skills/:id', verifyAdmin, async (req, res) => {
    try {
        const { name, categories, proficiency, icon, color, desc } = req.body;
        const validCategories = toCategoryArray(categories).filter(c => SKILL_CATEGORIES.includes(c));

        const updated = await SkillModel.findByIdAndUpdate(
            req.params.id,
            {
                name,
                categories: validCategories.length ? validCategories : ['Tools'],
                proficiency: Number(proficiency) || 85,
                icon,
                color,
                desc
            },
            { new: true, runValidators: true }
        );

        if (!updated) return res.status(404).json({ error: 'Skill not found' });

        try {
            const stats = await getStatsDoc();
            await addActivity(stats, `Skill updated: ${updated.name}`, 'blue');
        } catch (e) {
            console.error('Stats update failed: - server.js:559', e);
        }

        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        console.error('Update skill error: - server.js:564', err);
        res.status(500).json({ error: 'Failed to update skill' });
    }
});

// 13. Delete Skill (Admin Only)
app.delete('/api/admin/skills/:id', verifyAdmin, async (req, res) => {
    try {
        const skill = await SkillModel.findByIdAndDelete(req.params.id);
        if (!skill) return res.status(404).json({ error: 'Skill not found' });

        try {
            const stats = await getStatsDoc();
            stats.techStackCount = await SkillModel.countDocuments();
            await addActivity(stats, `Skill deleted: ${skill.name}`, 'red');
        } catch (e) {
            console.error('Stats update failed: - server.js:580', e);
        }

        res.status(200).json({ success: true, message: 'Skill deleted successfully' });
    } catch (err) {
        console.error('Delete skill error: - server.js:585', err);
        res.status(500).json({ error: 'Failed to delete skill' });
    }
});

// --- MESSAGES MANAGEMENT ROUTES (Admin Only) ---

// 14. Get All Messages
app.get('/api/admin/messages', verifyAdmin, async (req, res) => {
    try {
        const messages = await Message.find().sort({ createdAt: -1 });
        const unreadCount = await Message.countDocuments({ isRead: false });
        res.status(200).json({ success: true, data: messages, unreadCount });
    } catch (err) {
        console.error('Fetch messages error: - server.js:599', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// 15. Mark Message as Read
app.patch('/api/admin/messages/:id/read', verifyAdmin, async (req, res) => {
    try {
        const message = await Message.findByIdAndUpdate(
            req.params.id,
            { isRead: true },
            { new: true }
        );
        if (!message) return res.status(404).json({ error: 'Message not found' });

        const stats = await getStatsDoc();
        stats.newMessages = await Message.countDocuments({ isRead: false });
        await stats.save();

        res.status(200).json({ success: true, data: message, unreadCount: stats.newMessages });
    } catch (err) {
        console.error('Mark read error: - server.js:620', err);
        res.status(500).json({ error: 'Failed to update message status' });
    }
});

// 16. Delete Message
app.delete('/api/admin/messages/:id', verifyAdmin, async (req, res) => {
    try {
        const message = await Message.findByIdAndDelete(req.params.id);
        if (!message) return res.status(404).json({ error: 'Message not found' });

        const stats = await getStatsDoc();
        stats.newMessages = await Message.countDocuments({ isRead: false });
        await addActivity(stats, `Message from ${message.user_name} deleted`, 'red');

        res.status(200).json({ success: true, message: 'Message deleted successfully', unreadCount: stats.newMessages });
    } catch (err) {
        console.error('Delete message error: - server.js:637', err);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// --- TIMELINE (Experience & Education) ROUTES ---

// Get All Timeline records (Public)
app.get('/api/timeline', async (req, res) => {
    try {
        const records = await TimelineModel.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: records });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch timeline records' });
    }
});

// Add Timeline record (Admin)
app.post('/api/admin/timeline', verifyAdmin, async (req, res) => {
    try {
        const { type, title, organization, startDate, endDate, description } = req.body;
        const duration = startDate && endDate ? `${startDate} - ${endDate}` : startDate || endDate || '';

        const newRecord = await TimelineModel.create({
            type,
            title,
            organization,
            startDate,
            endDate,
            duration,
            description
        });

        const stats = await getStatsDoc();
        await addActivity(stats, `Added new ${type}: ${title}`, 'teal');

        res.status(201).json({ success: true, data: newRecord });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create record' });
    }
});

// Update Timeline record (Admin)
app.put('/api/admin/timeline/:id', verifyAdmin, async (req, res) => {
    try {
        const { type, title, organization, startDate, endDate, description } = req.body;
        const duration = startDate && endDate ? `${startDate} - ${endDate}` : startDate || endDate || '';

        const updated = await TimelineModel.findByIdAndUpdate(
            req.params.id,
            { type, title, organization, startDate, endDate, duration, description },
            { new: true, runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: 'Record not found' });

        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update record' });
    }
});

// Delete Timeline record (Admin)
app.delete('/api/admin/timeline/:id', verifyAdmin, async (req, res) => {
    try {
        const record = await TimelineModel.findByIdAndDelete(req.params.id);
        if (!record) return res.status(404).json({ error: 'Record not found' });

        const stats = await getStatsDoc();
        await addActivity(stats, `Deleted ${record.type}: ${record.title}`, 'red');

        res.status(200).json({ success: true, message: 'Record deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete record' });
    }
});

// --- CERTIFICATES ROUTES ---

// Get All Certificates (Public)
app.get('/api/certificates', async (req, res) => {
    try {
        const certs = await CertificateModel.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: certs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch certificates' });
    }
});

// Add Certificate (Admin)
app.post('/api/admin/certificates', verifyAdmin, async (req, res) => {
    try {
        const { title, issuer, date, category, status, credentialId, credentials } = req.body;
        const newCert = await CertificateModel.create({
            title,
            issuer,
            date,
            category,
            status,
            credentialId,
            credentials: credentials || []
        });

        const stats = await getStatsDoc();
        await addActivity(stats, `Added certificate: ${title}`, 'teal');

        res.status(201).json({ success: true, data: newCert });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create certificate' });
    }
});

// Update Certificate (Admin)
app.put('/api/admin/certificates/:id', verifyAdmin, async (req, res) => {
    try {
        const updated = await CertificateModel.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: 'Certificate not found' });
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update certificate' });
    }
});

// Delete Certificate (Admin)
app.delete('/api/admin/certificates/:id', verifyAdmin, async (req, res) => {
    try {
        const cert = await CertificateModel.findByIdAndDelete(req.params.id);
        if (!cert) return res.status(404).json({ error: 'Certificate not found' });

        const stats = await getStatsDoc();
        await addActivity(stats, `Deleted certificate: ${cert.title}`, 'red');

        res.status(200).json({ success: true, message: 'Certificate deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete certificate' });
    }
});

// --- SETTINGS & PROFILE API ROUTES ---

// 1. Get Profile & Settings Data (Public)
app.get('/api/profile', async (req, res) => {
    try {
        const profile = await getProfileDoc();
        res.status(200).json({ success: true, data: profile });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// 2. Update Profile & Settings (Admin Only)
app.put('/api/admin/profile', verifyAdmin, async (req, res) => {
    try {
        const profile = await getProfileDoc();
        Object.assign(profile, req.body);
        if (req.body.socials) {
            profile.socials = { ...profile.socials.toObject(), ...req.body.socials };
        }
        await profile.save();
        const stats = await getStatsDoc();
        await addActivity(stats, 'Updated website profile and settings', 'teal');
        res.status(200).json({ success: true, message: 'Settings saved', data: profile });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// 3. Update Admin Credentials (Username & Password)
app.post('/api/admin/update-credentials', verifyAdmin, async (req, res) => {
    try {
        const { currentPassword, newUsername, newPassword } = req.body;
        if (!currentPassword) return res.status(400).json({ error: 'Current password is required' });

        const admin = await AdminModel.findById(req.admin.id || req.admin._id);
        if (!admin) return res.status(404).json({ error: 'Admin account not found' });

        const isMatch = await bcrypt.compare(currentPassword, admin.password);
        if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect' });

        if (newUsername && newUsername.trim()) {
            admin.username = newUsername.trim();
        }

        if (newPassword && newPassword.trim()) {
            if (newPassword.length < 6) {
                return res.status(400).json({ error: 'New password must be at least 6 characters' });
            }
            const salt = await bcrypt.genSalt(10);
            admin.password = await bcrypt.hash(newPassword, salt);
        }

        await admin.save();
        const stats = await getStatsDoc();
        await addActivity(stats, 'Admin credentials updated', 'amber');

        res.status(200).json({ success: true, message: 'Credentials updated successfully', username: admin.username });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update credentials' });
    }
});

// --- Server Start ---
const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT} - server.js:845`);
    });
}

export default app;
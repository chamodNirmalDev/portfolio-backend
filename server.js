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
    'Desktop App', 'Database', 'AI & ML', 'Robotics & IoT', 'Tools'
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
        console.error('Error sending email: - server.js:200', error);
        return res.status(500).json({ error: 'Failed to send email.' });
    }

    try {
        await Message.create({ user_name, user_email, message });
        const stats = await getStatsDoc();
        stats.newMessages = await Message.countDocuments({ isRead: false });
        await addActivity(stats, `New message received from ${user_name}`, 'blue');
    } catch (dbErr) {
        console.error('DB save failed (email was sent): - server.js:210', dbErr);
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
        console.error('Track view error: - server.js:224', err);
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
        console.error('Track CV error: - server.js:237', err);
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
            console.error('ADMIN_USERNAME / ADMIN_PASSWORD / JWT_SECRET env variables missing - server.js:250');
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
                console.error('Activity log failed: - server.js:265', dbErr);
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
        console.error('Login error: - server.js:280', err);
        return res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// 5. Get Dashboard Overview Data
app.get('/api/admin/overview', verifyAdmin, async (req, res) => {
    try {
        const stats = await getStatsDoc();
        res.status(200).json({ success: true, data: stats });
    } catch (err) {
        console.error('Overview error: - server.js:291', err);
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
        console.error('Fetch projects error: - server.js:304', err);
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
            console.error('Stats update failed: - server.js:335', e);
        }

        res.status(201).json({ success: true, data: newProject });
    } catch (err) {
        console.error('Create project error: - server.js:340', err);
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
            console.error('Stats update failed: - server.js:370', e);
        }

        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        console.error('Update project error: - server.js:375', err);
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
            console.error('Stats update failed: - server.js:391', e);
        }

        res.status(200).json({ success: true, message: 'Project deleted successfully' });
    } catch (err) {
        console.error('Delete project error: - server.js:396', err);
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
        console.error('Fetch skills error: - server.js:417', err);
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
            console.error('Stats update failed: - server.js:447', e);
        }

        res.status(201).json({ success: true, data: newSkill });
    } catch (err) {
        console.error('Create skill error: - server.js:452', err);
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
            console.error('Stats update failed: - server.js:482', e);
        }

        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        console.error('Update skill error: - server.js:487', err);
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
            console.error('Stats update failed: - server.js:503', e);
        }

        res.status(200).json({ success: true, message: 'Skill deleted successfully' });
    } catch (err) {
        console.error('Delete skill error: - server.js:508', err);
        res.status(500).json({ error: 'Failed to delete skill' });
    }
});

// --- Server Start ---
const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT} - server.js:517`);
    });
}

export default app;
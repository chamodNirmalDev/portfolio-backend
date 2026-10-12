import dotenv from 'dotenv';
import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';

dotenv.config();
const app = express();

app.use(express.json());

app.use(cors({
    origin: ['http://localhost:5173', 'https://portfolio-by-chamod-nirmal.vercel.app']
}));

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.post('/api/send-email', async (req, res) => {
    const { user_name, user_email, message } = req.body;

    if (!user_name || !user_email || !message) {
        return res.status(400).json({
            error: 'Please Fill All Fields!'
        });
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

                <!-- අලුතින් එක් කළ Reply Button එක -->
                <a href="mailto:${user_email}?subject=Re: Your Message on My Portfolio" 
                   style="display: inline-block; background-color: #0d9488; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                   Reply to ${user_name}
                </a>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json(
            {
                success: true,
                message: 'Email Sent Successfully!'
            }
        );
    } catch (error) {
        console.error('Error sending email: - server.js:66', error);
        res.status(500).json({
            error: 'Failed to send email.'
        });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} - server.js:75`);
})
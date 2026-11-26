
require('dotenv').config();

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendTestEmail() {
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: 'Lost and Found - Email Test',
            text: 'Congratulations! Your Gmail is successfully connected to the Lost and Found application.'
        });

        console.log('Email sent successfully!');
        console.log('Message ID:', info.messageId);

    } catch (error) {
        console.log('Email sending failed:', error.message);
    }
}

sendTestEmail();

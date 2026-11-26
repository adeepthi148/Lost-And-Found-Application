
require('dotenv').config();

const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const prompt = require('prompt-sync')({ sigint: true });

// Enter admin details first
const name = prompt('Enter Admin Name: ').trim();
const email = prompt('Enter Admin Email: ').trim();
const password = prompt.hide('Enter Admin Password: ');

async function createAdmin() {
    if (!name || !email || !password) {
        console.log('Please fill all fields.');
        return;
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        // Connect only after entering details
        const db = mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        db.connect((err) => {
            if (err) {
                console.log('Database connection failed:', err.message);
                return;
            }

            console.log('MySQL Connected Successfully!');

            const sql = `INSERT INTO admins (name, email, password)
                         VALUES (?, ?, ?)`;

            db.query(sql, [name, email, hashedPassword], (err) => {
                if (err) {
                    console.log('Admin creation failed:', err.message);
                } else {
                    console.log('Admin account created successfully!');
                }

                db.end();
            });
        });

    } catch (error) {
        console.log('Error:', error.message);
    }
}

createAdmin();

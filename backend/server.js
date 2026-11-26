
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const db = require('./db');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- MIDDLEWARE --------------------

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadFolder = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder, { recursive: true });
}

// -------------------- EMAIL SETUP --------------------

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// -------------------- PHOTO UPLOAD --------------------

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadFolder);
    },

    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname);
        cb(null, Date.now() + extension);
    }
});

const upload = multer({ storage });

// -------------------- HOME --------------------

app.get('/', (req, res) => {
    res.send('Lost and Found Backend is Running!');
});

// -------------------- TEST --------------------

app.get('/test', (req, res) => {
    res.send('Backend is working successfully!');
});

// -------------------- TEST DATABASE --------------------

app.get('/test-db', (req, res) => {
    db.query('SHOW TABLES', (err, result) => {
        if (err) {
            return res.status(500).json({
                message: err.message
            });
        }

        res.json(result);
    });
});

// -------------------- REGISTER --------------------

app.post('/register', (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            message: 'Fill all fields'
        });
    }

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            return res.status(500).json({
                message: 'Password error'
            });
        }

        db.query(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            [name, email, hash],
            (err) => {
                if (err) {
                    return res.status(500).json({
                        message: err.code === 'ER_DUP_ENTRY'
                            ? 'Email already registered!'
                            : 'Registration failed.'
                    });
                }

                res.json({
                    message: 'Registration successful!'
                });
            }
        );
    });
});

// -------------------- LOGIN --------------------

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: 'Enter email and password'
        });
    }

    db.query(
        'SELECT * FROM users WHERE email = ?',
        [email],
        (err, result) => {
            if (err) {
                return res.status(500).json({
                    message: 'Database error'
                });
            }

            if (result.length === 0) {
                return res.status(401).json({
                    message: 'Email not registered!'
                });
            }

            bcrypt.compare(password, result[0].password, (err, match) => {
                if (err || !match) {
                    return res.status(401).json({
                        message: 'Invalid email or password!'
                    });
                }

                res.json({
                    message: 'Login successful!',
                    user: {
                        user_id: result[0].user_id,
                        name: result[0].name,
                        email: result[0].email
                    }
                });
            });
        }
    );
});

// -------------------- REPORT LOST ITEM --------------------

app.post('/report-lost', upload.single('photo'), (req, res) => {
    const {
        title,
        category,
        description,
        location,
        item_date,
        contact_email,
        user_id
    } = req.body;

    if (
        !title || !category || !description || !location ||
        !item_date || !contact_email || !user_id
    ) {
        if (req.file) fs.unlink(req.file.path, () => {});

        return res.status(400).json({
            message: 'Fill all fields'
        });
    }

    const photo = req.file
        ? 'uploads/' + req.file.filename
        : null;

    const sql = `
        INSERT INTO items
        (title, category, description, location, status,
        contact_email, user_id, item_date, photo_path)
        VALUES (?, ?, ?, ?, 'lost', ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            title,
            category,
            description,
            location,
            contact_email,
            user_id,
            item_date,
            photo
        ],
        (err, result) => {
            if (err) {
                if (req.file) fs.unlink(req.file.path, () => {});

                return res.status(500).json({
                    message: err.message
                });
            }

            res.json({
                message: 'Lost item reported successfully!',
                item_id: result.insertId,
                photo_path: photo
            });
        }
    );
});

// -------------------- REPORT FOUND ITEM --------------------

app.post('/report-found', upload.single('photo'), (req, res) => {
    const {
        title,
        category,
        description,
        location,
        item_date,
        contact_email,
        user_id
    } = req.body;

    if (
        !title || !category || !description || !location ||
        !item_date || !contact_email || !user_id
    ) {
        if (req.file) fs.unlink(req.file.path, () => {});

        return res.status(400).json({
            message: 'Fill all fields'
        });
    }

    const photo = req.file
        ? 'uploads/' + req.file.filename
        : null;

    const sql = `
        INSERT INTO items
        (title, category, description, location, status,
        contact_email, user_id, item_date, photo_path)
        VALUES (?, ?, ?, ?, 'found', ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            title,
            category,
            description,
            location,
            contact_email,
            user_id,
            item_date,
            photo
        ],
        (err, result) => {
            if (err) {
                if (req.file) fs.unlink(req.file.path, () => {});

                return res.status(500).json({
                    message: err.message
                });
            }

            res.json({
                message: 'Found item reported successfully!',
                item_id: result.insertId,
                photo_path: photo
            });
        }
    );
});

// -------------------- GET ALL ITEMS --------------------

// Returns lost, found and recovered reports.
// recovery_label tells the frontend how to display completed reports.

app.get('/items', (req, res) => {
    const sql = `
        SELECT
            items.*,
            users.name AS reported_by,

            CASE
                WHEN items.status = 'recovered'
                     AND r.found_item_id = items.id
                    THEN 'RETURNED'

                WHEN items.status = 'recovered'
                    THEN 'RECOVERED'

                ELSE NULL
            END AS recovery_label

        FROM items

        LEFT JOIN users
            ON items.user_id = users.user_id

        LEFT JOIN item_recoveries r
            ON (
                r.lost_item_id = items.id
                OR r.found_item_id = items.id
            )
            AND r.recovery_status = 'recovered'

        ORDER BY items.id DESC
    `;

    db.query(sql, (err, result) => {
        if (err) {
            return res.status(500).json({
                message: err.message
            });
        }

        res.json(result);
    });
});

// ======================================================
//       INTERNAL MATCHING AND TWO-STUDENT CONFIRMATION
// ======================================================

// -------------------- LINK MATCHING REPORTS --------------------

// This does not create a visible recovery request.
// It simply links the matching lost and found reports.

app.post('/recoveries/link', (req, res) => {
    const {
        lost_item_id,
        found_item_id,
        user_id
    } = req.body;

    if (!lost_item_id || !found_item_id || !user_id) {
        return res.status(400).json({
            message: 'Lost report, found report and user ID are required.'
        });
    }

    if (Number(lost_item_id) === Number(found_item_id)) {
        return res.status(400).json({
            message: 'Please select two different reports.'
        });
    }

    const sql = `
        SELECT id, user_id, status
        FROM items
        WHERE id IN (?, ?)
    `;

    db.query(sql, [lost_item_id, found_item_id], (err, items) => {
        if (err) {
            return res.status(500).json({
                message: err.message
            });
        }

        const lostItem = items.find(item =>
            Number(item.id) === Number(lost_item_id)
        );

        const foundItem = items.find(item =>
            Number(item.id) === Number(found_item_id)
        );

        if (!lostItem || !foundItem) {
            return res.status(404).json({
                message: 'One or both reports were not found.'
            });
        }

        if (
            lostItem.status !== 'lost' ||
            foundItem.status !== 'found'
        ) {
            return res.status(400).json({
                message: 'Please select an active lost report and an active found report.'
            });
        }

        if (
            String(lostItem.user_id) === String(foundItem.user_id)
        ) {
            return res.status(400).json({
                message: 'The two reports must belong to different students.'
            });
        }

        // Only a student who owns one of these reports can link them.
        if (
            String(user_id) !== String(lostItem.user_id) &&
            String(user_id) !== String(foundItem.user_id)
        ) {
            return res.status(403).json({
                message: 'You do not own either of these reports.'
            });
        }

        db.query(
            `SELECT recovery_id, recovery_status
             FROM item_recoveries
             WHERE lost_item_id = ? AND found_item_id = ?`,
            [lost_item_id, found_item_id],
            (checkErr, existing) => {
                if (checkErr) {
                    return res.status(500).json({
                        message: checkErr.message
                    });
                }

                if (existing.length > 0) {
                    return res.status(409).json({
                        message: 'These reports are already linked.',
                        recovery_id: existing[0].recovery_id
                    });
                }

                db.query(
                    `INSERT INTO item_recoveries
                     (lost_item_id, found_item_id)
                     VALUES (?, ?)`,
                    [lost_item_id, found_item_id],
                    (insertErr, result) => {
                        if (insertErr) {
                            return res.status(500).json({
                                message: insertErr.message
                            });
                        }

                        res.json({
                            message: 'Matching reports linked successfully. Both students can now confirm.',
                            recovery_id: result.insertId,
                            status: 'pending'
                        });
                    }
                );
            }
        );
    });
});

// -------------------- GET MATCHED REPORTS --------------------

// Used by the dashboard to show which reports are linked
// and whether each student has confirmed.

app.get('/recoveries', (req, res) => {
    const sql = `
        SELECT
            r.recovery_id,
            r.lost_item_id,
            r.found_item_id,
            r.owner_confirmed,
            r.finder_confirmed,
            r.recovery_status,
            r.created_at,

            lost.title AS lost_title,
            lost.user_id AS owner_id,
            lost.status AS lost_status,

            found.title AS found_title,
            found.user_id AS finder_id,
            found.status AS found_status

        FROM item_recoveries r

        JOIN items lost
            ON r.lost_item_id = lost.id

        JOIN items found
            ON r.found_item_id = found.id

        ORDER BY r.recovery_id DESC
    `;

    db.query(sql, (err, result) => {
        if (err) {
            return res.status(500).json({
                message: err.message
            });
        }

        res.json(result);
    });
});

// -------------------- STUDENT CONFIRMATION --------------------

app.put('/recoveries/:id/confirm', (req, res) => {
    const recoveryId = req.params.id;
    const userId = req.body.user_id;

    if (!userId) {
        return res.status(400).json({
            message: 'User ID is required.'
        });
    }

    db.beginTransaction((transactionErr) => {
        if (transactionErr) {
            return res.status(500).json({
                message: transactionErr.message
            });
        }

        const checkSql = `
            SELECT
                r.recovery_id,
                r.owner_confirmed,
                r.finder_confirmed,
                r.recovery_status,
                r.lost_item_id,
                r.found_item_id,

                lost.user_id AS owner_id,
                found.user_id AS finder_id,

                lost.status AS lost_status,
                found.status AS found_status

            FROM item_recoveries r

            JOIN items lost
                ON r.lost_item_id = lost.id

            JOIN items found
                ON r.found_item_id = found.id

            WHERE r.recovery_id = ?
            FOR UPDATE
        `;

        db.query(checkSql, [recoveryId], (err, rows) => {
            if (err) {
                return db.rollback(() => {
                    res.status(500).json({
                        message: err.message
                    });
                });
            }

            if (rows.length === 0) {
                return db.rollback(() => {
                    res.status(404).json({
                        message: 'Matching reports not found.'
                    });
                });
            }

            const recovery = rows[0];

            if (recovery.recovery_status !== 'pending') {
                return db.rollback(() => {
                    res.status(400).json({
                        message: 'Both students have already confirmed this item.'
                    });
                });
            }

            let confirmationColumn;
            let confirmationMessage;

            // Lost-item owner confirms receiving the item.
            if (String(recovery.owner_id) === String(userId)) {
                confirmationColumn = 'owner_confirmed';
                confirmationMessage = 'You confirmed that you received the item.';
            }

            // Found-item reporter confirms returning the item.
            else if (String(recovery.finder_id) === String(userId)) {
                confirmationColumn = 'finder_confirmed';
                confirmationMessage = 'You confirmed that you returned the item.';
            }

            else {
                return db.rollback(() => {
                    res.status(403).json({
                        message: 'You are not part of this matching pair.'
                    });
                });
            }

            const updateConfirmationSql = `
                UPDATE item_recoveries
                SET ${confirmationColumn} = 1
                WHERE recovery_id = ?
            `;

            db.query(
                updateConfirmationSql,
                [recoveryId],
                (updateErr) => {
                    if (updateErr) {
                        return db.rollback(() => {
                            res.status(500).json({
                                message: updateErr.message
                            });
                        });
                    }

                    db.query(
                        `SELECT owner_confirmed, finder_confirmed
                         FROM item_recoveries
                         WHERE recovery_id = ?`,
                        [recoveryId],
                        (statusErr, result) => {
                            if (statusErr) {
                                return db.rollback(() => {
                                    res.status(500).json({
                                        message: statusErr.message
                                    });
                                });
                            }

                            const bothConfirmed =
                                Number(result[0].owner_confirmed) === 1 &&
                                Number(result[0].finder_confirmed) === 1;

                            // Only one student has confirmed.
                            // Keep both item statuses unchanged.

                            if (!bothConfirmed) {
                                return db.commit((commitErr) => {
                                    if (commitErr) {
                                        return db.rollback(() => {
                                            res.status(500).json({
                                                message: commitErr.message
                                            });
                                        });
                                    }

                                    res.json({
                                        message: confirmationMessage +
                                            ' Waiting for the other student.',
                                        status: 'pending'
                                    });
                                });
                            }

                            // Both students have confirmed.
                            // Only now update both item reports.

                            db.query(
                                `UPDATE items
                                 SET status = 'recovered'
                                 WHERE id = ?
                                 AND status = 'lost'`,
                                [recovery.lost_item_id],
                                (lostErr, lostResult) => {
                                    if (lostErr) {
                                        return db.rollback(() => {
                                            res.status(500).json({
                                                message: lostErr.message
                                            });
                                        });
                                    }

                                    if (lostResult.affectedRows !== 1) {
                                        return db.rollback(() => {
                                            res.status(400).json({
                                                message: 'Lost report is no longer active.'
                                            });
                                        });
                                    }

                                    db.query(
                                        `UPDATE items
                                         SET status = 'recovered'
                                         WHERE id = ?
                                         AND status = 'found'`,
                                        [recovery.found_item_id],
                                        (foundErr, foundResult) => {
                                            if (foundErr) {
                                                return db.rollback(() => {
                                                    res.status(500).json({
                                                        message: foundErr.message
                                                    });
                                                });
                                            }

                                            if (foundResult.affectedRows !== 1) {
                                                return db.rollback(() => {
                                                    res.status(400).json({
                                                        message: 'Found report is no longer active.'
                                                    });
                                                });
                                            }

                                            db.query(
                                                `UPDATE item_recoveries
                                                 SET recovery_status = 'recovered'
                                                 WHERE recovery_id = ?`,
                                                [recoveryId],
                                                (recoveryErr) => {
                                                    if (recoveryErr) {
                                                        return db.rollback(() => {
                                                            res.status(500).json({
                                                                message: recoveryErr.message
                                                            });
                                                        });
                                                    }

                                                    db.commit((commitErr) => {
                                                        if (commitErr) {
                                                            return db.rollback(() => {
                                                                res.status(500).json({
                                                                    message: commitErr.message
                                                                });
                                                            });
                                                        }

                                                        res.json({
                                                            message: 'Both students confirmed! The lost item is RECOVERED and the found item is RETURNED.',
                                                            status: 'recovered'
                                                        });
                                                    });
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

// -------------------- DELETE OWN REPORT --------------------

app.delete('/items/:id', (req, res) => {
    const itemId = req.params.id;
    const userId = req.body.user_id;

    if (!userId) {
        return res.status(400).json({
            message: 'User ID is required.'
        });
    }

    db.beginTransaction((transactionErr) => {
        if (transactionErr) {
            return res.status(500).json({
                message: transactionErr.message
            });
        }

        const checkSql = `
            SELECT id, photo_path
            FROM items
            WHERE id = ? AND user_id = ?
            FOR UPDATE
        `;

        db.query(checkSql, [itemId, userId], (err, result) => {
            if (err) {
                return db.rollback(() => {
                    res.status(500).json({
                        message: err.message
                    });
                });
            }

            if (result.length === 0) {
                return db.rollback(() => {
                    res.status(404).json({
                        message: 'Report not found or you do not own this report.'
                    });
                });
            }

            const photoPath = result[0].photo_path;

            db.query(
                `DELETE FROM item_recoveries
                 WHERE lost_item_id = ? OR found_item_id = ?`,
                [itemId, itemId],
                (recoveryErr) => {
                    if (recoveryErr) {
                        return db.rollback(() => {
                            res.status(500).json({
                                message: recoveryErr.message
                            });
                        });
                    }

                    db.query(
                        'DELETE FROM items WHERE id = ? AND user_id = ?',
                        [itemId, userId],
                        (deleteErr, deleteResult) => {
                            if (deleteErr) {
                                return db.rollback(() => {
                                    res.status(500).json({
                                        message: deleteErr.message
                                    });
                                });
                            }

                            if (deleteResult.affectedRows === 0) {
                                return db.rollback(() => {
                                    res.status(404).json({
                                        message: 'Report could not be deleted.'
                                    });
                                });
                            }

                            db.commit((commitErr) => {
                                if (commitErr) {
                                    return db.rollback(() => {
                                        res.status(500).json({
                                            message: commitErr.message
                                        });
                                    });
                                }

                                if (photoPath) {
                                    const photoName = path.basename(photoPath);
                                    const fullPhotoPath = path.join(
                                        uploadFolder,
                                        photoName
                                    );

                                    fs.unlink(fullPhotoPath, (fileErr) => {
                                        if (
                                            fileErr &&
                                            fileErr.code !== 'ENOENT'
                                        ) {
                                            console.error(
                                                'Photo deletion error:',
                                                fileErr.message
                                            );
                                        }
                                    });
                                }

                                res.json({
                                    message: 'Report deleted permanently!'
                                });
                            });
                        }
                    );
                }
            );
        });
    });
});

// -------------------- ADMIN LOGIN --------------------

app.post('/admin-login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: 'Enter email and password'
        });
    }

    db.query(
        'SELECT * FROM admins WHERE email = ?',
        [email],
        (err, result) => {
            if (err) {
                return res.status(500).json({
                    message: 'Database error'
                });
            }

            if (result.length === 0) {
                return res.status(401).json({
                    message: 'Admin email not found'
                });
            }

            bcrypt.compare(password, result[0].password, (err, match) => {
                if (err || !match) {
                    return res.status(401).json({
                        message: 'Invalid password'
                    });
                }

                res.json({
                    message: 'Admin login successful!',
                    admin: {
                        admin_id: result[0].admin_id,
                        name: result[0].name,
                        email: result[0].email
                    }
                });
            });
        }
    );
});

// -------------------- FORGOT PASSWORD OTP --------------------

app.post('/forgot-password', (req, res) => {
    const email = (req.body.email || '').trim();

    if (!email) {
        return res.status(400).json({
            message: 'Please enter your email address.'
        });
    }

    db.query(
        'SELECT user_id FROM users WHERE email = ?',
        [email],
        (err, result) => {
            if (err) {
                console.error('User lookup error:', err.message);

                return res.status(500).json({
                    message: 'Database error.'
                });
            }

            if (result.length === 0) {
                return res.json({
                    message: 'If this email is registered, an OTP will be sent.'
                });
            }

            const userId = result[0].user_id;
            const otp = crypto.randomInt(100000, 1000000).toString();

            bcrypt.hash(otp, 10, (hashErr, hashedOTP) => {
                if (hashErr) {
                    return res.status(500).json({
                        message: 'Could not generate OTP.'
                    });
                }

                db.query(
                    'DELETE FROM password_resets WHERE user_id = ?',
                    [userId],
                    (deleteErr) => {
                        if (deleteErr) {
                            return res.status(500).json({
                                message: 'Database error.'
                            });
                        }

                        db.query(
                            `INSERT INTO password_resets
                             (user_id, otp_hash, expires_at)
                             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
                            [userId, hashedOTP],
                            (insertErr) => {
                                if (insertErr) {
                                    return res.status(500).json({
                                        message: 'Could not save OTP.'
                                    });
                                }

                                transporter.sendMail({
                                    from: process.env.EMAIL_USER,
                                    to: email,
                                    subject: 'Lost and Found - Password Reset OTP',
                                    text: `Your password reset OTP is ${otp}. It is valid for 5 minutes. Do not share it with anyone.`
                                }, (mailErr) => {
                                    if (mailErr) {
                                        console.error(
                                            'Email sending error:',
                                            mailErr.message
                                        );

                                        db.query(
                                            'DELETE FROM password_resets WHERE user_id = ?',
                                            [userId]
                                        );

                                        return res.status(500).json({
                                            message: 'Could not send OTP email. Please try again.'
                                        });
                                    }

                                    res.json({
                                        message: 'OTP sent successfully to your registered email.'
                                    });
                                });
                            }
                        );
                    }
                );
            });
        }
    );
});

// -------------------- RESET PASSWORD --------------------

app.post('/reset-password', (req, res) => {
    const email = (req.body.email || '').trim();
    const otp = (req.body.otp || '').trim();
    const newPassword = req.body.newPassword;
    const confirmPassword = req.body.confirmPassword;

    if (!email || !otp || !newPassword || !confirmPassword) {
        return res.status(400).json({
            message: 'Please fill all fields.'
        });
    }

    if (!/^\d{6}$/.test(otp)) {
        return res.status(400).json({
            message: 'Enter a valid six-digit OTP.'
        });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({
            message: 'Password must contain at least 6 characters.'
        });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({
            message: 'Passwords do not match.'
        });
    }

    const sql = `
        SELECT pr.id, pr.otp_hash, pr.attempts, u.user_id
        FROM password_resets pr
        JOIN users u ON pr.user_id = u.user_id
        WHERE u.email = ?
        AND pr.used = FALSE
        AND pr.expires_at > NOW()
        AND pr.attempts < 5
        ORDER BY pr.created_at DESC
        LIMIT 1
    `;

    db.query(sql, [email], (err, result) => {
        if (err) {
            return res.status(500).json({
                message: 'Database error.'
            });
        }

        if (result.length === 0) {
            return res.status(400).json({
                message: 'OTP is invalid, expired, or locked. Please request a new OTP.'
            });
        }

        const resetRecord = result[0];

        bcrypt.compare(otp, resetRecord.otp_hash, (compareErr, match) => {
            if (compareErr) {
                return res.status(500).json({
                    message: 'OTP verification failed.'
                });
            }

            if (!match) {
                db.query(
                    'UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?',
                    [resetRecord.id]
                );

                return res.status(400).json({
                    message: 'Incorrect OTP. Please try again.'
                });
            }

            bcrypt.hash(newPassword, 10, (hashErr, newHash) => {
                if (hashErr) {
                    return res.status(500).json({
                        message: 'Could not update password.'
                    });
                }

                db.query(
                    'UPDATE users SET password = ? WHERE user_id = ?',
                    [newHash, resetRecord.user_id],
                    (updateErr) => {
                        if (updateErr) {
                            return res.status(500).json({
                                message: 'Password update failed.'
                            });
                        }

                        db.query(
                            'UPDATE password_resets SET used = TRUE WHERE id = ?',
                            [resetRecord.id],
                            () => {
                                res.json({
                                    message: 'Password changed successfully! Please log in.'
                                });
                            }
                        );
                    }
                );
            });
        });
    });
});

// -------------------- START SERVER --------------------

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Test URL: http://localhost:${PORT}/test`);
});

import http from "http";
import fs from "fs";
// @ts-ignore
import mime from "mime-types";
import { Pool } from "pg";
import crypto from "crypto";
import dotenv from "dotenv";
import {sendDecisionEmail, sendDoctorAuthorizationEmail} from "./script/mailer";


dotenv.config();
const pool = new Pool({
    user: process.env.USER, // Username from Render
    host: process.env.HOST, // Host from Render
    database: process.env.DATABASE, // Database name from Render
    password: process.env.PASSWORD, // Password from Render
    port: 5432, // Port from Render
    ssl: {
        rejectUnauthorized: false // Required for Render's PostgreSQL SSL connection
    }
});

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}
async function deriveKey(password: string, keySize: number): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    return await crypto.subtle.importKey(
        "raw", passwordBuffer, { name: "PBKDF2" },
        false, ["deriveKey"]
    ).then(key => {
        return crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: new Uint8Array(16),  // Salt should be securely random
                iterations: 100000,
                hash: "SHA-256"
            },
            key, { name: "AES-GCM", length: keySize },
            false, ["encrypt", "decrypt"]
        );
    });
}
async function aesEncrypt(data: string, password: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const iv = new Uint8Array(12); // 12-byte random IV
    const key = await deriveKey(password, 256); // 256-bit AES key

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        dataBuffer
    );

    // Combine the IV and the encrypted data for transport
    const combinedBuffer = new Uint8Array(iv.byteLength + encryptedBuffer.byteLength);
    combinedBuffer.set(iv);
    combinedBuffer.set(new Uint8Array(encryptedBuffer), iv.byteLength);

    // Convert the combined buffer to base64 for easier transport/storage
    return arrayBufferToBase64(combinedBuffer.buffer);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const length = binaryString.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}



let lookup = mime.lookup;

const port = process.env.PORT || 5000;

const server = http.createServer(async (req, res) => {
    const path = req.url as string;

    if (path === "/register" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk.toString();
        });

        req.on("end", async () => {
            try {
                const formData = JSON.parse(body);

                // Find the maximum ID in the patients table
                const maxIdResult = await pool.query("SELECT MAX(id) FROM patients");
                let maxId = maxIdResult.rows[0].max;

                // If no patients exist, start with "005"
                if (!maxId) {
                    maxId = "004"; // Start from "004" so that the next ID is "005"
                }

                // Increment the maximum ID by 1 and format it to 3 digits
                const nextId = String(parseInt(maxId) + 1).padStart(3, "0");

                // Insert the new patient into the patients table
                const patientQuery = `
                    INSERT INTO patients (id, first_name, last_name, gender, age, health_card_number, email_address, phone_number, address)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *;
                `;
                const password = "strongpassword";
                // Encrypt the data
                const encrypHealthCardNo = await aesEncrypt(formData.healthCardNumber, password);
                const patientValues = [
                    nextId, // Use the generated ID
                    formData.firstName,
                    formData.lastName,
                    formData.gender,
                    parseInt(formData.age),
                    encrypHealthCardNo,
                    formData.emailAddress,
                    formData.contactNumber,
                    formData.address,
                ];

                const patientResult = await pool.query(patientQuery, patientValues);
                console.log("Patient data saved successfully:", patientResult.rows[0]);

                // Insert the new user into the users table
                const userQuery = `
                    INSERT INTO users (role, username, password)
                    VALUES ($1, $2, $3)
                    RETURNING *;
                `;

                const userValues = ["Patient", formData.emailAddress, formData.password];

                const userResult = await pool.query(userQuery, userValues);
                console.log("User data saved successfully:", userResult.rows[0]);

                // Send a success response back to the client
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Registration successful!" }));
            } catch (error) {
                console.error("Error during registration:", error);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Internal Server Error" }));
            }
        });
    }

    else if (path === "/add_admin" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk.toString();
        });

        req.on("end", async () => {
            try {
                const formData = JSON.parse(body);

                // Find the maximum ID in the admins table
                const maxIdResult = await pool.query("SELECT MAX(id) FROM staffs");
                let maxId = maxIdResult.rows[0].max || "000"; // Default to "000" if no records exist

                // Increment the maximum ID by 1 and format it to 3 digits
                const nextId = String(parseInt(maxId) + 1).padStart(3, "0");

                // Insert the new admin into the admins table
                const adminQuery = `
                INSERT INTO staffs (id, first_name, last_name, email_address, phone_number)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *;
            `;
                const adminValues = [
                    nextId,
                    formData.firstName,
                    formData.lastName,
                    formData.emailAddress,
                    formData.contactNumber,
                ];

                const adminResult = await pool.query(adminQuery, adminValues);
                console.log("Admin data saved successfully:", adminResult.rows[0]);

                // Insert the new user into the users table
                const userQuery = `
                    INSERT INTO users (role, username, password)
                    VALUES ($1, $2, $3)
                    RETURNING *;
                `;

                const userValues = ["Admin", formData.emailAddress, formData.password];

                const userResult = await pool.query(userQuery, userValues);
                console.log("User data saved successfully:", userResult.rows[0]);


                // Send success response
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Admin added successfully", admin: adminResult.rows[0] }));

            } catch (error) {
                console.error("Error during registration:", error);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Internal Server Error" }));
            }
        });
    }
    else if (path === "/add_patient" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk.toString();
        });

        req.on("end", async () => {
            try {
                const formData = JSON.parse(body);

                // Find the maximum ID in the patients table
                const maxIdResult = await pool.query("SELECT MAX(id) FROM patients");
                let maxId = maxIdResult.rows[0].max || "000"; // Default to "000" if no records exist

                // Increment the maximum ID by 1 and format it to 3 digits
                const nextId = String(parseInt(maxId) + 1).padStart(3, "0");

                // Insert the new patient into the patients table
                const patientQuery = `
                INSERT INTO patients (id, first_name, last_name, gender, age, health_card_number, email_address, phone_number, address)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *;
            `;
                const password = "strongpassword";
                // Encrypt the data
                const encrypHealthCardNo = await aesEncrypt(formData.healthCardNumber, password);
                const patientValues = [
                    nextId,
                    formData.firstName,
                    formData.lastName,
                    formData.gender,
                    parseInt(formData.age),
                    encrypHealthCardNo,
                    formData.emailAddress,
                    formData.contactNumber,
                    formData.address,
                ];

                const patientResult = await pool.query(patientQuery, patientValues);
                console.log("Patient data saved successfully:", patientResult.rows[0]);

                // Send success response
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Patient added successfully", patient: patientResult.rows[0] }));

            } catch (error) {
                console.error("Error during registration:", error);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Internal Server Error" }));
            }
        });
    }
    else if (path === "/add_doctor" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk.toString();
        });

        req.on("end", async () => {
            try {
                const formData = JSON.parse(body);

                // Insert the new doctor into the doctors table
                const doctorQuery = `
                INSERT INTO doctors (docfirst_name, doclast_name, cpso, address, contact_info)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *;
            `;
                const doctorValues = [
                    formData.firstName,
                    formData.lastName,
                    formData.cpso,
                    formData.address,
                    formData.contactNumber,
                ];

                const doctorResult = await pool.query(doctorQuery, doctorValues);
                console.log("Doctor data saved successfully:", doctorResult.rows[0]);

                // Send success response
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "doctor added successfully", doctor: doctorResult.rows[0] }));

            } catch (error) {
                console.error("Error during registration:", error);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Internal Server Error" }));
            }
        });
    }

    // condition check 1. url match, 2. request method is GET
    else if (path === "/api/patients" && req.method === "GET") {
        // Handle GET request to fetch all patients
        try {
            // wait query finish then move to next step, run the query in pool(PostgreSQL pool)
            const result = await pool.query("SELECT * FROM patients");
            // 200 in HTTP status code is "OK", response should be JSON
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result.rows));
        } catch (error) {
            console.error("Error fetching patient data:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }

    }else if (path.startsWith("/api/patients/email/") && req.method === "GET") {

        const email = path.replace("/api/patients/email/", "");


        try {
            const query = "SELECT * FROM patients WHERE TRIM(LOWER(email_address)) = TRIM(LOWER($1))";
            const result = await pool.query(query, [email]);

            if (result.rows.length > 0) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(result.rows[0]));
            } else {
                console.log("Patient not found in database.");
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Patient not found" }));
            }
        } catch (error) {
            console.error("Database error:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Database query failed" }));
        }
    }

    // Fetch ALL refill requests (For Admin)
    else if (path === "/api/refill_requests" && req.method === "GET") {
        try {

            const result = await pool.query(`
            SELECT refill_requests.id, refill_requests.request_date, refill_requests.rxnum, refill_requests.status, 
            prescription.name AS medication, prescription.remaining, patients.first_name || ' ' || patients.last_name 
            AS patient_name FROM refill_requests JOIN prescription ON refill_requests.rxnum = prescription.rxnum  
            JOIN patients ON refill_requests.patient_id = patients.id  WHERE refill_requests.status = 'Pending'
            ORDER BY request_date DESC;
        `);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result.rows));
        } catch (error) {
            console.error("Error fetching refill requests:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Internal Server Error" }));
        }
    }

        // Fetch refill requests for patient
    // .startWith() check if it matches the request start with this
    else if (path.startsWith("/api/refill_requests/") && req.method === "GET") {
        const patientId = path.split("/").pop(); // Extract patient ID which at the last

        if (!patientId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Invalid request. Missing patient ID." }));
            return;
        }

        try {
            const result = await pool.query(`
            SELECT refill_requests.id, refill_requests.request_date, refill_requests.rxnum, refill_requests.status, 
                   prescription.name AS medication
            FROM refill_requests
            JOIN prescription ON refill_requests.rxnum = prescription.rxnum
            WHERE refill_requests.patient_id = $1
            ORDER BY request_date DESC
        `, [patientId]);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result.rows));
        } catch (error) {
            console.error("Error fetching patient refill requests:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Internal Server Error" }));
        }
    }


    else if (path.startsWith("/api/prescriptions/") && req.method === "GET") {
        const patientId = path.split("/").pop(); // Extract patient ID


        try {
            // $1 placeholder
            const result = await pool.query("SELECT * FROM prescription WHERE patient_id = $1", [patientId]);

            if (result.rows.length > 0) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(result.rows));
            } else {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "No prescriptions found for this patient" }));
            }
        } catch (error) {
            console.error("Error fetching prescriptions:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    // Handle refill request submission
    else if (path.startsWith("/api/refill/") && req.method === "POST") {
        const rxnum = path.split("/").pop(); // Extract RxNum from URL
        const userSession = req.headers["user-session"]; // Get user session from headers

        if (!rxnum || !userSession) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Invalid request. Missing RxNum or session." }));
            return;
        }

        try {
            const user = JSON.parse(userSession as string);
            const userEmail = user.username.trim();

            // Find Patient ID from email
            const patientResult = await pool.query("SELECT id FROM patients WHERE email_address = $1", [userEmail]);
            if (patientResult.rows.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Patient not found." }));
                return;
            }

            const patientId = patientResult.rows[0].id;

            // Insert refill request
            const insertQuery = `
            INSERT INTO refill_requests (rxnum, patient_id)
            VALUES ($1, $2)
            RETURNING *;
        `;
            const result = await pool.query(insertQuery, [rxnum, patientId]);

            res.writeHead(201, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Refill request submitted successfully.", request: result.rows[0] }));

        } catch (error) {
            console.error("Error handling refill request:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Internal Server Error" }));
        }
    }






    else if (path.startsWith("/api/refill_requests/") && req.method === "PUT") {
        const requestId = path.split("/").pop();

        let body = "";
        req.on("data", (chunk) => {
            body += chunk.toString();
        });

        req.on("end", async () => {
            try {
                const {status} = JSON.parse(body);

                const requestResult = await pool.query(
                    "SELECT * FROM refill_requests WHERE id = $1",
                    [requestId]
                );

                if (requestResult.rows.length === 0) {
                    res.writeHead(404, {"Content-Type": "application/json"});
                    res.end(JSON.stringify({message: "Request not found"}));
                    return;
                }

                const {rxnum, patient_id} = requestResult.rows[0];

                if (status === "Approved") {
                    const prescriptionResult = await pool.query(
                        "SELECT * FROM prescription WHERE rxnum = $1 AND patient_id = $2",
                        [rxnum, patient_id]
                    );

                    if (prescriptionResult.rows.length === 0) {
                        res.writeHead(404, {"Content-Type": "application/json"});
                        res.end(JSON.stringify({message: "Prescription not found"}));
                        return;
                    }

                    const {remaining, day_qty, name: medicationName} = prescriptionResult.rows[0];

                    if (remaining <= 0) {
                        const doctorResult = await pool.query(`
                            SELECT doctors.docfirst_name, doctors.doclast_name, doctors.email
                            FROM doctors
                            JOIN prescription ON doctors.cpso = prescription.doc_cpso
                            WHERE prescription.rxnum = $1 AND prescription.patient_id = $2
                        `, [rxnum, patient_id]);

                        if (doctorResult.rows.length > 0) {
                            const doctor = doctorResult.rows[0];
                            const doctorName = `${doctor.docfirst_name} ${doctor.doclast_name}`;
                            const doctorEmail = doctor.email;

                            const patientResult = await pool.query("SELECT first_name, last_name FROM patients WHERE id = $1", [patient_id]);
                            const patientName = `${patientResult.rows[0].first_name} ${patientResult.rows[0].last_name}`;

                            const prescriptionResult = await pool.query("SELECT name FROM prescription WHERE rxnum = $1", [rxnum]);
                            const medicineName = prescriptionResult.rows[0].name;

                            await sendDoctorAuthorizationEmail(doctorEmail, doctorName, patientName, medicineName);
                        }

                        res.writeHead(400, {"Content-Type": "application/json"});
                        res.end(JSON.stringify({message: "No more refills available. Request sent to doctor."}));
                        return;
                    }


                    if (remaining < day_qty) {
                        res.writeHead(400, {"Content-Type": "application/json"});
                        res.end(JSON.stringify({message: "Refill amount exceeds available quantity."}));
                        return;
                    }

                    await pool.query(
                        "UPDATE prescription SET remaining = remaining - $1, dispensed_day = CURRENT_DATE WHERE rxnum = $2 AND patient_id = $3",
                        [day_qty, rxnum, patient_id]
                    );
                }

                await pool.query(
                    "UPDATE refill_requests SET status = $1 WHERE id = $2",
                    [status, requestId]
                );

                const patientResult = await pool.query(
                    "SELECT first_name, last_name, email_address FROM patients WHERE id = $1",
                    [patient_id]
                );

                if (patientResult.rows.length > 0) {
                    const patient = patientResult.rows[0];
                    const patientName = `${patient.first_name} ${patient.last_name}`;
                    const toEmail = patient.email_address;

                    const prescriptionResult = await pool.query(
                        "SELECT * FROM prescription WHERE rxnum = $1 AND patient_id = $2",
                        [rxnum, patient_id]
                    );

                    const { name: medicineName } = prescriptionResult.rows[0];


                    const decision = status;

                    await sendDecisionEmail(toEmail, patientName, medicineName, decision);

                    console.log(`Email sent to ${toEmail}`);
                }

                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify({message: `Request ${status}`}));
            } catch (error) {
                console.error("Error updating refill request:", error);
                res.writeHead(500, {"Content-Type": "application/json"});
                res.end(JSON.stringify({message: "Internal Server Error"}));
            }
        });
    }



    else if (path.startsWith("/api/request_doctor/") && req.method === "POST") {

        const rxnum = path.split("/").pop();
        const userSession = req.headers["user-session"];

        if (!rxnum || !userSession) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Missing RxNum or session." }));
            return;
        }

        try {
            const user = JSON.parse(userSession as string);
            const userEmail = user.username;

            const patientResult = await pool.query("SELECT id, first_name, last_name FROM patients WHERE email_address = $1", [userEmail]);
            if (patientResult.rows.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Patient not found." }));
                return;
            }

            const patient = patientResult.rows[0];

            const prescriptionResult = await pool.query("SELECT name, doctor_cpso FROM prescription WHERE rxnum = $1", [rxnum]);
            if (prescriptionResult.rows.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Prescription not found." }));
                return;
            }

            const { name: medicineName, doctor_cpso } = prescriptionResult.rows[0];

            const doctorResult = await pool.query("SELECT email FROM doctors WHERE cpso = $1", [doctor_cpso]);
            if (doctorResult.rows.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Doctor not found." }));
                return;
            }

            const doctorEmail = doctorResult.rows[0].email;

            await sendDecisionEmail(userEmail, `${patient.first_name} ${patient.last_name}`, medicineName, "Authorization Requested");
            await sendDoctorAuthorizationEmail(doctorEmail, `${patient.first_name} ${patient.last_name}`, medicineName, "Authorization Requested");

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Doctor has been contacted for authorization." }));

        } catch (error) {
            console.error("Error sending doctor authorization request:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Failed to send authorization email." }));
        }
    }





    else if (path === "/api/send-email" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk.toString();
        });

        req.on("end", async () => {
            try {
                const { toEmail, patientName, medicineName, decision } = JSON.parse(body);

                await sendDecisionEmail(toEmail, patientName, medicineName, decision);

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Email sent successfully" }));
            } catch (error) {
                console.error("Error sending email:", error);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Failed to send email" }));
            }
        });
    }

    else if (path.startsWith("/api/patients/") && req.method === "GET") {
        // Handle GET request to fetch a specific patient by ID
        const patientId = path.split("/").pop(); // Extract patient ID from the URL

        try {
            const result = await pool.query("SELECT * FROM patients WHERE id = $1", [patientId]);

            if (result.rows.length > 0) {
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify(result.rows[0]));
            } else {
                res.writeHead(404, {"Content-Type": "application/json"});
                res.end(JSON.stringify({message: "Patient not found"}));
            }
        } catch (error) {
            console.error("Error fetching patient data:", error);
            res.writeHead(500, {"Content-Type": "application/json"});
            res.end(JSON.stringify({error: "Internal Server Error"}));
        }

    }
    else if (path === "/api/users/login" && req.method === "POST") {
        // Handle POST request for user login
        let body = "";
        req.on("data", (chunk) => {
            body += chunk.toString();
        });

        req.on("end", async () => {
            try {
                const { username, password } = JSON.parse(body);

                // Query the database for the user
                const result = await pool.query("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);

                if (result.rows.length > 0) {
                    const user = result.rows[0];
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(user)); // Return the user data
                } else {
                    res.writeHead(401, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ message: "Invalid Login Credentials" }));
                }
            } catch (error) {
                console.error("Error during login:", error);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Internal Server Error" }));
            }
        });
    } else {
        // Serve static files for all other routes
        let filePath = path;
        if (path === "/" || path === "/home") {
            filePath = "/home.html";
        } else if (
            path === "/prescription_request" ||
            path === "/patient_dashboard" ||
            path === "/request_process" ||
            path === "/login" ||
            path === "/patient_list" ||
            path === "/admin_dashboard" ||
            path === "/register" ||
            path === "/patient_profile" ||
            path === "/add_patient" ||
            path === "/add_admin" ||
            path === "/add_doctor" ||
            path === "/order_medication"
        ) {
            filePath = "/index.html";
        }

        let mime_type = lookup(filePath.substring(1));

        fs.readFile(__dirname + filePath, function (err, data) {
            if (err) {
                res.writeHead(404);
                res.end("Error 404 - File Not Found" + err.message);
                return;
            }

            if (!mime_type) {
                mime_type = "text/plain";
            }

            res.setHeader("X-Content-Type-Options", "nosniff");
            res.writeHead(200, { "Content-Type": mime_type });
            res.end(data);
        });
    }
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
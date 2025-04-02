import nodemailer from "nodemailer";

export async function sendDecisionEmail(
    toEmail: string,
    patientName: string,
    medicineName: string,
    decision: string
        // "approved" | "denied"
) {
    console.log("Preparing to send email to:", toEmail);

    const transporter = nodemailer.createTransport({
        host: "smtp-relay.brevo.com",
        port: 587,
        secure: false,
        auth: {
            user: "892d11001@smtp-brevo.com", //SMTP
            pass: "FbSHLnXWhR9BsJz4",
        },
    });

    const mailOptions = {
        from: '"Your Clinic" <katepharmstaff@gmail.com>',
        to: toEmail,
        subject: "Prescription Refill Request Update",
        text: `Hello ${patientName},

            We hope this message finds you well.
            
            This is to inform you that your prescription refill request for **${medicineName}** has been **${decision.toUpperCase()}**.
            
            If you have any questions or need further assistance, please feel free to contact us.
            
            Best regards,  
            PharmKate Pharmacy Team`,

    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:", info.messageId);
    } catch (err) {
        console.error("Failed to send email:", err);
    }
}

export async function sendDoctorAuthorizationEmail(
    doctorEmail: string,
    doctorName: string,
    patientName: string,
    medicineName: string
) {
    console.log("Preparing to send authorization request to doctor:", doctorEmail);

    const transporter = nodemailer.createTransport({
        host: "smtp-relay.brevo.com",
        port: 587,
        secure: false,
        auth: {
            user: "892d11001@smtp-brevo.com",
            pass: "FbSHLnXWhR9BsJz4",
        },
    });

    const mailOptions = {
        from: '"Your Clinic" <katepharmstaff@gmail.com>',
        to: doctorEmail,
        subject: "Prescription Refill Authorization Needed",
        text: `Dear Doctor,

            We are writing to request authorization for an additional refill of **${medicineName}** for patient **${patientName}**.
            
            The prescription currently has no remaining refills. Please review the patient's case and respond with your decision.
            
            Thank you,
            PharmKate Pharmacy Staff`,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("Doctor email sent:", info.messageId);
    } catch (err) {
        console.error("Failed to send email to doctor:", err);
    }
}


# PharmaCare – Prescription Refill Management

**PharmaCare** is a full-stack web application designed to streamline the prescription refill process for pharmacies. Patients can log in to view their prescriptions and request refills, while pharmacy staff can manage and respond to those requests efficiently through an admin interface.

##  Features

- **Patient Dashboard** – View active prescriptions with dosage, quantity, refill status, and prescribing doctor.
- **Refill Request** – Patients can submit refill requests directly from their dashboard.
- **Admin Panel** – Staff can review, approve, or reject refill requests.
- **Email Notifications** – Automatic emails are sent to patients when their requests are processed.
- **Role-based Access** – Different views and permissions for patients and staff.
- **Doctor Contact Request** *(Coming Soon)* – When no refills remain, a patient can request authorization from the doctor.

## Technology

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js
- **Database**: PostgreSQL
- **Authentication**: Custom logic via headers
- **Email Service**: Nodemailer

## Installation and Running

### 1. Clone the repo

Clone the repo as below to your device: 

https://github.com/merryviji/Pharmacyedited

### 2. Install dependencies

npm install

### 3. Configure environment variables

Create a .env file in the root of this project, and add the following:

USER=durham_pharmacy_db_user
HOST=dpg-cv0vi8tds78s73davq0g-a.ohio-postgres.render.com
DATABASE=durham_pharmacy_db
DATABASE=durham_pharmacy_db
PASSWORD=EIZpoJqfNNcg8TW6jfldKveIWf9yvFau

### 4. Fun this application

npm start

This application will run on http://localhost:5000.
# Training Path 🎓

A full-stack training management platform where instructors assign personalized learning paths to students, track their progress, and grade their submissions — all from a single web application.

---

## 📌 Overview

**Training Path** is a role-based web application built for real-world instructor–student workflows:

- 🧑‍🎓 **Students** register their own accounts, log in, and see only the courses their instructor assigned them.
- 👨‍🏫 **Instructors (Doctors)** manage students, assign courses, create tasks, review submissions, and issue grades.
- 🔒 Secure authentication with **JWT (HTTP-only cookies)** and **bcrypt** password hashing.

---

## 🚀 Features

### Student Side
- Register and log in to a personal account
- View only the courses assigned by the instructor
- Browse course levels and tasks in order
- Submit task files for review
- Re-submit after instructor feedback ("Needs Revision")
- Track submission status: Pending → Reviewed → Approved with grade
- View personal progress dashboard (task completion, scores, deadlines)

### Instructor Side
- Full student roster management (add, edit, delete)
- Assign courses to individual students (no password sharing required)
- Create and manage course levels and tasks
- Upload course materials (PDFs, videos, etc.)
- Review student submissions, leave feedback, and assign grades
- Approve or request revision on each submission
- Dashboard with live stats: submissions activity, grade distribution, students per course

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Material UI (MUI) v5, Axios, React Router v6 |
| **Backend** | Node.js, Express.js |
| **Database** | MySQL / MariaDB |
| **Auth** | JSON Web Tokens (JWT), bcrypt, HTTP-only cookies |
| **File Upload** | Multer |

---

## 🔐 Authentication Flow

1. Student **registers** their own account (email + password, hashed with bcrypt)
2. Instructor **adds** the student in the system and assigns courses — **no password exchange needed**
3. Student **logs in** → receives a JWT stored in an HTTP-only cookie
4. Student dashboard shows only the courses the instructor assigned
5. All API routes are protected by a `verifyToken` middleware
6. Doctor routes have an additional **role check** (only `role = 'doctor'` can access)

---

## 📄 License

This project is for educational and demonstration purposes.

---

## 👤 Author

Built as a full-stack capstone project demonstrating REST API design, JWT authentication, role-based access control, and React component architecture.

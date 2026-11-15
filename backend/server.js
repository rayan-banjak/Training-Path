const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Authentication Middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "training_platform_jwt_secret_key_2026_xyz"
    );
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

const requireDoctor = (req, res, next) => {
  if (!req.user || req.user.role !== "doctor") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Doctor privileges required.",
    });
  }
  next();
};

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage: storage });

const db = mysql.createPool({
    connectionLimit: 10,
    host: "localhost",
    user: "root",
    password: "",
    database: "training_platform",
    charset: 'utf8mb4'
});

db.getConnection((err, connection) => {
    if (err) {
        console.log("Database connection failed:", err);
        return;
    }
    console.log("MySQL Pool connected successfully!");
    connection.release();
});

app.get("/", (req, res) => {
    res.send("Training Platform API is running");
});


// 1. Register 

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (password.length < 4) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 4 characters long",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check whether the email already exists
    const checkEmailQuery = "SELECT id FROM users WHERE email = ? LIMIT 1";
    db.query(checkEmailQuery, [normalizedEmail], async (error, results) => {
      if (error) {
        return res.status(500).json({
          success: false,
          message: "Database error checking email",
        });
      }

      if (results.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Email already exists",
        });
      }

      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const assignedRole = role === "doctor" ? "doctor" : "student";

        const insertUserQuery = "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)";
        db.query(
          insertUserQuery,
          [name.trim(), normalizedEmail, hashedPassword, assignedRole],
          (insertError, insertResult) => {
            if (insertError) {
              return res.status(500).json({
                success: false,
                message: "Failed to create user in database",
              });
            }

            return res.status(201).json({
              success: true,
              message: "Account created successfully",
              user: {
                id: insertResult.insertId,
                name: name.trim(),
                email: normalizedEmail,
                role: assignedRole,
              },
            });
          }
        );
      } catch (hashError) {
        return res.status(500).json({
          success: false,
          message: "Failed to secure password",
        });
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

//2.Login
app.post("/api/login", (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const findUserQuery = "SELECT id, name, email, password, role, level_id FROM users WHERE email = ? LIMIT 1";

    db.query(findUserQuery, [normalizedEmail], async (err, results) => {
      if (err) return res.status(500).json({ success: false, message: "Database error: " + err.message });
      if (results.length === 0) {
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }

      const user = results[0];
      let isMatch = false;
      try {
        isMatch = await bcrypt.compare(password, user.password);
      } catch (compareErr) {
        isMatch = false;
      }

      if (!isMatch && user.password === password) {
        isMatch = true;
      }

      if (!isMatch) {
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        process.env.JWT_SECRET || "training_platform_jwt_secret_key_2026_xyz",
        {
          expiresIn: process.env.JWT_EXPIRES_IN || "1d",
        }
      );
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
        path: "/",
      });
      return res.status(200).json({
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          level_id: user.level_id,
        },
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

//3.Auth Check : 
app.get("/api/auth/check", verifyToken, (req, res) => {
  const sql = "SELECT id, name, email, role, level_id FROM users WHERE id = ? LIMIT 1";
  db.query(sql, [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    if (results.length === 0) {
      return res.status(401).json({ success: false, message: "User no longer exists" });
    }
    return res.status(200).json({
      success: true,
      user: results[0],
    });
  });
});

//4.Logout: 
app.post("/api/logout", (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Session validation : 
app.get("/api/users/:id", (req, res) => {
  const sql = "SELECT id, name, email, role, level_id FROM users WHERE id = ?";
  db.query(sql, [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ message: "User not found" });
    const user = results[0];

    const coursesSql = `
      SELECT 
        uc.course_id AS id, 
        l.title, 
        l.description, 
        uc.enrolled_at,
        (SELECT COUNT(*) FROM tasks t WHERE t.level_id = uc.course_id) AS total_tasks,
        (
          SELECT COUNT(DISTINCT s.task_id)
          FROM submissions s
          JOIN tasks t ON s.task_id = t.id
          WHERE s.user_id = uc.user_id 
            AND t.level_id = uc.course_id 
            AND s.status = 'Approved' 
            AND s.grade IS NOT NULL
        ) AS completed_graded_tasks,
        (
          SELECT ROUND(AVG(s.grade), 1)
          FROM submissions s
          JOIN tasks t ON s.task_id = t.id
          WHERE s.user_id = uc.user_id 
            AND t.level_id = uc.course_id 
            AND s.status = 'Approved' 
            AND s.grade IS NOT NULL
        ) AS final_grade
      FROM user_courses uc
      JOIN levels l ON uc.course_id = l.id
      WHERE uc.user_id = ?
      ORDER BY uc.enrolled_at ASC, uc.id ASC
    `;
    db.query(coursesSql, [req.params.id], (cErr, courses) => {
      if (cErr) return res.status(500).json({ error: cErr.message });
      user.courses = (courses || []).map(c => ({
        ...c,
        is_finished: c.total_tasks > 0 && c.completed_graded_tasks === c.total_tasks
      }));
      res.json(user);
    });
  });
});

// Get enrolled courses for a user
app.get("/api/users/:id/courses", (req, res) => {
  const coursesSql = `
    SELECT 
      uc.course_id AS id, 
      l.title, 
      l.description, 
      uc.enrolled_at,
      (SELECT COUNT(*) FROM tasks t WHERE t.level_id = uc.course_id) AS total_tasks,
      (
        SELECT COUNT(DISTINCT s.task_id)
        FROM submissions s
        JOIN tasks t ON s.task_id = t.id
        WHERE s.user_id = uc.user_id 
          AND t.level_id = uc.course_id 
          AND s.status = 'Approved' 
          AND s.grade IS NOT NULL
      ) AS completed_graded_tasks,
      (
        SELECT ROUND(AVG(s.grade), 1)
        FROM submissions s
        JOIN tasks t ON s.task_id = t.id
        WHERE s.user_id = uc.user_id 
          AND t.level_id = uc.course_id 
          AND s.status = 'Approved' 
          AND s.grade IS NOT NULL
      ) AS final_grade
    FROM user_courses uc
    JOIN levels l ON uc.course_id = l.id
    WHERE uc.user_id = ?
    ORDER BY uc.enrolled_at ASC, uc.id ASC
  `;
  db.query(coursesSql, [req.params.id], (err, courses) => {
    if (err) return res.status(500).json({ error: err.message });
    const formatted = (courses || []).map(c => ({
      ...c,
      is_finished: c.total_tasks > 0 && c.completed_graded_tasks === c.total_tasks
    }));
    res.json(formatted);
  });
});

// 3. Get All Levels (Courses)
app.get("/api/levels", (req, res) => {
  db.query("SELECT * FROM levels", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// 4. Get Single Level Details
app.get("/api/levels/:id", (req, res) => {
  db.query("SELECT * FROM levels WHERE id = ?", [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results[0] || {});
  });
});

// 5. Get Tasks by Level 
app.get("/api/tasks/level/:levelId", (req, res) => {
  const { levelId } = req.params;
  const sql = "SELECT * FROM tasks WHERE level_id = ?";

  db.query(sql, [levelId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// 6. Get Single Task Details
app.get("/api/tasks/:id", (req, res) => {
  db.query("SELECT * FROM tasks WHERE id = ?", [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results[0] || {});
  });
});

// 7. Submit Task 
app.post("/api/submissions", upload.single("file"), (req, res) => {
  const { user_id, task_id, comment } = req.body;
  const file_path = req.file ? req.file.path : null;

  // Prevent submission if this task has already been approved and graded
  const checkSql = "SELECT id, status, grade FROM submissions WHERE user_id = ? AND task_id = ? ORDER BY submitted_at DESC LIMIT 1";
  db.query(checkSql, [user_id, task_id], (checkErr, existingSubs) => {
    if (!checkErr && existingSubs.length > 0 && existingSubs[0].status === 'Approved' && existingSubs[0].grade !== null) {
      return res.status(403).json({ error: "This task has already been approved and graded. New submissions are closed." });
    }

    const sql = `
      INSERT INTO submissions (user_id, task_id, status, file_path, comment, submitted_at)
      VALUES (?, ?, 'Done', ?, ?, NOW())
    `;

    db.query(sql, [user_id, task_id, file_path, comment], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        message: "Task submitted successfully!",
        id: result.insertId,
        submissionId: result.insertId,
        filePath: file_path,
        file_path: file_path
      });
    });
  });
});

// 8. Get All Students
app.get("/api/students", (req, res) => {
  const sql = `
    SELECT 
      u.id, 
      u.name, 
      u.email, 
      u.level_id, 
      u.created_at,
      l.title AS course_title,
      (SELECT COUNT(*) FROM tasks t WHERE t.level_id = u.level_id) AS total_tasks,
      (
        SELECT COUNT(DISTINCT s.task_id)
        FROM submissions s
        JOIN tasks t ON s.task_id = t.id
        WHERE s.user_id = u.id 
          AND t.level_id = u.level_id 
          AND s.status = 'Approved' 
          AND s.grade IS NOT NULL
      ) AS completed_graded_tasks,
      (
        SELECT ROUND(AVG(s.grade), 1)
        FROM submissions s
        JOIN tasks t ON s.task_id = t.id
        WHERE s.user_id = u.id 
          AND t.level_id = u.level_id 
          AND s.status = 'Approved' 
          AND s.grade IS NOT NULL
      ) AS final_grade
    FROM users u
    LEFT JOIN levels l ON u.level_id = l.id
    WHERE u.role = 'student'
    ORDER BY u.id DESC
  `;
  db.query(sql, (err, students) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!students || students.length === 0) return res.json([]);

    const coursesSql = `
      SELECT 
        uc.user_id,
        uc.course_id AS id,
        l.title,
        (SELECT COUNT(*) FROM tasks t WHERE t.level_id = uc.course_id) AS total_tasks,
        (
          SELECT COUNT(DISTINCT s.task_id)
          FROM submissions s
          JOIN tasks t ON s.task_id = t.id
          WHERE s.user_id = uc.user_id 
            AND t.level_id = uc.course_id 
            AND s.status = 'Approved' 
            AND s.grade IS NOT NULL
        ) AS completed_graded_tasks,
        (
          SELECT ROUND(AVG(s.grade), 1)
          FROM submissions s
          JOIN tasks t ON s.task_id = t.id
          WHERE s.user_id = uc.user_id 
            AND t.level_id = uc.course_id 
            AND s.status = 'Approved' 
            AND s.grade IS NOT NULL
        ) AS final_grade
      FROM user_courses uc
      JOIN levels l ON uc.course_id = l.id
      ORDER BY uc.enrolled_at ASC, uc.id ASC
    `;

    db.query(coursesSql, (cErr, allCourses) => {
      if (cErr) return res.status(500).json({ error: cErr.message });

      const coursesByUserId = {};
      (allCourses || []).forEach(c => {
        if (!coursesByUserId[c.user_id]) coursesByUserId[c.user_id] = [];
        coursesByUserId[c.user_id].push({
          ...c,
          is_finished: c.total_tasks > 0 && c.completed_graded_tasks === c.total_tasks
        });
      });

      const enrichedStudents = students.map(student => {
        const studentCourses = coursesByUserId[student.id] || [];
        return {
          ...student,
          courses: studentCourses,
          course_ids: studentCourses.map(c => c.id)
        };
      });

      res.json(enrichedStudents);
    });
  });
});

// Helper for course assignment
const handleAssignCourses = (userId, course_ids, level_id, res) => {
  let selectedCourseIds = [];
  if (Array.isArray(course_ids)) {
    selectedCourseIds = course_ids.map(Number).filter(id => !isNaN(id) && id > 0);
  } else if (course_ids !== undefined && course_ids !== null && course_ids !== '') {
    selectedCourseIds = [Number(course_ids)].filter(id => !isNaN(id) && id > 0);
  } else if (level_id !== undefined && level_id !== null && level_id !== '') {
    selectedCourseIds = [Number(level_id)].filter(id => !isNaN(id) && id > 0);
  }

  const primaryLevelId = selectedCourseIds.length > 0 ? selectedCourseIds[selectedCourseIds.length - 1] : null;

  db.query("UPDATE users SET level_id = ? WHERE id = ?", [primaryLevelId, userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    if (selectedCourseIds.length === 0) {
      db.query("DELETE FROM user_courses WHERE user_id = ?", [userId], (delErr) => {
        if (delErr) return res.status(500).json({ error: delErr.message });
        return res.json({ message: "Student courses updated successfully" });
      });
      return;
    }

    db.query(
      "DELETE FROM user_courses WHERE user_id = ? AND course_id NOT IN (?)",
      [userId, selectedCourseIds],
      (delErr) => {
        if (delErr) return res.status(500).json({ error: delErr.message });

        const values = selectedCourseIds.map(cId => [userId, cId]);
        db.query(
          "INSERT IGNORE INTO user_courses (user_id, course_id) VALUES ?",
          [values],
          (insErr) => {
            if (insErr) return res.status(500).json({ error: insErr.message });
            res.json({ message: "Student courses updated successfully" });
          }
        );
      }
    );
  });
};

// 9. Assign Courses to Student
app.put("/api/students/:id/courses", (req, res) => {
  handleAssignCourses(req.params.id, req.body.course_ids, req.body.level_id, res);
});

app.put("/api/students/:id/level", (req, res) => {
  handleAssignCourses(req.params.id, req.body.course_ids, req.body.level_id, res);
});

// 10. Add New Task
app.post("/api/tasks", upload.single("file"), (req, res) => {
  const { level_id, title, instructions } = req.body;
  const file_path = req.file ? req.file.path : null;
  db.query(
    "INSERT INTO tasks (level_id, title, instructions, file_path) VALUES (?, ?, ?, ?)",
    [level_id, title, instructions, file_path],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Task created successfully", taskId: result.insertId });
    }
  );
});

// 11. Update Task 
app.put("/api/tasks/:id", upload.single("file"), (req, res) => {
  const { title, instructions } = req.body;
  const file_path = req.file ? req.file.path : null;

  const sql = file_path 
    ? "UPDATE tasks SET title = ?, instructions = ?, file_path = ? WHERE id = ?"
    : "UPDATE tasks SET title = ?, instructions = ? WHERE id = ?";
  const params = file_path 
    ? [title, instructions, file_path, req.params.id]
    : [title, instructions, req.params.id];

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Task updated successfully" });
  });
});

// 12. Delete Task 
app.delete("/api/tasks/:id", (req, res) => {
  db.query("DELETE FROM tasks WHERE id = ?", [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Task deleted successfully" });
  });
});

// 13. Upload Material
app.post("/api/materials", upload.single("file"), (req, res) => {
  const { level_id, title } = req.body;
  const file_path = req.file ? req.file.path : null;
  db.query("INSERT INTO materials (level_id, title, file_path) VALUES (?, ?, ?)", [level_id, title, file_path], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Material uploaded successfully", materialId: result.insertId });
  });
});

// 14. Get Materials by Level
app.get("/api/materials/level/:levelId", (req, res) => {
  db.query("SELECT * FROM materials WHERE level_id = ?", [req.params.levelId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// 15. Delete Material
app.delete("/api/materials/:id", (req, res) => {
  db.query("DELETE FROM materials WHERE id = ?", [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Material deleted successfully" });
  });
});

// 16. Add New Level
app.post("/api/levels", (req, res) => {
  const { title, description } = req.body;
  db.query("INSERT INTO levels (title, description) VALUES (?, ?)", [title, description], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Course added successfully", id: result.insertId });
  });
});

// 17. Update Level
app.put("/api/levels/:id", (req, res) => {
  const { title, description } = req.body;
  db.query("UPDATE levels SET title = ?, description = ? WHERE id = ?", [title, description, req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Course updated successfully" });
  });
});

// 18. Delete Level 
app.delete("/api/levels/:id", (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM materials WHERE level_id = ?", [id], () => {
    db.query("DELETE FROM tasks WHERE level_id = ?", [id], () => {
      db.query("DELETE FROM levels WHERE id = ?", [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Course deleted successfully" });
      });
    });
  });
});

// 19. Get Submissions by User ID 
app.get("/api/submissions/user/:userId", (req, res) => {
  const sql = `
    SELECT s.*, t.title as task_title, l.title as course_title, l.id as course_id, t.level_id
    FROM submissions s
    JOIN tasks t ON s.task_id = t.id
    JOIN levels l ON t.level_id = l.id
    WHERE s.user_id = ?
    ORDER BY s.submitted_at DESC
  `;
  db.query(sql, [req.params.userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// 20. Save Registration Request from Home Page
app.post("/api/registration-requests", (req, res) => {
  const { name, phone, level_id } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: "Name and contact info are required" });
  }
  const cleanPhone = String(phone).trim();
  const emailIdentifier = cleanPhone.includes('@') 
    ? cleanPhone.toLowerCase() 
    : `inquiry_${cleanPhone.replace(/\D/g, '') || Date.now()}@request.pending`;

  db.query(
    "INSERT INTO users (name, email, password, role, level_id) VALUES (?, ?, 'pending', 'pending', ?) ON DUPLICATE KEY UPDATE name = VALUES(name), level_id = VALUES(level_id)",
    [name.trim(), emailIdentifier, level_id || null],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Registration request submitted successfully!" });
    }
  );
});

// 21. Enroll / Assign courses to a student 
app.post("/api/students", async (req, res) => {
  const { user_id, name, email, level_id, course_ids } = req.body;

  // 1. Direct enrollment by existing student ID
  if (user_id) {
    return handleAssignCourses(user_id, course_ids, level_id, res);
  }

  // 2. Enrollment by email: check if student is already registered
  if (email && email.trim() !== '') {
    const cleanEmail = email.trim().toLowerCase();
    db.query("SELECT id, name FROM users WHERE email = ? AND role = 'student' LIMIT 1", [cleanEmail], async (err, users) => {
      if (err) return res.status(500).json({ error: err.message });

      if (users.length > 0) {
        const existingStudentId = users[0].id;
        if (name && name.trim() !== '') {
          db.query("UPDATE users SET name = ? WHERE id = ?", [name.trim(), existingStudentId]);
        }
        return handleAssignCourses(existingStudentId, course_ids, level_id, res);
      }
      try {
        const cleanName = (name && name.trim() !== '') ? name.trim() : cleanEmail.split('@')[0];
        const hashedPassword = await bcrypt.hash("123456", 10);
        db.query(
          "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'student')",
          [cleanName, cleanEmail, hashedPassword],
          (insErr, insResult) => {
            if (insErr) return res.status(500).json({ error: insErr.message });
            return handleAssignCourses(insResult.insertId, course_ids, level_id, res);
          }
        );
      } catch (hashError) {
        return res.status(500).json({ error: "Failed to create student account" });
      }
    });
    return;
  }

  return res.status(400).json({ error: "Student ID or email is required to assign courses." });
});

// 22. Edit student details 
app.put("/api/students/:id", (req, res) => {
  const { name, email, course_ids, level_id } = req.body;
  const studentId = req.params.id;

  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  db.query(
    "UPDATE users SET name = ?, email = ? WHERE id = ? AND role = 'student'",
    [cleanName, cleanEmail, studentId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      if (course_ids !== undefined || level_id !== undefined) {
        return handleAssignCourses(studentId, course_ids, level_id, res);
      }
      res.json({ message: "Student details updated successfully" });
    }
  );
});

// 23. Delete student
app.delete("/api/students/:id", (req, res) => {
  db.query("DELETE FROM users WHERE id = ? AND role = 'student'", [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Student deleted successfully" });
  });
});


app.get("/api/submissions", (req, res) => {
  const sql = `
    SELECT s.*, u.name as student_name, t.title as task_title, l.title as course_title, t.level_id as course_id
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    JOIN tasks t ON s.task_id = t.id
    JOIN levels l ON t.level_id = l.id
    ORDER BY s.submitted_at DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// 25. Update submission status + feedback + grade
app.put("/api/submissions/:id/status", (req, res) => {
  const { status, feedback, grade } = req.body;
  const gradeVal = (grade !== undefined && grade !== null && grade !== '') ? Number(grade) : null;
  db.query(
    "UPDATE submissions SET status = ?, feedback = ?, grade = ? WHERE id = ?",
    [status, feedback || null, gradeVal, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Status updated" });
    }
  );
});

const PORT = 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
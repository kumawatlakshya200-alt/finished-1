// server.js - VIDYA-CUE Backend (JSON files only, pure JavaScript)
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'supersecretkey123';

// ====== DATA FILES ======
const DATA_DIR = './data';
const TEACHERS_FILE = path.join(DATA_DIR, 'teachers.json');
const ASSIGNMENTS_FILE = path.join(DATA_DIR, 'assignments.json');

// Create data directory
async function initDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    // Create default teacher if not exists
    try {
      await fs.access(TEACHERS_FILE);
    } catch {
      const defaultTeacher = {
        teachers: [{
          id: '1',
          name: 'Dr. Priya Sharma',
          email: 'priya.sharma@ecb.ac.in',
          password: await bcrypt.hash('password123', 10), // hashed
          department: 'Computer Science',
          role: 'teacher'
        }]
      };
      await fs.writeFile(TEACHERS_FILE, JSON.stringify(defaultTeacher, null, 2));
      console.log('Default teacher created');
    }
    
    // Create sample assignments if not exists
    try {
      await fs.access(ASSIGNMENTS_FILE);
    } catch {
      const sampleData = {
        assignments: [
          {
            id: '1',
            title: 'Array Manipulation Challenge',
            subject: 'Data Structures',
            course: 'B.Tech CSE 3rd Sem',
            status: 'pending',
            dueDate: '2024-11-30',
            totalStudents: 75,
            submittedCount: 18,
            gradedCount: 0,
            teacherId: '1'
          },
          {
            id: '2',
            title: 'Algorithm Complexity Analysis',
            subject: 'Algorithms',
            course: 'B.Tech CSE 5th Sem',
            status: 'graded',
            dueDate: '2024-11-25',
            totalStudents: 68,
            submittedCount: 68,
            gradedCount: 68,
            teacherId: '1'
          }
        ]
      };
      await fs.writeFile(ASSIGNMENTS_FILE, JSON.stringify(sampleData, null, 2));
    }
  } catch (err) {
    console.error('Init error:', err);
  }
}

// ====== FILE HELPERS ======
async function readJSON(file) {
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch {
    return { [path.basename(file, '.json').slice(0, -1)]: [] };
  }
}

async function writeJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

// ====== MIDDLEWARE ======
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token, authorization denied' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token is not valid' });
  }
}

function signToken(teacher) {
  return jwt.sign(
    { id: teacher.id, email: teacher.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ====== ROUTES ======
app.get('/', (req, res) => {
  res.json({ message: 'VIDYA-CUE Teacher API (JSON files) running' });
});

// AUTH
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { teachers } = await readJSON(TEACHERS_FILE);
    
    const teacher = teachers.find(t => t.email === email);
    if (!teacher || !(await bcrypt.compare(password, teacher.password))) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    const token = signToken(teacher);
    res.json({
      token,
      teacher: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        department: teacher.department,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, department } = req.body;
    const { teachers } = await readJSON(TEACHERS_FILE);
    
    if (teachers.find(t => t.email === email)) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    
    const newTeacher = {
      id: Date.now().toString(),
      name,
      email,
      password: await bcrypt.hash(password, 10),
      department,
      role: 'teacher'
    };
    
    teachers.push(newTeacher);
    await writeJSON(TEACHERS_FILE, { teachers });
    
    const token = signToken(newTeacher);
    res.status(201).json({
      token,
      teacher: { id: newTeacher.id, name, email, department }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ASSIGNMENTS
app.get('/api/assignments', auth, async (req, res) => {
  try {
    const { assignments } = await readJSON(ASSIGNMENTS_FILE);
    const teacherAssignments = assignments.filter(a => a.teacherId === req.user.id);
    
    const stats = {
      totalAssignments: teacherAssignments.length,
      pending: teacherAssignments.filter(a => a.status === 'pending').length,
      submitted: teacherAssignments.filter(a => a.status === 'submitted').length,
      graded: teacherAssignments.filter(a => a.status === 'graded').length,
    };
    
    res.json({ stats, assignments: teacherAssignments });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/assignments', auth, async (req, res) => {
  try {
    const { assignments } = await readJSON(ASSIGNMENTS_FILE);
    const newAssignment = {
      id: Date.now().toString(),
      ...req.body,
      teacherId: req.user.id,
      submittedCount: req.body.submittedCount || 0,
      gradedCount: req.body.gradedCount || 0
    };
    
    assignments.push(newAssignment);
    await writeJSON(ASSIGNMENTS_FILE, { assignments });
    res.status(201).json(newAssignment);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/assignments/:id', auth, async (req, res) => {
  try {
    const { assignments } = await readJSON(ASSIGNMENTS_FILE);
    const assignment = assignments.find(a => a.id === req.params.id && a.teacherId === req.user.id);
    
    if (!assignment) return res.status(404).json({ message: 'Not found' });
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/assignments/:id', auth, async (req, res) => {
  try {
    const { assignments } = await readJSON(ASSIGNMENTS_FILE);
    const index = assignments.findIndex(a => a.id === req.params.id && a.teacherId === req.user.id);
    
    if (index === -1) return res.status(404).json({ message: 'Not found' });
    
    assignments[index] = { ...assignments[index], ...req.body };
    await writeJSON(ASSIGNMENTS_FILE, { assignments });
    res.json(assignments[index]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/assignments/:id', auth, async (req, res) => {
  try {
    const { assignments } = await readJSON(ASSIGNMENTS_FILE);
    const filtered = assignments.filter(a => a.id !== req.params.id || a.teacherId !== req.user.id);
    
    await writeJSON(ASSIGNMENTS_FILE, { assignments: filtered });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/assignments/:id/mark-graded', auth, async (req, res) => {
  try {
    const { assignments } = await readJSON(ASSIGNMENTS_FILE);
    const index = assignments.findIndex(a => a.id === req.params.id && a.teacherId === req.user.id);
    
    if (index === -1) return res.status(404).json({ message: 'Not found' });
    
    assignments[index].status = 'graded';
    assignments[index].gradedCount = assignments[index].submittedCount;
    await writeJSON(ASSIGNMENTS_FILE, { assignments });
    res.json(assignments[index]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/assignments/:id/remind', auth, async (req, res) => {
  res.json({ message: 'Reminder triggered (implement actual logic)' });
});

// ====== START ======
initDataDir().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Default login: priya.sharma@ecb.ac.in / password123`);
  });
});

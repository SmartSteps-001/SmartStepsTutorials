const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'smart-steps-secret-key';
const MONGO_URI = 'mongodb+srv://faithabayomi18:f1vouroluw11972@dominionspecialist.cdp3oi9.mongodb.net/videocall?retryWrites=true&w=majority&appName=dominionspecialist';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: 'smart-steps-session-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGO_URI
  }),
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Connect to MongoDB Atlas
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

// Teacher Schema
const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  subject: { type: String, required: true, enum: ['Biology', 'Mathematics', 'English', 'Physics', 'Chemistry'] },
  createdAt: { type: Date, default: Date.now }
});

// Quiz Schema
const quizSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: { type: String, required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  questions: [{
    question: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctAnswer: { type: Number, required: true },
    passageId: { type: String } // Optional: links question to a reading passage
  }],
  passages: [{
    id: { type: String, required: true },
    text: { type: String, required: true },
    questionCount: { type: Number, required: true }
  }],
  timeLimit: { type: Number, default: 0 }, // Time limit in minutes (0 = no limit)
  shareId: { type: String, unique: true, default: uuidv4 },
  createdAt: { type: Date, default: Date.now }
});

// Student Response Schema
const responseSchema = new mongoose.Schema({
  studentName: { type: String, required: true },
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  answers: [{ type: Number, required: true }],
  score: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  timeSpent: { type: Number, default: 0 }, // Time spent in seconds
  correctionId: { type: String, unique: true, default: uuidv4 },
  submittedAt: { type: Date, default: Date.now }
});

const Teacher = mongoose.model('Teacher', teacherSchema);
const Quiz = mongoose.model('Quiz', quizSchema);
const Response = mongoose.model('Response', responseSchema);

// Authentication middleware
const authenticateTeacher = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.teacher = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// Routes

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/teacher-register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher-register.html'));
});

app.get('/teacher-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher-login.html'));
});

app.get('/teacher-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher-dashboard.html'));
});

app.get('/create-quiz', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'create-quiz.html'));
});

app.get('/quiz/:shareId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student-quiz.html'));
});

app.get('/correction/:correctionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'quiz-correction.html'));
});

app.get('/quiz-results/:quizId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'quiz-results.html'));
});

app.get('/student-details/:responseId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student-details.html'));
});

// Teacher registration
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, subject } = req.body;

    // Check if teacher already exists
    const existingTeacher = await Teacher.findOne({ email });
    if (existingTeacher) {
      return res.status(400).json({ error: 'Teacher with this email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new teacher
    const teacher = new Teacher({
      name,
      email,
      password: hashedPassword,
      subject
    });

    await teacher.save();

    // Generate JWT token
    const token = jwt.sign(
      { id: teacher._id, email: teacher.email, name: teacher.name, subject: teacher.subject },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    res.status(201).json({ message: 'Teacher registered successfully', teacher: { id: teacher._id, name, email, subject } });
  } catch (error) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Teacher login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find teacher
    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, teacher.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: teacher._id, email: teacher.email, name: teacher.name, subject: teacher.subject },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    res.json({ message: 'Login successful', teacher: { id: teacher._id, name: teacher.name, email: teacher.email, subject: teacher.subject } });
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Teacher logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Create quiz
app.post('/api/quiz', authenticateTeacher, async (req, res) => {
  try {
    const { title, questions, passages, timeLimit } = req.body;
    
    const quiz = new Quiz({
      title,
      subject: req.teacher.subject,
      teacherId: req.teacher.id,
      questions,
      passages: passages || [],
      timeLimit: timeLimit || 0,
      shareId: uuidv4()
    });

    await quiz.save();
    res.status(201).json({ message: 'Quiz created successfully', quiz });
  } catch (error) {
    res.status(500).json({ error: 'Error creating quiz' });
  }
});

// Delete quiz
app.delete('/api/quiz/:quizId', authenticateTeacher, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Verify that the quiz belongs to the authenticated teacher
    if (quiz.teacherId.toString() !== req.teacher.id) {
      return res.status(403).json({ error: 'Access denied. You can only delete your own quizzes.' });
    }

    // Delete all responses associated with this quiz
    await Response.deleteMany({ quizId: req.params.quizId });

    // Delete the quiz
    await Quiz.findByIdAndDelete(req.params.quizId);

    res.json({ message: 'Quiz and all associated responses deleted successfully' });
  } catch (error) {
    console.error('Error deleting quiz:', error);
    res.status(500).json({ error: 'Error deleting quiz' });
  }
});

// Get teacher's quizzes
app.get('/api/quizzes', authenticateTeacher, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ teacherId: req.teacher.id });
    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching quizzes' });
  }
});

// Get quiz by share ID (for students)
app.get('/api/quiz/:shareId', async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ shareId: req.params.shareId });
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    // Remove correct answers for student view but keep passages
    const studentQuiz = {
      ...quiz.toObject(),
      questions: quiz.questions.map(q => ({
        question: q.question,
        options: q.options,
        passageId: q.passageId
      }))
    };
    
    res.json(studentQuiz);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching quiz' });
  }
});

// Submit quiz response
app.post('/api/submit/:shareId', async (req, res) => {
  try {
    const { studentName, answers, timeSpent } = req.body;
    
    const quiz = await Quiz.findOne({ shareId: req.params.shareId });
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Calculate score
    let score = 0;
    quiz.questions.forEach((question, index) => {
      if (answers[index] !== -1 && answers[index] === question.correctAnswer) {
        score++;
      }
    });

    // Save response
    const response = new Response({
      studentName,
      quizId: quiz._id,
      answers,
      score,
      totalQuestions: quiz.questions.length,
      timeSpent: timeSpent || 0,
      correctionId: uuidv4()
    });

    await response.save();

    res.json({ 
      message: 'Quiz submitted successfully', 
      score, 
      totalQuestions: quiz.questions.length,
      percentage: Math.round((score / quiz.questions.length) * 100),
      correctionId: response.correctionId
    });
  } catch (error) {
    res.status(500).json({ error: 'Error submitting quiz' });
  }
});

// Get correction data for student
app.get('/api/correction/:correctionId', async (req, res) => {
  try {
    const response = await Response.findOne({ correctionId: req.params.correctionId })
      .populate('quizId');
    
    if (!response) {
      return res.status(404).json({ error: 'Correction not found' });
    }

    // Include correct answers for correction view
    const correctionData = {
      studentName: response.studentName,
      quiz: response.quizId,
      studentAnswers: response.answers,
      score: response.score,
      totalQuestions: response.totalQuestions,
      percentage: Math.round((response.score / response.totalQuestions) * 100),
      timeSpent: response.timeSpent,
      submittedAt: response.submittedAt
    };

    res.json(correctionData);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching correction data' });
  }
});

// Get quiz responses (for teachers) - separated by quiz
app.get('/api/responses/:quizId', authenticateTeacher, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz || quiz.teacherId.toString() !== req.teacher.id) {
      return res.status(404).json({ error: 'Quiz not found or access denied' });
    }

    const responses = await Response.find({ quizId: req.params.quizId })
      .populate('quizId', 'title')
      .sort({ submittedAt: -1 });
    
    res.json({
      quiz: {
        title: quiz.title,
        subject: quiz.subject,
        totalQuestions: quiz.questions.length,
        timeLimit: quiz.timeLimit
      },
      responses
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching responses' });
  }
});

// Get detailed student response (for teachers)
app.get('/api/student-details/:responseId', authenticateTeacher, async (req, res) => {
  try {
    const response = await Response.findById(req.params.responseId)
      .populate('quizId');
    
    if (!response) {
      return res.status(404).json({ error: 'Response not found' });
    }

    // Verify teacher owns this quiz
    if (response.quizId.teacherId.toString() !== req.teacher.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Include detailed analysis
    const detailedResponse = {
      studentName: response.studentName,
      quiz: response.quizId,
      studentAnswers: response.answers,
      score: response.score,
      totalQuestions: response.totalQuestions,
      percentage: Math.round((response.score / response.totalQuestions) * 100),
      timeSpent: response.timeSpent,
      submittedAt: response.submittedAt,
      questionAnalysis: response.quizId.questions.map((question, index) => ({
        question: question.question,
        options: question.options,
        correctAnswer: question.correctAnswer,
        studentAnswer: response.answers[index],
        isCorrect: response.answers[index] === question.correctAnswer
      }))
    };

    res.json(detailedResponse);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching student details' });
  }
});

// Get all responses for teacher's quizzes (grouped by quiz)
app.get('/api/all-responses', authenticateTeacher, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ teacherId: req.teacher.id });
    const quizIds = quizzes.map(quiz => quiz._id);
    
    const responses = await Response.find({ quizId: { $in: quizIds } })
      .populate('quizId', 'title subject timeLimit')
      .sort({ submittedAt: -1 });
    
    // Group responses by quiz
    const groupedResponses = {};
    responses.forEach(response => {
      const quizId = response.quizId._id.toString();
      if (!groupedResponses[quizId]) {
        groupedResponses[quizId] = {
          quiz: response.quizId,
          responses: []
        };
      }
      groupedResponses[quizId].responses.push(response);
    });
    
    res.json(groupedResponses);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching all responses' });
  }
});

// Get quiz statistics
app.get('/api/quiz-stats/:quizId', authenticateTeacher, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz || quiz.teacherId.toString() !== req.teacher.id) {
      return res.status(404).json({ error: 'Quiz not found or access denied' });
    }

    const responses = await Response.find({ quizId: req.params.quizId });
    
    const stats = {
      totalAttempts: responses.length,
      averageScore: responses.length > 0 ? 
        Math.round(responses.reduce((sum, r) => sum + (r.score / r.totalQuestions * 100), 0) / responses.length) : 0,
      highestScore: responses.length > 0 ? 
        Math.max(...responses.map(r => Math.round(r.score / r.totalQuestions * 100))) : 0,
      lowestScore: responses.length > 0 ? 
        Math.min(...responses.map(r => Math.round(r.score / r.totalQuestions * 100))) : 0,
      averageTime: responses.length > 0 ? 
        Math.round(responses.reduce((sum, r) => sum + r.timeSpent, 0) / responses.length) : 0
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching quiz statistics' });
  }
});

// Verify teacher authentication
app.get('/api/verify', authenticateTeacher, (req, res) => {
  res.json({ authenticated: true, teacher: req.teacher });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`Smart Steps Quiz Server running on port ${PORT}`);
  console.log(`Connected to MongoDB Atlas database: videocall`);
});
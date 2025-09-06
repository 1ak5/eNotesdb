// Fix punycode warning
process.removeAllListeners('warning');

// Load environment variables first
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://suryawanshiaditya915:j28ypFv6unzrodIz@notesapp.d3r8gkc.mongodb.net/notes-app?retryWrites=true&w=majority';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

// Simplified MongoDB connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('💡 Please make sure MongoDB is running locally or check your Atlas connection');
    
    // Try to give more helpful error messages
    if (error.message.includes('ECONNREFUSED')) {
      console.log('🔧 MongoDB is not running. Start it with: mongod');
    } else if (error.message.includes('authentication failed')) {
      console.log('🔐 Check your MongoDB username/password in connection string');
    }
    
    process.exit(1);
  }
};

// Connect to database
connectDB();

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('🚀 Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ Mongoose disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('👋 MongoDB connection closed.');
  process.exit(0);
});

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  pin: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Notebook Schema
const notebookSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  section: { type: String, enum: ['regular', 'checklist'], required: true },
  createdAt: { type: Date, default: Date.now }
});

// Note Schema
const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notebookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notebook' },
  section: { type: String, enum: ['regular', 'checklist', 'locked', 'favorites'], required: true },
  title: { type: String },
  content: { type: String, required: true },
  isChecked: { type: Boolean, default: false },
  isFavorite: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },
  checklistItems: [{
    text: String,
    checked: { type: Boolean, default: false }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Notebook = mongoose.model('Notebook', notebookSchema);
const Note = mongoose.model('Note', noteSchema);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGODB_URI
  }),
  cookie: { 
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: false,
    httpOnly: true
  }
});

app.use(sessionMiddleware);

// Share session with socket.io
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Add user settings schema for lock password
const userSettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lockPassword: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const UserSettings = mongoose.model('UserSettings', userSettingsSchema);

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

// Socket.IO connection handling
const userSockets = new Map(); // Track user sockets

io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);
  
  // Store user socket when authenticated
  socket.on('authenticate', (userId) => {
    if (userId) {
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      console.log(`✅ User ${userId} authenticated with socket ${socket.id}`);
    }
  });
  
  socket.on('disconnect', () => {
    if (socket.userId) {
      userSockets.delete(socket.userId);
      console.log(`👋 User ${socket.userId} disconnected`);
    }
  });
});

// Broadcast functions for real-time updates
const broadcastToUser = (userId, event, data) => {
  const socketId = userSockets.get(userId.toString());
  if (socketId) {
    io.to(socketId).emit(event, data);
  }
};

const broadcastNotebookUpdate = async (userId, section) => {
  try {
    const notebooks = await Notebook.find({ userId, section }).lean().sort({ createdAt: -1 });
    const notebooksWithCounts = await Promise.all(
      notebooks.map(async (notebook) => {
        const noteCount = await Note.countDocuments({ notebookId: notebook._id });
        return { ...notebook, noteCount };
      })
    );
    broadcastToUser(userId, 'notebooks_updated', { section, notebooks: notebooksWithCounts });
  } catch (error) {
    console.error('Failed to broadcast notebook update:', error);
  }
};

const broadcastNotesUpdate = async (userId, section, notebookId = null) => {
  try {
    let query = { userId, section };
    if (section === 'regular' || section === 'checklist') {
      query.notebookId = notebookId;
    } else if (section === 'favorites') {
      query = { userId, isFavorite: true };
    } else if (section === 'locked') {
      query.isLocked = true;
    }

    const notes = await Note.find(query)
      .populate('notebookId', 'name')
      .lean()
      .sort({ updatedAt: -1 })
      .limit(100);
    
    broadcastToUser(userId, 'notes_updated', { section, notebookId, notes });
  } catch (error) {
    console.error('Failed to broadcast notes update:', error);
  }
};

// Routes

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, pin } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    const user = new User({ username, pin: hashedPin });
    await user.save();

    req.session.userId = user._id;
    res.json({ success: true, userId: user._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, pin } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    let isValidPin = false;
    // Check if the stored pin is likely unhashed (e.g., if it's not a bcrypt hash)
    // bcrypt hashes typically start with $2a$, $2b$, or $2y$
    if (user.pin && !user.pin.startsWith('$2')) {
      // Likely an unhashed pin, compare directly
      isValidPin = (pin === user.pin);
      if (isValidPin) {
        // Hash and update the pin for future logins
        const hashedPin = await bcrypt.hash(pin, 10);
        user.pin = hashedPin;
        await user.save();
      }
    } else {
      // Hashed pin, compare using bcrypt
      isValidPin = await bcrypt.compare(pin, user.pin);
    }

    if (!isValidPin) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    req.session.userId = user._id;
    res.json({ success: true, userId: user._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get notebooks
app.get('/api/notebooks/:section', requireAuth, async (req, res) => {
  try {
    const { section } = req.params;
    const notebooks = await Notebook.find({ 
      userId: req.session.userId, 
      section 
    }).lean().sort({ createdAt: -1 });

    // Get note counts
    const notebooksWithCounts = await Promise.all(
      notebooks.map(async (notebook) => {
        const noteCount = await Note.countDocuments({ 
          notebookId: notebook._id 
        });
        return {
          ...notebook,
          noteCount
        };
      })
    );

    res.json(notebooksWithCounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create notebook
app.post('/api/notebooks', requireAuth, async (req, res) => {
  try {
    const { name, section } = req.body;
    const notebook = new Notebook({
      userId: req.session.userId,
      name,
      section
    });
    await notebook.save();
    
    // Real-time broadcast
    broadcastNotebookUpdate(req.session.userId, section);
    
    res.json(notebook);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete notebook
app.delete('/api/notebooks/:id', requireAuth, async (req, res) => {
  try {
    const notebook = await Notebook.findById(req.params.id);
    if (!notebook) {
      return res.status(404).json({ error: 'Notebook not found' });
    }
    
    await Note.deleteMany({ notebookId: req.params.id });
    await Notebook.findByIdAndDelete(req.params.id);
    
    // Real-time broadcast
    broadcastNotebookUpdate(req.session.userId, notebook.section);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get notes
app.get('/api/notes/:section/:notebookId?', requireAuth, async (req, res) => {
  try {
    const { section, notebookId } = req.params;
    let query = { userId: req.session.userId, section };
    
    if (section === 'regular' || section === 'checklist') {
      query.notebookId = notebookId;
    } else if (section === 'favorites') {
      query = { userId: req.session.userId, isFavorite: true };
    } else if (section === 'locked') {
      query.isLocked = true;
    }

    const notes = await Note.find(query)
      .populate('notebookId', 'name')
      .lean()
      .sort({ updatedAt: -1 })
      .limit(100);
    
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create note
app.post('/api/notes', requireAuth, async (req, res) => {
  try {
    const noteData = {
      ...req.body,
      userId: req.session.userId,
      updatedAt: new Date()
    };
    
    const note = new Note(noteData);
    await note.save();
    await note.populate('notebookId', 'name');
    
    // Real-time broadcast to all relevant sections
    if (noteData.section === 'regular' || noteData.section === 'checklist') {
      broadcastNotesUpdate(req.session.userId, noteData.section, noteData.notebookId);
      // Also update notebook count
      broadcastNotebookUpdate(req.session.userId, noteData.section);
    } else if (noteData.section === 'locked') {
      broadcastNotesUpdate(req.session.userId, 'locked');
    }
    
    // Update favorites if note is favorited
    if (noteData.isFavorite) {
      broadcastNotesUpdate(req.session.userId, 'favorites');
    }
    
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update note
app.put('/api/notes/:id', requireAuth, async (req, res) => {
  try {
    const note = await Note.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    ).populate('notebookId', 'name');
    
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    // Real-time broadcast
    if (note.section === 'regular' || note.section === 'checklist') {
      broadcastNotesUpdate(req.session.userId, note.section, note.notebookId?._id);
    } else if (note.section === 'locked') {
      broadcastNotesUpdate(req.session.userId, 'locked');
    }
    
    // Update favorites if note is favorited
    if (note.isFavorite) {
      broadcastNotesUpdate(req.session.userId, 'favorites');
    }
    
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete note
app.delete('/api/notes/:id', requireAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    await Note.findByIdAndDelete(req.params.id);
    
    // Real-time broadcast
    if (note.section === 'regular' || note.section === 'checklist') {
      broadcastNotesUpdate(req.session.userId, note.section, note.notebookId);
      // Also update notebook count
      broadcastNotebookUpdate(req.session.userId, note.section);
    } else if (note.section === 'locked') {
      broadcastNotesUpdate(req.session.userId, 'locked');
    }
    
    // Update favorites if note was favorited
    if (note.isFavorite) {
      broadcastNotesUpdate(req.session.userId, 'favorites');
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle favorite
app.post('/api/notes/:id/favorite', requireAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    note.isFavorite = !note.isFavorite;
    note.updatedAt = new Date();
    await note.save();
    await note.populate('notebookId', 'name');
    
    // Real-time broadcast to all relevant sections
    if (note.section === 'regular' || note.section === 'checklist') {
      broadcastNotesUpdate(req.session.userId, note.section, note.notebookId?._id);
    } else if (note.section === 'locked') {
      broadcastNotesUpdate(req.session.userId, 'locked');
    }
    
    // Always update favorites
    broadcastNotesUpdate(req.session.userId, 'favorites');
    
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add route to set lock password
app.post('/api/set-lock-password', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;

    const hashedLockPassword = await bcrypt.hash(password, 10);

    await UserSettings.findOneAndUpdate(
      { userId: req.session.userId },
      { lockPassword: hashedLockPassword },
      { upsert: true }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add route to verify lock password
app.post('/api/verify-lock-password', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    const settings = await UserSettings.findOne({ userId: req.session.userId });
    
    if (!settings || !settings.lockPassword) {
      return res.json({ success: false, needsSetup: true });
    }
    
    const isValid = await bcrypt.compare(password, settings.lockPassword);
    res.json({ success: isValid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add route to check if lock password exists
app.get('/api/check-lock-setup', requireAuth, async (req, res) => {
  try {
    const settings = await UserSettings.findOne({ userId: req.session.userId });
    res.json({ hasPassword: !!(settings && settings.lockPassword) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check session
app.get('/api/check-session', async (req, res) => {
  if (req.session.userId) {
    try {
      const user = await User.findById(req.session.userId).select('username');
      res.json({ 
        authenticated: true, 
        userId: req.session.userId,
        username: user ? user.username : 'User'
      });
    } catch (error) {
      res.json({ 
        authenticated: true, 
        userId: req.session.userId,
        username: 'User'
      });
    }
  } else {
    res.json({ authenticated: false });
  }
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} in your browser`);
});

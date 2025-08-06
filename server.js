const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
mongoose.connect('mongodb+srv://suryawanshiaditya915:j28ypFv6unzrodIz@notesapp.d3r8gkc.mongodb.net/notes-app?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
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
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: 'mongodb+srv://suryawanshiaditya915:j28ypFv6unzrodIz@notesapp.d3r8gkc.mongodb.net/notes-app?retryWrites=true&w=majority',
    touchAfter: 24 * 3600 // lazy session update
  }),
  cookie: { 
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: false,
    httpOnly: true
  }
}));

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

    const isValidPin = await bcrypt.compare(pin, user.pin);
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

    // Get note counts in parallel for better performance
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
    res.json(notebook);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete notebook
app.delete('/api/notebooks/:id', requireAuth, async (req, res) => {
  try {
    await Note.deleteMany({ notebookId: req.params.id });
    await Notebook.findByIdAndDelete(req.params.id);
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
      .limit(100); // Limit results for better performance
    
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
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete note
app.delete('/api/notes/:id', requireAuth, async (req, res) => {
  try {
    await Note.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle favorite
app.post('/api/notes/:id/favorite', requireAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    note.isFavorite = !note.isFavorite;
    note.updatedAt = new Date();
    await note.save();
    await note.populate('notebookId', 'name');
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add route to set lock password
app.post('/api/set-lock-password', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await UserSettings.findOneAndUpdate(
      { userId: req.session.userId },
      { lockPassword: hashedPassword },
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
app.get('/api/check-session', (req, res) => {
  res.json({ authenticated: !!req.session.userId });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

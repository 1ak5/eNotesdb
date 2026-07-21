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
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://suryawanshiaditya915:j28ypFv6unzrodIz@notesapp.d3r8gkc.mongodb.net/notes-app?retryWrites=true&w=majority';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path_mod = require('path');

// ─── MongoDB Connection ─────────────────────────────────
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB Connected: ' + conn.connection.host);
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('MongoDB is not running.');
    } else if (error.message.includes('authentication failed')) {
      console.log('Check your MongoDB credentials');
    }
    process.exit(1);
  }
};

connectDB();

mongoose.connection.on('connected', () => console.log('Mongoose connected'));
mongoose.connection.on('error', (err) => console.error('Mongoose error:', err));
mongoose.connection.on('disconnected', () => console.log('Mongoose disconnected'));

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed.');
  process.exit(0);
});

// ─── SCHEMAS ────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  pin: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const notebookSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  section: { type: String, enum: ['regular', 'checklist'], required: true },
  createdAt: { type: Date, default: Date.now }
});

const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notebookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notebook' },
  section: { type: String, enum: ['regular', 'checklist', 'locked', 'favorites'], required: true },
  title: { type: String },
  content: { type: String, required: true },
  isChecked: { type: Boolean, default: false },
  isFavorite: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },
  checklistItems: [{ text: String, checked: { type: Boolean, default: false } }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const imageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cloudUrl: { type: String, required: true },
  fileName: { type: String, required: true },
  isPinned: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },
  section: { type: String, enum: ['regular', 'locked'], default: 'regular' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const userSettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lockPassword: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Notebook = mongoose.model('Notebook', notebookSchema);
const Note = mongoose.model('Note', noteSchema);
const Image = mongoose.model('Image', imageSchema);
const UserSettings = mongoose.model('UserSettings', userSettingsSchema);

// ─── MIDDLEWARE ─────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGODB_URI }),
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, secure: false, httpOnly: true }
});

app.use(sessionMiddleware);

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

const requireAuth = (req, res, next) => {
  if (req.session.userId) next();
  else res.status(401).json({ error: 'Authentication required' });
};

// ─── SOCKET.IO ──────────────────────────────────────────

const userSockets = new Map();
io.engine.pingTimeout = 10000;
io.engine.pingInterval = 5000;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('authenticate', (userId) => {
    if (userId) {
      const existing = userSockets.get(userId);
      if (existing) {
        const s = io.sockets.sockets.get(existing);
        if (s) s.disconnect();
      }
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      socket.join('user_' + userId);
      console.log('User ' + userId + ' authenticated');
      socket.emit('sync_required');
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      socket.leave('user_' + socket.userId);
      userSockets.delete(socket.userId);
      console.log('User ' + socket.userId + ' disconnected');
    }
  });
});

const broadcastToUser = (userId, event, data) => {
  const socketId = userSockets.get(userId.toString());
  if (socketId) {
    io.volatile.to(socketId).emit(event, data);
    io.to(socketId).emit(event, data);
  }
};

const broadcastNotebookUpdate = async (userId, section) => {
  try {
    const notebooks = await Notebook.find({ userId, section }).lean().sort({ createdAt: -1 });
    const withCounts = await Promise.all(notebooks.map(async (nb) => {
      const c = await Note.countDocuments({ notebookId: nb._id });
      return { ...nb, noteCount: c };
    }));
    broadcastToUser(userId, 'notebooks_updated', { section, notebooks: withCounts });
  } catch (e) { console.error('broadcast notebooks:', e); }
};

const broadcastNotesUpdate = async (userId, section, notebookId) => {
  try {
    let query = { userId, section };
    if (section === 'regular' || section === 'checklist') query.notebookId = notebookId;
    else if (section === 'favorites') query = { userId, isFavorite: true };
    const notes = await Note.find(query).populate('notebookId', 'name').lean().sort({ updatedAt: -1 }).limit(100);
    broadcastToUser(userId, 'notes_updated', { section, notebookId, notes });
  } catch (e) { console.error('broadcast notes:', e); }
};

const broadcastImagesUpdate = async (userId) => {
  try {
    const images = await Image.find({ userId }).lean().sort({ isPinned: -1, createdAt: -1 });
    broadcastToUser(userId, 'images_updated', { images });
  } catch (e) { console.error('broadcast images:', e); }
};

// ─── AUTH ROUTES ────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  try {
    const { username, pin } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hashedPin = await bcrypt.hash(pin, 10);
    const user = new User({ username, pin: hashedPin });
    await user.save();
    req.session.userId = user._id;
    res.json({ success: true, userId: user._id });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, pin } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    let ok = false;
    if (user.pin && !user.pin.startsWith('$2')) {
      ok = (pin === user.pin);
      if (ok) { user.pin = await bcrypt.hash(pin, 10); await user.save(); }
    } else {
      ok = await bcrypt.compare(pin, user.pin);
    }
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
    req.session.userId = user._id;
    res.json({ success: true, userId: user._id });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/check-session', async (req, res) => {
  if (req.session.userId) {
    try {
      const user = await User.findById(req.session.userId).select('username');
      res.json({ authenticated: true, userId: req.session.userId, username: user ? user.username : 'User' });
    } catch (e) {
      res.json({ authenticated: true, userId: req.session.userId, username: 'User' });
    }
  } else {
    res.json({ authenticated: false });
  }
});

// ─── NOTEBOOKS ──────────────────────────────────────────

app.get('/api/notebooks/:section', requireAuth, async (req, res) => {
  try {
    const { section } = req.params;
    const notebooks = await Notebook.find({ userId: req.session.userId, section }).lean().sort({ createdAt: -1 });
    const withCounts = await Promise.all(notebooks.map(async (nb) => {
      const c = await Note.countDocuments({ notebookId: nb._id });
      return { ...nb, noteCount: c };
    }));
    res.json(withCounts);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/notebooks', requireAuth, async (req, res) => {
  try {
    const { name, section } = req.body;
    const notebook = new Notebook({ userId: req.session.userId, name, section });
    await notebook.save();
    broadcastNotebookUpdate(req.session.userId, section);
    res.json(notebook);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/notebooks/:id', requireAuth, async (req, res) => {
  try {
    const nb = await Notebook.findById(req.params.id);
    if (!nb) return res.status(404).json({ error: 'Not found' });
    await Note.deleteMany({ notebookId: req.params.id });
    await Notebook.findByIdAndDelete(req.params.id);
    broadcastNotebookUpdate(req.session.userId, nb.section);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── NOTES ──────────────────────────────────────────────

app.get('/api/notes/:section/:notebookId?', requireAuth, async (req, res) => {
  try {
    const { section, notebookId } = req.params;
    let query = { userId: req.session.userId, section };
    if (section === 'regular' || section === 'checklist') query.notebookId = notebookId;
    else if (section === 'favorites') query = { userId: req.session.userId, isFavorite: true };
    const notes = await Note.find(query).populate('notebookId', 'name').lean().sort({ updatedAt: -1 }).limit(100);
    res.json(notes);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/notes/standalone/:section', requireAuth, async (req, res) => {
  try {
    const { section } = req.params;
    const notes = await Note.find({
      userId: req.session.userId, section,
      $or: [{ notebookId: null }, { notebookId: { $exists: false } }]
    }).lean().sort({ updatedAt: -1 }).limit(100);
    res.json(notes);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/notes', requireAuth, async (req, res) => {
  try {
    const noteData = { ...req.body, userId: req.session.userId, updatedAt: new Date() };
    if (noteData.notebookId && !mongoose.Types.ObjectId.isValid(noteData.notebookId)) delete noteData.notebookId;
    const note = new Note(noteData);
    await note.save();
    await note.populate('notebookId', 'name');
    console.log('Note created: ' + note._id + ' section=' + note.section);
    if (noteData.section === 'regular' || noteData.section === 'checklist') {
      broadcastNotesUpdate(req.session.userId, noteData.section, noteData.notebookId);
      broadcastNotebookUpdate(req.session.userId, noteData.section);
    } else if (noteData.section === 'locked') {
      broadcastNotesUpdate(req.session.userId, 'locked');
    }
    if (noteData.isFavorite) broadcastNotesUpdate(req.session.userId, 'favorites');
    res.json(note);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/notes/:id', requireAuth, async (req, res) => {
  try {
    const updateData = { ...req.body, updatedAt: new Date() };
    if (updateData.notebookId && !mongoose.Types.ObjectId.isValid(updateData.notebookId)) delete updateData.notebookId;
    const note = await Note.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate('notebookId', 'name');
    if (!note) return res.status(404).json({ error: 'Not found' });
    if (note.section === 'regular' || note.section === 'checklist') {
      broadcastNotesUpdate(req.session.userId, note.section, note.notebookId?._id);
      broadcastNotebookUpdate(req.session.userId, note.section);
    } else if (note.section === 'locked') {
      broadcastNotesUpdate(req.session.userId, 'locked');
    }
    if (note.isFavorite) broadcastNotesUpdate(req.session.userId, 'favorites');
    res.json(note);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/notes/:id', requireAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found' });
    await Note.findByIdAndDelete(req.params.id);
    if (note.section === 'regular' || note.section === 'checklist') {
      broadcastNotesUpdate(req.session.userId, note.section, note.notebookId);
      broadcastNotebookUpdate(req.session.userId, note.section);
    } else if (note.section === 'locked') {
      broadcastNotesUpdate(req.session.userId, 'locked');
    }
    if (note.isFavorite) broadcastNotesUpdate(req.session.userId, 'favorites');
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/notes/:id/favorite', requireAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found' });
    note.isFavorite = !note.isFavorite;
    note.updatedAt = new Date();
    await note.save();
    await note.populate('notebookId', 'name');
    broadcastNotesUpdate(req.session.userId, 'favorites');
    res.json(note);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── IMAGES ─────────────────────────────────────────────

app.get('/api/images', requireAuth, async (req, res) => {
  try {
    const query = { userId: req.session.userId };
    if (req.query.section) query.section = req.query.section;
    const images = await Image.find(query).lean().sort({ isPinned: -1, createdAt: -1 });
    res.json(images);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/images', requireAuth, async (req, res) => {
  try {
    const { cloudUrl, fileName, isPinned, isLocked, section } = req.body;
    if (!cloudUrl) return res.status(400).json({ error: 'cloudUrl required' });
    const image = new Image({
      userId: req.session.userId,
      cloudUrl,
      fileName: fileName || 'image',
      isPinned: isPinned || false,
      isLocked: isLocked || false,
      section: section || (isLocked ? 'locked' : 'regular')
    });
    await image.save();
    broadcastImagesUpdate(req.session.userId);
    res.json(image);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/images/:id', requireAuth, async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).json({ error: 'Not found' });
    if (image.userId.toString() !== req.session.userId.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await Image.findByIdAndDelete(req.params.id);
    broadcastImagesUpdate(req.session.userId);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/images/:id/pin', requireAuth, async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).json({ error: 'Not found' });
    image.isPinned = !image.isPinned;
    image.updatedAt = new Date();
    await image.save();
    broadcastImagesUpdate(req.session.userId);
    res.json(image);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/images/:id/lock', requireAuth, async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).json({ error: 'Not found' });
    image.isLocked = !image.isLocked;
    image.section = image.isLocked ? 'locked' : 'regular';
    image.updatedAt = new Date();
    await image.save();
    broadcastImagesUpdate(req.session.userId);
    res.json(image);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── LOCK PASSWORD ──────────────────────────────────────

app.post('/api/set-lock-password', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    await UserSettings.findOneAndUpdate(
      { userId: req.session.userId },
      { lockPassword: hashed },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/verify-lock-password', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    const settings = await UserSettings.findOne({ userId: req.session.userId });
    if (!settings || !settings.lockPassword) return res.json({ success: false, needsSetup: true });
    const ok = await bcrypt.compare(password, settings.lockPassword);
    res.json({ success: ok });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/check-lock-setup', requireAuth, async (req, res) => {
  try {
    const settings = await UserSettings.findOne({ userId: req.session.userId });
    res.json({ hasPassword: !!(settings && settings.lockPassword) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});


// ─── CLOUDINARY CONFIG ────────────────────────────────────
app.get('/api/config', requireAuth, (req, res) => {
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'szokpp2i',
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || 'enotes_unsigned'
  });
});
});

// ─── SERVE ──────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path_mod.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});

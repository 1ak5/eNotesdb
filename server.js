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
const nodemailer = require('nodemailer');

// ─── EMAIL TRANSPORTER ──────────────────────────────────
const mailTransporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Use direct SSL/TLS for cloud stability
  auth: {
    user: process.env.SMTP_EMAIL || 'adityasuryawanshi470@gmail.com',
    pass: process.env.SMTP_PASS || 'vjhiynnrulydwnqk'
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

const sendResetEmail = async (toEmail, username, otp) => {
  const mailOptions = {
    from: `"eNotes App" <${process.env.SMTP_EMAIL || 'adityasuryawanshi470@gmail.com'}>`,
    to: toEmail,
    subject: 'eNotes - Password Reset OTP',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #EFECE4;">
        <h2 style="color: #1A1A1A; margin-top: 0;">eNotes Account Recovery</h2>
        <p style="color: #555555; font-size: 15px;">Hello <b>${username}</b>,</p>
        <p style="color: #555555; font-size: 15px;">You requested to reset your password. Use the OTP code below to reset your password. This OTP is valid for <b>10 minutes</b>.</p>
        <div style="background: #F8F7F4; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; border: 1px dashed #D0CCC0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1A1A1A;">${otp}</span>
        </div>
        <p style="color: #888888; font-size: 13px; margin-bottom: 0;">If you did not request this, you can safely ignore this email. Never share this code with anyone.</p>
      </div>
    `
  };
  return await mailTransporter.sendMail(mailOptions);
};

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
  email: { type: String, default: null, trim: true, lowercase: true },
  resetOtp: {
    code: { type: String, default: null },
    expiresAt: { type: Date, default: null }
  },
  createdAt: { type: Date, default: Date.now }
});

const notebookSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  section: { type: String, enum: ['regular', 'checklist'], required: true },
  isLocked: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
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
  folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImageFolder', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const imageFolderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  section: { type: String, enum: ['regular', 'locked'], default: 'regular' },
  createdAt: { type: Date, default: Date.now }
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
const ImageFolder = mongoose.model('ImageFolder', imageFolderSchema);
const UserSettings = mongoose.model('UserSettings', userSettingsSchema);

// ─── MIDDLEWARE ─────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store: MongoStore.create({ 
    mongoUrl: MONGODB_URI,
    ttl: 365 * 24 * 60 * 60 // 1 year session in MongoDB
  }),
  cookie: { 
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year cookie
    secure: false, 
    httpOnly: true 
  }
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
    const { username, pin, email } = req.body;
    if (!username || !pin) return res.status(400).json({ error: 'Username and password are required' });
    const existing = await User.findOne({ username: username.trim() });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    
    let cleanEmail = null;
    if (email && email.trim()) {
      cleanEmail = email.trim().toLowerCase();
    }

    const user = new User({ username: username.trim(), pin, email: cleanEmail });
    await user.save();
    req.session.userId = user._id;
    res.json({ success: true, userId: user._id, email: user.email });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, pin } = req.body;
    const user = await User.findOne({ username: username ? username.trim() : '' });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    // Support both old hashed passwords and new plain text passwords
    let ok = false;
    if (user.pin.startsWith('$2')) {
      // Old password stored as bcrypt hash — compare with bcrypt
      ok = await bcrypt.compare(pin, user.pin);
    } else {
      // New password stored as plain text — direct comparison
      ok = (pin === user.pin);
    }
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
    req.session.userId = user._id;
    res.json({ success: true, userId: user._id, email: user.email || null });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/check-session', async (req, res) => {
  if (req.session.userId) {
    try {
      const user = await User.findById(req.session.userId).select('username email');
      res.json({ 
        authenticated: true, 
        userId: req.session.userId, 
        username: user ? user.username : 'User',
        email: user ? (user.email || null) : null
      });
    } catch (e) {
      res.json({ authenticated: true, userId: req.session.userId, username: 'User', email: null });
    }
  } else {
    res.json({ authenticated: false });
  }
});

// Connect or update Gmail for logged in user
app.post('/api/connect-email', requireAuth, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findById(req.session.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (!email || !email.trim()) {
      user.email = null;
      await user.save();
      return res.json({ success: true, email: null, message: 'Gmail disconnected successfully' });
    }

    const cleanEmail = email.trim().toLowerCase();
    // Validate basic email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    user.email = cleanEmail;
    await user.save();
    res.json({ success: true, email: user.email, message: 'Gmail connected successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Forgot Password - Step 1: Send OTP to connected Gmail
app.post('/api/forgot-password/send-otp', async (req, res) => {
  try {
    const { username, accountIdentifier } = req.body;
    const identifier = (username || accountIdentifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ error: 'Username or Gmail is required' });
    }

    // Find user by either username OR email (case-insensitive)
    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: identifier.toLowerCase() }
      ]
    });
    if (!user) {
      return res.status(404).json({ error: 'No account found with this username or Gmail' });
    }

    if (!user.email) {
      return res.status(400).json({ 
        error: 'No Gmail connected to this account. Password cannot be reset automatically.' 
      });
    }

    // Generate 6-digit random OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.resetOtp = { code: otp, expiresAt };
    await user.save();

    // Send email
    await sendResetEmail(user.email, user.username, otp);

    // Mask email for security (e.g. ad***470@gmail.com)
    const parts = user.email.split('@');
    const namePart = parts[0];
    const maskedName = namePart.length > 3 
      ? namePart.substring(0, 2) + '***' + namePart.slice(-2) 
      : namePart.substring(0, 1) + '***';
    const maskedEmail = `${maskedName}@${parts[1]}`;

    res.json({ 
      success: true, 
      message: `OTP sent successfully to ${maskedEmail}`,
      username: user.username,
      maskedEmail 
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ error: 'Failed to send OTP email: ' + error.message });
  }
});

// Forgot Password - Step 2: Verify OTP and Reset Password
app.post('/api/forgot-password/verify-reset', async (req, res) => {
  try {
    const { username, accountIdentifier, otp, newPin } = req.body;
    const identifier = (username || accountIdentifier || '').trim();
    if (!identifier || !otp || !newPin) {
      return res.status(400).json({ error: 'Username/Gmail, OTP, and new password are required' });
    }

    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: identifier.toLowerCase() }
      ]
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.resetOtp || !user.resetOtp.code || !user.resetOtp.expiresAt) {
      return res.status(400).json({ error: 'No reset request found. Please request a new OTP.' });
    }

    if (new Date() > new Date(user.resetOtp.expiresAt)) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
    }

    if (user.resetOtp.code !== otp.trim()) {
      return res.status(400).json({ error: 'Invalid OTP code. Please check and try again.' });
    }

    // OTP is valid! Reset password to new plain text pin
    user.pin = newPin.trim();
    user.resetOtp = { code: null, expiresAt: null }; // Clear OTP
    await user.save();

    res.json({ success: true, message: 'Password reset successful! You can now log in.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── NOTEBOOKS ──────────────────────────────────────────

app.get('/api/notebooks/:section', requireAuth, async (req, res) => {
  try {
    const { section } = req.params;
    const notebooks = await Notebook.find({ userId: req.session.userId, section }).lean().sort({ sortOrder: 1, createdAt: -1 });
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

app.patch('/api/notebooks/:id', requireAuth, async (req, res) => {
  try {
    const { name, isLocked, sortOrder } = req.body;
    const nb = await Notebook.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!nb) return res.status(404).json({ error: 'Not found' });
    if (name !== undefined) nb.name = name;
    if (isLocked !== undefined) nb.isLocked = isLocked;
    if (sortOrder !== undefined) nb.sortOrder = sortOrder;
    await nb.save();
    broadcastNotebookUpdate(req.session.userId, nb.section);
    res.json(nb);
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
    const { cloudUrl, fileName, isPinned, isLocked, section, folderId } = req.body;
    if (!cloudUrl) return res.status(400).json({ error: 'cloudUrl required' });
    const imageData = {
      userId: req.session.userId,
      cloudUrl,
      fileName: fileName || 'image',
      isPinned: isPinned || false,
      isLocked: isLocked || false,
      section: section || (isLocked ? 'locked' : 'regular'),
    };
    if (folderId && mongoose.Types.ObjectId.isValid(folderId)) {
      imageData.folderId = folderId;
    }
    const image = new Image(imageData);
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

app.post('/api/images/batch-delete', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }
    await Image.deleteMany({ _id: { $in: ids }, userId: req.session.userId });
    broadcastImagesUpdate(req.session.userId);
    res.json({ success: true, deleted: ids.length });
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

// Move image to/from folder
app.post('/api/images/:id/move-folder', requireAuth, async (req, res) => {
  try {
    const { folderId } = req.body;
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).json({ error: 'Not found' });
    if (image.userId.toString() !== req.session.userId.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    image.folderId = folderId && mongoose.Types.ObjectId.isValid(folderId) ? folderId : null;
    image.updatedAt = new Date();
    await image.save();
    broadcastImagesUpdate(req.session.userId);
    res.json(image);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── IMAGE FOLDERS ──────────────────────────────────────

app.get('/api/image-folders', requireAuth, async (req, res) => {
  try {
    const query = { userId: req.session.userId };
    if (req.query.section) query.section = req.query.section;
    const folders = await ImageFolder.find(query).lean().sort({ createdAt: -1 });
    res.json(folders);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/image-folders', requireAuth, async (req, res) => {
  try {
    const { name, section } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const folder = new ImageFolder({
      userId: req.session.userId,
      name,
      section: section || 'regular',
    });
    await folder.save();
    broadcastImagesUpdate(req.session.userId);
    res.json(folder);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.patch('/api/image-folders/:id', requireAuth, async (req, res) => {
  try {
    const folder = await ImageFolder.findById(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Not found' });
    if (folder.userId.toString() !== req.session.userId.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    folder.name = name.trim();
    await folder.save();
    broadcastImagesUpdate(req.session.userId);
    res.json(folder);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/image-folders/:id', requireAuth, async (req, res) => {
  try {
    const folder = await ImageFolder.findById(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Not found' });
    if (folder.userId.toString() !== req.session.userId.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    // Unlink all images in this folder
    await Image.updateMany({ folderId: req.params.id }, { folderId: null });
    await ImageFolder.findByIdAndDelete(req.params.id);
    broadcastImagesUpdate(req.session.userId);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── LOCK PASSWORD ──────────────────────────────────────

app.post('/api/set-lock-password', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    // Store lock password as plain text (no hashing)
    await UserSettings.findOneAndUpdate(
      { userId: req.session.userId },
      { lockPassword: password },
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
    // Support both old hashed and new plain text lock passwords
    let ok = false;
    if (settings.lockPassword.startsWith('$2')) {
      ok = await bcrypt.compare(password, settings.lockPassword);
    } else {
      ok = (password === settings.lockPassword);
    }
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

// ─── SERVE ──────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path_mod.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});

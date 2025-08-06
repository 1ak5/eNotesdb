class NotesApp {
    constructor() {
        this.currentSection = 'regular';
        this.currentNotebook = null;
        this.currentView = 'notebooks';
        this.isLockedUnlocked = false;
        this.editingNote = null;
        this.lockPasswordSet = false;
        
        // Proper cache system - once loaded, always instant
        this.cache = {
            notebooks: {
                regular: null,
                checklist: null
            },
            notes: {},
            favorites: null,
            locked: null,
            isLoaded: {
                regular: false,
                checklist: false,
                favorites: false,
                locked: false
            }
        };
        
        // Loading states
        this.isLoading = {
            notebooks: false,
            notes: false,
            favorites: false,
            locked: false
        };
        
        this.init();
    }

    async init() {
        this.bindEvents();
        this.showApp();
        await this.checkSessionAndLoadInitial();
    }

    showLoading(containerId, message = 'Loading...') {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; color: #89999A;">
                    <div style="width: 40px; height: 40px; border: 3px solid #DDC8B7; border-top: 3px solid #89999A; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
                    <div>${message}</div>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `;
        }
    }

    async checkSessionAndLoadInitial() {
        try {
            const response = await fetch('/api/check-session');
            const data = await response.json();
            
            if (data.authenticated) {
                // Load initial section (regular) immediately
                this.loadInitialSection();
            } else {
                this.showAuth();
            }
        } catch (error) {
            console.error('Session check failed:', error);
            this.showAuth();
        }
    }

    // Load initial section immediately on app start
    async loadInitialSection() {
        this.showLoading('notebooks-list', 'Loading notebooks...');
        await this.loadNotebooks();
        // Start background preloading of other sections
        this.preloadOtherSections();
    }

    // Background preload other sections
    async preloadOtherSections() {
        // Preload in background without showing loading
        setTimeout(async () => {
            try {
                // Load checklist notebooks
                if (!this.cache.isLoaded.checklist) {
                    const checklistResponse = await fetch('/api/notebooks/checklist');
                    const checklistNotebooks = await checklistResponse.json();
                    this.cache.notebooks.checklist = checklistNotebooks;
                    this.cache.isLoaded.checklist = true;
                }

                // Load favorites
                if (!this.cache.isLoaded.favorites) {
                    const favoritesResponse = await fetch('/api/notes/favorites');
                    const favorites = await favoritesResponse.json();
                    this.cache.favorites = favorites;
                    this.cache.isLoaded.favorites = true;
                }

                // Load locked notes
                if (!this.cache.isLoaded.locked) {
                    const lockedResponse = await fetch('/api/notes/locked');
                    const locked = await lockedResponse.json();
                    this.cache.locked = locked;
                    this.cache.isLoaded.locked = true;
                }

                console.log('Background preloading completed');
            } catch (error) {
                console.error('Background preload failed:', error);
            }
        }, 1000); // Start preloading after 1 second
    }

    bindEvents() {
        // Auth events
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchAuthTab(e.target.dataset.tab));
        });
        
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('register-form').addEventListener('submit', (e) => this.handleRegister(e));
        
        // App events
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
        document.getElementById('back-btn').addEventListener('click', () => this.goBack());
        
        // INSTANT navigation with proper caching
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchSectionWithCache(e.currentTarget.dataset.section);
            });
        });
        
        // Add buttons
        document.getElementById('add-notebook-btn').addEventListener('click', () => this.addNotebook());
        document.getElementById('add-note-btn').addEventListener('click', () => this.addNote());
        document.getElementById('add-checklist-btn').addEventListener('click', () => this.addChecklistItem());
        
        // Unlock button
        document.getElementById('unlock-btn').addEventListener('click', () => this.unlockSection());
        
        // Modal events
        document.getElementById('save-edit-btn').addEventListener('click', () => this.saveEditInstantly());
        document.getElementById('cancel-edit-btn').addEventListener('click', () => this.cancelEdit());
        
        // Enter key handlers
        document.getElementById('notebook-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addNotebook();
        });
        
        document.getElementById('note-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.addNote();
            }
        });
        
        document.getElementById('checklist-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addChecklistItem();
        });
        
        document.getElementById('unlock-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.unlockSection();
        });
    }

    showAuth() {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }

    showApp() {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
    }

    switchAuthTab(tab) {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        
        if (tab === 'login') {
            document.getElementById('login-form').classList.remove('hidden');
            document.getElementById('register-form').classList.add('hidden');
        } else {
            document.getElementById('login-form').classList.add('hidden');
            document.getElementById('register-form').classList.remove('hidden');
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const pin = document.getElementById('login-pin').value;
        
        if (!username || !pin) return;
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showApp();
                this.loadInitialSection();
            } else {
                alert(data.error || 'Login failed');
            }
        } catch (error) {
            alert('Login failed: ' + error.message);
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const pin = document.getElementById('register-pin').value;
        
        if (!username || !pin) return;
        
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showApp();
                this.loadInitialSection();
            } else {
                alert(data.error || 'Registration failed');
            }
        } catch (error) {
            alert('Registration failed: ' + error.message);
        }
    }

    async handleLogout() {
        try {
            await fetch('/api/logout', { method: 'POST' });
            this.showAuth();
            this.resetApp();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }

    resetApp() {
        this.currentSection = 'regular';
        this.currentNotebook = null;
        this.currentView = 'notebooks';
        this.isLockedUnlocked = false;
        this.editingNote = null;
        this.lockPasswordSet = false;
        
        // Reset cache
        this.cache = {
            notebooks: { regular: null, checklist: null },
            notes: {},
            favorites: null,
            locked: null,
            isLoaded: { regular: false, checklist: false, favorites: false, locked: false }
        };
        this.isLoading = { notebooks: false, notes: false, favorites: false, locked: false };
        
        // Clear forms
        document.getElementById('login-username').value = '';
        document.getElementById('login-pin').value = '';
        document.getElementById('register-username').value = '';
        document.getElementById('register-pin').value = '';
    }

    // Smart section switching with proper caching
    switchSectionWithCache(section) {
        this.currentSection = section;
        this.currentView = (section === 'regular' || section === 'checklist') ? 'notebooks' : 'notes';
        this.isLockedUnlocked = false;
        
        // Update navigation INSTANTLY
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-section="${section}"]`).classList.add('active');
        
        // Update header INSTANTLY
        document.getElementById('header-title').textContent = 
            section.charAt(0).toUpperCase() + section.slice(1);
        
        // Hide back button INSTANTLY
        document.getElementById('back-btn').classList.add('hidden');
        
        // Show appropriate view INSTANTLY
        this.showViewInstantly();
        
        // Load data based on cache status
        if (section === 'regular' || section === 'checklist') {
            if (this.cache.isLoaded[section] && this.cache.notebooks[section]) {
                // INSTANT - render from cache
                this.renderNotebooks(this.cache.notebooks[section]);
            } else {
                // First time - show loading and fetch
                this.showLoading('notebooks-list', 'Loading notebooks...');
                this.loadNotebooks();
            }
        } else if (section === 'favorites') {
            if (this.cache.isLoaded.favorites && this.cache.favorites) {
                // INSTANT - render from cache
                this.renderFavorites(this.cache.favorites);
            } else {
                // First time - show loading and fetch
                this.showLoading('favorites-list', 'Loading favorites...');
                this.loadFavorites();
            }
        } else if (section === 'locked') {
            this.showLockedSectionWithCache();
        }
    }

    showViewInstantly() {
        // Hide all views INSTANTLY
        document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
        
        // Show appropriate view INSTANTLY
        if (this.currentSection === 'regular' || this.currentSection === 'checklist') {
            if (this.currentView === 'notebooks') {
                document.getElementById('notebooks-view').classList.remove('hidden');
            } else if (this.currentSection === 'checklist') {
                document.getElementById('checklist-view').classList.remove('hidden');
            } else {
                document.getElementById('notes-view').classList.remove('hidden');
            }
        } else if (this.currentSection === 'locked') {
            document.getElementById('locked-view').classList.remove('hidden');
        } else if (this.currentSection === 'favorites') {
            document.getElementById('favorites-view').classList.remove('hidden');
        }
    }

    async loadNotebooks() {
        if (this.currentSection !== 'regular' && this.currentSection !== 'checklist') return;
        if (this.isLoading.notebooks) return;
        
        this.isLoading.notebooks = true;
        
        try {
            const response = await fetch(`/api/notebooks/${this.currentSection}`);
            const notebooks = await response.json();
            
            // Update cache
            this.cache.notebooks[this.currentSection] = notebooks;
            this.cache.isLoaded[this.currentSection] = true;
            
            this.renderNotebooks(notebooks);
        } catch (error) {
            console.error('Failed to load notebooks:', error);
            document.getElementById('notebooks-list').innerHTML = '<div style="text-align: center; color: #89999A; padding: 2rem;">Failed to load notebooks</div>';
        } finally {
            this.isLoading.notebooks = false;
        }
    }

    renderNotebooks(notebooks) {
        const container = document.getElementById('notebooks-list');
        container.innerHTML = '';
        
        if (notebooks.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #89999A; padding: 2rem;">No notebooks yet. Create your first notebook!</div>';
            return;
        }
        
        notebooks.forEach(notebook => {
            const item = document.createElement('div');
            item.className = 'notebook-item';
            item.innerHTML = `
                <div class="notebook-info">
                    <h3>${notebook.name}</h3>
                    <p>${notebook.noteCount} notes</p>
                </div>
                <div class="notebook-actions">
                    <button class="delete-btn" onclick="app.deleteNotebook('${notebook._id}')">
                        <i class="material-icons">delete</i>
                    </button>
                </div>
            `;
            
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-btn')) {
                    this.openNotebook(notebook);
                }
            });
            
            container.appendChild(item);
        });
    }

    async addNotebook() {
        const input = document.getElementById('notebook-input');
        const name = input.value.trim();
        
        if (!name) return;
        
        // Clear input INSTANTLY
        input.value = '';
        
        try {
            const response = await fetch('/api/notebooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, section: this.currentSection })
            });
            
            if (response.ok) {
                // Invalidate cache and reload
                this.cache.notebooks[this.currentSection] = null;
                this.cache.isLoaded[this.currentSection] = false;
                this.showLoading('notebooks-list', 'Updating...');
                this.loadNotebooks();
            }
        } catch (error) {
            console.error('Failed to add notebook:', error);
        }
    }

    async deleteNotebook(id) {
        if (!confirm('Delete this notebook and all its notes?')) return;
        
        try {
            const response = await fetch(`/api/notebooks/${id}`, { method: 'DELETE' });
            if (response.ok) {
                // Invalidate cache and reload
                this.cache.notebooks[this.currentSection] = null;
                this.cache.isLoaded[this.currentSection] = false;
                this.showLoading('notebooks-list', 'Updating...');
                this.loadNotebooks();
            }
        } catch (error) {
            console.error('Failed to delete notebook:', error);
        }
    }

    openNotebook(notebook) {
        this.currentNotebook = notebook;
        this.currentView = (this.currentSection === 'checklist') ? 'checklist' : 'notes';
        
        // Update header INSTANTLY
        document.getElementById('header-title').textContent = notebook.name;
        document.getElementById('back-btn').classList.remove('hidden');
        
        // Show appropriate view INSTANTLY
        this.showViewInstantly();
        
        // Load notes with caching
        const cacheKey = `${this.currentSection}_${notebook._id}`;
        if (this.cache.notes[cacheKey]) {
            // INSTANT - render from cache
            if (this.currentSection === 'checklist') {
                this.renderChecklistItems(this.cache.notes[cacheKey]);
            } else {
                this.renderNotes(this.cache.notes[cacheKey]);
            }
        } else {
            // First time - show loading and fetch
            if (this.currentSection === 'checklist') {
                this.showLoading('checklist-list', 'Loading items...');
                this.loadChecklistItems();
            } else {
                this.showLoading('notes-list', 'Loading notes...');
                this.loadNotes();
            }
        }
    }

    goBack() {
        if (this.currentView === 'notes' || this.currentView === 'checklist') {
            this.currentView = 'notebooks';
            this.currentNotebook = null;
            
            // Update header INSTANTLY
            document.getElementById('header-title').textContent = 
                this.currentSection.charAt(0).toUpperCase() + this.currentSection.slice(1);
            document.getElementById('back-btn').classList.add('hidden');
            
            this.showViewInstantly();
            
            // Render from cache (should be available)
            if (this.cache.notebooks[this.currentSection]) {
                this.renderNotebooks(this.cache.notebooks[this.currentSection]);
            } else {
                this.loadNotebooks();
            }
        }
    }

    async loadNotes() {
        if (this.isLoading.notes) return;
        this.isLoading.notes = true;
        
        try {
            const url = this.currentNotebook 
                ? `/api/notes/${this.currentSection}/${this.currentNotebook._id}`
                : `/api/notes/${this.currentSection}`;
                
            const response = await fetch(url);
            const notes = await response.json();
            
            // Cache the notes
            const cacheKey = this.currentNotebook ? `${this.currentSection}_${this.currentNotebook._id}` : this.currentSection;
            this.cache.notes[cacheKey] = notes;
            
            this.renderNotes(notes);
        } catch (error) {
            console.error('Failed to load notes:', error);
            document.getElementById('notes-list').innerHTML = '<div style="text-align: center; color: #89999A; padding: 2rem;">Failed to load notes</div>';
        } finally {
            this.isLoading.notes = false;
        }
    }

    renderNotes(notes) {
        const container = document.getElementById('notes-list');
        container.innerHTML = '';
        
        if (notes.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #89999A; padding: 2rem;">No notes yet. Add your first note!</div>';
            return;
        }
        
        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-item';
            item.setAttribute('data-note-id', note._id);
            
            let sourceInfo = '';
            if (this.currentSection === 'favorites' && note.notebookId) {
                sourceInfo = `<div class="note-source"><i class="material-icons">star</i> From ${note.notebookId.name}</div>`;
            }
            
            const date = new Date(note.updatedAt);
            const dateStr = date.toLocaleDateString('en-GB');
            const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            const starIcon = note.isFavorite ? 'star' : 'star_border';

            item.innerHTML = `
                ${sourceInfo}
                <div class="note-content">${this.escapeHtml(note.content)}</div>
                <div class="note-meta">
                    <span>${dateStr} ${timeStr}</span>
                    <div class="note-actions">
                        <button class="favorite-btn ${note.isFavorite ? 'active' : ''}" onclick="app.toggleFavoriteInstant('${note._id}')">
                            <i class="material-icons">${starIcon}</i>
                        </button>
                        <button onclick="app.editNote('${note._id}', \`${note.content.replace(/`/g, '\\`')}\`)">
                            <i class="material-icons">edit</i>
                        </button>
                        <button class="delete-btn" onclick="app.deleteNote('${note._id}')">
                            <i class="material-icons">delete</i>
                        </button>
                    </div>
                </div>
            `;
            
            container.appendChild(item);
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async addNote() {
        const input = document.getElementById('note-input');
        const content = input.value.trim();
        
        if (!content) return;
        
        // Clear input INSTANTLY
        input.value = '';
        
        try {
            const noteData = {
                content,
                section: this.currentSection
            };
            
            if (this.currentNotebook) {
                noteData.notebookId = this.currentNotebook._id;
            }
            
            if (this.currentSection === 'locked') {
                noteData.isLocked = true;
            }
            
            const response = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(noteData)
            });
            
            if (response.ok) {
                // Invalidate relevant caches
                this.invalidateNoteCaches();
                // Reload current view
                this.reloadCurrentNotes();
            }
        } catch (error) {
            console.error('Failed to add note:', error);
        }
    }

    invalidateNoteCaches() {
        // Clear note caches
        this.cache.notes = {};
        this.cache.favorites = null;
        this.cache.locked = null;
        this.cache.isLoaded.favorites = false;
        this.cache.isLoaded.locked = false;
    }

    reloadCurrentNotes() {
        if (this.currentSection === 'favorites') {
            this.showLoading('favorites-list', 'Updating...');
            this.loadFavorites();
        } else if (this.currentSection === 'locked' && this.isLockedUnlocked) {
            this.showLoading('locked-notes', 'Updating...');
            this.loadLockedNotes();
        } else if (this.currentView === 'notes') {
            this.showLoading('notes-list', 'Updating...');
            this.loadNotes();
        } else if (this.currentView === 'checklist') {
            this.showLoading('checklist-list', 'Updating...');
            this.loadChecklistItems();
        }
    }

    async loadChecklistItems() {
        if (this.isLoading.checklist) return;
        this.isLoading.checklist = true;
        
        try {
            const response = await fetch(`/api/notes/${this.currentSection}/${this.currentNotebook._id}`);
            const items = await response.json();
            
            // Cache the items
            const cacheKey = `${this.currentSection}_${this.currentNotebook._id}`;
            this.cache.notes[cacheKey] = items;
            
            this.renderChecklistItems(items);
        } catch (error) {
            console.error('Failed to load checklist items:', error);
            document.getElementById('checklist-list').innerHTML = '<div style="text-align: center; color: #89999A; padding: 2rem;">Failed to load items</div>';
        } finally {
            this.isLoading.checklist = false;
        }
    }

    renderChecklistItems(items) {
        const container = document.getElementById('checklist-list');
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #89999A; padding: 2rem;">No items yet. Add your first item!</div>';
            return;
        }
        
        items.forEach(item => {
            const element = document.createElement('div');
            element.className = `checklist-item ${item.isChecked ? 'completed' : ''}`;
            element.setAttribute('data-item-id', item._id);
            element.innerHTML = `
                <input type="checkbox" ${item.isChecked ? 'checked' : ''} 
                       onchange="app.toggleChecklistItemInstant('${item._id}', this.checked)">
                <span class="checklist-text">${this.escapeHtml(item.content)}</span>
                <button class="delete-btn" onclick="app.deleteNote('${item._id}')">
                    <i class="material-icons">delete</i>
                </button>
            `;
            
            container.appendChild(element);
        });
    }

    // INSTANT checklist toggle with real-time UI update
    async toggleChecklistItemInstant(id, checked) {
        // Update UI INSTANTLY
        const item = document.querySelector(`[data-item-id="${id}"]`);
        if (item) {
            if (checked) {
                item.classList.add('completed');
            } else {
                item.classList.remove('completed');
            }
        }
        
        // Update server in background
        try {
            await fetch(`/api/notes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isChecked: checked })
            });
        } catch (error) {
            console.error('Failed to toggle checklist item:', error);
            // Revert UI change if failed
            if (item) {
                if (checked) {
                    item.classList.remove('completed');
                } else {
                    item.classList.add('completed');
                }
            }
        }
    }

    async addChecklistItem() {
        const input = document.getElementById('checklist-input');
        const content = input.value.trim();
        
        if (!content) return;
        
        // Clear input INSTANTLY
        input.value = '';
        
        try {
            const response = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    section: this.currentSection,
                    notebookId: this.currentNotebook._id,
                    isChecked: false
                })
            });
            
            if (response.ok) {
                // Invalidate cache and reload
                const cacheKey = `${this.currentSection}_${this.currentNotebook._id}`;
                delete this.cache.notes[cacheKey];
                this.showLoading('checklist-list', 'Updating...');
                this.loadChecklistItems();
            }
        } catch (error) {
            console.error('Failed to add checklist item:', error);
        }
    }

    showLockedSectionWithCache() {
        if (this.cache.isLoaded.locked && this.cache.locked && this.isLockedUnlocked) {
            // INSTANT - render from cache
            this.renderLockedNotes(this.cache.locked);
        } else {
            // Show lock screen or load for first time
            this.showLockedSection();
        }
    }

    async showLockedSection() {
        try {
            const response = await fetch('/api/check-lock-setup');
            const data = await response.json();
            
            if (!data.hasPassword) {
                this.showLockSetup();
            } else {
                this.lockPasswordSet = true;
                if (this.isLockedUnlocked) {
                    if (this.cache.isLoaded.locked && this.cache.locked) {
                        this.renderLockedNotes(this.cache.locked);
                    } else {
                        this.showLoading('locked-notes', 'Loading locked notes...');
                        this.loadLockedNotes();
                    }
                } else {
                    this.showLockPrompt();
                }
            }
        } catch (error) {
            console.error('Failed to check lock setup:', error);
        }
    }

    showLockSetup() {
        const container = document.querySelector('.locked-container');
        container.innerHTML = `
            <div class="lock-icon">
                <i class="material-icons">lock</i>
            </div>
            <h2>Set up password</h2>
            <p>Set a password to protect your locked notes</p>
            <input type="password" id="setup-password" placeholder="Enter new password">
            <button onclick="app.setupLockPassword()">Set Password</button>
        `;
        
        document.getElementById('setup-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.setupLockPassword();
        });
    }

    showLockPrompt() {
        const container = document.querySelector('.locked-container');
        container.innerHTML = `
            <div class="lock-icon">
                <i class="material-icons">lock</i>
            </div>
            <h2>This section is locked</h2>
            <p>Please enter your password to unlock</p>
            <input type="password" id="unlock-password" placeholder="Password">
            <button onclick="app.unlockSection()">Unlock</button>
        `;
        
        document.getElementById('unlock-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.unlockSection();
        });
        
        document.querySelector('.locked-container').classList.remove('hidden');
        document.getElementById('locked-notes').classList.add('hidden');
    }

    async setupLockPassword() {
        const password = document.getElementById('setup-password').value;
        
        if (!password) {
            alert('Please enter a password');
            return;
        }
        
        try {
            const response = await fetch('/api/set-lock-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            
            if (response.ok) {
                this.lockPasswordSet = true;
                this.isLockedUnlocked = true;
                document.querySelector('.locked-container').classList.add('hidden');
                document.getElementById('locked-notes').classList.remove('hidden');
                
                if (this.cache.isLoaded.locked && this.cache.locked) {
                    this.renderLockedNotes(this.cache.locked);
                } else {
                    this.showLoading('locked-notes', 'Loading locked notes...');
                    this.loadLockedNotes();
                }
            }
        } catch (error) {
            console.error('Failed to set lock password:', error);
        }
    }

    async unlockSection() {
        const password = document.getElementById('unlock-password').value;
        
        if (!password) return;
        
        try {
            const response = await fetch('/api/verify-lock-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.isLockedUnlocked = true;
                document.querySelector('.locked-container').classList.add('hidden');
                document.getElementById('locked-notes').classList.remove('hidden');
                
                if (this.cache.isLoaded.locked && this.cache.locked) {
                    this.renderLockedNotes(this.cache.locked);
                } else {
                    this.showLoading('locked-notes', 'Loading locked notes...');
                    this.loadLockedNotes();
                }
            } else {
                alert('Incorrect password');
                document.getElementById('unlock-password').value = '';
            }
        } catch (error) {
            console.error('Failed to unlock section:', error);
        }
    }

    async loadLockedNotes() {
        if (this.isLoading.locked) return;
        this.isLoading.locked = true;
        
        try {
            const response = await fetch('/api/notes/locked');
            const notes = await response.json();
            
            // Update cache
            this.cache.locked = notes;
            this.cache.isLoaded.locked = true;
            
            this.renderLockedNotes(notes);
        } catch (error) {
            console.error('Failed to load locked notes:', error);
            document.getElementById('locked-notes').innerHTML = '<div style="text-align: center; color: #89999A; padding: 2rem;">Failed to load locked notes</div>';
        } finally {
            this.isLoading.locked = false;
        }
    }

    renderLockedNotes(notes) {
        const container = document.getElementById('locked-notes');
        container.innerHTML = `
            <div class="add-section">
                <input type="text" id="locked-note-input" placeholder="Add a note...">
                <button onclick="app.addLockedNote()">Add</button>
            </div>
        `;
        
        if (notes.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.style.cssText = 'text-align: center; color: #89999A; padding: 2rem;';
            emptyDiv.textContent = 'No locked notes yet. Add your first locked note!';
            container.appendChild(emptyDiv);
        } else {
            notes.forEach(note => {
                const item = document.createElement('div');
                item.className = 'note-item';
                item.setAttribute('data-note-id', note._id);
                
                const date = new Date(note.updatedAt);
                const dateStr = date.toLocaleDateString('en-GB');
                const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                const starIcon = note.isFavorite ? 'star' : 'star_border';

                item.innerHTML = `
                    <div class="note-content">${this.escapeHtml(note.content)}</div>
                    <div class="note-meta">
                        <span>${dateStr} ${timeStr}</span>
                        <div class="note-actions">
                            <button class="favorite-btn ${note.isFavorite ? 'active' : ''}" onclick="app.toggleFavoriteInstant('${note._id}')">
                                <i class="material-icons">${starIcon}</i>
                            </button>
                            <button onclick="app.editNote('${note._id}', \`${note.content.replace(/`/g, '\\`')}\`)">
                                <i class="material-icons">edit</i>
                            </button>
                            <button class="delete-btn" onclick="app.deleteNote('${note._id}')">
                                <i class="material-icons">delete</i>
                            </button>
                        </div>
                    </div>
                `;
                
                container.appendChild(item);
            });
        }
        
        // Add enter key handler for locked notes
        const input = document.getElementById('locked-note-input');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.addLockedNote();
                }
            });
        }
    }

    async addLockedNote() {
        const input = document.getElementById('locked-note-input');
        const content = input.value.trim();
        
        if (!content) return;
        
        // Clear input INSTANTLY
        input.value = '';
        
        try {
            const response = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    section: 'locked',
                    isLocked: true
                })
            });
            
            if (response.ok) {
                // Invalidate cache and reload
                this.cache.locked = null;
                this.cache.isLoaded.locked = false;
                this.showLoading('locked-notes', 'Updating...');
                this.loadLockedNotes();
            }
        } catch (error) {
            console.error('Failed to add locked note:', error);
        }
    }

    async loadFavorites() {
        if (this.isLoading.favorites) return;
        this.isLoading.favorites = true;
        
        try {
            const response = await fetch('/api/notes/favorites');
            const notes = await response.json();
            
            // Update cache
            this.cache.favorites = notes;
            this.cache.isLoaded.favorites = true;
            
            this.renderFavorites(notes);
        } catch (error) {
            console.error('Failed to load favorites:', error);
            document.getElementById('favorites-list').innerHTML = '<div style="text-align: center; color: #89999A; padding: 2rem;">Failed to load favorites</div>';
        } finally {
            this.isLoading.favorites = false;
        }
    }

    renderFavorites(notes) {
        // Update count
        document.getElementById('favorites-count').textContent = `${notes.length} starred notes`;
        
        const container = document.getElementById('favorites-list');
        container.innerHTML = '';
        
        if (notes.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #89999A; padding: 2rem;">No favorite notes yet. Star some notes to see them here!</div>';
            return;
        }
        
        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-item';
            item.setAttribute('data-note-id', note._id);
            
            let sourceInfo = '';
            if (note.notebookId) {
                sourceInfo = `<div class="note-source"><i class="material-icons">star</i> From ${note.notebookId.name}</div>`;
            }
            
            const date = new Date(note.updatedAt);
            const dateStr = date.toLocaleDateString('en-GB');
            const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            const starIcon = 'star'; // Always filled in favorites

            item.innerHTML = `
                ${sourceInfo}
                <div class="note-content">${this.escapeHtml(note.content)}</div>
                <div class="note-meta">
                    <span>${dateStr} ${timeStr}</span>
                    <div class="note-actions">
                        <button class="favorite-btn active" onclick="app.toggleFavoriteInstant('${note._id}')">
                            <i class="material-icons">${starIcon}</i>
                        </button>
                        <button onclick="app.editNote('${note._id}', \`${note.content.replace(/`/g, '\\`')}\`)">
                            <i class="material-icons">edit</i>
                        </button>
                        <button class="delete-btn" onclick="app.deleteNote('${note._id}')">
                            <i class="material-icons">delete</i>
                        </button>
                    </div>
                </div>
            `;
            
            container.appendChild(item);
        });
    }

    // INSTANT favorite toggle with real-time UI update
    async toggleFavoriteInstant(id) {
        // Find the button and update UI INSTANTLY
        const noteItem = document.querySelector(`[data-note-id="${id}"]`);
        const button = noteItem?.querySelector('.favorite-btn');
        
        if (button) {
            const isActive = button.classList.contains('active');
            const icon = button.querySelector('.material-icons');
            
            // Update UI INSTANTLY
            icon.textContent = isActive ? 'star_border' : 'star';
            button.classList.toggle('active');
        }
        
        // Update server in background
        try {
            const response = await fetch(`/api/notes/${id}/favorite`, { method: 'POST' });
            if (!response.ok) {
                // Revert UI change if request failed
                if (button) {
                    const isActive = button.classList.contains('active');
                    const icon = button.querySelector('.material-icons');
                    icon.textContent = isActive ? 'star_border' : 'star';
                    button.classList.toggle('active');
                }
            } else {
                // Invalidate relevant caches
                this.invalidateNoteCaches();
            }
        } catch (error) {
            console.error('Failed to toggle favorite:', error);
            // Revert UI change if request failed
            if (button) {
                const isActive = button.classList.contains('active');
                const icon = button.querySelector('.material-icons');
                icon.textContent = isActive ? 'star_border' : 'star';
                button.classList.toggle('active');
            }
        }
    }

    editNote(id, content) {
        this.editingNote = id;
        document.getElementById('edit-textarea').value = content;
        document.getElementById('edit-modal').classList.remove('hidden');
    }

    // INSTANT edit save
    async saveEditInstantly() {
        if (!this.editingNote) return;
        
        const content = document.getElementById('edit-textarea').value.trim();
        if (!content) return;
        
        // Update UI INSTANTLY
        const noteItem = document.querySelector(`[data-note-id="${this.editingNote}"]`);
        const noteContent = noteItem?.querySelector('.note-content');
        if (noteContent) {
            noteContent.innerHTML = this.escapeHtml(content);
        }
        
        // Close modal INSTANTLY
        this.cancelEdit();
        
        // Update server in background
        try {
            await fetch(`/api/notes/${this.editingNote}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            
            // Invalidate relevant caches
            this.invalidateNoteCaches();
        } catch (error) {
            console.error('Failed to save edit:', error);
        }
    }

    cancelEdit() {
        this.editingNote = null;
        document.getElementById('edit-modal').classList.add('hidden');
        document.getElementById('edit-textarea').value = '';
    }

    async deleteNote(id) {
        if (!confirm('Delete this note?')) return;
        
        // Remove from UI INSTANTLY
        const noteItem = document.querySelector(`[data-note-id="${id}"]`);
        if (noteItem) {
            noteItem.remove();
        }
        
        try {
            await fetch(`/api/notes/${id}`, { method: 'DELETE' });
            // Invalidate relevant caches
            this.invalidateNoteCaches();
        } catch (error) {
            console.error('Failed to delete note:', error);
        }
    }
}

// Initialize app
const app = new NotesApp();

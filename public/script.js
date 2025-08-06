class NotesApp {
    constructor() {
        this.currentSection = 'regular';
        this.currentNotebook = null;
        this.currentView = 'notebooks';
        this.isLockedUnlocked = false;
        this.editingNote = null;
        this.lockPasswordSet = false;
        
        // Ultra-fast cache with instant access
        this.cache = {
            notebooks: {},
            notes: {},
            favorites: null,
            locked: null
        };
        
        // Prevent multiple loads
        this.isLoading = {
            notebooks: false,
            notes: false,
            favorites: false,
            locked: false
        };
        
        // Real-time data store
        this.liveData = {
            notebooks: {},
            notes: {},
            favorites: [],
            locked: []
        };
        
        this.init();
    }

    async init() {
        this.bindEvents();
        this.showApp();
        await this.checkSessionUltraFast();
    }

    // NO loading screens - instant everything
    showLoading() {
        // Removed - no loading screens
    }

    showSkeletonLoading() {
        // Removed - no skeleton loading
    }

    async checkSessionUltraFast() {
        try {
            const response = await fetch('/api/check-session');
            const data = await response.json();
            
            if (data.authenticated) {
                // Preload EVERYTHING instantly
                this.preloadEverythingInstantly();
                this.renderNotebooksInstantly();
            } else {
                this.showAuth();
            }
        } catch (error) {
            console.error('Session check failed:', error);
            this.showAuth();
        }
    }

    // Preload ALL data instantly in parallel
    async preloadEverythingInstantly() {
        try {
            // Fire all requests simultaneously
            const promises = [
                fetch('/api/notebooks/regular').then(r => r.json()).catch(() => []),
                fetch('/api/notebooks/checklist').then(r => r.json()).catch(() => []),
                fetch('/api/notes/favorites').then(r => r.json()).catch(() => []),
                fetch('/api/notes/locked').then(r => r.json()).catch(() => [])
            ];

            const [regular, checklist, favorites, locked] = await Promise.all(promises);

            // Store in both cache and live data
            this.cache.notebooks.regular = regular;
            this.cache.notebooks.checklist = checklist;
            this.cache.favorites = favorites;
            this.cache.locked = locked;
            
            this.liveData.notebooks.regular = regular;
            this.liveData.notebooks.checklist = checklist;
            this.liveData.favorites = favorites;
            this.liveData.locked = locked;

        } catch (error) {
            console.error('Preload failed:', error);
        }
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
        
        // INSTANT navigation - zero delay
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchSectionInstantly(e.currentTarget.dataset.section);
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
                this.preloadEverythingInstantly();
                this.renderNotebooksInstantly();
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
                this.preloadEverythingInstantly();
                this.renderNotebooksInstantly();
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
        this.cache = { notebooks: {}, notes: {}, favorites: null, locked: null };
        this.liveData = { notebooks: {}, notes: {}, favorites: [], locked: [] };
        this.isLoading = { notebooks: false, notes: false, favorites: false, locked: false };
        
        // Clear forms
        document.getElementById('login-username').value = '';
        document.getElementById('login-pin').value = '';
        document.getElementById('register-username').value = '';
        document.getElementById('register-pin').value = '';
    }

    // INSTANT section switching - ZERO delay
    switchSectionInstantly(section) {
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
        
        // Render data INSTANTLY from cache/live data
        if (section === 'regular' || section === 'checklist') {
            this.renderNotebooksInstantly();
        } else if (section === 'favorites') {
            this.renderFavoritesInstantly();
        } else if (section === 'locked') {
            this.showLockedSectionInstantly();
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

    renderNotebooksInstantly() {
        const data = this.liveData.notebooks[this.currentSection] || this.cache.notebooks[this.currentSection] || [];
        this.renderNotebooks(data);
    }

    renderFavoritesInstantly() {
        const data = this.liveData.favorites || this.cache.favorites || [];
        this.renderFavorites(data);
    }

    showLockedSectionInstantly() {
        if (this.liveData.locked && this.isLockedUnlocked) {
            this.renderLockedNotes(this.liveData.locked);
        } else {
            this.showLockedSection();
        }
    }

    async loadNotebooks() {
        if (this.currentSection !== 'regular' && this.currentSection !== 'checklist') return;
        if (this.isLoading.notebooks) return;
        
        this.isLoading.notebooks = true;
        
        try {
            const response = await fetch(`/api/notebooks/${this.currentSection}`);
            const notebooks = await response.json();
            
            // Update both cache and live data
            this.cache.notebooks[this.currentSection] = notebooks;
            this.liveData.notebooks[this.currentSection] = notebooks;
            
            // Only re-render if we're still on the same section
            if (this.currentView === 'notebooks') {
                this.renderNotebooks(notebooks);
            }
        } catch (error) {
            console.error('Failed to load notebooks:', error);
        } finally {
            this.isLoading.notebooks = false;
        }
    }

    renderNotebooks(notebooks) {
        const container = document.getElementById('notebooks-list');
        container.innerHTML = '';
        
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
        
        // Add to live data INSTANTLY
        const newNotebook = {
            _id: 'temp_' + Date.now(),
            name: name,
            noteCount: 0,
            section: this.currentSection
        };
        
        this.liveData.notebooks[this.currentSection] = this.liveData.notebooks[this.currentSection] || [];
        this.liveData.notebooks[this.currentSection].unshift(newNotebook);
        
        // Re-render INSTANTLY
        this.renderNotebooks(this.liveData.notebooks[this.currentSection]);
        
        try {
            const response = await fetch('/api/notebooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, section: this.currentSection })
            });
            
            if (response.ok) {
                const realNotebook = await response.json();
                // Replace temp with real data
                const index = this.liveData.notebooks[this.currentSection].findIndex(n => n._id === newNotebook._id);
                if (index !== -1) {
                    this.liveData.notebooks[this.currentSection][index] = realNotebook;
                    this.renderNotebooks(this.liveData.notebooks[this.currentSection]);
                }
                // Update cache
                this.cache.notebooks[this.currentSection] = this.liveData.notebooks[this.currentSection];
            } else {
                // Remove temp item on failure
                this.liveData.notebooks[this.currentSection] = this.liveData.notebooks[this.currentSection].filter(n => n._id !== newNotebook._id);
                this.renderNotebooks(this.liveData.notebooks[this.currentSection]);
            }
        } catch (error) {
            console.error('Failed to add notebook:', error);
            // Remove temp item on error
            this.liveData.notebooks[this.currentSection] = this.liveData.notebooks[this.currentSection].filter(n => n._id !== newNotebook._id);
            this.renderNotebooks(this.liveData.notebooks[this.currentSection]);
        }
    }

    async deleteNotebook(id) {
        if (!confirm('Delete this notebook and all its notes?')) return;
        
        // Remove from live data INSTANTLY
        this.liveData.notebooks[this.currentSection] = this.liveData.notebooks[this.currentSection].filter(n => n._id !== id);
        this.renderNotebooks(this.liveData.notebooks[this.currentSection]);
        
        try {
            const response = await fetch(`/api/notebooks/${id}`, { method: 'DELETE' });
            if (response.ok) {
                // Update cache
                this.cache.notebooks[this.currentSection] = this.liveData.notebooks[this.currentSection];
            } else {
                // Restore on failure - reload from server
                this.loadNotebooks();
            }
        } catch (error) {
            console.error('Failed to delete notebook:', error);
            // Restore on error - reload from server
            this.loadNotebooks();
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
        
        if (this.currentSection === 'checklist') {
            this.loadChecklistItemsInstantly();
        } else {
            this.loadNotesInstantly();
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
            this.renderNotebooksInstantly();
        }
    }

    async loadNotesInstantly() {
        // Show cached data first if available
        const cacheKey = this.currentNotebook ? `${this.currentSection}_${this.currentNotebook._id}` : this.currentSection;
        if (this.liveData.notes[cacheKey]) {
            this.renderNotes(this.liveData.notes[cacheKey]);
        }
        
        // Load fresh data in background
        this.loadNotes();
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
            
            // Store in live data
            const cacheKey = this.currentNotebook ? `${this.currentSection}_${this.currentNotebook._id}` : this.currentSection;
            this.liveData.notes[cacheKey] = notes;
            
            this.renderNotes(notes);
        } catch (error) {
            console.error('Failed to load notes:', error);
        } finally {
            this.isLoading.notes = false;
        }
    }

    renderNotes(notes) {
        const container = document.getElementById('notes-list');
        container.innerHTML = '';
        
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
        
        // Add to live data INSTANTLY
        const newNote = {
            _id: 'temp_' + Date.now(),
            content: content,
            section: this.currentSection,
            notebookId: this.currentNotebook,
            isFavorite: false,
            isLocked: this.currentSection === 'locked',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const cacheKey = this.currentNotebook ? `${this.currentSection}_${this.currentNotebook._id}` : this.currentSection;
        this.liveData.notes[cacheKey] = this.liveData.notes[cacheKey] || [];
        this.liveData.notes[cacheKey].unshift(newNote);
        
        // Re-render INSTANTLY
        this.renderNotes(this.liveData.notes[cacheKey]);
        
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
                const realNote = await response.json();
                // Replace temp with real data
                const index = this.liveData.notes[cacheKey].findIndex(n => n._id === newNote._id);
                if (index !== -1) {
                    this.liveData.notes[cacheKey][index] = realNote;
                    this.renderNotes(this.liveData.notes[cacheKey]);
                }
            } else {
                // Remove temp item on failure
                this.liveData.notes[cacheKey] = this.liveData.notes[cacheKey].filter(n => n._id !== newNote._id);
                this.renderNotes(this.liveData.notes[cacheKey]);
            }
        } catch (error) {
            console.error('Failed to add note:', error);
            // Remove temp item on error
            this.liveData.notes[cacheKey] = this.liveData.notes[cacheKey].filter(n => n._id !== newNote._id);
            this.renderNotes(this.liveData.notes[cacheKey]);
        }
    }

    clearNoteCaches() {
        // Don't clear - keep live data for instant access
    }

    async loadChecklistItemsInstantly() {
        // Show cached data first if available
        const cacheKey = `${this.currentSection}_${this.currentNotebook._id}`;
        if (this.liveData.notes[cacheKey]) {
            this.renderChecklistItems(this.liveData.notes[cacheKey]);
        }
        
        // Load fresh data in background
        this.loadChecklistItems();
    }

    async loadChecklistItems() {
        if (this.isLoading.checklist) return;
        this.isLoading.checklist = true;
        
        try {
            const response = await fetch(`/api/notes/${this.currentSection}/${this.currentNotebook._id}`);
            const items = await response.json();
            
            // Store in live data
            const cacheKey = `${this.currentSection}_${this.currentNotebook._id}`;
            this.liveData.notes[cacheKey] = items;
            
            this.renderChecklistItems(items);
        } catch (error) {
            console.error('Failed to load checklist items:', error);
        } finally {
            this.isLoading.checklist = false;
        }
    }

    renderChecklistItems(items) {
        const container = document.getElementById('checklist-list');
        container.innerHTML = '';
        
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
        
        // Update live data INSTANTLY
        const cacheKey = `${this.currentSection}_${this.currentNotebook._id}`;
        if (this.liveData.notes[cacheKey]) {
            const noteIndex = this.liveData.notes[cacheKey].findIndex(n => n._id === id);
            if (noteIndex !== -1) {
                this.liveData.notes[cacheKey][noteIndex].isChecked = checked;
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
        
        // Add to live data INSTANTLY
        const newItem = {
            _id: 'temp_' + Date.now(),
            content: content,
            section: this.currentSection,
            notebookId: this.currentNotebook._id,
            isChecked: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const cacheKey = `${this.currentSection}_${this.currentNotebook._id}`;
        this.liveData.notes[cacheKey] = this.liveData.notes[cacheKey] || [];
        this.liveData.notes[cacheKey].unshift(newItem);
        
        // Re-render INSTANTLY
        this.renderChecklistItems(this.liveData.notes[cacheKey]);
        
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
                const realItem = await response.json();
                // Replace temp with real data
                const index = this.liveData.notes[cacheKey].findIndex(n => n._id === newItem._id);
                if (index !== -1) {
                    this.liveData.notes[cacheKey][index] = realItem;
                    this.renderChecklistItems(this.liveData.notes[cacheKey]);
                }
            } else {
                // Remove temp item on failure
                this.liveData.notes[cacheKey] = this.liveData.notes[cacheKey].filter(n => n._id !== newItem._id);
                this.renderChecklistItems(this.liveData.notes[cacheKey]);
            }
        } catch (error) {
            console.error('Failed to add checklist item:', error);
            // Remove temp item on error
            this.liveData.notes[cacheKey] = this.liveData.notes[cacheKey].filter(n => n._id !== newItem._id);
            this.renderChecklistItems(this.liveData.notes[cacheKey]);
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
                    this.renderLockedNotesInstantly();
                } else {
                    this.showLockPrompt();
                }
            }
        } catch (error) {
            console.error('Failed to check lock setup:', error);
        }
    }

    renderLockedNotesInstantly() {
        const data = this.liveData.locked || this.cache.locked || [];
        this.renderLockedNotes(data);
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
                this.renderLockedNotesInstantly();
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
                this.renderLockedNotesInstantly();
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
            
            // Update live data
            this.liveData.locked = notes;
            this.cache.locked = notes;
            
            this.renderLockedNotes(notes);
        } catch (error) {
            console.error('Failed to load locked notes:', error);
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
        
        // Add to live data INSTANTLY
        const newNote = {
            _id: 'temp_' + Date.now(),
            content: content,
            section: 'locked',
            isLocked: true,
            isFavorite: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        this.liveData.locked = this.liveData.locked || [];
        this.liveData.locked.unshift(newNote);
        
        // Re-render INSTANTLY
        this.renderLockedNotes(this.liveData.locked);
        
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
                const realNote = await response.json();
                // Replace temp with real data
                const index = this.liveData.locked.findIndex(n => n._id === newNote._id);
                if (index !== -1) {
                    this.liveData.locked[index] = realNote;
                    this.renderLockedNotes(this.liveData.locked);
                }
                // Update cache
                this.cache.locked = this.liveData.locked;
            } else {
                // Remove temp item on failure
                this.liveData.locked = this.liveData.locked.filter(n => n._id !== newNote._id);
                this.renderLockedNotes(this.liveData.locked);
            }
        } catch (error) {
            console.error('Failed to add locked note:', error);
            // Remove temp item on error
            this.liveData.locked = this.liveData.locked.filter(n => n._id !== newNote._id);
            this.renderLockedNotes(this.liveData.locked);
        }
    }

    async loadFavorites() {
        if (this.isLoading.favorites) return;
        this.isLoading.favorites = true;
        
        try {
            const response = await fetch('/api/notes/favorites');
            const notes = await response.json();
            
            // Update live data
            this.liveData.favorites = notes;
            this.cache.favorites = notes;
            
            this.renderFavorites(notes);
        } catch (error) {
            console.error('Failed to load favorites:', error);
        } finally {
            this.isLoading.favorites = false;
        }
    }

    renderFavorites(notes) {
        // Update count
        document.getElementById('favorites-count').textContent = `${notes.length} starred notes`;
        
        const container = document.getElementById('favorites-list');
        container.innerHTML = '';
        
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
        
        // Update live data INSTANTLY
        this.updateNoteInLiveData(id, { isFavorite: !button?.classList.contains('active') });
        
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

    updateNoteInLiveData(id, updates) {
        // Update in all relevant live data stores
        Object.keys(this.liveData.notes).forEach(key => {
            const notes = this.liveData.notes[key];
            if (notes) {
                const index = notes.findIndex(n => n._id === id);
                if (index !== -1) {
                    Object.assign(notes[index], updates);
                }
            }
        });
        
        if (this.liveData.favorites) {
            const index = this.liveData.favorites.findIndex(n => n._id === id);
            if (index !== -1) {
                Object.assign(this.liveData.favorites[index], updates);
            }
        }
        
        if (this.liveData.locked) {
            const index = this.liveData.locked.findIndex(n => n._id === id);
            if (index !== -1) {
                Object.assign(this.liveData.locked[index], updates);
            }
        }
    }

    editNote(id, content) {
        this.editingNote = id;
        document.getElementById('edit-textarea').value = content;
        document.getElementById('edit-modal').classList.remove('hidden');
    }

    // INSTANT edit save - NO loading, NO revert
    async saveEditInstantly() {
        if (!this.editingNote) return;
        
        const content = document.getElementById('edit-textarea').value.trim();
        if (!content) return;
        
        // Update UI INSTANTLY and permanently
        const noteItem = document.querySelector(`[data-note-id="${this.editingNote}"]`);
        const noteContent = noteItem?.querySelector('.note-content');
        if (noteContent) {
            noteContent.innerHTML = this.escapeHtml(content);
        }
        
        // Update live data INSTANTLY
        this.updateNoteInLiveData(this.editingNote, { 
            content: content, 
            updatedAt: new Date() 
        });
        
        // Close modal INSTANTLY
        this.cancelEdit();
        
        // Update server in background - NO UI changes on success/failure
        try {
            await fetch(`/api/notes/${this.editingNote}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
        } catch (error) {
            console.error('Failed to save edit:', error);
            // Don't revert - keep the edit in UI
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
        
        // Remove from live data INSTANTLY
        this.removeNoteFromLiveData(id);
        
        try {
            await fetch(`/api/notes/${id}`, { method: 'DELETE' });
        } catch (error) {
            console.error('Failed to delete note:', error);
            // Don't restore - keep deleted from UI
        }
    }

    removeNoteFromLiveData(id) {
        // Remove from all live data stores
        Object.keys(this.liveData.notes).forEach(key => {
            if (this.liveData.notes[key]) {
                this.liveData.notes[key] = this.liveData.notes[key].filter(n => n._id !== id);
            }
        });
        
        if (this.liveData.favorites) {
            this.liveData.favorites = this.liveData.favorites.filter(n => n._id !== id);
        }
        
        if (this.liveData.locked) {
            this.liveData.locked = this.liveData.locked.filter(n => n._id !== id);
        }
    }
}

// Initialize app
const app = new NotesApp();

class NotesApp {
    constructor() {
        this.currentSection = 'regular';
        this.currentNotebook = null;
        this.currentView = 'notebooks';
        this.isLockedUnlocked = false;
        this.editingNote = null;
        this.lockPasswordSet = false;
        
        // Cache for faster loading
        this.cache = {
            notebooks: {},
            notes: {},
            favorites: null,
            locked: null
        };
        
        this.init();
    }

    async init() {
        this.bindEvents();
        // Show app immediately for instant UI
        this.showApp();
        await this.checkSessionFast();
    }

    showLoading(container) {
        if (typeof container === 'string') {
            container = document.getElementById(container);
        }
        if (container) {
            container.innerHTML = `
                <div class="loading-overlay">
                    <div class="loading-spinner"></div>
                </div>
            `;
        }
    }

    hideLoading(container) {
        if (typeof container === 'string') {
            container = document.getElementById(container);
        }
        if (container) {
            const loading = container.querySelector('.loading-overlay');
            if (loading) {
                loading.remove();
            }
        }
    }

    async checkSessionFast() {
        try {
            const response = await fetch('/api/check-session');
            const data = await response.json();
            
            if (data.authenticated) {
                // Preload all data for instant switching
                this.preloadAllData();
                this.loadNotebooks();
            } else {
                this.showAuth();
            }
        } catch (error) {
            console.error('Session check failed:', error);
            this.showAuth();
        }
    }

    // Preload all data for instant section switching
    async preloadAllData() {
        try {
            // Load all sections data in parallel
            const [regularNotebooks, checklistNotebooks, favorites, locked] = await Promise.all([
                fetch('/api/notebooks/regular').then(r => r.json()).catch(() => []),
                fetch('/api/notebooks/checklist').then(r => r.json()).catch(() => []),
                fetch('/api/notes/favorites').then(r => r.json()).catch(() => []),
                fetch('/api/notes/locked').then(r => r.json()).catch(() => [])
            ]);

            // Cache the data
            this.cache.notebooks.regular = regularNotebooks;
            this.cache.notebooks.checklist = checklistNotebooks;
            this.cache.favorites = favorites;
            this.cache.locked = locked;
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
        
        // Navigation - instant switching
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchSectionInstant(e.currentTarget.dataset.section);
            });
        });
        
        // Add buttons
        document.getElementById('add-notebook-btn').addEventListener('click', () => this.addNotebook());
        document.getElementById('add-note-btn').addEventListener('click', () => this.addNote());
        document.getElementById('add-checklist-btn').addEventListener('click', () => this.addChecklistItem());
        
        // Unlock button
        document.getElementById('unlock-btn').addEventListener('click', () => this.unlockSection());
        
        // Modal events
        document.getElementById('save-edit-btn').addEventListener('click', () => this.saveEdit());
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
                // Preload data immediately after login
                this.preloadAllData();
                this.loadNotebooks();
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
                this.preloadAllData();
                this.loadNotebooks();
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
        
        // Clear forms
        document.getElementById('login-username').value = '';
        document.getElementById('login-pin').value = '';
        document.getElementById('register-username').value = '';
        document.getElementById('register-pin').value = '';
    }

    // Instant section switching using cached data
    switchSectionInstant(section) {
        this.currentSection = section;
        this.currentView = (section === 'regular' || section === 'checklist') ? 'notebooks' : 'notes';
        this.isLockedUnlocked = false;
        
        // Update navigation instantly
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-section="${section}"]`).classList.add('active');
        
        // Update header instantly
        document.getElementById('header-title').textContent = 
            section.charAt(0).toUpperCase() + section.slice(1);
        
        // Hide back button
        document.getElementById('back-btn').classList.add('hidden');
        
        // Show appropriate view instantly
        this.showViewInstant();
        
        // Load cached data or fetch if not available
        if (section === 'regular' || section === 'checklist') {
            this.loadNotebooksInstant();
        } else if (section === 'favorites') {
            this.loadFavoritesInstant();
        } else if (section === 'locked') {
            this.showLockedSectionInstant();
        }
    }

    showViewInstant() {
        // Hide all views instantly
        document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
        
        // Show appropriate view instantly
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

    loadNotebooksInstant() {
        const cachedData = this.cache.notebooks[this.currentSection];
        if (cachedData) {
            this.renderNotebooks(cachedData);
        } else {
            this.loadNotebooks();
        }
    }

    loadFavoritesInstant() {
        if (this.cache.favorites) {
            this.renderFavorites(this.cache.favorites);
        } else {
            this.loadFavorites();
        }
    }

    showLockedSectionInstant() {
        if (this.cache.locked && this.isLockedUnlocked) {
            this.renderLockedNotes(this.cache.locked);
        } else {
            this.showLockedSection();
        }
    }

    async loadNotebooks() {
        if (this.currentSection !== 'regular' && this.currentSection !== 'checklist') return;
        
        try {
            const response = await fetch(`/api/notebooks/${this.currentSection}`);
            const notebooks = await response.json();
            
            // Update cache
            this.cache.notebooks[this.currentSection] = notebooks;
            
            this.renderNotebooks(notebooks);
        } catch (error) {
            console.error('Failed to load notebooks:', error);
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
        
        try {
            const response = await fetch('/api/notebooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, section: this.currentSection })
            });
            
            if (response.ok) {
                input.value = '';
                // Clear cache to force refresh
                delete this.cache.notebooks[this.currentSection];
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
                // Clear cache to force refresh
                delete this.cache.notebooks[this.currentSection];
                this.loadNotebooks();
            }
        } catch (error) {
            console.error('Failed to delete notebook:', error);
        }
    }

    openNotebook(notebook) {
        this.currentNotebook = notebook;
        this.currentView = (this.currentSection === 'checklist') ? 'checklist' : 'notes';
        
        // Update header instantly
        document.getElementById('header-title').textContent = notebook.name;
        document.getElementById('back-btn').classList.remove('hidden');
        
        // Show appropriate view instantly
        this.showViewInstant();
        
        if (this.currentSection === 'checklist') {
            this.loadChecklistItems();
        } else {
            this.loadNotes();
        }
    }

    goBack() {
        if (this.currentView === 'notes' || this.currentView === 'checklist') {
            this.currentView = 'notebooks';
            this.currentNotebook = null;
            
            // Update header instantly
            document.getElementById('header-title').textContent = 
                this.currentSection.charAt(0).toUpperCase() + this.currentSection.slice(1);
            document.getElementById('back-btn').classList.add('hidden');
            
            this.showViewInstant();
            this.loadNotebooksInstant();
        }
    }

    async loadNotes() {
        try {
            const url = this.currentNotebook 
                ? `/api/notes/${this.currentSection}/${this.currentNotebook._id}`
                : `/api/notes/${this.currentSection}`;
                
            const response = await fetch(url);
            const notes = await response.json();
            
            this.renderNotes(notes);
        } catch (error) {
            console.error('Failed to load notes:', error);
        }
    }

    renderNotes(notes) {
        const container = document.getElementById('notes-list');
        container.innerHTML = '';
        
        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-item';
            
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
                        <button class="favorite-btn ${note.isFavorite ? 'active' : ''}" onclick="app.toggleFavorite('${note._id}')">
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
                input.value = '';
                // Clear relevant caches
                this.clearNoteCaches();
                this.loadNotes();
            }
        } catch (error) {
            console.error('Failed to add note:', error);
        }
    }

    clearNoteCaches() {
        this.cache.favorites = null;
        this.cache.locked = null;
        this.cache.notes = {};
    }

    async loadChecklistItems() {
        try {
            const response = await fetch(`/api/notes/${this.currentSection}/${this.currentNotebook._id}`);
            const items = await response.json();
            
            const container = document.getElementById('checklist-list');
            container.innerHTML = '';
            
            items.forEach(item => {
                const element = document.createElement('div');
                element.className = `checklist-item ${item.isChecked ? 'completed' : ''}`;
                element.innerHTML = `
                    <input type="checkbox" ${item.isChecked ? 'checked' : ''} 
                           onchange="app.toggleChecklistItem('${item._id}', this.checked)">
                    <span class="checklist-text">${this.escapeHtml(item.content)}</span>
                    <button class="delete-btn" onclick="app.deleteNote('${item._id}')">
                        <i class="material-icons">delete</i>
                    </button>
                `;
                
                container.appendChild(element);
            });
        } catch (error) {
            console.error('Failed to load checklist items:', error);
        }
    }

    async addChecklistItem() {
        const input = document.getElementById('checklist-input');
        const content = input.value.trim();
        
        if (!content) return;
        
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
                input.value = '';
                this.loadChecklistItems();
            }
        } catch (error) {
            console.error('Failed to add checklist item:', error);
        }
    }

    async toggleChecklistItem(id, checked) {
        try {
            await fetch(`/api/notes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isChecked: checked })
            });
        } catch (error) {
            console.error('Failed to toggle checklist item:', error);
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
                    this.loadLockedNotes();
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
                this.loadLockedNotes();
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
                this.loadLockedNotes();
            } else {
                alert('Incorrect password');
                document.getElementById('unlock-password').value = '';
            }
        } catch (error) {
            console.error('Failed to unlock section:', error);
        }
    }

    async loadLockedNotes() {
        try {
            const response = await fetch('/api/notes/locked');
            const notes = await response.json();
            
            // Update cache
            this.cache.locked = notes;
            
            this.renderLockedNotes(notes);
        } catch (error) {
            console.error('Failed to load locked notes:', error);
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
            
            const date = new Date(note.updatedAt);
            const dateStr = date.toLocaleDateString('en-GB');
            const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            const starIcon = note.isFavorite ? 'star' : 'star_border';

            item.innerHTML = `
                <div class="note-content">${this.escapeHtml(note.content)}</div>
                <div class="note-meta">
                    <span>${dateStr} ${timeStr}</span>
                    <div class="note-actions">
                        <button class="favorite-btn ${note.isFavorite ? 'active' : ''}" onclick="app.toggleFavorite('${note._id}')">
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
                input.value = '';
                // Clear cache to force refresh
                this.cache.locked = null;
                this.loadLockedNotes();
            }
        } catch (error) {
            console.error('Failed to add locked note:', error);
        }
    }

    async loadFavorites() {
        try {
            const response = await fetch('/api/notes/favorites');
            const notes = await response.json();
            
            // Update cache
            this.cache.favorites = notes;
            
            this.renderFavorites(notes);
        } catch (error) {
            console.error('Failed to load favorites:', error);
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
                        <button class="favorite-btn active" onclick="app.toggleFavorite('${note._id}')">
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

    async toggleFavorite(id) {
        // Find the button and update UI immediately
        const button = document.querySelector(`button[onclick*="${id}"]`);
        if (button && button.classList.contains('favorite-btn')) {
            const isActive = button.classList.contains('active');
            const icon = button.querySelector('.material-icons');
            icon.textContent = isActive ? 'star_border' : 'star';
            button.classList.toggle('active');
        }
        
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
                // Clear caches to ensure fresh data
                this.clearNoteCaches();
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

    async saveEdit() {
        if (!this.editingNote) return;
        
        const content = document.getElementById('edit-textarea').value.trim();
        if (!content) return;
        
        try {
            const response = await fetch(`/api/notes/${this.editingNote}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            
            if (response.ok) {
                this.cancelEdit();
                // Clear caches and reload current view
                this.clearNoteCaches();
                
                if (this.currentSection === 'favorites') {
                    this.loadFavorites();
                } else if (this.currentSection === 'locked' && this.isLockedUnlocked) {
                    this.loadLockedNotes();
                } else if (this.currentView === 'notes') {
                    this.loadNotes();
                } else if (this.currentView === 'checklist') {
                    this.loadChecklistItems();
                }
            }
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
        
        try {
            const response = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
            if (response.ok) {
                // Clear caches and reload current view
                this.clearNoteCaches();
                
                if (this.currentSection === 'favorites') {
                    this.loadFavorites();
                } else if (this.currentSection === 'locked' && this.isLockedUnlocked) {
                    this.loadLockedNotes();
                } else if (this.currentView === 'notes') {
                    this.loadNotes();
                } else if (this.currentView === 'checklist') {
                    this.loadChecklistItems();
                }
            }
        } catch (error) {
            console.error('Failed to delete note:', error);
        }
    }
}

// Initialize app
const app = new NotesApp();

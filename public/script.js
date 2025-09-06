class NotesApp {
    constructor() {
        this.currentSection = 'regular';
        this.currentNotebook = null;
        this.currentView = 'notebooks';
        this.isLockedUnlocked = false;
        this.editingNote = null;
        this.lockPasswordSet = false;
        this.userId = null;
        this.socket = null;
        
        // Ultra-fast cache system
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

    // Enhanced WebSocket connection with ultra-fast updates
    initializeSocket() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.socket = io({
            transports: ['websocket'], // Force websocket for speed
            upgrade: false,
            rememberUpgrade: false,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 10000
        });
        
        this.socket.on('connect', () => {
            console.log('🚀 Real-time connection established!');
            if (this.userId) {
                this.socket.emit('authenticate', this.userId);
            }
        });

        // Enhanced real-time update handlers
        this.socket.on('notebooks_updated', (data) => {
            requestAnimationFrame(() => {
                this.handleRealtimeUpdate('notebooks_updated', data);
            });
        });

        this.socket.on('notes_updated', (data) => {
            requestAnimationFrame(() => {
                this.handleRealtimeUpdate('notes_updated', data);
            });
        });

        // Handle sync requirements
        this.socket.on('sync_required', () => {
            this.ultraFastLoad();
        });

        this.socket.on('reconnect', () => {
            console.log('🔄 Real-time connection restored');
            this.ultraFastLoad();
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Real-time connection lost');
        });
    }

    // Enhanced real-time update handler with optimistic updates
    handleRealtimeUpdate(type, data) {
        if (type === 'notebooks_updated') {
            console.log('📚 Handling real-time notebooks update:', data.section);
            
            // Optimistic update to cache
            if (data.notebooks) {
                this.cache.notebooks[data.section] = data.notebooks;
                this.cache.isLoaded[data.section] = true;
            
                // Use requestAnimationFrame for smooth UI updates
                requestAnimationFrame(() => {
                    // Only re-render if the user is currently viewing this section
                    if (this.currentSection === data.section && this.currentView === 'notebooks') {
                        this.renderNotebooks(data.notebooks);
                        this.showRealTimeNotification(`Notebooks in ${data.section} updated!`, 'success');
                    }
                });
            }
        } else if (type === 'notes_updated') {
            console.log('📝 Handling real-time notes update:', data.section);
            
            // Update main notes cache if applicable
            if (data.notebookId) {
                const cacheKey = `${data.section}_${data.notebookId}`;
                this.cache.notes[cacheKey] = data.notes;
            } else if (data.section === 'favorites') {
                this.cache.favorites = data.notes;
                this.cache.isLoaded.favorites = true;
            } else if (data.section === 'locked') {
                this.cache.locked = data.notes;
                this.cache.isLoaded.locked = true;
            }
            
            // Re-render if the user is currently viewing the affected section
            if (this.currentSection === data.section) {
                if (data.section === 'favorites' && this.currentView === 'notes') {
                    this.renderFavorites(data.notes);
                    this.showRealTimeNotification('Favorites updated!');
                } else if (data.section === 'locked' && this.currentView === 'notes' && this.isLockedUnlocked) {
                    this.renderLockedNotes(data.notes);
                    this.showRealTimeNotification('Locked notes updated!');
                } else if ((data.section === 'regular' || data.section === 'checklist') && 
                           this.currentNotebook && this.currentNotebook._id === data.notebookId) {
                    if (data.section === 'checklist') {
                        this.renderChecklistItems(data.notes);
                        this.showRealTimeNotification('Checklist updated!');
                    } else {
                        this.renderNotes(data.notes);
                        this.showRealTimeNotification('Notes updated!');
                    }
                }
            }
            // Also update favorites if a note within a notebook was favorited/unfavorited
            // This handles cases where user is in a regular notebook, and a note is favorited
            if (data.section !== 'favorites' && this.currentSection === 'favorites' && this.currentView === 'notes') {
                this.loadFavorites(); // Force reload favorites if currently viewing
            }
            
            // This handles cases where user is in favorites, and a note is unfavorited
            if (data.section === 'favorites' && this.currentSection !== 'favorites' && 
                (this.currentSection === 'regular' || this.currentSection === 'checklist') && 
                this.currentNotebook) {
                // If a note in the current notebook was affected by a favorite change, reload that notebook's notes
                this.loadNotes(); 
            }
        }
    }

    // Show real-time notification
    showRealTimeNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #89999A;
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            font-size: 14px;
            z-index: 10000;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Animate out and remove
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 2000);
    }

    // Super fast loading skeleton
    showOptimizedLoading(containerId, message = 'Loading...') {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.8rem; padding: 1rem;">
                ${Array(2).fill().map(() => `
                    <div style="background: #DDC8B7; border-radius: 15px; padding: 1rem; animation: fastPulse 1s ease-in-out infinite;">
                        <div style="height: 18px; background: #CDACA1; border-radius: 9px; margin-bottom: 0.4rem; opacity: 0.7;"></div>
                        <div style="height: 12px; background: #CDACA1; border-radius: 6px; width: 50%; opacity: 0.5;"></div>
                    </div>
                `).join('')}
            </div>
            <style>
                @keyframes fastPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
            </style>
        `;
    }
}

async checkSessionAndLoadInitial() {
    try {
        // Start session check INSTANTLY
        const sessionResponse = await fetch('/api/check-session');
        const data = await sessionResponse.json();
        
        if (data.authenticated) {
            this.userId = data.userId;
            // Set username INSTANTLY
            if (data.username) {
                document.getElementById('username-display').textContent = `Hi ${data.username}`;
            }
            
            // Initialize socket INSTANTLY and start loading regular section
            this.initializeSocket();
            this.ultraFastLoad();
        } else {
            this.showAuth();
        }
    } catch (error) {
        console.error('Session check failed:', error);
        this.showAuth();
    }
}

// ULTRA FAST loading - regular section loads FIRST, others in background
async ultraFastLoad() {
    // Show loading for regular section INSTANTLY
    this.showOptimizedLoading('notebooks-list', 'Loading...');
    
    // Load regular section FIRST and FAST
    try {
        const response = await fetch('/api/notebooks/regular');
        const notebooks = await response.json();
        
        // Update cache and render INSTANTLY
        this.cache.notebooks.regular = notebooks;
        this.cache.isLoaded.regular = true;
        this.renderNotebooks(notebooks);
        
        console.log('✅ Regular section loaded INSTANTLY');
    } catch (error) {
        console.error('Failed to load regular section:', error);
        document.getElementById('notebooks-list').innerHTML = '<div style="text-align: center; color: #89999A; padding: 2rem;">Failed to load notebooks</div>';
    }
    
    // Start background preloading for other sections (don't wait)
    this.backgroundPreload();
}

// Background preloading - runs after regular section is loaded
async backgroundPreload() {
    // Small delay to let regular section render first
    setTimeout(async () => {
        const preloadPromises = [
            // Preload checklist notebooks
            fetch('/api/notebooks/checklist')
                .then(r => r.json())
                .then(data => {
                    this.cache.notebooks.checklist = data;
                    this.cache.isLoaded.checklist = true;
                    console.log('✅ Checklist preloaded in background');
                })
                .catch(e => console.error('Checklist preload failed:', e)),
            
            // Preload favorites
            fetch('/api/notes/favorites')
                .then(r => r.json())
                .then(data => {
                    this.cache.favorites = data;
                    this.cache.isLoaded.favorites = true;
                    console.log('✅ Favorites preloaded in background');
                })
                .catch(e => console.error('Favorites preload failed:', e)),
            
            // Preload locked notes
            fetch('/api/notes/locked')
                .then(r => r.json())
                .then(data => {
                    this.cache.locked = data;
                    this.cache.isLoaded.locked = true;
                    console.log('✅ Locked notes preloaded in background');
                })
                .catch(e => console.error('Locked notes preload failed:', e))
        ];
        
        // Run all preloads in background
        Promise.all(preloadPromises).then(() => {
            console.log('🚀 ALL sections preloaded in background! Instant switching ready.');
        });
    }, 100); // Very small delay to prioritize regular section
}

    // Aggressive background preloading for instant switching
    async aggressivePreload() {
        // Start all preloads immediately in parallel
        const preloadPromises = [];
        
        // Preload checklist notebooks
        if (!this.cache.isLoaded.checklist) {
            preloadPromises.push(
                fetch('/api/notebooks/checklist')
                    .then(r => r.json())
                    .then(data => {
                        this.cache.notebooks.checklist = data;
                        this.cache.isLoaded.checklist = true;
                        console.log('✅ Checklist notebooks preloaded');
                    })
                    .catch(e => console.error('Checklist preload failed:', e))
            );
        }

        // Preload favorites
        if (!this.cache.isLoaded.favorites) {
            preloadPromises.push(
                fetch('/api/notes/favorites')
                    .then(r => r.json())
                    .then(data => {
                        this.cache.favorites = data;
                        this.cache.isLoaded.favorites = true;
                        console.log('✅ Favorites preloaded');
                    })
                    .catch(e => console.error('Favorites preload failed:', e))
            );
        }

        // Preload locked notes
        if (!this.cache.isLoaded.locked) {
            preloadPromises.push(
                fetch('/api/notes/locked')
                    .then(r => r.json())
                    .then(data => {
                        this.cache.locked = data;
                        this.cache.isLoaded.locked = true;
                        console.log('✅ Locked notes preloaded');
                    })
                    .catch(e => console.error('Locked notes preload failed:', e))
            );
        }

        // Wait for all preloads to complete
        try {
            await Promise.all(preloadPromises);
            console.log('🚀 All sections preloaded! Switching will be instant.');
        } catch (error) {
            console.error('Some preloads failed:', error);
        }
    }

    // Update username display visibility based on view
    updateUsernameVisibility() {
        const usernameDisplay = document.getElementById('username-display');
        
        // Show username only on home pages (notebooks view)
        if (this.currentView === 'notebooks') {
            usernameDisplay.classList.remove('hidden');
        } else {
            usernameDisplay.classList.add('hidden');
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
        
        // INSTANT navigation with real-time updates
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
            // First, disconnect any existing socket connection
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }

            // Clear all existing data before making the request
            this.resetApp();
            
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Set new user data
                this.userId = data.userId;
                document.getElementById('username-display').textContent = `Hi ${username}`;
                
                // Show app screen
                this.showApp();
                
                // Initialize new socket connection
                this.initializeSocket();
                
                // Small delay to ensure complete cleanup before loading new data
                setTimeout(() => {
                    this.ultraFastLoad();
                }, 100);
                
                return; // Exit early on success
            }
            alert(data.error || 'Login failed');
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
            // First, disconnect any existing socket connection
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }

            // Clear all existing data before making the request
            this.resetApp();
            
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Set new user data
                this.userId = data.userId;
                document.getElementById('username-display').textContent = `Hi ${username}`;
                
                // Show app screen
                this.showApp();
                
                // Initialize new socket connection
                this.initializeSocket();
                
                // Small delay to ensure complete cleanup before loading new data
                setTimeout(() => {
                    this.ultraFastLoad();
                }, 100);
                
                return; // Exit early on success
            }
            alert(data.error || 'Registration failed');
        } catch (error) {
            alert('Registration failed: ' + error.message);
        }
    }

    async handleLogout() {
        try {
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            await fetch('/api/logout', { method: 'POST' });
            this.showAuth();
            this.resetApp();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }

    resetApp() {
        // Disconnect and clear socket first
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        // Reset all application state
        this.currentSection = 'regular';
        this.currentNotebook = null;
        this.currentView = 'notebooks';
        this.isLockedUnlocked = false;
        this.editingNote = null;
        this.lockPasswordSet = false;
        this.userId = null;
        
        // Reset username display
        document.getElementById('username-display').textContent = 'Hi User';
        
        // Aggressively clear cache
        this.cache = {
            notebooks: { regular: null, checklist: null },
            notes: {},
            favorites: null,
            locked: null,
            isLoaded: { regular: false, checklist: false, favorites: false, locked: false }
        };
        
        // Reset all loading states
        this.isLoading = { notebooks: false, notes: false, favorites: false, locked: false };
        
        // Clear all UI elements
        ['notebooks-list', 'notes-list', 'checklist-list', 'favorites-list', 'locked-list'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.innerHTML = '';
        });
        
        // Reset all input fields
        ['login-username', 'login-pin', 'register-username', 'register-pin', 
         'notebook-input', 'note-input', 'checklist-input', 'unlock-password'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });
        
        // Reset navigation state
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('[data-section="regular"]')?.classList.add('active');
        
        // Clear any modal or edit state
        document.getElementById('back-btn')?.classList.add('hidden');
        document.getElementById('header-title').textContent = 'Regular';
    }

    // INSTANT section switching with real-time data
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
    
    // Update username visibility
    this.updateUsernameVisibility();
    
    // Show appropriate view INSTANTLY
    this.showViewInstantly();
    
    // Load data with INSTANT cache check first
    if (section === 'regular' || section === 'checklist') {
        if (this.cache.isLoaded[section] && this.cache.notebooks[section]) {
            // INSTANT - render from cache
            this.renderNotebooks(this.cache.notebooks[section]);
        } else {
            // Show loading and load data
            this.showOptimizedLoading('notebooks-list', 'Loading...');
            this.loadNotebooks();
        }
    } else if (section === 'favorites') {
        if (this.cache.isLoaded.favorites && this.cache.favorites) {
            // INSTANT - render from cache
            this.renderFavorites(this.cache.favorites);
        } else {
            // Show loading and load data
            this.showOptimizedLoading('favorites-list', 'Loading...');
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
    
    // Check cache first for INSTANT loading
    if (this.cache.isLoaded[this.currentSection] && this.cache.notebooks[this.currentSection]) {
        this.renderNotebooks(this.cache.notebooks[this.currentSection]);
        return;
    }
    
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
        
        if (!response.ok) {
            console.error('Failed to add notebook');
        }
    } catch (error) {
        console.error('Failed to add notebook:', error);
    }
}

    async deleteNotebook(id) {
    if (!confirm('Delete this notebook and all its notes?')) return;
    
    try {
        const response = await fetch(`/api/notebooks/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            console.error('Failed to delete notebook');
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
        
        // Update username visibility (hide when inside notebook)
        this.updateUsernameVisibility();
        
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
            // Optimized loading
            if (this.currentSection === 'checklist') {
                this.showOptimizedLoading('checklist-list', 'Loading items...');
                this.loadChecklistItems();
            } else {
                this.showOptimizedLoading('notes-list', 'Loading notes...');
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
            
            // Update username visibility (show when back to home)
            this.updateUsernameVisibility();
            
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
        
        if (!response.ok) {
            console.error('Failed to add note');
        }
    } catch (error) {
        console.error('Failed to add note:', error);
    }
}

    async deleteNote(id) {
    if (!confirm('Delete this note?')) return;

    try {
        await fetch(`/api/notes/${id}`, { method: 'DELETE' });
        console.log('✅ Note deleted successfully');
    } catch (error) {
        console.error('Failed to delete note:', error);
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
                // Real-time update will handle UI refresh
                console.log('✅ Checklist item added - real-time update will refresh UI');
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
                        this.showOptimizedLoading('locked-notes', 'Loading locked notes...');
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
                body: JSON.stringify({ password })
            };
            
            if (response.ok) {
                this.lockPasswordSet = true;
                this.isLockedUnlocked = true;
                document.querySelector('.locked-container').classList.add('hidden');
                document.getElementById('locked-notes').classList.remove('hidden');
                
                if (this.cache.isLoaded.locked && this.cache.locked) {
                    this.renderLockedNotes(this.cache.locked);
                } else {
                    this.showOptimizedLoading('locked-notes', 'Loading locked notes...');
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
                    this.showOptimizedLoading('locked-notes', 'Loading locked notes...');
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
                // Real-time update will handle UI refresh
                console.log('✅ Locked note added - real-time update will refresh UI');
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
        try {
            const response = await fetch(`/api/notes/${id}/favorite`, { method: 'POST' });
            if (!response.ok) {
                console.error('Failed to toggle favorite');
            } else {
                console.log('✅ Favorite toggled - real-time update will refresh other sections');
            }
        } catch (error) {
            console.error('Failed to toggle favorite:', error);
        }
    }

    editNote(id, content) {
        this.editingNote = id;
        document.getElementById('edit-textarea').value = content;
        document.getElementById('edit-modal').classList.remove('hidden');
    }

    // INSTANT edit save with real-time updates
    async saveEditInstantly() {
        if (!this.editingNote) return;
        
        const content = document.getElementById('edit-textarea').value.trim();
        if (!content) return;

        // Close modal INSTANTLY
        this.cancelEdit();
        
        // Update server - real-time will handle other users
        try {
            await fetch(`/api/notes/${this.editingNote}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            
            console.log('✅ Note edited - real-time update will refresh other users');
        } catch (error) {
            console.error('Failed to save edit:', error);
        }
    }

    cancelEdit() {
        this.editingNote = null;
        document.getElementById('edit-modal').classList.add('hidden');
        document.getElementById('edit-textarea').value = '';
    }
}

// Initialize app
const app = new NotesApp();
class NotesApp {
    constructor() {
        this.currentSection = 'regular';
        this.currentNotebook = null;
        this.currentView = 'notebooks';
        this.isLockedUnlocked = false;
        this.editingNote = null;
        this.lockPasswordSet = false;
        this.userId = null;
        this.socket = null;
        
        // Ultra-fast cache system
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

    // Enhanced WebSocket connection with ultra-fast updates
    initializeSocket() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.socket = io({
            transports: ['websocket'], // Force websocket for speed
            upgrade: false,
            rememberUpgrade: false,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 10000
        });
        
        this.socket.on('connect', () => {
            console.log('🚀 Real-time connection established!');
            if (this.userId) {
                this.socket.emit('authenticate', this.userId);
            }
        });

        // Enhanced real-time update handlers
        this.socket.on('notebooks_updated', (data) => {
            requestAnimationFrame(() => {
                this.handleRealtimeUpdate('notebooks_updated', data);
            });
        });

        this.socket.on('notes_updated', (data) => {
            requestAnimationFrame(() => {
                this.handleRealtimeUpdate('notes_updated', data);
            });
        });

        // Handle sync requirements
        this.socket.on('sync_required', () => {
            this.ultraFastLoad();
        });

        this.socket.on('reconnect', () => {
            console.log('🔄 Real-time connection restored');
            this.ultraFastLoad();
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Real-time connection lost');
        });
    }

    // Enhanced real-time update handler with optimistic updates
    handleRealtimeUpdate(type, data) {
        if (type === 'notebooks_updated') {
            console.log('📚 Handling real-time notebooks update:', data.section);
            
            // Optimistic update to cache
            if (data.notebooks) {
                this.cache.notebooks[data.section] = data.notebooks;
                this.cache.isLoaded[data.section] = true;
            
                // Use requestAnimationFrame for smooth UI updates
                requestAnimationFrame(() => {
                    // Only re-render if the user is currently viewing this section
                    if (this.currentSection === data.section && this.currentView === 'notebooks') {
                        this.renderNotebooks(data.notebooks);
                        this.showRealTimeNotification(`Notebooks in ${data.section} updated!`, 'success');
                    }
                });
            }
        } else if (type === 'notes_updated') {
            console.log('📝 Handling real-time notes update:', data.section);
            
            // Update main notes cache if applicable
            if (data.notebookId) {
                const cacheKey = `${data.section}_${data.notebookId}`;
                this.cache.notes[cacheKey] = data.notes;
            } else if (data.section === 'favorites') {
                this.cache.favorites = data.notes;
                this.cache.isLoaded.favorites = true;
            } else if (data.section === 'locked') {
                this.cache.locked = data.notes;
                this.cache.isLoaded.locked = true;
            }
            
            // Re-render if the user is currently viewing the affected section
            if (this.currentSection === data.section) {
                if (data.section === 'favorites' && this.currentView === 'notes') {
                    this.renderFavorites(data.notes);
                    this.showRealTimeNotification('Favorites updated!');
                } else if (data.section === 'locked' && this.currentView === 'notes' && this.isLockedUnlocked) {
                    this.renderLockedNotes(data.notes);
                    this.showRealTimeNotification('Locked notes updated!');
                } else if ((data.section === 'regular' || data.section === 'checklist') && 
                           this.currentNotebook && this.currentNotebook._id === data.notebookId) {
                    if (data.section === 'checklist') {
                        this.renderChecklistItems(data.notes);
                        this.showRealTimeNotification('Checklist updated!');
                    } else {
                        this.renderNotes(data.notes);
                        this.showRealTimeNotification('Notes updated!');
                    }
                }
            }
            // Also update favorites if a note within a notebook was favorited/unfavorited
            // This handles cases where user is in a regular notebook, and a note is favorited
            if (data.section !== 'favorites' && this.currentSection === 'favorites' && this.currentView === 'notes') {
                this.loadFavorites(); // Force reload favorites if currently viewing
            }
            
            // This handles cases where user is in favorites, and a note is unfavorited
            if (data.section === 'favorites' && this.currentSection !== 'favorites' && 
                (this.currentSection === 'regular' || this.currentSection === 'checklist') && 
                this.currentNotebook) {
                // If a note in the current notebook was affected by a favorite change, reload that notebook's notes
                this.loadNotes(); 
            }
        }
    }

    // Show real-time notification
    showRealTimeNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #89999A;
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            font-size: 14px;
            z-index: 10000;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Animate out and remove
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 2000);
    }

    // Super fast loading skeleton
    showOptimizedLoading(containerId, message = 'Loading...') {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.8rem; padding: 1rem;">
                ${Array(2).fill().map(() => `
                    <div style="background: #DDC8B7; border-radius: 15px; padding: 1rem; animation: fastPulse 1s ease-in-out infinite;">
                        <div style="height: 18px; background: #CDACA1; border-radius: 9px; margin-bottom: 0.4rem; opacity: 0.7;"></div>
                        <div style="height: 12px; background: #CDACA1; border-radius: 6px; width: 50%; opacity: 0.5;"></div>
                    </div>
                `).join('')}
            </div>
            <style>
                @keyframes fastPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
            </style>
        `;
    }
}

async checkSessionAndLoadInitial() {
    try {
        // Start session check INSTANTLY
        const sessionResponse = await fetch('/api/check-session');
        const data = await sessionResponse.json();
        
        if (data.authenticated) {
            this.userId = data.userId;
            // Set username INSTANTLY
            if (data.username) {
                document.getElementById('username-display').textContent = `Hi ${data.username}`;
            }
            
            // Initialize socket INSTANTLY and start loading regular section
            this.initializeSocket();
            this.ultraFastLoad();
        } else {
            this.showAuth();
        }
    } catch (error) {
        console.error('Session check failed:', error);
        this.showAuth();
    }
}

// ULTRA FAST loading - regular section loads FIRST, others in background
async ultraFastLoad() {
    // Show loading for regular section INSTANTLY
    this.showOptimizedLoading('notebooks-list', 'Loading...');
    
    // Load regular section FIRST and FAST
    try {
        const response = await fetch('/api/notebooks/regular');
        const notebooks = await response.json();
        
        // Update cache and render INSTANTLY
        this.cache.notebooks.regular = notebooks;
        this.cache.isLoaded.regular = true;
        this.renderNotebooks(notebooks);
        
        console.log('✅ Regular section loaded INSTANTLY');
    } catch (error) {
        console.error('Failed to load regular section:', error);
        document.getElementById('notebooks-list').innerHTML = '<div style="text-align: center; color: #89999A; padding: 2rem;">Failed to load notebooks</div>';
    }
    
    // Start background preloading for other sections (don't wait)
    this.backgroundPreload();
}

// Background preloading - runs after regular section is loaded
async backgroundPreload() {
    // Small delay to let regular section render first
    setTimeout(async () => {
        const preloadPromises = [
            // Preload checklist notebooks
            fetch('/api/notebooks/checklist')
                .then(r => r.json())
                .then(data => {
                    this.cache.notebooks.checklist = data;
                    this.cache.isLoaded.checklist = true;
                    console.log('✅ Checklist preloaded in background');
                })
                .catch(e => console.error('Checklist preload failed:', e)),
            
            // Preload favorites
            fetch('/api/notes/favorites')
                .then(r => r.json())
                .then(data => {
                    this.cache.favorites = data;
                    this.cache.isLoaded.favorites = true;
                    console.log('✅ Favorites preloaded in background');
                })
                .catch(e => console.error('Favorites preload failed:', e)),
            
            // Preload locked notes
            fetch('/api/notes/locked')
                .then(r => r.json())
                .then(data => {
                    this.cache.locked = data;
                    this.cache.isLoaded.locked = true;
                    console.log('✅ Locked notes preloaded in background');
                })
                .catch(e => console.error('Locked notes preload failed:', e))
        ];
        
        // Run all preloads in background
        Promise.all(preloadPromises).then(() => {
            console.log('🚀 ALL sections preloaded in background! Instant switching ready.');
        });
    }, 100); // Very small delay to prioritize regular section
}

    // Aggressive background preloading for instant switching
    async aggressivePreload() {
        // Start all preloads immediately in parallel
        const preloadPromises = [];
        
        // Preload checklist notebooks
        if (!this.cache.isLoaded.checklist) {
            preloadPromises.push(
                fetch('/api/notebooks/checklist')
                    .then(r => r.json())
                    .then(data => {
                        this.cache.notebooks.checklist = data;
                        this.cache.isLoaded.checklist = true;
                        console.log('✅ Checklist notebooks preloaded');
                    })
                    .catch(e => console.error('Checklist preload failed:', e))
            );
        }

        // Preload favorites
        if (!this.cache.isLoaded.favorites) {
            preloadPromises.push(
                fetch('/api/notes/favorites')
                    .then(r => r.json())
                    .then(data => {
                        this.cache.favorites = data;
                        this.cache.isLoaded.favorites = true;
                        console.log('✅ Favorites preloaded');
                    })
                    .catch(e => console.error('Favorites preload failed:', e))
            );
        }

        // Preload locked notes
        if (!this.cache.isLoaded.locked) {
            preloadPromises.push(
                fetch('/api/notes/locked')
                    .then(r => r.json())
                    .then(data => {
                        this.cache.locked = data;
                        this.cache.isLoaded.locked = true;
                        console.log('✅ Locked notes preloaded');
                    })
                    .catch(e => console.error('Locked notes preload failed:', e))
            );
        }

        // Wait for all preloads to complete
        try {
            await Promise.all(preloadPromises);
            console.log('🚀 All sections preloaded! Switching will be instant.');
        } catch (error) {
            console.error('Some preloads failed:', error);
        }
    }

    // Update username display visibility based on view
    updateUsernameVisibility() {
        const usernameDisplay = document.getElementById('username-display');
        
        // Show username only on home pages (notebooks view)
        if (this.currentView === 'notebooks') {
            usernameDisplay.classList.remove('hidden');
        } else {
            usernameDisplay.classList.add('hidden');
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
        
        // INSTANT navigation with real-time updates
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
            // First, disconnect any existing socket connection
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }

            // Clear all existing data before making the request
            this.resetApp();
            
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Set new user data
                this.userId = data.userId;
                document.getElementById('username-display').textContent = `Hi ${username}`;
                
                // Show app screen
                this.showApp();
                
                // Initialize new socket connection
                this.initializeSocket();
                
                // Small delay to ensure complete cleanup before loading new data
                setTimeout(() => {
                    this.ultraFastLoad();
                }, 100);
                
                return; // Exit early on success
            }
            alert(data.error || 'Login failed');
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
            // First, disconnect any existing socket connection
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }

            // Clear all existing data before making the request
            this.resetApp();
            
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Set new user data
                this.userId = data.userId;
                document.getElementById('username-display').textContent = `Hi ${username}`;
                
                // Show app screen
                this.showApp();
                
                // Initialize new socket connection
                this.initializeSocket();
                
                // Small delay to ensure complete cleanup before loading new data
                setTimeout(() => {
                    this.ultraFastLoad();
                }, 100);
                
                return; // Exit early on success
            }
            alert(data.error || 'Registration failed');
        } catch (error) {
            alert('Registration failed: ' + error.message);
        }
    }

    async handleLogout() {
        try {
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            await fetch('/api/logout', { method: 'POST' });
            this.showAuth();
            this.resetApp();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }

    resetApp() {
        // Disconnect and clear socket first
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        // Reset all application state
        this.currentSection = 'regular';
        this.currentNotebook = null;
        this.currentView = 'notebooks';
        this.isLockedUnlocked = false;
        this.editingNote = null;
        this.lockPasswordSet = false;
        this.userId = null;
        
        // Reset username display
        document.getElementById('username-display').textContent = 'Hi User';
        
        // Aggressively clear cache
        this.cache = {
            notebooks: { regular: null, checklist: null },
            notes: {},
            favorites: null,
            locked: null,
            isLoaded: { regular: false, checklist: false, favorites: false, locked: false }
        };
        
        // Reset all loading states
        this.isLoading = { notebooks: false, notes: false, favorites: false, locked: false };
        
        // Clear all UI elements
        ['notebooks-list', 'notes-list', 'checklist-list', 'favorites-list', 'locked-list'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.innerHTML = '';
        });
        
        // Reset all input fields
        ['login-username', 'login-pin', 'register-username', 'register-pin', 
         'notebook-input', 'note-input', 'checklist-input', 'unlock-password'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });
        
        // Reset navigation state
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('[data-section="regular"]')?.classList.add('active');
        
        // Clear any modal or edit state
        document.getElementById('back-btn')?.classList.add('hidden');
        document.getElementById('header-title').textContent = 'Regular';
    }

    // INSTANT section switching with real-time data
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
    
    // Update username visibility
    this.updateUsernameVisibility();
    
    // Show appropriate view INSTANTLY
    this.showViewInstantly();
    
    // Load data with INSTANT cache check first
    if (section === 'regular' || section === 'checklist') {
        if (this.cache.isLoaded[section] && this.cache.notebooks[section]) {
            // INSTANT - render from cache
            this.renderNotebooks(this.cache.notebooks[section]);
        } else {
            // Show loading and load data
            this.showOptimizedLoading('notebooks-list', 'Loading...');
            this.loadNotebooks();
        }
    } else if (section === 'favorites') {
        if (this.cache.isLoaded.favorites && this.cache.favorites) {
            // INSTANT - render from cache
            this.renderFavorites(this.cache.favorites);
        } else {
            // Show loading and load data
            this.showOptimizedLoading('favorites-list', 'Loading...');
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
    
    // Check cache first for INSTANT loading
    if (this.cache.isLoaded[this.currentSection] && this.cache.notebooks[this.currentSection]) {
        this.renderNotebooks(this.cache.notebooks[this.currentSection]);
        return;
    }
    
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
        
        if (!response.ok) {
            console.error('Failed to add notebook');
        }
    } catch (error) {
        console.error('Failed to add notebook:', error);
    }
}

    async deleteNotebook(id) {
    if (!confirm('Delete this notebook and all its notes?')) return;
    
    try {
        const response = await fetch(`/api/notebooks/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            console.error('Failed to delete notebook');
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
        
        // Update username visibility (hide when inside notebook)
        this.updateUsernameVisibility();
        
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
            // Optimized loading
            if (this.currentSection === 'checklist') {
                this.showOptimizedLoading('checklist-list', 'Loading items...');
                this.loadChecklistItems();
            } else {
                this.showOptimizedLoading('notes-list', 'Loading notes...');
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
            
            // Update username visibility (show when back to home)
            this.updateUsernameVisibility();
            
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
        
        if (!response.ok) {
            console.error('Failed to add note');
        }
    } catch (error) {
        console.error('Failed to add note:', error);
    }
}

    async deleteNote(id) {
    if (!confirm('Delete this note?')) return;

    try {
        await fetch(`/api/notes/${id}`, { method: 'DELETE' });
        console.log('✅ Note deleted successfully');
    } catch (error) {
        console.error('Failed to delete note:', error);
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
                // Real-time update will handle UI refresh
                console.log('✅ Checklist item added - real-time update will refresh UI');
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
                        this.showOptimizedLoading('locked-notes', 'Loading locked notes...');
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
                body: JSON.stringify({ password })
            };
            
            if (response.ok) {
                this.lockPasswordSet = true;
                this.isLockedUnlocked = true;
                document.querySelector('.locked-container').classList.add('hidden');
                document.getElementById('locked-notes').classList.remove('hidden');
                
                if (this.cache.isLoaded.locked && this.cache.locked) {
                    this.renderLockedNotes(this.cache.locked);
                } else {
                    this.showOptimizedLoading('locked-notes', 'Loading locked notes...');
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
                    this.showOptimizedLoading('locked-notes', 'Loading locked notes...');
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
                // Real-time update will handle UI refresh
                console.log('✅ Locked note added - real-time update will refresh UI');
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
        try {
            const response = await fetch(`/api/notes/${id}/favorite`, { method: 'POST' });
            if (!response.ok) {
                console.error('Failed to toggle favorite');
            } else {
                console.log('✅ Favorite toggled - real-time update will refresh other sections');
            }
        } catch (error) {
            console.error('Failed to toggle favorite:', error);
        }
    }

    editNote(id, content) {
        this.editingNote = id;
        document.getElementById('edit-textarea').value = content;
        document.getElementById('edit-modal').classList.remove('hidden');
    }

    // INSTANT edit save with real-time updates
    async saveEditInstantly() {
        if (!this.editingNote) return;
        
        const content = document.getElementById('edit-textarea').value.trim();
        if (!content) return;

        // Close modal INSTANTLY
        this.cancelEdit();
        
        // Update server - real-time will handle other users
        try {
            await fetch(`/api/notes/${this.editingNote}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            
            console.log('✅ Note edited - real-time update will refresh other users');
        } catch (error) {
            console.error('Failed to save edit:', error);
        }
    }

    cancelEdit() {
        this.editingNote = null;
        document.getElementById('edit-modal').classList.add('hidden');
        document.getElementById('edit-textarea').value = '';
    }
}

// Initialize app
const app = new NotesApp();

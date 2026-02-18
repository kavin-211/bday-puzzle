
/**
 * Puzzle Master Core Logic
 */

// Utils
const STORAGE_KEY = 'puzzle_db';
// Updated Regex to allow kenrich@gmail.com and standard gmail
const GMAIL_REGEX = /^[a-z0-9](\.?[a-z0-9]){5,}@g(oogle)?mail\.com$/;

const ASSETS = [
    'assets/images/stage_1.png',
    'assets/images/stage_2.png',
    'assets/images/stage_3.png',
    'assets/images/stage_4.png',
    'assets/images/stage_5.png'
];

const CONFIG = {
    snapDist: 30,
    baseGrid: 8 // Level 1 = 8x8
};

// --- DATA MANAGEMENT ---
const DB = {
    get() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch { return []; }
    },
    save(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },
    findUser(email) {
        return this.get().find(u => u.email === email);
    },
    login(email) {
        const data = this.get();
        let user = data.find(u => u.email === email);
        
        if (!user) {
            user = {
                email,
                currentLevel: 1,
                installed: false,
                history: []
            };
            data.push(user);
        }
        
        this.save(data);
        return user;
    },
    updateLevel(email, newLevel) {
        const data = this.get();
        const user = data.find(u => u.email === email);
        if (user) {
            user.currentLevel = newLevel;
            // Update the last history entry if it exists and is open
            // Actually, game completion doesn't necessarily end a session, 
            // but we can update a "lastActivity" timestamp if we wanted.
            this.save(data);
        }
    },
    recordSessionStart(email) {
        const data = this.get();
        const user = data.find(u => u.email === email);
        if (user) {
            const now = Date.now();
            // Check if there is an open session (no outTime)? 
            // Or just start new. Simple approach: Start new session.
            // If previous session has no outTime, maybe close it now?
            
            if (user.history.length > 0) {
                const last = user.history[user.history.length - 1];
                if (!last.outTime) {
                    last.outTime = now; // Close previous if open
                    last.duration = this.calcDuration(last.inTime, last.outTime);
                }
            }
            
            user.history.push({
                inTime: now,
                outTime: null,
                duration: null
            });
            this.save(data);
        }
    },
    recordSessionEnd(email) {
        const data = this.get();
        const user = data.find(u => u.email === email);
        if (user && user.history.length > 0) {
            const last = user.history[user.history.length - 1];
            if (!last.outTime) {
                last.outTime = Date.now();
                last.duration = this.calcDuration(last.inTime, last.outTime);
                this.save(data);
            }
        }
    },
    calcDuration(start, end) {
        const diff = end - start;
        const seconds = Math.floor((diff / 1000) % 60);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const hours = Math.floor((diff / (1000 * 60 * 60)));
        return `${hours}h ${minutes}m ${seconds}s`;
    },
    markInstalled(email) {
        if (!email) return;
        const data = this.get();
        const user = data.find(u => u.email === email);
        if (user) {
            user.installed = true;
            this.save(data);
        }
    },
    deleteHistory(email, index) {
        const data = this.get();
        const user = data.find(u => u.email === email);
        if (user && user.history[index]) {
            user.history.splice(index, 1);
            this.save(data);
            return user; // Return updated user
        }
        return null;
    }
};

// --- APP STATE ---
const State = {
    user: null,
    deferredInstall: null
};

// --- UI CONTROLLER ---
const UI = {
    screens: {
        login: document.getElementById('login-modal'),
        start: document.getElementById('start-modal'),
        game: document.getElementById('game-interface'),
        complete: document.getElementById('complete-modal'),
        admin: document.getElementById('admin-modal'),
        history: document.getElementById('history-modal'),
        logoutConfirm: document.getElementById('logout-confirm-modal')
    },
    
    init() {
        this.bindEvents();
        
        // PWA Install
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            State.deferredInstall = e;
            // Show install trigger if not logged in or just generic
            document.getElementById('install-trigger').classList.remove('hidden');
        });
        
        // Check Session
        const savedEmail = localStorage.getItem('pm_session_email');
        if (savedEmail) {
            const user = DB.findUser(savedEmail);
            if (user) {
                State.user = user;
                this.showStartModal();
            } else {
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
        
        // Track visibility for session end
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && State.user) {
                DB.recordSessionEnd(State.user.email);
            } else if (document.visibilityState === 'visible' && State.user) {
                // Optional: Resume session? For now, we just track "Out" on close/hide.
                // If they come back without reloading, we might want to start new "In"?
                // Let's keep it simple: One "In" per Load/Start.
            }
        });
    },

    bindEvents() {
        // Login
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email-input').value.trim();
            const error = document.getElementById('login-error');
            
            // ADMIN SHORTCUT
            if (email === "kenrich@gmail.com") {
                this.openAdmin(true); // Direct Admin Logic
                return;
            }
            
            if (!GMAIL_REGEX.test(email)) {
                error.textContent = "Please use a valid Gmail address";
                return;
            }
            
            const user = DB.login(email);
            localStorage.setItem('pm_session_email', email);
            State.user = user;
            
            this.showStartModal();
        });
        
        // Start Button
        document.getElementById('start-btn').addEventListener('click', () => {
             if (State.user) {
                 DB.recordSessionStart(State.user.email);
                 this.startGame(State.user);
             }
        });
        
        // Logout Request
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.screens.logoutConfirm.classList.remove('hidden');
        });
        
        // Confirm Logout
        document.getElementById('confirm-logout-btn').addEventListener('click', () => {
            if (State.user) DB.recordSessionEnd(State.user.email);
            
            localStorage.removeItem('pm_session_email');
            State.user = null;
            location.reload(); // Reload to reset state cleanly
        });
        
        // Cancel Logout
        document.getElementById('cancel-logout-btn').addEventListener('click', () => {
            this.screens.logoutConfirm.classList.add('hidden');
        });
        
        // Admin Trigger (Header Double Tap) - Kept as fallback/easter egg
        let lastTap = 0;
        document.getElementById('main-header').addEventListener('click', (e) => {
             // Avoid triggering on Logout button
             if(e.target.closest('#logout-btn')) return;
             
             const now = Date.now();
             if (now - lastTap < 400) {
                 // Check if user is admin email or if we want to allow password bypass?
                 // Requirement: "login input la... admin login success"
                 // So maybe rely on login form.
                 // But let's keep the existing "h10-211" style feature just in case, but secured.
                 // Current req says "kenrich@gmail.com" logic.
             }
             lastTap = now;
        });
        
        document.getElementById('close-admin').addEventListener('click', () => {
             this.screens.admin.classList.add('hidden');
             // If we logged in directly as admin (no user session), show login
             if (!State.user) this.showLogin();
        });
        
        // History Modal
        document.getElementById('close-history').addEventListener('click', () => {
            this.screens.history.classList.add('hidden');
        });
        
        // Login Install Button
        document.getElementById('login-install-btn').addEventListener('click', () => {
            this.triggerInstall();
        });
        
        // Floating Install Trigger
        let lastInstallTap = 0;
        document.getElementById('install-trigger').addEventListener('click', () => {
            this.triggerInstall();
        });

        // Next Level
        document.getElementById('next-level-btn').addEventListener('click', () => {
            this.screens.complete.classList.add('hidden');
            const user = State.user;
            this.startGame(user);
        });
    },
    
    showLogin() {
        this.screens.login.classList.remove('hidden');
        this.screens.start.classList.add('hidden');
        this.screens.game.classList.add('hidden');
        document.body.style.backgroundImage = `url('assets/images/stage_1.png')`;
    },
    
    showStartModal() {
        this.screens.login.classList.add('hidden');
        this.screens.game.classList.add('hidden');
        this.screens.start.classList.remove('hidden');
        document.body.style.backgroundImage = `url('assets/images/stage_1.png')`;
    },
    
    startGame(user) {
        State.user = user;
        this.screens.start.classList.add('hidden'); 
        this.screens.game.classList.remove('hidden');
        document.getElementById('stage-title').textContent = `Stage ${user.currentLevel}`;
        
        Game.init(document.getElementById('puzzle-canvas'));
        Game.loadLevel(user.currentLevel);
    },
    
    openAdmin(isAuth = false) {
        if (isAuth) {
            this.renderAdminTable();
            this.screens.admin.classList.remove('hidden');
            this.screens.login.classList.add('hidden');
            this.screens.start.classList.add('hidden');
            document.body.style.backgroundImage = `url('assets/images/stage_1.png')`; // Default bg for admin
        }
    },
    
    renderAdminTable() {
        const users = DB.get();
        const tbody = document.getElementById('admin-tbody');
        tbody.innerHTML = '';
        
        users.forEach(u => {
            // Get last active entry
            let lastActiveStr = 'N/A';
            let lastActiveTs = 0;
            if (u.history.length > 0) {
                const last = u.history[u.history.length - 1];
                const d = new Date(last.inTime);
                lastActiveStr = d.toLocaleString();
                lastActiveTs = last.inTime;
            }
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.email}</td>
                <td>${u.currentLevel}</td>
                <td class="last-active-cell text-link">${lastActiveStr}</td>
                <td>${u.installed ? 'Yes' : 'No'}</td>
            `;
            
            // Add click event for Last Active
            const dateCell = tr.querySelector('.last-active-cell');
            dateCell.addEventListener('click', () => {
                this.showHistory(u);
            });
            
            tbody.appendChild(tr);
        });
    },
    
    showHistory(user) {
        const modal = this.screens.history;
        document.getElementById('history-user-title').textContent = `${user.email.split('@')[0]}'s History`;
        const tbody = document.getElementById('history-tbody');
        
        const renderRows = (u) => {
            tbody.innerHTML = u.history.map((h, i) => {
                const inT = new Date(h.inTime).toLocaleString();
                const outT = h.outTime ? new Date(h.outTime).toLocaleString() : 'Active/Crash';
                const dur = h.duration || '-';
                // Use data-index to track original index for deletion, but note we reverse map for display?
                // Actually, if we map then reverse, the index 'i' is the original index if we DON'T reverse first.
                // Let's map first then reverse logic in display, or just render normally.
                // To keep it simple and consistent with "Show newest first", we need to handle index carefully.
                // Let's create the array with original indices first.
                return { h, originalIndex: i };
            }).reverse().map(item => {
                const { h, originalIndex } = item;
                const inT = new Date(h.inTime).toLocaleString();
                const outT = h.outTime ? new Date(h.outTime).toLocaleString() : 'Active/Crash';
                const dur = h.duration || '-';
                
                return `
                    <tr>
                        <td>${new Date(h.inTime).toLocaleDateString()}</td>
                        <td>${inT.split(',')[1]}</td>
                        <td>${outT.includes('/') ? outT.split(',')[1] : outT}</td>
                        <td>${dur}</td>
                        <td class="delete-cell">
                            <button class="delete-btn" data-email="${u.email}" data-index="${originalIndex}" title="Delete Record">
                                🗑️
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
            
            // Re-bind delete events
            const deleteBtns = tbody.querySelectorAll('.delete-btn');
            deleteBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if(confirm('Are you sure you want to delete this record?')) {
                        const email = e.target.closest('button').dataset.email;
                        const idx = parseInt(e.target.closest('button').dataset.index);
                        const updatedUser = DB.deleteHistory(email, idx);
                        if (updatedUser) {
                            renderRows(updatedUser); // Re-render with updated user data
                        }
                    }
                });
            });
        };
        
        renderRows(user);
        
        modal.classList.remove('hidden');
    },
    
    triggerInstall() {
        if (State.deferredInstall) {
            State.deferredInstall.prompt();
            State.deferredInstall.userChoice.then((choice) => {
                if (choice.outcome === 'accepted') {
                    if (State.user) DB.markInstalled(State.user.email);
                    State.deferredInstall = null;
                    document.getElementById('install-trigger').classList.add('hidden');
                }
            });
        }
    }
};

// --- GAME ENGINE ---
const Game = {
    canvas: null,
    ctx: null,
    pieces: [],
    img: null,
    
    state: {
        isDragging: false,
        selectedPiece: null,
        dragOffset: {x:0, y:0},
        zIndex: 1,
        gridSize: 8,
        cols: 8, rows: 8,
        puzzleRect: null,
        crop: null
    },

    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        window.addEventListener('resize', () => {
            this.resize();
            if (this.img) this.draw();
        });
        
        // Touch/Mouse Events
        ['mousedown', 'touchstart'].forEach(evt => 
            this.canvas.addEventListener(evt, this.onDown.bind(this), {passive: false})
        );
        ['mousemove', 'touchmove'].forEach(evt => 
            window.addEventListener(evt, this.onMove.bind(this), {passive: false})
        );
        ['mouseup', 'touchend'].forEach(evt => 
            window.addEventListener(evt, this.onUp.bind(this))
        );
        
        this.resize();
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    loadLevel(level) {
        // Safe check for asset existence
        const assetIndex = (level - 1) % ASSETS.length;
        const assetUrl = ASSETS[assetIndex];
        
        // Update Body Background
        document.body.style.backgroundImage = `url('${assetUrl}')`;
        
        this.img = new Image();
        this.img.src = assetUrl;
        
        this.img.onload = () => {
            // Calculate grid size to ensure roughly square pieces
            // Base total pieces ~ 64 for level 1, increasing slightly or keeping manageable
            // Level 1: ~64 pieces (8x8 if square)
            // Level 2: ~80 pieces
            // Level 3: ~100 pieces?
            
            // Let's define a target piece count base
            const basePieces = 30 + (level * 15); // L1=45, L2=60, L3=75... keeping it mobile friendly
            
            const imgRatio = this.img.width / this.img.height;
            
            // rows * cols = total
            // cols / rows = imgRatio  => cols = rows * imgRatio
            // rows * (rows * imgRatio) = total
            // rows^2 = total / imgRatio
            // rows = sqrt(total / imgRatio)
            
            this.state.rows = Math.max(3, Math.round(Math.sqrt(basePieces / imgRatio)));
            this.state.cols = Math.max(3, Math.round(this.state.rows * imgRatio));
            
            this.generate();
            this.draw();
        };
    },

    generate() {
        this.resize();
        
        const { width, height } = this.canvas;
        const s = this.state;
        
        // --- 1. Puzzle Dimensions Calculation ---
        // Requirement: 96% width on mobile, constrained by available height to leave space for pieces.
        
        const HEADER_HEIGHT = 80; // Approx header height + margin
        const BOTTOM_MARGIN = 20;
        const SIDE_MARGIN = width * 0.02; // 2% on each side
        
        // Available vertical space
        const availableHeight = height - HEADER_HEIGHT - BOTTOM_MARGIN;
        
        // Desired Width
        let targetW = width * 0.96;
        if (width > 800) targetW = width * 0.6; // Desktop/Tablet cap
        
        const imgRat = this.img.width / this.img.height;
        let targetH = targetW / imgRat;
        
        // Height Constraint: We need space for loose pieces!
        // Strategy: Ensure puzzle doesn't take more than 70% of available height.
        // This leaves ~30% for loose pieces (split top/bottom).
        const maxH = availableHeight * 0.75; 
        
        if (targetH > maxH) {
            targetH = maxH;
            // targetW remains fixed at 96% (or desktop width) as per "any cost of ratio" requirement.
            // This ensures pieces have space in the remaining vertical area.
        }
        
        // Final Puzzle Rect (Center vertically in available space below header)
        // This naturally creates Top and Bottom gaps.
        const startX = (width - targetW) / 2;
        const startY = HEADER_HEIGHT + (availableHeight - targetH) / 2;
        
        s.puzzleRect = { x: startX, y: startY, w: targetW, h: targetH };
        
        // Crop Calc
        s.crop = { x: 0, y: 0, w: this.img.width, h: this.img.height };
        
        const pieceW = targetW / s.cols;
        const pieceH = targetH / s.rows;
        
        // --- 2. Piece Placement (Scattering) ---
        // Define Safe Zones: Top Gap & Bottom Gap (excluding header & screen edges)
        
        const safeZones = [];
        // Tab Protrusion Calculation: approx 25% of min(w,h) based on createPath
        // We add a safety buffer of ~35-40% to be safe.
        const maxTabSize = Math.max(pieceW, pieceH) * 0.45; 
        const gapBuffer = 10; // Extra padding from puzzle/header/edge
        const totalBuffer = maxTabSize + gapBuffer;
        
        // Top Zone: Between Header & Puzzle Top
        // Height available: (startY - HEADER_HEIGHT)
        // Usable Height: available - 2*totalBuffer (top and bottom padding for piece)
        const topH = startY - HEADER_HEIGHT;
        const usableTopH = topH - (2 * totalBuffer);
        
        if (usableTopH > pieceH) { // Only if piece fits with full buffers
            safeZones.push({
                x: SIDE_MARGIN + totalBuffer,
                y: HEADER_HEIGHT + totalBuffer,
                w: width - (SIDE_MARGIN * 2) - (2 * totalBuffer),
                h: usableTopH
            });
        }
        
        // Bottom Zone: Between Puzzle Bottom & Screen Bottom
        // Height available: (height - botY - BOTTOM_MARGIN)
        const botY = startY + targetH;
        const botH = height - botY - BOTTOM_MARGIN;
        const usableBotH = botH - (2 * totalBuffer);
        
        if (usableBotH > pieceH) {
             safeZones.push({
                x: SIDE_MARGIN + totalBuffer,
                y: botY + totalBuffer,
                w: width - (SIDE_MARGIN * 2) - (2 * totalBuffer),
                h: usableBotH
            });
        }
        
        // Side Zones (Only if wide enough, e.g., desktop or very square puzzle)
        // On mobile 96% width, sides are tiny (2%), so likely ignored.
        /* 
         if (width - (startX + targetW) > pieceW) {
             // Right side logic...
         }
        */
        
        // Fallback: If no safe zones (unlikely with 70% max constraints), enable overlapping on bottom but SAFE from edge.
        if (safeZones.length === 0) {
            // Force strict placement at bottom with buffer
            const safeY = height - pieceH - totalBuffer - BOTTOM_MARGIN;
            const safeX = SIDE_MARGIN + totalBuffer;
            const safeW = width - (2 * (SIDE_MARGIN + totalBuffer));
            
            safeZones.push({
                x: safeX, 
                y: safeY > (botY + gapBuffer) ? safeY : (botY + gapBuffer), 
                w: Math.max(pieceW, safeW), 
                h: pieceH + 5 
            });
        }

        this.pieces = [];
        
        // Tab Generation
        const vTabs = [];
        for(let r=0; r<s.rows; r++) {
            vTabs[r] = [];
            for(let c=0; c<s.cols-1; c++) vTabs[r][c] = Math.random() > 0.5 ? 1 : -1;
        }
        const hTabs = [];
        for(let r=0; r<s.rows-1; r++) {
            hTabs[r] = [];
            for(let c=0; c<s.cols; c++) hTabs[r][c] = Math.random() > 0.5 ? 1 : -1;
        }

        for (let r = 0; r < s.rows; r++) {
            for (let c = 0; c < s.cols; c++) {
                
                // Pick a random zone
                const zone = safeZones[Math.floor(Math.random() * safeZones.length)];
                
                // Random position within zone, strictly clamped
                const maxPX = zone.w - pieceW;
                const maxPY = zone.h - pieceH;
                
                // Ensure randomness doesn't break bounds if maxP is negative (swallow error, clamp to 0)
                const finalMaxX = Math.max(0, maxPX);
                const finalMaxY = Math.max(0, maxPY);
                
                const randX = zone.x + Math.random() * finalMaxX;
                const randY = zone.y + Math.random() * finalMaxY;
                
                const tabs = {
                    top: r === 0 ? 0 : -hTabs[r-1][c],
                    right: c === s.cols-1 ? 0 : vTabs[r][c],
                    bottom: r === s.rows-1 ? 0 : hTabs[r][c],
                    left: c === 0 ? 0 : -vTabs[r][c-1]
                };
                
                const path = this.createPath(pieceW, pieceH, tabs);
                
                this.pieces.push({
                    r, c,
                    cx: startX + c * pieceW,
                    cy: startY + r * pieceH,
                    x: randX, 
                    y: randY,
                    w: pieceW, h: pieceH,
                    tabs,
                    path,
                    locked: false,
                    zIndex: 0
                });
            }
        }
    },
    
    createPath(w, h, tabs) {
        const p = new Path2D();
        const ts = Math.min(w, h) * 0.25; // Tab Size
        
        p.moveTo(0, 0);
        this.edge(p, 0, 0, w, 0, tabs.top, ts);
        this.edge(p, w, 0, w, h, tabs.right, ts);
        this.edge(p, w, h, 0, h, tabs.bottom, ts);
        this.edge(p, 0, h, 0, 0, tabs.left, ts);
        
        p.closePath();
        return p;
    },
    
    edge(p, x1, y1, x2, y2, type, t) {
        if (type === 0) {
            p.lineTo(x2, y2);
            return;
        }
        
        const dx = x2 - x1;
        const dy = y2 - y1;
        
        const b1x = x1 + dx * 0.35;
        const b1y = y1 + dy * 0.35;
        p.lineTo(b1x, b1y);
        
        const ang = Math.atan2(dy, dx);
        const px = -Math.sin(ang); 
        const py = Math.cos(ang);
        const s = type; 
        
        // Neck 
        const c1x = b1x + px * t * s * 0.2;
        const c1y = b1y + py * t * s * 0.2;
        const sh1x = (x1+dx*0.5) - dx*0.1 + px * t * s * 0.9;
        const sh1y = (y1+dy*0.5) - dy*0.1 + py * t * s * 0.9;
        const tipx = (x1+dx*0.5) + px * t * s * 1.0;
        const tipy = (y1+dy*0.5) + py * t * s * 1.0;
        const sh2x = (x1+dx*0.5) + dx*0.1 + px * t * s * 0.9;
        const sh2y = (y1+dy*0.5) + dy*0.1 + py * t * s * 0.9;
        const b2x = x1 + dx * 0.65;
        const b2y = y1 + dy * 0.65;
        const c2x = b2x + px * t * s * 0.2;
        const c2y = b2y + py * t * s * 0.2;
        
        p.bezierCurveTo(c1x, c1y, sh1x, sh1y, tipx, tipy);
        p.bezierCurveTo(sh2x, sh2y, c2x, c2y, b2x, b2y);
        
        p.lineTo(x2, y2);
    },

    rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },

    onDown(e) {
        e.preventDefault();
        const pos = this.getPos(e);
        
        // Check standard reversed z-index for top piece match
        const hit = this.pieces
            .filter(p => !p.locked)
            .sort((a,b) => b.zIndex - a.zIndex)
            .find(p => {
                // Approximate hit test for performance + tab inclusion
                const margin = p.w * 0.3;
                if(pos.x < p.x - margin || pos.x > p.x + p.w + margin || pos.y < p.y - margin || pos.y > p.y + p.h + margin) return false;
                
                // Precise path check
                return this.ctx.isPointInPath(p.path, pos.x - p.x, pos.y - p.y);
            });
            
        if (hit) {
            this.state.isDragging = true;
            this.state.selectedPiece = hit;
            this.state.dragOffset = { x: pos.x - hit.x, y: pos.y - hit.y };
            hit.zIndex = ++this.state.zIndex;
            this.draw();
        }
    },
    
    onMove(e) {
        if (!this.state.isDragging || !this.state.selectedPiece) return;
        e.preventDefault();
        const pos = this.getPos(e);
        const p = this.state.selectedPiece;
        
        let newX = pos.x - this.state.dragOffset.x;
        let newY = pos.y - this.state.dragOffset.y;
        
        // Strict Boundary Checks (Prevent dragging off-screen)
        // Account for Tabs protruding
        const maxTabSize = Math.max(p.w, p.h) * 0.45; 
        
        // Check X
        if (newX < maxTabSize) newX = maxTabSize;
        if (newX + p.w + maxTabSize > this.canvas.width) newX = this.canvas.width - p.w - maxTabSize;
        
        // Check Y (Account for Header)
        const HEADER_BOUND = 80;
        if (newY < HEADER_BOUND + maxTabSize) newY = HEADER_BOUND + maxTabSize;
        if (newY + p.h + maxTabSize > this.canvas.height) newY = this.canvas.height - p.h - maxTabSize;
        
        p.x = newX;
        p.y = newY;
        this.draw();
    },
    
    onUp(e) {
        if (!this.state.isDragging || !this.state.selectedPiece) return;
        const p = this.state.selectedPiece;
        
        if (Math.hypot(p.x - p.cx, p.y - p.cy) < CONFIG.snapDist) {
            p.x = p.cx;
            p.y = p.cy;
            p.locked = true;
            p.zIndex = 0;
            // Play snap sound?
        }
        
        this.state.isDragging = false;
        this.state.selectedPiece = null;
        this.draw();
        this.checkWin();
    },
    
    checkWin() {
        if (this.pieces.every(p => p.locked)) {
            const user = State.user;
            if(user) {
                DB.updateLevel(user.email, user.currentLevel + 1);
                DB.recordSessionEnd(user.email); // Optionally end session on complete? Or keep going.
                document.getElementById('complete-modal').classList.remove('hidden');
            }
        }
    },
    
    getPos(e) {
        let cx = e.clientX, cy = e.clientY;
        if (e.touches && e.touches.length) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
        const r = this.canvas.getBoundingClientRect();
        return { x: cx - r.left, y: cy - r.top };
    },

    draw() {
        const {width, height} = this.canvas;
        this.ctx.clearRect(0,0,width,height);
        
        if (!this.state.puzzleRect) return;
        
        const pr = this.state.puzzleRect;
        this.ctx.strokeStyle = 'rgba(255,20,147,0.3)'; // Pinkish guide
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(pr.x, pr.y, pr.w, pr.h);
        this.ctx.setLineDash([]);
        
        // Draw locked pieces (background layer)
        const locked = this.pieces.filter(p => p.locked);
        locked.forEach(p => this.drawPiece(p));
        
        // Draw loose pieces
        const loose = this.pieces.filter(p => !p.locked).sort((a,b) => a.zIndex - b.zIndex);
        loose.forEach(p => this.drawPiece(p));
    },
    
    drawPiece(p) {
        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        
        // Shadow
        if(!p.locked) {
            this.ctx.shadowColor = 'rgba(0,0,0,0.3)';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowOffsetX = 2;
            this.ctx.shadowOffsetY = 2;
        }
        
        this.ctx.save();
        this.ctx.clip(p.path);
        
        if (this.img && this.img.complete) {
              const pr = this.state.puzzleRect;
              const cr = this.state.crop;
              const scaleX = cr.w / pr.w;
              const scaleY = cr.h / pr.h;
              
              const imgOx = cr.x + (p.c * p.w * scaleX);
              const imgOy = cr.y + (p.r * p.h * scaleY);
              
              const tabMargin = Math.max(p.w, p.h) * 0.5;
              const sx = imgOx - tabMargin * scaleX;
              const sy = imgOy - tabMargin * scaleY;
              const sw = p.w * scaleX + tabMargin * 2 * scaleX;
              const sh = p.h * scaleY + tabMargin * 2 * scaleY;
              
              const dx = -tabMargin;
              const dy = -tabMargin;
              const dw = p.w + tabMargin * 2;
              const dh = p.h + tabMargin * 2;
              
              this.ctx.drawImage(this.img, sx, sy, sw, sh, dx, dy, dw, dh);
        } else {
            this.ctx.fillStyle = '#ff69b4'; // Fallback pink
            this.ctx.fill(p.path);
        }
        
        this.ctx.restore(); // End Clip
        
        // Stroke
        this.ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke(p.path);
        
        this.ctx.restore(); // End Translate
    }
};

// Initialize
UI.init();

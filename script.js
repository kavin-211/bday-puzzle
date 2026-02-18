
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
    },
    
    showStartModal() {
        this.screens.login.classList.add('hidden');
        this.screens.game.classList.add('hidden');
        this.screens.start.classList.remove('hidden');
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
        tbody.innerHTML = user.history.map(h => {
            const inT = new Date(h.inTime).toLocaleString();
            const outT = h.outTime ? new Date(h.outTime).toLocaleString() : 'Active/Crash';
            const dur = h.duration || '-';
            return `
                <tr>
                    <td>${new Date(h.inTime).toLocaleDateString()}</td>
                    <td>${inT.split(',')[1]}</td>
                    <td>${outT.includes('/') ? outT.split(',')[1] : outT}</td>
                    <td>${dur}</td>
                </tr>
            `;
        }).reverse().join(''); // Show newest first
        
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
        const size = CONFIG.baseGrid + (level - 1);
        this.state.gridSize = size;
        this.state.rows = size;
        this.state.cols = size;
        
        const assetUrl = ASSETS[(level - 1) % ASSETS.length];
        
        this.img = new Image();
        this.img.src = assetUrl;
        
        this.img.onload = () => {
            this.generate();
            this.draw();
        };
    },

    generate() {
        this.resize();
        
        const { width, height } = this.canvas;
        const s = this.state;
        
        // Mobile Responsive Layout
        // Requirement: 96% width for puzzle canvas on mobile.
        // On Desktop, maybe keep it smaller/reasonable.
        
        let puzzleWidthPct = 0.96;
        if (width > 800) puzzleWidthPct = 0.6; // Tablet/Desktop
        
        // The "Canvas" ID covers screen, but "puzzleRect" is the drawing area.
        let targetW = width * puzzleWidthPct;
        
        // Ensure Aspect Ratio of Image (or square if needed?)
        // Let's assume square pieces for now, so total ratio depends on Rows/Cols (which are equal now)
        // But the image might be rectangular.
        
        const imgRat = this.img.width / this.img.height;
        let targetH = targetW / imgRat;
        
        // Check if H is too big
        if (targetH > height * 0.7) {
            targetH = height * 0.7;
            targetW = targetH * imgRat;
        }
        
        const startX = (width - targetW) / 2;
        const startY = (height - targetH) / 2;
        
        s.puzzleRect = { x: startX, y: startY, w: targetW, h: targetH };
        
        // Crop Calc
        let cropX = 0, cropY = 0, cropW = this.img.width, cropH = this.img.height;
        s.crop = { x: cropX, y: cropY, w: cropW, h: cropH };
        
        const pieceW = targetW / s.cols;
        const pieceH = targetH / s.rows;
        
        this.pieces = [];
        
        // Generate Tabs
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

        // Piece Placement (Outside Puzzle Area)
        const headerH = 80;
        const padding = 10;
        
        const getSafePos = () => {
            // New Strategy:
            // Define areas: Top, Bottom, Left, Right (surrounding puzzleRect)
            // Prioritize areas with most space.
            
            const areas = [
                { id: 'top', x: padding, y: headerH, w: width - 2*padding, h: startY - headerH },
                { id: 'bottom', x: padding, y: startY + targetH, w: width - 2*padding, h: height - (startY + targetH) - padding },
                { id: 'left', x: padding, y: headerH, w: startX - padding, h: height - headerH },
                { id: 'right', x: startX + targetW, y: headerH, w: width - (startX + targetW) - padding, h: height - headerH }
            ];
            
            // Filter usable areas (must hold at least one piece)
            const usable = areas.filter(a => a.w > pieceW && a.h > pieceH);
            
            if (usable.length === 0) {
                 // Fallback: Just put it anywhere (bottom usually)
                 return { x: this.rand(padding, width - pieceW - padding), y: height - pieceH - padding };
            }
            
            // Pick random area
            const area = usable[Math.floor(Math.random() * usable.length)];
            
            // Random pos within area
            const x = this.rand(area.x, area.x + area.w - pieceW);
            const y = this.rand(area.y, area.y + area.h - pieceH);
            
            return {x, y};
        };

        for (let r = 0; r < s.rows; r++) {
            for (let c = 0; c < s.cols; c++) {
                const pos = getSafePos();
                
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
                    x: pos.x, y: pos.y,
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
        
        p.x = pos.x - this.state.dragOffset.x;
        p.y = pos.y - this.state.dragOffset.y;
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

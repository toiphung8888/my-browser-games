/**
 * 2D GOLD MINER
 * Pure JS Implementation with Web Audio API
 */

// --- CONFIGURATION ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const SOIL_LEVEL = 100; // Y position where soil starts
const MINER_X = CANVAS_WIDTH / 2;
const MINER_Y = 60;

// --- AUDIO MANAGER (Procedural Sound) ---
class AudioManager {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    playTone(freq, type, duration, vol = 0.1) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playShoot() {
        this.playTone(600, 'square', 0.1, 0.05);
    }

    playGrab() {
        // Low thud
        this.playTone(100, 'sawtooth', 0.2, 0.1);
    }

    playCollect(value) {
        // Higher pitch for higher value
        const freq = value > 500 ? 1200 : 800;
        this.playTone(freq, 'sine', 0.5, 0.2);
        // Double ding for diamond
        if (value >= 600) {
            setTimeout(() => this.playTone(1500, 'sine', 0.5, 0.2), 100);
        }
    }

    playGameOver() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, this.ctx.currentTime + 1);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 1);
    }
}

// --- GAME ENTITIES ---

class Item {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.active = true;

        // Define properties based on type
        switch (type) {
            case 'gold-small':
                this.radius = 15;
                this.value = 100;
                this.weight = 1.5; // Multiplier for pull speed
                this.color = '#FFD700';
                break;
            case 'gold-large':
                this.radius = 35;
                this.value = 500;
                this.weight = 4.0;
                this.color = '#FFD700';
                break;
            case 'rock':
                this.radius = 25;
                this.value = 20;
                this.weight = 6.0;
                this.color = '#808080';
                break;
            case 'diamond':
                this.radius = 12;
                this.value = 900;
                this.weight = 0.5; // Very fast
                this.color = '#00FFFF';
                break;
        }
    }

    draw(ctx) {
        if (!this.active) return;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Add some shine or texture details
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        if (this.type.includes('rock')) {
            // Rough texture look
            ctx.beginPath();
            ctx.arc(this.x - 5, this.y - 5, this.radius / 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Shiny highlight
            ctx.beginPath();
            ctx.arc(this.x - this.radius/3, this.y - this.radius/3, this.radius / 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

class Hook {
    constructor(game) {
        this.game = game;
        this.angle = Math.PI / 2; // Pointing down (90 deg)
        this.swingSpeed = 0.02;
        this.swingDir = 1;
        this.length = 20;
        this.maxLength = 700;
        this.state = 'IDLE'; // IDLE, SHOOT, RETRACT
        this.x = MINER_X;
        this.y = MINER_Y;
        this.speed = 10;
        this.caughtItem = null;
    }

    reset() {
        this.length = 20;
        this.state = 'IDLE';
        this.caughtItem = null;
        this.angle = Math.PI / 2;
    }

    trigger() {
        if (this.state === 'IDLE') {
            this.state = 'SHOOT';
            this.game.audio.playShoot();
        }
    }

    update() {
        if (this.state === 'IDLE') {
            // Swing back and forth
            this.angle += this.swingSpeed * this.swingDir;
            if (this.angle > Math.PI - 0.2 || this.angle < 0.2) {
                this.swingDir *= -1;
            }
        } else if (this.state === 'SHOOT') {
            this.length += this.speed;
            
            // Boundary Check
            if (this.x + Math.cos(this.angle) * this.length < 0 || 
                this.x + Math.cos(this.angle) * this.length > CANVAS_WIDTH || 
                this.y + Math.sin(this.angle) * this.length > CANVAS_HEIGHT) {
                this.state = 'RETRACT';
            }
            
            // Check Collision with Items
            if (!this.caughtItem) {
                let tipX = this.x + Math.cos(this.angle) * this.length;
                let tipY = this.y + Math.sin(this.angle) * this.length;

                for (let item of this.game.items) {
                    if (item.active) {
                        let dx = tipX - item.x;
                        let dy = tipY - item.y;
                        let dist = Math.sqrt(dx*dx + dy*dy);
                        
                        if (dist < item.radius + 5) {
                            // Caught!
                            this.caughtItem = item;
                            this.state = 'RETRACT';
                            this.game.audio.playGrab();
                            // Shift hook tip slightly to center on item
                            this.length = Math.sqrt((item.x - this.x)**2 + (item.y - this.y)**2);
                            break;
                        }
                    }
                }
            }

        } else if (this.state === 'RETRACT') {
            let pullSpeed = this.speed;
            if (this.caughtItem) {
                pullSpeed = this.speed / this.caughtItem.weight;
                
                // Update item position to follow hook
                this.caughtItem.x = this.x + Math.cos(this.angle) * this.length;
                this.caughtItem.y = this.y + Math.sin(this.angle) * this.length;
            }

            this.length -= pullSpeed;

            if (this.length <= 20) {
                this.length = 20;
                this.state = 'IDLE';
                if (this.caughtItem) {
                    this.game.score += this.caughtItem.value;
                    this.game.createFloater(this.caughtItem.value);
                    this.game.audio.playCollect(this.caughtItem.value);
                    this.caughtItem.active = false; // Remove item
                    this.caughtItem = null;
                }
            }
        }
    }

    draw(ctx) {
        let tipX = this.x + Math.cos(this.angle) * this.length;
        let tipY = this.y + Math.sin(this.angle) * this.length;

        // Draw Line
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(tipX, tipY);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw Claw (Simple Anchor Shape)
        ctx.save();
        ctx.translate(tipX, tipY);
        ctx.rotate(this.angle - Math.PI/2);
        
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI*2);
        ctx.fill();

        // Prongs
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        // Left prong
        ctx.moveTo(-10, -5);
        ctx.quadraticCurveTo(-5, 5, 0, 0);
        // Right prong
        ctx.moveTo(10, -5);
        ctx.quadraticCurveTo(5, 5, 0, 0);
        ctx.stroke();

        ctx.restore();
    }
}

// --- GAME LOGIC ---

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.lastTime = 0;
        this.accumulator = 0;
        this.step = 1/60;

        this.audio = new AudioManager();
        this.hook = new Hook(this);
        
        this.items = [];
        this.floaters = []; // Floating score texts

        // Game State
        this.score = 0;
        this.level = 1;
        this.targetScore = 650;
        this.timeLeft = 60;
        this.state = 'MENU'; // MENU, PLAYING, PAUSED, LEVEL_END, GAME_OVER

        // DOM Elements
        this.uiScore = document.getElementById('scoreVal');
        this.uiTarget = document.getElementById('targetVal');
        this.uiTime = document.getElementById('timeVal');
        this.uiLevel = document.getElementById('levelVal');
        
        // Bind Inputs
        this.bindEvents();
    }

    bindEvents() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                if (this.state === 'PLAYING') this.hook.trigger();
            }
        });

        // Mouse / Touch
        this.canvas.addEventListener('mousedown', (e) => {
             if (this.state === 'PLAYING') this.hook.trigger();
        });

        // UI Buttons
        document.getElementById('btn-start').onclick = () => {
            this.audio.init();
            this.startGame();
        };
        document.getElementById('btn-pause').onclick = () => this.togglePause();
        document.getElementById('btn-resume').onclick = () => this.togglePause();
        document.getElementById('btn-next').onclick = () => this.startLevel(this.level + 1);
        document.getElementById('btn-restart').onclick = () => this.startGame();
    }

    startGame() {
        this.level = 1;
        this.score = 0;
        this.startLevel(1);
    }

    startLevel(lvl) {
        this.level = lvl;
        // Difficulty scaling
        this.targetScore = this.score + (500 + (lvl * 300));
        this.timeLeft = Math.max(30, 60 - (lvl * 2)); 
        
        this.generateItems();
        this.hook.reset();
        
        this.state = 'PLAYING';
        this.updateUI();
        this.hideOverlays();
        
        this.lastTime = performance.now();
        requestAnimationFrame((ts) => this.loop(ts));
    }

    generateItems() {
        this.items = [];
        const count = 8 + this.level; // More items per level
        
        for (let i = 0; i < count; i++) {
            let type = 'rock';
            let rand = Math.random();
            
            // Random generation logic
            if (rand > 0.9) type = 'diamond';
            else if (rand > 0.7) type = 'gold-large';
            else if (rand > 0.4) type = 'gold-small';
            
            let x = Math.random() * (CANVAS_WIDTH - 60) + 30;
            let y = Math.random() * (CANVAS_HEIGHT - SOIL_LEVEL - 60) + SOIL_LEVEL + 50;
            
            // Prevent immediate overlap (simple check)
            let safe = true;
            for(let item of this.items) {
                let d = Math.sqrt((x-item.x)**2 + (y-item.y)**2);
                if (d < item.radius + 30) safe = false;
            }
            
            if (safe) {
                this.items.push(new Item(x, y, type));
            }
        }
    }

    togglePause() {
        if (this.state === 'PLAYING') {
            this.state = 'PAUSED';
            document.getElementById('pause-overlay').classList.remove('hidden');
        } else if (this.state === 'PAUSED') {
            this.state = 'PLAYING';
            document.getElementById('pause-overlay').classList.add('hidden');
            this.lastTime = performance.now();
            requestAnimationFrame((ts) => this.loop(ts));
        }
    }

    createFloater(score) {
        this.floaters.push({
            val: score,
            x: MINER_X,
            y: MINER_Y - 20,
            life: 1.0 // seconds
        });
    }

    update(dt) {
        if (this.state !== 'PLAYING') return;

        // Timer
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.checkEndLevel();
        }

        this.hook.update();

        // Update floaters
        for (let i = this.floaters.length - 1; i >= 0; i--) {
            let f = this.floaters[i];
            f.y -= 30 * dt;
            f.life -= dt;
            if (f.life <= 0) this.floaters.splice(i, 1);
        }

        // Cleanup caught items from array if completely retrieved
        // (Handled in Hook logic mostly, but we can verify here)
    }

    checkEndLevel() {
        if (this.score >= this.targetScore) {
            this.state = 'LEVEL_END';
            document.getElementById('level-score').innerText = this.score;
            document.getElementById('level-overlay').classList.remove('hidden');
        } else {
            this.state = 'GAME_OVER';
            this.audio.playGameOver();
            document.getElementById('final-score').innerText = this.score;
            document.getElementById('gameover-overlay').classList.remove('hidden');
        }
    }

    draw() {
        // Clear background handled by CSS, but we clear canvas content
        this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw Miner (Simple representation)
        this.ctx.fillStyle = '#f1c40f';
        this.ctx.fillRect(MINER_X - 15, MINER_Y - 30, 30, 30);
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(MINER_X - 15, MINER_Y, 30, 5); // Wheel axle

        // Draw Items
        this.items.forEach(item => item.draw(this.ctx));

        // Draw Hook
        this.hook.draw(this.ctx);

        // Draw Floaters
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillStyle = '#0f0';
        this.floaters.forEach(f => {
            this.ctx.fillText(`+${f.val}`, f.x, f.y);
        });
    }

    updateUI() {
        this.uiScore.innerText = this.score;
        this.uiTarget.innerText = this.targetScore;
        this.uiTime.innerText = Math.ceil(this.timeLeft);
        this.uiLevel.innerText = this.level;
    }

    hideOverlays() {
        document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
    }

    loop(timestamp) {
        if (this.state !== 'PLAYING') return;

        let dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        this.update(dt);
        this.draw();
        this.updateUI();

        requestAnimationFrame((ts) => this.loop(ts));
    }
}

// Start
window.onload = () => {
    const game = new Game();
};
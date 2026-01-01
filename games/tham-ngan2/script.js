/* =========================================
   CORE SETUP & CONSTANTS
   ========================================= */
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const ui = {
    time: document.getElementById('time-display'),
    drain: document.getElementById('drain-display'),
    level: document.getElementById('level-display'),
    score: document.getElementById('score-display'),
    screens: {
        start: document.getElementById('start-screen'),
        gameover: document.getElementById('game-over-screen'),
        upgrade: document.getElementById('upgrade-screen')
    },
    cards: document.getElementById('cards-container')
};

let width, height;
function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

/* =========================================
   AUDIO ENGINE (Web Audio API)
   ========================================= */
const AudioEngine = {
    ctx: null,
    gainMaster: null,
    
    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.gainMaster = this.ctx.createGain();
            this.gainMaster.connect(this.ctx.destination);
            this.gainMaster.gain.value = 0.3;
        }
    },

    playTone(freq, type, duration, vol = 1, slide = 0) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slide !== 0) {
            osc.frequency.exponentialRampToValueAtTime(freq + slide, this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.gainMaster);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    playShoot() { this.playTone(400, 'triangle', 0.1, 0.5, -300); },
    playHit() { this.playTone(100, 'sawtooth', 0.1, 0.4, -50); },
    playEnemyDeath() { this.playTone(150, 'square', 0.2, 0.5, -100); },
    playCollect() { this.playTone(800, 'sine', 0.3, 0.6, 400); },
    playLevelUp() { 
        this.playTone(440, 'sine', 0.5, 0.5); 
        setTimeout(() => this.playTone(554, 'sine', 0.5, 0.5), 100);
        setTimeout(() => this.playTone(659, 'sine', 0.8, 0.5), 200);
    },
    playWarning() { this.playTone(800, 'square', 0.1, 0.2); }
};

/* =========================================
   GAME STATE & ENTITIES
   ========================================= */
const Game = {
    state: 'menu', // menu, playing, paused, gameover, upgrade
    lastTime: 0,
    
    // Core Stats
    time: 60,
    maxTime: 120,
    baseDrain: 0.5, // Passive loss per second
    drainMultiplier: 1,
    level: 1,
    xp: 0,
    xpToNext: 10,
    score: 0,
    
    // Entities
    player: { x: 0, y: 0, speed: 4, size: 15, vx: 0, vy: 0 },
    camera: { x: 0, y: 0 },
    bullets: [],
    enemies: [],
    particles: [],
    orbs: [],
    
    // Systems
    input: { keys: {}, joystick: { active: false, x: 0, y: 0 } },
    stats: {
        fireRate: 400, // ms
        lastShot: 0,
        bulletSpeed: 10,
        multishot: 1,
        pierce: 1,
        damage: 1
    },

    shake: 0
};

/* =========================================
   INPUT HANDLING
   ========================================= */
window.addEventListener('keydown', e => Game.input.keys[e.code] = true);
window.addEventListener('keyup', e => Game.input.keys[e.code] = false);

// Mobile Joystick
const joystickZone = document.getElementById('joystick-zone');
let touchId = null;
let touchStart = {x:0, y:0};

document.addEventListener('touchstart', e => {
    if(Game.state !== 'playing') return;
    const touch = e.changedTouches[0];
    touchId = touch.identifier;
    touchStart.x = touch.clientX;
    touchStart.y = touch.clientY;
    Game.input.joystick.active = true;
}, {passive: false});

document.addEventListener('touchmove', e => {
    if(!Game.input.joystick.active) return;
    for(let i=0; i<e.changedTouches.length; i++) {
        if(e.changedTouches[i].identifier === touchId) {
            const touch = e.changedTouches[i];
            const dx = touch.clientX - touchStart.x;
            const dy = touch.clientY - touchStart.y;
            const dist = Math.min(50, Math.hypot(dx, dy));
            const angle = Math.atan2(dy, dx);
            Game.input.joystick.x = (Math.cos(angle) * dist) / 50;
            Game.input.joystick.y = (Math.sin(angle) * dist) / 50;
        }
    }
}, {passive: false});

document.addEventListener('touchend', e => {
    Game.input.joystick.active = false;
    Game.input.joystick.x = 0;
    Game.input.joystick.y = 0;
});

/* =========================================
   UPGRADE SYSTEM
   ========================================= */
const Upgrades = [
    {
        name: "Time Dilation",
        benefit: "Fire Rate +25%",
        cost: "Time Drain +0.5/s",
        apply: () => { Game.stats.fireRate *= 0.8; Game.baseDrain += 0.5; }
    },
    {
        name: "Quantum Split",
        benefit: "Multi-Shot +1",
        cost: "Max Time -20s",
        apply: () => { Game.stats.multishot += 1; Game.maxTime -= 20; if(Game.time > Game.maxTime) Game.time = Game.maxTime; }
    },
    {
        name: "Velocity Debt",
        benefit: "Move Speed +30%",
        cost: "Enemies +10% Speed",
        apply: () => { Game.player.speed *= 1.3; Game.enemySpeedMult = (Game.enemySpeedMult || 1) + 0.1; }
    },
    {
        name: "Leech Protocol",
        benefit: "Time per Kill +1s",
        cost: "Damage -20%",
        apply: () => { Game.timePerKill = (Game.timePerKill || 2) + 1; Game.stats.damage *= 0.8; }
    },
    {
        name: "Temporal Shield",
        benefit: "Pushback Enemies",
        cost: "Instant Time Cost 15s",
        apply: () => { Game.time -= 15; Game.stats.knockback = (Game.stats.knockback || 0) + 5; }
    }
];

function triggerLevelUp() {
    Game.state = 'upgrade';
    AudioEngine.playLevelUp();
    ui.screens.upgrade.classList.add('active');
    ui.cards.innerHTML = '';

    // Pick 3 random upgrades
    for(let i=0; i<3; i++) {
        const upg = Upgrades[Math.floor(Math.random() * Upgrades.length)];
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
            <h3>${upg.name}</h3>
            <div class="benefit">BENEFIT: ${upg.benefit}</div>
            <div class="cost">DEBT: ${upg.cost}</div>
        `;
        el.onclick = () => {
            upg.apply();
            Game.level++;
            Game.xp = 0;
            Game.xpToNext = Math.floor(Game.xpToNext * 1.5);
            ui.screens.upgrade.classList.remove('active');
            Game.state = 'playing';
            Game.lastTime = performance.now();
        };
        ui.cards.appendChild(el);
    }
}

/* =========================================
   GAME LOOP & LOGIC
   ========================================= */
function initGame() {
    Game.time = 60;
    Game.maxTime = 120;
    Game.baseDrain = 1.0;
    Game.level = 1;
    Game.xp = 0;
    Game.score = 0;
    Game.enemies = [];
    Game.bullets = [];
    Game.particles = [];
    Game.orbs = [];
    Game.player = { x: 0, y: 0, speed: 4, size: 12 };
    Game.stats = { fireRate: 400, lastShot: 0, bulletSpeed: 12, multishot: 1, damage: 20 };
    Game.timePerKill = 2;
    Game.state = 'playing';
    
    AudioEngine.init();
    
    ui.screens.start.classList.remove('active');
    ui.screens.gameover.classList.remove('active');
    ui.screens.upgrade.classList.remove('active');
    document.getElementById('ui-layer').classList.remove('low-time-alert');
    
    loop(0);
}

function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(width, height) / 2 + 50;
    const ex = Game.player.x + Math.cos(angle) * dist;
    const ey = Game.player.y + Math.sin(angle) * dist;
    
    const type = Math.random();
    let enemy = {
        x: ex, y: ey,
        hp: 20 + (Game.level * 5),
        speed: (2 + Math.random()) * (Game.enemySpeedMult || 1),
        size: 15,
        type: 'normal',
        color: '#ff0055'
    };

    if (type > 0.8 && Game.level > 2) {
        enemy.type = 'drainer';
        enemy.color = '#aa00ff';
        enemy.speed *= 1.5;
        enemy.hp *= 0.5;
    } else if (type > 0.95 && Game.level > 4) {
        enemy.type = 'elite';
        enemy.color = '#ffe600';
        enemy.size = 25;
        enemy.hp *= 3;
    }

    Game.enemies.push(enemy);
}

function update(dt) {
    const now = performance.now();
    
    // TIME SYSTEM
    const totalDrain = Game.baseDrain;
    Game.time -= totalDrain * dt;
    if (Game.time > Game.maxTime) Game.time = Game.maxTime;
    
    if (Game.time <= 0) {
        Game.state = 'gameover';
        ui.screens.gameover.classList.add('active');
        document.getElementById('final-level').innerText = Game.level;
        return;
    }

    // Controls
    let dx = 0, dy = 0;
    if (Game.input.keys['KeyW'] || Game.input.keys['ArrowUp']) dy = -1;
    if (Game.input.keys['KeyS'] || Game.input.keys['ArrowDown']) dy = 1;
    if (Game.input.keys['KeyA'] || Game.input.keys['ArrowLeft']) dx = -1;
    if (Game.input.keys['KeyD'] || Game.input.keys['ArrowRight']) dx = 1;

    // Merge Joystick
    if (Game.input.joystick.active) {
        dx = Game.input.joystick.x;
        dy = Game.input.joystick.y;
    }

    // Normalize
    const len = Math.hypot(dx, dy);
    if (len > 0.1) {
        const speed = Game.player.speed;
        // If keyboard, normalize to 1
        const scale = Game.input.joystick.active ? 1 : (1/len);
        Game.player.x += dx * scale * speed;
        Game.player.y += dy * scale * speed;
    }

    // Camera
    Game.camera.x = Game.player.x - width / 2;
    Game.camera.y = Game.player.y - height / 2;

    // Auto Shoot
    if (now - Game.stats.lastShot > Game.stats.fireRate && Game.enemies.length > 0) {
        // Find closest
        let closest = null;
        let minDist = Infinity;
        for (let e of Game.enemies) {
            const d = Math.hypot(e.x - Game.player.x, e.y - Game.player.y);
            if (d < minDist) { minDist = d; closest = e; }
        }

        if (closest && minDist < 600) {
            const angle = Math.atan2(closest.y - Game.player.y, closest.x - Game.player.x);
            
            for (let i = 0; i < Game.stats.multishot; i++) {
                const spread = (i - (Game.stats.multishot-1)/2) * 0.2;
                Game.bullets.push({
                    x: Game.player.x, y: Game.player.y,
                    vx: Math.cos(angle + spread) * Game.stats.bulletSpeed,
                    vy: Math.sin(angle + spread) * Game.stats.bulletSpeed,
                    life: 100
                });
            }
            AudioEngine.playShoot();
            Game.stats.lastShot = now;
            Game.shake = 2;
        }
    }

    // Bullets
    for (let i = Game.bullets.length - 1; i >= 0; i--) {
        const b = Game.bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
        
        // Collision
        let hit = false;
        for (let j = Game.enemies.length - 1; j >= 0; j--) {
            const e = Game.enemies[j];
            if (Math.hypot(b.x - e.x, b.y - e.y) < e.size + 5) {
                e.hp -= Game.stats.damage;
                createParticles(e.x, e.y, e.color, 3);
                AudioEngine.playHit();
                
                // Knockback
                const kAngle = Math.atan2(e.y - b.y, e.x - b.x);
                e.x += Math.cos(kAngle) * (5 + (Game.stats.knockback || 0));
                e.y += Math.sin(kAngle) * (5 + (Game.stats.knockback || 0));

                if (e.hp <= 0) {
                    Game.enemies.splice(j, 1);
                    Game.score++;
                    Game.xp++;
                    Game.time += (Game.timePerKill || 2);
                    createParticles(e.x, e.y, e.color, 10);
                    AudioEngine.playEnemyDeath();
                    
                    if (Math.random() > 0.9) {
                        Game.orbs.push({x: e.x, y: e.y, type: 'time'});
                    }
                }
                hit = true;
                break;
            }
        }
        if (hit || b.life <= 0) Game.bullets.splice(i, 1);
    }

    // Enemies
    if (Game.enemies.length < 10 + Game.level * 2) {
        if (Math.random() < 0.05 + (Game.level * 0.01)) spawnEnemy();
    }

    for (let e of Game.enemies) {
        const angle = Math.atan2(Game.player.y - e.y, Game.player.x - e.x);
        e.x += Math.cos(angle) * e.speed;
        e.y += Math.sin(angle) * e.speed;

        // Player Hit
        if (Math.hypot(Game.player.x - e.x, Game.player.y - e.y) < Game.player.size + e.size) {
            // No HP, direct time drain
            let drain = 5;
            if (e.type === 'drainer') drain = 10;
            if (e.type === 'elite') drain = 15;
            
            Game.time -= drain * dt;
            Game.shake = 10;
            createParticles(Game.player.x, Game.player.y, '#fff', 5);
            
            // Push enemy away
            e.x -= Math.cos(angle) * 50;
            e.y -= Math.sin(angle) * 50;
            AudioEngine.playWarning();
        }
    }

    // Orbs
    for (let i = Game.orbs.length - 1; i >= 0; i--) {
        const o = Game.orbs[i];
        const d = Math.hypot(Game.player.x - o.x, Game.player.y - o.y);
        
        // Magnet
        if (d < 150) {
            o.x += (Game.player.x - o.x) * 0.1;
            o.y += (Game.player.y - o.y) * 0.1;
        }

        if (d < 30) {
            Game.time += 5;
            AudioEngine.playCollect();
            Game.orbs.splice(i, 1);
        }
    }

    // Level Up
    if (Game.xp >= Game.xpToNext) {
        triggerLevelUp();
    }

    // Particles
    Game.particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
        if(p.life <= 0) Game.particles.splice(i, 1);
    });

    // Shake Decay
    if (Game.shake > 0) Game.shake *= 0.9;
    if (Game.shake < 0.5) Game.shake = 0;
}

function createParticles(x, y, color, count) {
    for(let i=0; i<count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5;
        Game.particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color,
            life: 1.0
        });
    }
}

function draw() {
    ctx.clearRect(0, 0, width, height);

    // Screen Shake
    ctx.save();
    if (Game.shake > 0) {
        ctx.translate(Math.random()*Game.shake - Game.shake/2, Math.random()*Game.shake - Game.shake/2);
    }

    // World Grid (Parallax Illusion)
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    const gridSize = 100;
    const offX = -Game.camera.x % gridSize;
    const offY = -Game.camera.y % gridSize;
    
    ctx.beginPath();
    for (let x = offX; x < width; x += gridSize) {
        ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    for (let y = offY; y < height; y += gridSize) {
        ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Transform for game world
    ctx.translate(-Game.camera.x, -Game.camera.y);

    // Orbs
    for (let o of Game.orbs) {
        ctx.fillStyle = '#00ff9d';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ff9d';
        ctx.beginPath();
        ctx.arc(o.x, o.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Enemies
    for (let e of Game.enemies) {
        ctx.fillStyle = e.color;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (e.type === 'drainer') {
            ctx.moveTo(e.x, e.y - e.size);
            ctx.lineTo(e.x + e.size, e.y);
            ctx.lineTo(e.x, e.y + e.size);
            ctx.lineTo(e.x - e.size, e.y);
        } else {
            ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
    }

    // Bullets
    ctx.fillStyle = '#00f3ff';
    for (let b of Game.bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Player
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00f3ff';
    ctx.beginPath();
    ctx.arc(Game.player.x, Game.player.y, Game.player.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Particles
    for (let p of Game.particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fillRect(p.x, p.y, 4, 4);
        ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Low Time Visual Effect (Chromatic Aberration simulation)
    if (Game.time < 15) {
        document.getElementById('ui-layer').classList.add('low-time-alert');
        ctx.fillStyle = 'rgba(255, 0, 85, 0.1)';
        ctx.fillRect(0, 0, width, height);
        
        // Heartbeat Sound
        if (Math.floor(Date.now() / (Game.time * 20)) % 2 === 0) {
            // Simple visual indicator of heartbeat
            ctx.strokeStyle = 'rgba(255,0,0,0.5)';
            ctx.lineWidth = 10;
            ctx.strokeRect(0,0,width,height);
        }
    } else {
        document.getElementById('ui-layer').classList.remove('low-time-alert');
    }

    // UI Updates
    ui.time.innerText = Game.time.toFixed(2);
    ui.drain.innerText = `-${Game.baseDrain.toFixed(2)}/s`;
    ui.level.innerText = Game.level;
    ui.score.innerText = Game.score;

    if (Game.time < 10) ui.time.classList.add('bad');
    else ui.time.classList.remove('bad');
}

function loop(timestamp) {
    if (Game.state === 'playing') {
        const dt = (timestamp - Game.lastTime) / 1000;
        if (dt < 0.1) update(dt); // Cap lag
        draw();
    }
    Game.lastTime = timestamp;
    requestAnimationFrame(loop);
}

// UI Handlers
document.getElementById('start-btn').onclick = initGame;
document.getElementById('restart-btn').onclick = initGame;

// Initial Draw
ctx.fillStyle = '#050505';
ctx.fillRect(0,0,canvas.width, canvas.height);
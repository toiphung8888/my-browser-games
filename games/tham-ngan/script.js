/* =========================================
   AUDIO SYSTEM (Throttled)
   ========================================= */
const AudioSys = {
    ctx: null,
    // Keep track of the last time a sound type played
    lastPlayed: {}, 

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    playTone(key, type, freq, duration, vol = 0.1, slide = 0) {
        if (!this.ctx) return;
        
        // --- THROTTLE FIX ---
        // If this sound key played less than 50ms ago, skip it.
        const now = this.ctx.currentTime;
        if (this.lastPlayed[key] && now - this.lastPlayed[key] < 0.05) {
            return;
        }
        this.lastPlayed[key] = now;
        // --------------------

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (slide !== 0) {
            osc.frequency.exponentialRampToValueAtTime(freq + slide, now + duration);
        }

        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(now + duration);
    },

    // Pass a unique 'key' as the first argument to group sounds
    shoot()   { this.playTone('shoot', 'square', 400, 0.1, 0.05, -200); },
    hit()     { this.playTone('hit', 'sawtooth', 100, 0.1, 0.05, -50); },
    kill()    { this.playTone('kill', 'sawtooth', 80, 0.2, 0.08, -80); },
    hurt()    { this.playTone('hurt', 'sine', 150, 0.3, 0.2, -100); },
    powerup() { this.playTone('powerup', 'sine', 600, 0.3, 0.1, 300); },
    
    levelUp() { 
        // Level up sounds shouldn't be throttled heavily, so we use different keys
        this.playTone('lvl1', 'sine', 440, 0.2, 0.1); 
        setTimeout(() => this.playTone('lvl2', 'sine', 554, 0.2, 0.1), 150);
        setTimeout(() => this.playTone('lvl3', 'sine', 659, 0.4, 0.1), 300);
    }
};
/* =========================================
   GAME ENGINE & STATE
   ========================================= */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- PATCH: Animation ID tracker ---
let animationId = null;

let width, height;
const resize = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
};
window.addEventListener('resize', resize);
resize();

// Game State
const state = {
    running: false,
    paused: false,
    frame: 0,
    score: 0,
    camera: { x: 0, y: 0, shake: 0 }
};

// Input State
const input = {
    keys: {},
    joy: { active: false, x: 0, y: 0 } // x,y range -1 to 1
};

/* =========================================
   ENTITIES
   ========================================= */
class Entity {
    constructor(x, y, radius, color) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.markedForDeletion = false;
    }
    draw(ctx, camX, camY) {
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y - camY, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }
}

class Particle extends Entity {
    constructor(x, y, color, speed, life) {
        super(x, y, Math.random() * 3 + 1, color);
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = life;
        this.maxLife = life;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
        this.radius *= 0.95; // Shrink
        if (this.life <= 0) this.markedForDeletion = true;
    }
}

class Bullet extends Entity {
    constructor(x, y, angle) {
        super(x, y, 4, '#ffee00');
        const speed = 12;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 60; // Despawn after distance
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
        if (this.life <= 0) this.markedForDeletion = true;
    }
}

class Item extends Entity {
    constructor(x, y) {
        super(x, y, 8, '#00ff00');
        this.bobOffset = Math.random() * 100;
    }
    update() {
        // Visual bobbing effect
    }
    draw(ctx, camX, camY) {
        const pulse = Math.sin((state.frame + this.bobOffset) * 0.1) * 2;
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y - camY, this.radius + pulse, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

class Enemy extends Entity {
    constructor(x, y, type) {
        super(x, y, type === 'elite' ? 20 : 12, type === 'elite' ? '#ff004c' : '#aa00ff');
        this.type = type;
        this.hp = type === 'elite' ? 50 : 3;
        this.speed = type === 'elite' ? 1.5 : 2 + (state.score / 500);
        this.pushX = 0;
        this.pushY = 0;
        this.dashTimer = 0;
    }

    update(player) {
        this.pushX *= 0.9;
        this.pushY *= 0.9;

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const angle = Math.atan2(dy, dx);

        let currentSpeed = this.speed;

        // Elite Dash Mechanic
        if (this.type === 'elite') {
            this.dashTimer++;
            if (this.dashTimer > 200) { 
                currentSpeed = 8;
                if (this.dashTimer > 220) this.dashTimer = 0;
                if (state.frame % 3 === 0) {
                    particles.push(new Particle(this.x, this.y, 'rgba(255,0,76,0.5)', 0, 10));
                }
            }
        }

        this.x += (Math.cos(angle) * currentSpeed) + this.pushX;
        this.y += (Math.sin(angle) * currentSpeed) + this.pushY;
    }

    takeDamage(dmg) {
        this.hp -= dmg;
        this.pushX = (Math.random() - 0.5) * 5;
        this.pushY = (Math.random() - 0.5) * 5;
        AudioSys.hit();
        if (this.hp <= 0) {
            this.markedForDeletion = true;
            AudioSys.kill();
            spawnParticles(this.x, this.y, this.color, 5);
            return true; // killed
        }
        return false;
    }
}

class Player extends Entity {
    constructor() {
        super(0, 0, 15, '#00f0ff');
        this.speed = 4;
        this.maxHp = 100;
        this.hp = 100;
        this.xp = 0;
        this.level = 1;
        this.nextLevelXp = 20;
        this.fireRate = 15;
        this.damage = 1;
        this.bulletCount = 1;
        this.cooldown = 0;
    }

    update() {
        // Movement
        let dx = 0;
        let dy = 0;

        if (input.keys['w']) dy -= 1;
        if (input.keys['s']) dy += 1;
        if (input.keys['a']) dx -= 1;
        if (input.keys['d']) dx += 1;

        if (input.joy.active) {
            dx = input.joy.x;
            dy = input.joy.y;
        }

        if (!input.joy.active && (dx !== 0 || dy !== 0)) {
            const len = Math.hypot(dx, dy);
            dx /= len;
            dy /= len;
        }

        this.x += dx * this.speed;
        this.y += dy * this.speed;

        // Auto Shoot
        this.cooldown--;
        if (this.cooldown <= 0) {
            this.shoot();
            this.cooldown = this.fireRate;
        }
    }

    shoot() {
        let closest = null;
        let minDist = Infinity;
        
        for (const e of enemies) {
            const d = Math.hypot(e.x - this.x, e.y - this.y);
            if (d < minDist) {
                minDist = d;
                closest = e;
            }
        }

        let angle = 0;
        if (closest && minDist < 600) {
            angle = Math.atan2(closest.y - this.y, closest.x - this.x);
        } else {
             angle = state.frame * 0.1;
        }

        const spread = 0.2;
        const startAngle = angle - (spread * (this.bulletCount - 1)) / 2;

        for (let i = 0; i < this.bulletCount; i++) {
            bullets.push(new Bullet(this.x, this.y, startAngle + (spread * i)));
        }
        AudioSys.shoot();
    }

    gainXp(amount) {
        this.xp += amount;
        if (this.xp >= this.nextLevelXp) {
            this.levelUp();
        }
        updateUI();
    }

    levelUp() {
        this.level++;
        this.xp -= this.nextLevelXp;
        this.nextLevelXp = Math.floor(this.nextLevelXp * 1.5);
        this.hp = this.maxHp; 
        
        const upgrade = Math.random();
        if (upgrade < 0.33) {
            this.fireRate = Math.max(5, this.fireRate - 2);
            spawnFloatingText("FIRE RATE UP!", this.x, this.y - 30);
        } else if (upgrade < 0.66) {
            this.damage += 1; 
            spawnFloatingText("DAMAGE UP!", this.x, this.y - 30);
        } else {
            this.bulletCount++; 
            spawnFloatingText("MULTI-SHOT UP!", this.x, this.y - 30);
        }
        
        AudioSys.levelUp();
        particles.push(new Particle(this.x, this.y, '#fff', 0, 20)); 
    }
}

/* =========================================
   GLOBALS & UTILS
   ========================================= */
const player = new Player();
let enemies = [];
let bullets = [];
let particles = [];
let items = [];
let floatingTexts = [];

function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color, Math.random() * 5, 20 + Math.random() * 20));
    }
}

function spawnFloatingText(text, x, y) {
    floatingTexts.push({text, x, y, life: 60});
}

function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const dist = (Math.max(width, height) / 2) + 100;
    const ex = player.x + Math.cos(angle) * dist;
    const ey = player.y + Math.sin(angle) * dist;
    const isElite = (state.score > 50 && Math.random() < 0.1);
    enemies.push(new Enemy(ex, ey, isElite ? 'elite' : 'normal'));
}

/* =========================================
   INPUT HANDLING
   ========================================= */
window.addEventListener('keydown', e => input.keys[e.key] = true);
window.addEventListener('keyup', e => input.keys[e.key] = false);

const joyZone = document.getElementById('joystick-zone');
const joyKnob = document.getElementById('joystick-knob');
let joyTouchId = null;
let joyCenter = { x: 0, y: 0 };

joyZone.addEventListener('touchstart', e => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    joyTouchId = touch.identifier;
    const rect = joyZone.getBoundingClientRect();
    joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    input.joy.active = true;
    updateJoystick(touch);
}, {passive: false});

joyZone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joyTouchId) {
            updateJoystick(e.changedTouches[i]);
            break;
        }
    }
}, {passive: false});

const endJoystick = (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joyTouchId) {
            input.joy.active = false;
            input.joy.x = 0;
            input.joy.y = 0;
            joyKnob.style.transform = `translate(-50%, -50%)`;
            joyTouchId = null;
        }
    }
};

joyZone.addEventListener('touchend', endJoystick);
joyZone.addEventListener('touchcancel', endJoystick);

function updateJoystick(touch) {
    const maxDist = 60;
    let dx = touch.clientX - joyCenter.x;
    let dy = touch.clientY - joyCenter.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist > maxDist) {
        const angle = Math.atan2(dy, dx);
        dx = Math.cos(angle) * maxDist;
        dy = Math.sin(angle) * maxDist;
    }
    
    joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    input.joy.x = dx / maxDist;
    input.joy.y = dy / maxDist;
}

/* =========================================
   CORE GAME LOOP
   ========================================= */
function initGame() {
    // --- PATCH: Stop any running loop first ---
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    enemies = [];
    bullets = [];
    particles = [];
    items = [];
    player.x = 0;
    player.y = 0;
    player.hp = player.maxHp;
    player.xp = 0;
    player.level = 1;
    player.nextLevelXp = 20;
    player.fireRate = 15;
    player.bulletCount = 1;
    state.score = 0;
    state.frame = 0;
    
    state.running = true;
    state.paused = false;
    
    updateUI();
    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('game-over-screen').classList.remove('active');
    
    AudioSys.init();
    loop();
}

function updateUI() {
    document.getElementById('hp-bar').style.width = `${(player.hp / player.maxHp) * 100}%`;
    document.getElementById('xp-bar').style.width = `${(player.xp / player.nextLevelXp) * 100}%`;
    document.getElementById('level-display').innerText = player.level;
    document.getElementById('score-display').innerText = state.score;
}

function drawGrid(camX, camY) {
    const gridSize = 100;
    const offX = -camX % gridSize;
    const offY = -camY % gridSize;
    
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let x = offX; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    for (let y = offY; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();
}

function loop() {
    if (!state.running) return;
    if (state.paused) {
        // --- PATCH: Save ID even when paused ---
        animationId = requestAnimationFrame(loop);
        return;
    }

    if (state.frame % 60 === 0 && enemies.length < 50 + (player.level * 2)) {
        spawnEnemy();
    }
    if (state.frame % 600 === 0) {
        const angle = Math.random() * Math.PI * 2;
        items.push(new Item(player.x + Math.cos(angle)*300, player.y + Math.sin(angle)*300));
    }

    player.update();
    
    state.camera.x = player.x - width / 2;
    state.camera.y = player.y - height / 2;

    if (state.camera.shake > 0) {
        state.camera.x += (Math.random() - 0.5) * state.camera.shake;
        state.camera.y += (Math.random() - 0.5) * state.camera.shake;
        state.camera.shake *= 0.9;
        if(state.camera.shake < 0.5) state.camera.shake = 0;
    }

    bullets.forEach(b => b.update());
    enemies.forEach(e => e.update(player));
    particles.forEach(p => p.update());
    items.forEach(i => i.update());

    // Collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        let hit = false;
        for (let e of enemies) {
            const dx = b.x - e.x;
            const dy = b.y - e.y;
            if (dx*dx + dy*dy < (b.radius + e.radius)**2) {
                if (e.takeDamage(player.damage)) {
                    state.score++;
                    player.gainXp(e.type === 'elite' ? 5 : 1);
                    if (e.type === 'elite') state.camera.shake = 10;
                }
                spawnParticles(b.x, b.y, '#ffee00', 3);
                hit = true;
                break; 
            }
        }
        if (hit) b.markedForDeletion = true;
    }

    for (let e of enemies) {
        const dx = e.x - player.x;
        const dy = e.y - player.y;
        if (dx*dx + dy*dy < (e.radius + player.radius)**2) {
            player.hp -= 0.5; 
            if (state.frame % 20 === 0) AudioSys.hurt();
            state.camera.shake = 5;
            updateUI();
            if (player.hp <= 0) {
                gameOver();
            }
        }
    }

    for (let i of items) {
        const dx = i.x - player.x;
        const dy = i.y - player.y;
        if (dx*dx + dy*dy < (i.radius + player.radius)**2) {
            player.hp = Math.min(player.hp + 20, player.maxHp);
            AudioSys.powerup();
            updateUI();
            i.markedForDeletion = true;
            spawnFloatingText("+HP", player.x, player.y - 20);
        }
    }

    bullets = bullets.filter(b => !b.markedForDeletion);
    enemies = enemies.filter(e => !e.markedForDeletion);
    particles = particles.filter(p => !p.markedForDeletion);
    items = items.filter(i => !i.markedForDeletion);
    floatingTexts = floatingTexts.filter(t => t.life > 0);

    ctx.clearRect(0, 0, width, height);
    
    drawGrid(state.camera.x, state.camera.y);

    items.forEach(i => i.draw(ctx, state.camera.x, state.camera.y));
    bullets.forEach(b => b.draw(ctx, state.camera.x, state.camera.y));
    enemies.forEach(e => e.draw(ctx, state.camera.x, state.camera.y));
    player.draw(ctx, state.camera.x, state.camera.y);
    particles.forEach(p => p.draw(ctx, state.camera.x, state.camera.y));

    ctx.font = "bold 20px Courier New";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    floatingTexts.forEach(t => {
        ctx.fillText(t.text, t.x - state.camera.x, t.y - state.camera.y);
        t.y -= 1;
        t.life--;
    });

    state.frame++;
    // --- PATCH: Capture ID ---
    animationId = requestAnimationFrame(loop);
}

function gameOver() {
    state.running = false;
    // --- PATCH: Stop loop immediately ---
    if (animationId) cancelAnimationFrame(animationId);
    
    document.getElementById('final-level').innerText = player.level;
    document.getElementById('final-score').innerText = state.score;
    document.getElementById('game-over-screen').classList.add('active');
}

// UI Buttons
document.getElementById('start-btn').addEventListener('click', initGame);
document.getElementById('restart-btn').addEventListener('click', initGame);
document.getElementById('pause-btn').addEventListener('click', () => {
    state.paused = !state.paused;
    document.getElementById('pause-btn').innerText = state.paused ? "|>" : "||";

});

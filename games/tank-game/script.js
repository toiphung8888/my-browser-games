/* ================= CONFIGURATION ================= */
const CONFIG = {
    PLAYER_SPEED: 5,
    PLAYER_MAX_HP: 100,
    PLAYER_RELOAD_TIME: 15, // Frames
    BULLET_SPEED: 12,
    ENEMY_SPAWN_RATE: 100, // Frames
    MAX_ENEMIES_BASE: 3
};

const COLORS = {
    playerBody: '#00f0ff',
    playerTurret: '#00a8b3',
    enemyBody: '#ff0055',
    enemyTurret: '#b3003b',
    bulletPlayer: '#ccfbff',
    bulletEnemy: '#ffccda',
    grid: '#222'
};

/* ================= AUDIO SYSTEM (PROCEDURAL) ================= */
class SoundManager {
    constructor() {
        // Khởi tạo AudioContext (hỗ trợ cả Webkit cho Safari cũ)
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0.3; // Âm lượng tổng
        
        this.isMuted = false;
        this.isPlaying = false;
        
        // Cấu hình nhạc nền (Bassline)
        this.nextNoteTime = 0;
        this.tempo = 0.2; // Tốc độ cơ bản
        this.notes = [110, 110, 110, 87, 110, 110, 87, 130]; // Dãy nốt Hz
        this.noteIndex = 0;
        this.timerID = null;
    }

    // Kích hoạt AudioContext (Cần thiết vì trình duyệt chặn Autoplay)
    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // Hiệu ứng bắn súng (Pew Pew)
    playShoot() {
        if (this.isMuted) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.type = 'sawtooth'; 
        osc.frequency.setValueAtTime(800, t); 
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.15); 

        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

        osc.start(t);
        osc.stop(t + 0.15);
    }

    // Hiệu ứng nổ (White Noise)
    playExplosion() {
        if (this.isMuted) return;
        const t = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.5; 
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;

        const gain = this.ctx.createGain();
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        gain.gain.setValueAtTime(0.8, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

        noise.start(t);
    }

    // Bắt đầu nhạc nền
    startMusic() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.nextNoteTime = this.ctx.currentTime;
        this.scheduleNotes();
    }

    // Dừng nhạc nền
    stopMusic() {
        this.isPlaying = false;
        if(this.timerID) clearTimeout(this.timerID);
    }

    // Tăng tốc nhạc theo Wave
    updateTempo(wave) {
        // Giới hạn tốc độ nhanh nhất là 0.1s/beat
        this.tempo = Math.max(0.1, 0.25 - (wave * 0.015)); 
    }

    scheduleNotes() {
        if (!this.isPlaying) return;

        // Lên lịch nốt nhạc trước 0.1s để tránh bị khựng
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.playNote(this.nextNoteTime);
            this.nextNoteTime += this.tempo;
        }
        
        this.timerID = setTimeout(() => this.scheduleNotes(), 25);
    }

    playNote(time) {
        if (this.isMuted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.type = 'square';
        osc.frequency.value = this.notes[this.noteIndex];
        
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

        osc.start(time);
        osc.stop(time + 0.1);

        this.noteIndex = (this.noteIndex + 1) % this.notes.length;
    }
}

// Khởi tạo Audio Manager toàn cục
const audio = new SoundManager();

/* ================= CANVAS SETUP ================= */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ================= STATE MANAGEMENT ================= */
let gameRunning = false;
let paused = false;
let animationId = null;
let score = 0;
let wave = 1;
let frames = 0;

// Entities
let player;
let enemies = [];
let bullets = [];
let particles = [];
let shakeIntensity = 0;

// Input State
const keys = { w: false, a: false, s: false, d: false };
const mouse = { x: canvas.width / 2, y: canvas.height / 2, down: false };

/* ================= CLASSES ================= */

class GameObject {
    constructor(x, y, radius, color) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.markedForDeletion = false;
    }
}

class Particle extends GameObject {
    constructor(x, y, color, speed) {
        super(x, y, Math.random() * 3 + 1, color);
        this.vx = (Math.random() - 0.5) * speed;
        this.vy = (Math.random() - 0.5) * speed;
        this.alpha = 1;
        this.decay = Math.random() * 0.03 + 0.01;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
        if (this.alpha <= 0) this.markedForDeletion = true;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }
}

class Bullet extends GameObject {
    constructor(x, y, angle, isEnemy) {
        super(x, y, 5, isEnemy ? COLORS.bulletEnemy : COLORS.bulletPlayer);
        this.vx = Math.cos(angle) * CONFIG.BULLET_SPEED;
        this.vy = Math.sin(angle) * CONFIG.BULLET_SPEED;
        this.isEnemy = isEnemy;
        this.damage = 10;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class Tank extends GameObject {
    constructor(x, y, colorBody, colorTurret) {
        super(x, y, 22, colorBody);
        this.colorTurret = colorTurret;
        this.angle = 0;
        this.turretAngle = 0;
        this.hp = 100;
        this.maxHp = 100;
        this.cooldown = 0;
        this.width = 44;
        this.height = 44;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Body
        ctx.rotate(this.angle);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        ctx.shadowBlur = 0;
        
        // Tracks
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-this.width/2 - 6, -this.height/2 + 4, 6, this.height - 8);
        ctx.fillRect(this.width/2, -this.height/2 + 4, 6, this.height - 8);
        
        // Turret
        ctx.rotate(-this.angle); 
        ctx.rotate(this.turretAngle);
        ctx.fillStyle = '#333';
        ctx.fillRect(0, -6, 32, 12);
        ctx.fillStyle = this.colorTurret;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // HP Bar
        if (this.hp < this.maxHp) {
            const hpPct = Math.max(0, this.hp / this.maxHp);
            ctx.fillStyle = '#555';
            ctx.fillRect(this.x - 25, this.y - 50, 50, 6);
            ctx.fillStyle = hpPct > 0.5 ? '#0f0' : '#f00';
            ctx.fillRect(this.x - 25, this.y - 50, 50 * hpPct, 6);
        }
    }

    takeDamage(amount) {
        this.hp -= amount;
        createExplosion(this.x, this.y, 3, 'orange');
        if (this.hp <= 0) {
            this.markedForDeletion = true;
            createExplosion(this.x, this.y, 25, this.color);
            shakeScreen(5);
            audio.playExplosion(); // Kích hoạt âm thanh nổ
        }
    }
}

class Player extends Tank {
    constructor() {
        super(canvas.width / 2, canvas.height / 2, COLORS.playerBody, COLORS.playerTurret);
        this.hp = CONFIG.PLAYER_MAX_HP;
        this.maxHp = CONFIG.PLAYER_MAX_HP;
    }

    update() {
        let dx = 0, dy = 0;
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx*dx + dy*dy);
            dx /= len; dy /= len;
            this.x += dx * CONFIG.PLAYER_SPEED;
            this.y += dy * CONFIG.PLAYER_SPEED;
            this.angle = lerpAngle(this.angle, Math.atan2(dy, dx), 0.15);
        }

        this.x = Math.max(30, Math.min(canvas.width - 30, this.x));
        this.y = Math.max(30, Math.min(canvas.height - 30, this.y));

        this.turretAngle = Math.atan2(mouse.y - this.y, mouse.x - this.x);

        if (this.cooldown > 0) this.cooldown--;
        if (mouse.down && this.cooldown <= 0) {
            shoot(this, false);
            this.cooldown = CONFIG.PLAYER_RELOAD_TIME;
        }
    }
}

class Enemy extends Tank {
    constructor(x, y) {
        super(x, y, COLORS.enemyBody, COLORS.enemyTurret);
        this.speed = 2 + (wave * 0.2);
        this.reloadTime = Math.max(40, 100 - (wave * 8));
        this.hp = 30 + (wave * 10);
        this.maxHp = this.hp;
        this.moveAngle = Math.random() * Math.PI * 2;
        this.changeDirTimer = 0;
    }

    update(player) {
        if (!player) return;

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        this.turretAngle = Math.atan2(dy, dx);

        if (dist > 300) {
            this.x += Math.cos(this.turretAngle) * this.speed;
            this.y += Math.sin(this.turretAngle) * this.speed;
            this.angle = this.turretAngle;
        } else {
            this.changeDirTimer--;
            if (this.changeDirTimer <= 0) {
                this.moveAngle = this.turretAngle + (Math.PI/2) * (Math.random() < 0.5 ? 1 : -1);
                this.changeDirTimer = 40 + Math.random() * 40;
            }
            this.x += Math.cos(this.moveAngle) * this.speed;
            this.y += Math.sin(this.moveAngle) * this.speed;
            this.angle = lerpAngle(this.angle, this.moveAngle, 0.1);
        }

        this.x = Math.max(30, Math.min(canvas.width - 30, this.x));
        this.y = Math.max(30, Math.min(canvas.height - 30, this.y));

        if (this.cooldown > 0) this.cooldown--;
        if (dist < 700 && this.cooldown <= 0) {
            shoot(this, true);
            this.cooldown = this.reloadTime;
        }
    }
}

/* ================= GAME ENGINE & LOGIC ================= */

function initGame() {
    score = 0;
    wave = 1;
    frames = 0;
    shakeIntensity = 0;
    enemies = [];
    bullets = [];
    particles = [];
    player = new Player();
    updateHUD();
}

function startGame() {
    // Kích hoạt âm thanh khi người dùng tương tác
    audio.resume();
    audio.startMusic();
    audio.updateTempo(1);

    initGame();
    gameRunning = true;
    paused = false;

    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById('game-over-screen').classList.remove('active');
    
    if (animationId) cancelAnimationFrame(animationId);
    animate();
}

function gameOver() {
    gameRunning = false;
    audio.stopMusic(); // Dừng nhạc
    document.getElementById('game-over-screen').classList.add('active');
    document.getElementById('final-score').innerText = score;
}

function update() {
    frames++;

    // Spawning
    if (frames % CONFIG.ENEMY_SPAWN_RATE === 0 && enemies.length < CONFIG.MAX_ENEMIES_BASE + wave) {
        spawnEnemy();
    }

    player.update();
    enemies.forEach(e => e.update(player));
    bullets.forEach(b => b.update());
    particles.forEach(p => p.update());

    checkCollisions();

    bullets = bullets.filter(b => !b.markedForDeletion);
    enemies = enemies.filter(e => !e.markedForDeletion);
    particles = particles.filter(p => !p.markedForDeletion);

    if (player.hp <= 0) {
        gameOver();
    }
}

function spawnEnemy() {
    let ex, ey;
    if (Math.random() < 0.5) {
        ex = Math.random() < 0.5 ? -50 : canvas.width + 50;
        ey = Math.random() * canvas.height;
    } else {
        ex = Math.random() * canvas.width;
        ey = Math.random() < 0.5 ? -50 : canvas.height + 50;
    }
    enemies.push(new Enemy(ex, ey));
}

function checkCollisions() {
    bullets.forEach(b => {
        if (b.isEnemy) {
            if (!b.markedForDeletion && checkCircleCollision(b, player)) {
                player.takeDamage(b.damage);
                b.markedForDeletion = true;
                shakeScreen(4);
                updateHUD();
            }
        } else {
            enemies.forEach(e => {
                if (!b.markedForDeletion && !e.markedForDeletion && checkCircleCollision(b, e)) {
                    e.takeDamage(b.damage);
                    b.markedForDeletion = true;
                    if (e.markedForDeletion) {
                        score += 100;
                        if (score % 500 === 0) {
                            wave++;
                            audio.updateTempo(wave); // Tăng tốc nhạc
                        }
                        updateHUD();
                    }
                }
            });
        }
    });
}

function checkCircleCollision(c1, c2) {
    const dist = Math.sqrt((c1.x - c2.x)**2 + (c1.y - c2.y)**2);
    return dist < c1.radius + c2.radius;
}

/* ================= RENDERING ================= */

function draw() {
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();

    ctx.save();
    if (shakeIntensity > 0) {
        const dx = (Math.random() - 0.5) * shakeIntensity;
        const dy = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(dx, dy);
        shakeIntensity *= 0.9;
        if (shakeIntensity < 0.5) shakeIntensity = 0;
    }

    particles.forEach(p => p.draw(ctx));
    bullets.forEach(b => b.draw(ctx));
    enemies.forEach(e => e.draw(ctx));
    if (player && player.hp > 0) player.draw(ctx);

    ctx.restore();
}

function drawGrid() {
    ctx.strokeStyle = '#1e1e1e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = 0; y <= canvas.height; y += 50) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();
}

/* ================= MAIN LOOP ================= */

function animate() {
    if (!gameRunning) return;

    if (!paused) {
        update();
    }
    
    draw();
    animationId = requestAnimationFrame(animate);
}

/* ================= UTILS & UI ================= */

function shoot(tank, isEnemy) {
    const mx = tank.x + Math.cos(tank.turretAngle) * 35;
    const my = tank.y + Math.sin(tank.turretAngle) * 35;
    bullets.push(new Bullet(mx, my, tank.turretAngle, isEnemy));
    audio.playShoot(); // Kích hoạt âm thanh bắn
}

function createExplosion(x, y, count, color) {
    for(let i=0; i<count; i++) particles.push(new Particle(x, y, color, 8));
}

function shakeScreen(amount) { 
    shakeIntensity = amount; 
}

function lerpAngle(a, b, t) {
    const da = (b - a) % (2 * Math.PI);
    return a + ((2 * da) % (2 * Math.PI) - da) * t;
}

function updateHUD() {
    document.getElementById('score-val').innerText = score;
    document.getElementById('wave-val').innerText = wave;
    if (player) {
        const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
        document.getElementById('health-fill').style.width = hpPct + '%';
    }
}

function togglePause() {
    if (!gameRunning) return;
    paused = !paused;
    const pauseScreen = document.getElementById('pause-screen');
    if (paused) {
        pauseScreen.classList.add('active');
        audio.stopMusic();
    } else {
        pauseScreen.classList.remove('active');
        audio.startMusic();
    }
}

/* ================= EVENT LISTENERS ================= */

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('restart-btn').addEventListener('click', startGame);

    document.getElementById('pause-btn').addEventListener('click', togglePause);
    document.getElementById('resume-btn').addEventListener('click', togglePause);

    window.addEventListener('keydown', e => {
        if ('wasd'.includes(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
        if (e.key === 'Escape') togglePause();
    });

    window.addEventListener('keyup', e => {
        if ('wasd'.includes(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
    });

    window.addEventListener('mousemove', e => { 
        mouse.x = e.clientX; 
        mouse.y = e.clientY; 
    });
    
    window.addEventListener('mousedown', () => mouse.down = true);
    window.addEventListener('mouseup', () => mouse.down = false);
    
    draw(); 
});
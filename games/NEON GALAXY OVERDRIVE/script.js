/**
 * NEON GALAXY: OVERDRIVE - CORE ENGINE
 * Author: Gemini
 * Description: High-performance canvas rendering with Web Audio API synthesis.
 */

// --- CẤU HÌNH & KHỞI TẠO ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const scoreEl = document.getElementById('score-val');
const healthFill = document.getElementById('health-fill');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');

// Game State
let gameState = {
    isPlaying: false,
    score: 0,
    frames: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    mouse: { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false }
};

// Resize Handling
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gameState.width = canvas.width;
    gameState.height = canvas.height;
}
window.addEventListener('resize', resize);
resize();

// Input Handling
window.addEventListener('mousemove', (e) => {
    gameState.mouse.x = e.clientX;
    gameState.mouse.y = e.clientY;
});
window.addEventListener('mousedown', () => gameState.mouse.down = true);
window.addEventListener('mouseup', () => gameState.mouse.down = false);

// --- HỆ THỐNG ÂM THANH (AUDIO SYNTHESIZER) ---
// Không dùng file mp3, tự tạo âm thanh điện tử bằng sóng
const AudioSys = {
    ctx: null,
    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playTone: function(freq, type, duration, vol = 0.1) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type; // 'sine', 'square', 'sawtooth', 'triangle'
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    shoot: function() {
        // Tiếng súng laser (High frequency sweep down)
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    },
    explosion: function() {
        // Tiếng nổ trầm
        this.playTone(100, 'square', 0.3, 0.1);
        this.playTone(50, 'sawtooth', 0.4, 0.1);
    }
};

// --- HỆ THỐNG ĐỒ HỌA & ENTITIES ---

// 1. Lớp Nền Sao (Parallax Background)
class Star {
    constructor() {
        this.x = Math.random() * gameState.width;
        this.y = Math.random() * gameState.height;
        this.size = Math.random() * 2;
        this.speed = Math.random() * 3 + 0.5; // Sao gần chạy nhanh, xa chạy chậm
        this.brightness = Math.random();
    }
    update() {
        this.y += this.speed;
        if (this.y > gameState.height) {
            this.y = 0;
            this.x = Math.random() * gameState.width;
        }
    }
    draw() {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.brightness})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 2. Lớp Hạt (Particles - Hiệu ứng cháy nổ)
class Particle {
    constructor(x, y, color, speed) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * Math.random() * speed;
        this.vy = Math.sin(angle) * Math.random() * speed;
        this.life = 1.0; // Độ trong suốt
        this.decay = Math.random() * 0.03 + 0.01;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// 3. Lớp Đạn
class Bullet {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.speed = 15;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.markedForDeletion = false;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        // Xóa nếu ra khỏi màn hình
        if (this.x < 0 || this.x > gameState.width || this.y < 0 || this.y > gameState.height) {
            this.markedForDeletion = true;
        }
        // Tạo đuôi hạt (trail)
        if (Math.random() > 0.5) {
            particles.push(new Particle(this.x, this.y, '#00f3ff', 2));
        }
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f3ff';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// 4. Lớp Kẻ Thù (Enemy)
class Enemy {
    constructor(type) {
        this.radius = 20 + Math.random() * 10;
        // Xuất hiện ngẫu nhiên ở cạnh trên
        this.x = Math.random() * gameState.width;
        this.y = -this.radius; 
        this.color = `hsl(${Math.random() * 60 + 300}, 100%, 50%)`; // Tím -> Hồng
        this.speed = Math.random() * 2 + 1;
        this.type = type; // 'basic', 'chaser', 'shooter'
        this.health = Math.floor(this.radius / 5);
        this.markedForDeletion = false;
        
        // Góc xoay để tạo hiệu ứng
        this.angle = 0; 
        this.spinSpeed = Math.random() * 0.1 - 0.05;
    }
    
    update(player) {
        this.angle += this.spinSpeed;
        
        if (this.type === 'chaser') {
            // Logic đuổi theo người chơi
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy);
            this.x += (dx / dist) * (this.speed * 1.5);
            this.y += (dy / dist) * (this.speed * 1.5);
        } else {
            // Đi thẳng xuống
            this.y += this.speed;
            this.x += Math.sin(this.y * 0.05) * 2; // Lắc lư nhẹ
        }

        if (this.y > gameState.height + this.radius) {
            this.markedForDeletion = true;
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        
        // Vẽ hình lục giác
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            ctx.lineTo(this.radius * Math.cos(i * Math.PI / 3), this.radius * Math.sin(i * Math.PI / 3));
        }
        ctx.closePath();
        ctx.stroke();

        // Tâm sáng
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.3, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
    }
}

// 5. Lớp Người Chơi (Player)
class Player {
    constructor() {
        this.x = gameState.width / 2;
        this.y = gameState.height - 100;
        this.radius = 20;
        this.color = '#00f3ff';
        this.bullets = [];
        this.lastShot = 0;
        this.health = 100;
        this.maxHealth = 100;
    }

    update() {
        // Di chuyển mượt mà về phía chuột (Lerp)
        this.x += (gameState.mouse.x - this.x) * 0.1;
        this.y += (gameState.mouse.y - this.y) * 0.1;

        // Bắn súng
        if (gameState.mouse.down) {
            const now = Date.now();
            if (now - this.lastShot > 100) { // Tốc độ bắn
                this.shoot();
                this.lastShot = now;
            }
        }
    }

    shoot() {
        AudioSys.shoot();
        // Bắn 2 tia song song
        bullets.push(new Bullet(this.x - 15, this.y, -Math.PI / 2));
        bullets.push(new Bullet(this.x + 15, this.y, -Math.PI / 2));
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Hiệu ứng động cơ
        if (Math.random() < 0.8) {
             ctx.fillStyle = 'orange';
             ctx.beginPath();
             ctx.moveTo(-10, 20);
             ctx.lineTo(0, 40 + Math.random() * 20);
             ctx.lineTo(10, 20);
             ctx.fill();
        }

        // Vẽ tàu vũ trụ (Hình tam giác cách điệu)
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        ctx.fillStyle = '#000';

        ctx.beginPath();
        ctx.moveTo(0, -30);
        ctx.lineTo(20, 20);
        ctx.lineTo(0, 10);
        ctx.lineTo(-20, 20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}

// --- QUẢN LÝ GAME LOOP ---

let player;
let bullets = [];
let enemies = [];
let particles = [];
let stars = [];
let animationId;
let spawnInterval = 60; // Frames giữa các lần sinh quái

function init() {
    player = new Player();
    bullets = [];
    enemies = [];
    particles = [];
    stars = [];
    gameState.score = 0;
    gameState.frames = 0;
    spawnInterval = 60;
    scoreEl.innerText = 0;
    healthFill.style.width = '100%';

    // Tạo nền sao
    for(let i=0; i<100; i++) stars.push(new Star());
}

function spawnEnemies() {
    if (gameState.frames % spawnInterval === 0) {
        // Càng chơi lâu càng khó
        if (spawnInterval > 20 && gameState.frames % 500 === 0) spawnInterval -= 5;
        
        const type = Math.random() > 0.8 ? 'chaser' : 'basic';
        enemies.push(new Enemy(type));
    }
}

function checkCollisions() {
    // Đạn trúng địch
    bullets.forEach((bullet, bIndex) => {
        enemies.forEach((enemy, eIndex) => {
            const dist = Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y);
            if (dist < enemy.radius + 5) {
                // Hiệu ứng nổ hạt
                for (let i=0; i<8; i++) {
                    particles.push(new Particle(enemy.x, enemy.y, enemy.color, 4));
                }
                
                // Giảm máu địch hoặc tiêu diệt
                enemy.health--;
                bullet.markedForDeletion = true;
                
                if (enemy.health <= 0) {
                    AudioSys.explosion();
                    enemy.markedForDeletion = true;
                    gameState.score += 100;
                    scoreEl.innerText = gameState.score;
                    // Tạo nổ lớn hơn khi chết
                    for (let i=0; i<15; i++) {
                        particles.push(new Particle(enemy.x, enemy.y, '#fff', 6));
                    }
                }
            }
        });
    });

    // Địch va vào người chơi
    enemies.forEach((enemy, index) => {
        const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (dist < player.radius + enemy.radius) {
            enemy.markedForDeletion = true;
            AudioSys.explosion();
            player.health -= 20;
            healthFill.style.width = `${player.health}%`;
            
            // Camera Shake (mô phỏng)
            canvas.style.transform = `translate(${Math.random()*10-5}px, ${Math.random()*10-5}px)`;
            setTimeout(() => canvas.style.transform = 'none', 50);

            if (player.health <= 0) {
                endGame();
            }
        }
    });
}

function animate() {
    if (!gameState.isPlaying) return;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Tạo hiệu ứng đuôi mờ (motion blur)
    ctx.fillRect(0, 0, gameState.width, gameState.height);

    // Update Stars
    stars.forEach(star => { star.update(); star.draw(); });

    // Player
    player.update();
    player.draw();

    // Bullets
    bullets.forEach((bullet, index) => {
        bullet.update();
        bullet.draw();
        if (bullet.markedForDeletion) bullets.splice(index, 1);
    });

    // Enemies
    spawnEnemies();
    enemies.forEach((enemy, index) => {
        enemy.update(player);
        enemy.draw();
        if (enemy.markedForDeletion) enemies.splice(index, 1);
    });

    // Particles
    particles.forEach((p, index) => {
        p.update();
        p.draw();
        if (p.life <= 0) particles.splice(index, 1);
    });

    checkCollisions();

    gameState.frames++;
    animationId = requestAnimationFrame(animate);
}

function startGame() {
    AudioSys.init(); // Kích hoạt AudioContext sau tương tác người dùng
    gameState.isPlaying = true;
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    init();
    animate();
}

function endGame() {
    gameState.isPlaying = false;
    cancelAnimationFrame(animationId);
    finalScoreEl.innerText = gameState.score;
    gameOverScreen.classList.remove('hidden');
}

// --- EVENTS ---
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

// Vẽ màn hình chờ (Animation nhẹ khi chưa chơi)
function attractMode() {
    if (gameState.isPlaying) return;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Vẽ sao ngẫu nhiên
    if (Math.random() < 0.5) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, 2, 2);
    }
    requestAnimationFrame(attractMode);
}
resize();
attractMode();
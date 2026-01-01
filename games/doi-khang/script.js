/* =========================================
   SETUP & CONSTANTS
   ========================================= */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

// Game Constants
const FRICTION = 0.98;
const WALL_DAMAGE_THRESHOLD = 8;
const COLLISION_DAMAGE_MULTIPLIER = 2.5;
const MAX_HP = 100;

// Audio Context
let audioCtx;

// Input State
const keys = {};

// Game State
let gameState = 'START'; // START, PLAYING, GAMEOVER
let winner = null;
let shakeTime = 0;

/* =========================================
   AUDIO SYSTEM (Web Audio API)
   ========================================= */
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'hit') {
        // Metallic thud
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'wall') {
        // Dull thud
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.linearRampToValueAtTime(20, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'win') {
        // Victory fanfare snippet
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554, now + 0.1); // C#
        osc.frequency.setValueAtTime(659, now + 0.2); // E
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 1.0);
        osc.start(now);
        osc.stop(now + 1.0);
    }
}

/* =========================================
   ENTITIES
   ========================================= */
class Player {
    constructor(x, y, color, controls) {
        this.x = x;
        this.y = y;
        this.radius = 20;
        this.color = color;
        this.controls = controls; // {up, down, left, right}
        
        this.vx = 0;
        this.vy = 0;
        this.accel = 0.8;
        this.hp = MAX_HP;
        this.mass = 2;
        
        this.trail = [];
    }

    update() {
        // Input Handling
        if (keys[this.controls.up]) this.vy -= this.accel;
        if (keys[this.controls.down]) this.vy += this.accel;
        if (keys[this.controls.left]) this.vx -= this.accel;
        if (keys[this.controls.right]) this.vx += this.accel;

        // Friction
        this.vx *= FRICTION;
        this.vy *= FRICTION;

        // Update Position
        this.x += this.vx;
        this.y += this.vy;

        // Trail Logic
        if (Math.abs(this.vx) + Math.abs(this.vy) > 2) {
            this.trail.push({x: this.x, y: this.y, r: this.radius, a: 0.6});
        }
        // Fade trails
        for (let i = this.trail.length - 1; i >= 0; i--) {
            this.trail[i].a -= 0.05;
            if (this.trail[i].a <= 0) this.trail.splice(i, 1);
        }

        // Wall Collisions
        this.checkWalls();
    }

    checkWalls() {
        let hit = false;
        let speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);

        // Left Wall
        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.vx *= -0.8; // Bounce
            hit = true;
        }
        // Right Wall
        if (this.x + this.radius > canvas.width) {
            this.x = canvas.width - this.radius;
            this.vx *= -0.8;
            hit = true;
        }
        // Top Wall
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.vy *= -0.8;
            hit = true;
        }
        // Bottom Wall
        if (this.y + this.radius > canvas.height) {
            this.y = canvas.height - this.radius;
            this.vy *= -0.8;
            hit = true;
        }

        if (hit) {
            if (speed > WALL_DAMAGE_THRESHOLD) {
                this.takeDamage((speed - WALL_DAMAGE_THRESHOLD) * 2);
                shake(5);
            }
            playSound('wall');
        }
    }

    draw(ctx) {
        // Draw Trail
        ctx.fillStyle = this.color;
        this.trail.forEach(t => {
            ctx.globalAlpha = t.a * 0.5;
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.r * 0.8, 0, Math.PI*2);
            ctx.fill();
        });
        ctx.globalAlpha = 1.0;

        // Draw Player Body
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Speed Indicator (Inner White Circle)
        let speed = Math.hypot(this.vx, this.vy);
        let rSize = Math.min(this.radius, speed);
        ctx.beginPath();
        ctx.arc(this.x, this.y, rSize/2, 0, Math.PI*2);
        ctx.fillStyle = "#fff";
        ctx.fill();
    }

    getMomentum() {
        return Math.hypot(this.vx, this.vy) * this.mass;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp < 0) this.hp = 0;
    }
}

class Hazard {
    constructor(x, y, w, h, type) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.type = type; // 'electric', 'gravity', 'slick'
    }

    draw(ctx) {
        ctx.save();
        if (this.type === 'electric') {
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.shadowColor = '#ffcc00';
            ctx.shadowBlur = 10;
            ctx.lineDashOffset = Date.now() / 10; // Animate dash
            ctx.strokeRect(this.x, this.y, this.w, this.h);
        } else if (this.type === 'gravity') {
            ctx.fillStyle = 'rgba(100, 0, 255, 0.1)';
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.strokeStyle = 'rgba(100, 0, 255, 0.5)';
            ctx.strokeRect(this.x, this.y, this.w, this.h);
            // Draw center point
            ctx.fillStyle = '#fff';
            ctx.fillRect(this.x + this.w/2 - 2, this.y + this.h/2 - 2, 4, 4);
        } else if (this.type === 'slick') {
            ctx.fillStyle = 'rgba(0, 255, 100, 0.1)';
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.strokeStyle = '#0f8';
            ctx.strokeRect(this.x, this.y, this.w, this.h);
        }
        ctx.restore();
    }
}

/* =========================================
   GAME LOGIC
   ========================================= */
let p1, p2;
let hazards = [];

function initGame() {
    p1 = new Player(100, 300, '#00f3ff', {up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD'});
    p2 = new Player(700, 300, '#ff0055', {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'});
    
    hazards = [];
    // Central Gravity Hazard
    hazards.push(new Hazard(350, 250, 100, 100, 'gravity'));
    // Electric Corners
    hazards.push(new Hazard(50, 50, 50, 50, 'electric'));
    hazards.push(new Hazard(700, 550, 50, 50, 'electric'));
    // Slick Zones
    hazards.push(new Hazard(200, 100, 400, 50, 'slick'));
    hazards.push(new Hazard(200, 450, 400, 50, 'slick'));

    winner = null;
    gameState = 'PLAYING';
    document.getElementById('message-area').style.display = 'none';
}

function resolvePlayerCollision() {
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let dist = Math.hypot(dx, dy);

    if (dist < p1.radius + p2.radius) {
        // Normalize impact vector
        let nx = dx / dist;
        let ny = dy / dist;

        // Relative velocity
        let rvx = p2.vx - p1.vx;
        let rvy = p2.vy - p1.vy;

        // Velocity along normal
        let velAlongNormal = rvx * nx + rvy * ny;

        // Do not resolve if velocities are separating
        if (velAlongNormal > 0) return;

        // Calculate Impulse (Elastic collision assumption)
        let restitution = 0.8; // Bounciness
        let j = -(1 + restitution) * velAlongNormal;
        j /= (1/p1.mass + 1/p2.mass);

        let impulseX = j * nx;
        let impulseY = j * ny;

        // Apply forces
        p1.vx -= impulseX / p1.mass;
        p1.vy -= impulseY / p1.mass;
        p2.vx += impulseX / p2.mass;
        p2.vy += impulseY / p2.mass;

        // --- DAMAGE CALCULATION ---
        // Calculate raw speeds pre-impact (approx)
        let s1 = Math.hypot(p1.vx, p1.vy); // using current because force applied instantly
        let s2 = Math.hypot(p2.vx, p2.vy);
        
        let impactForce = Math.abs(j);
        
        // Only deal damage if impact is hard
        if (impactForce > 5) {
            shake(10);
            playSound('hit');
            
            // Damage logic: Higher speed deals damage to lower speed
            // Or if head on, both take damage
            let dmg = impactForce * COLLISION_DAMAGE_MULTIPLIER;
            
            // Slight advantage to the faster player
            if (s1 > s2 * 1.2) {
                p2.takeDamage(dmg);
            } else if (s2 > s1 * 1.2) {
                p1.takeDamage(dmg);
            } else {
                p1.takeDamage(dmg / 2);
                p2.takeDamage(dmg / 2);
            }
        }

        // Separate players to prevent sticking
        let percent = 0.2; // Penetration percentage to correct
        let slop = 0.01;
        let correction = Math.max(dist - (p1.radius + p2.radius) - slop, 0) / (1/p1.mass + 1/p2.mass) * percent;
        let cx = correction * nx;
        let cy = correction * ny;
        // p1.x -= cx / p1.mass; // Simple projection correction causes jitter, skipping for now as bounce handles most
        // p1.y -= cy / p1.mass; 
    }
}

function handleHazards(player) {
    hazards.forEach(h => {
        // Simple AABB vs Circle check
        let closestX = Math.max(h.x, Math.min(player.x, h.x + h.w));
        let closestY = Math.max(h.y, Math.min(player.y, h.y + h.h));
        let dx = player.x - closestX;
        let dy = player.y - closestY;
        
        if ((dx * dx + dy * dy) < (player.radius * player.radius)) {
            if (h.type === 'electric') {
                player.takeDamage(0.5);
                player.vx *= -0.9;
                player.vy *= -0.9;
                playSound('hit');
            } else if (h.type === 'gravity') {
                let centerX = h.x + h.w/2;
                let centerY = h.y + h.h/2;
                let dirX = centerX - player.x;
                let dirY = centerY - player.y;
                player.vx += dirX * 0.005;
                player.vy += dirY * 0.005;
            } else if (h.type === 'slick') {
                // Negate friction by adding velocity back
                player.vx /= FRICTION; 
                player.vy /= FRICTION;
                player.vx *= 0.995; // Less friction
                player.vy *= 0.995;
            }
        }
    });
}

function shake(magnitude) {
    shakeTime = magnitude;
}

function checkWin() {
    if (p1.hp <= 0 && p2.hp <= 0) winner = "DRAW";
    else if (p1.hp <= 0) winner = "PLAYER 2 WINS";
    else if (p2.hp <= 0) winner = "PLAYER 1 WINS";

    if (winner) {
        gameState = 'GAMEOVER';
        playSound('win');
        let msg = document.getElementById('message-area');
        msg.innerText = winner + "\nPRESS SPACE TO RESTART";
        msg.style.display = 'block';
    }
}

function updateUI() {
    if (!p1 || !p2) return;
    document.getElementById('p1-hp').style.width = p1.hp + '%';
    document.getElementById('p2-hp').style.width = p2.hp + '%';
    
    document.getElementById('p1-mom').innerText = Math.round(p1.getMomentum()) + " M";
    document.getElementById('p2-mom').innerText = Math.round(p2.getMomentum()) + " M";
}

/* =========================================
   MAIN LOOP
   ========================================= */
function loop() {
    // 1. Clear Screen
    ctx.fillStyle = "#0a0a10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Shake Effect
    ctx.save();
    if (shakeTime > 0) {
        let sx = (Math.random() - 0.5) * shakeTime;
        let sy = (Math.random() - 0.5) * shakeTime;
        ctx.translate(sx, sy);
        shakeTime *= 0.9;
        if (shakeTime < 0.5) shakeTime = 0;
    }

    // 3. Draw Hazards
    if (gameState === 'PLAYING') {
        hazards.forEach(h => h.draw(ctx));
    }

    if (gameState === 'PLAYING') {
        // Update Physics
        p1.update();
        p2.update();
        handleHazards(p1);
        handleHazards(p2);
        resolvePlayerCollision();

        // Draw Players
        p1.draw(ctx);
        p2.draw(ctx);

        updateUI();
        checkWin();
    }

    ctx.restore();

    requestAnimationFrame(loop);
}

// Input Listeners
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    
    // Start Game Trigger
    if (gameState === 'START') {
        initAudio();
        initGame();
    }
    // Restart Trigger
    if (gameState === 'GAMEOVER' && e.code === 'Space') {
        initGame();
    }
});

window.addEventListener('keyup', e => {
    keys[e.code] = false;
});

// Start loop
loop();
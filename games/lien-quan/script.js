/**
 * MOBILE WEB MOBA ENGINE
 * ----------------------
 * Architecture:
 * 1. Systems: Audio, Input, Camera, Game (Main Loop)
 * 2. Entities: Hero, Minion, Tower, Bullet, Particle
 * 3. Components included in Entities for performance
 */

// --- CONFIGURATION ---
const CONFIG = {
    MAP_WIDTH: 3000,
    MAP_HEIGHT: 2000,
    LANE_TOP_Y: 300,
    LANE_MID_Y: 1000,
    LANE_BOT_Y: 1700,
    COLORS: {
        ground: '#2a2a2a',
        grass: '#1e3c2f',
        lane: '#333333',
        bush: 'rgba(30, 100, 50, 0.8)',
        wall: '#111',
        hero: '#3498db',
        enemy: '#e74c3c',
        tower: '#9b59b6',
        bullet: '#f1c40f'
    }
};

// --- UTILITIES ---
const MathUtils = {
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
    circleIntersect: (c1, c2) => MathUtils.dist(c1.x, c1.y, c2.x, c2.y) < (c1.radius + c2.radius),
    rand: (min, max) => Math.random() * (max - min) + min
};

// --- AUDIO SYSTEM (Procedural Web Audio API) ---
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    playTone(freq, type, duration, vol = 1) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playAttack() { this.playTone(200 + Math.random()*100, 'triangle', 0.1); }
    playHit() { this.playTone(100, 'square', 0.1, 0.5); }
    playSkill1() { this.playTone(600, 'sine', 0.3); }
    playSkill2() { this.playTone(400, 'sawtooth', 0.4); }
    playUlt() { 
        this.playTone(100, 'sawtooth', 1.0); 
        setTimeout(() => this.playTone(800, 'sine', 0.5), 100);
    }
}

// --- INPUT SYSTEM (Multi-touch Joystick) ---
class InputManager {
    constructor(game) {
        this.game = game;
        this.moveVector = { x: 0, y: 0 };
        this.isAttacking = false;
        this.joystick = {
            active: false,
            origin: { x: 0, y: 0 },
            current: { x: 0, y: 0 },
            id: null,
            radius: 50
        };

        this.setupTouch();
        this.setupButtons();
    }

    setupTouch() {
        const zone = document.getElementById('joystick-zone');
        const stick = document.getElementById('joystick-stick');
        const base = document.getElementById('joystick-base');

        zone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            if (this.joystick.id === null) {
                this.joystick.id = touch.identifier;
                this.joystick.active = true;
                const rect = zone.getBoundingClientRect();
                this.joystick.origin = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
                this.joystick.current = { ...this.joystick.origin };
                
                // Visuals
                base.style.display = 'block';
                base.style.left = (this.joystick.origin.x - 50) + 'px';
                base.style.top = (this.joystick.origin.y - 50) + 'px';
                stick.style.transform = `translate(0px, 0px)`;
            }
        }, { passive: false });

        zone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.joystick.id) {
                    const touch = e.changedTouches[i];
                    const rect = zone.getBoundingClientRect();
                    const dx = (touch.clientX - rect.left) - this.joystick.origin.x;
                    const dy = (touch.clientY - rect.top) - this.joystick.origin.y;
                    
                    const dist = Math.hypot(dx, dy);
                    const angle = Math.atan2(dy, dx);
                    
                    const limit = Math.min(dist, this.joystick.radius);
                    const tx = Math.cos(angle) * limit;
                    const ty = Math.sin(angle) * limit;

                    stick.style.transform = `translate(${tx}px, ${ty}px)`;

                    // Normalize vector for game logic
                    this.moveVector.x = tx / this.joystick.radius;
                    this.moveVector.y = ty / this.joystick.radius;
                }
            }
        }, { passive: false });

        const endTouch = (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.joystick.id) {
                    this.joystick.active = false;
                    this.joystick.id = null;
                    this.moveVector = { x: 0, y: 0 };
                    base.style.display = 'none';
                }
            }
        };

        zone.addEventListener('touchend', endTouch);
        zone.addEventListener('touchcancel', endTouch);
    }

    setupButtons() {
        // Attack
        const btnAtk = document.getElementById('btn-attack');
        btnAtk.addEventListener('touchstart', (e) => { e.preventDefault(); this.game.player.autoAttack(); });
        
        // Skills
        ['btn-s1', 'btn-s2', 'btn-ult'].forEach(id => {
            const btn = document.getElementById(id);
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const key = btn.getAttribute('data-key');
                this.game.player.castSkill(parseInt(key));
            });
        });
    }
}

// --- ENTITIES ---
class Entity {
    constructor(game, x, y, radius, team) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.team = team; // 0: Neutral, 1: Player, 2: Enemy
        this.markedForDeletion = false;
    }
}

class Unit extends Entity {
    constructor(game, x, y, radius, team, hp, speed) {
        super(game, x, y, radius, team);
        this.hp = hp;
        this.maxHp = hp;
        this.speed = speed;
        this.vx = 0;
        this.vy = 0;
        this.angle = 0;
    }

    takeDamage(amount) {
        this.hp -= amount;
        this.game.addFloatingText(Math.floor(amount), this.x, this.y - 20, '#fff');
        if (this.hp <= 0) {
            this.kill();
        }
    }

    kill() {
        this.markedForDeletion = true;
        this.game.audio.playHit();
        // Death particles
        for(let i=0; i<8; i++) {
            this.game.particles.push(new Particle(this.x, this.y, '#999'));
        }
    }

    drawHealthBar(ctx) {
        const w = 40;
        const h = 5;
        const pct = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - w/2, this.y - this.radius - 10, w, h);
        ctx.fillStyle = this.team === 1 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(this.x - w/2, this.y - this.radius - 10, w * pct, h);
    }
}

class Hero extends Unit {
    constructor(game, x, y) {
        super(game, x, y, 25, 1, 1000, 5); // Team 1 = Player
        this.mana = 200;
        this.maxMana = 200;
        this.regen = 0.5;
        this.attackRange = 150;
        this.attackCooldown = 0;
        
        this.skills = {
            1: { cd: 0, maxCd: 60, cost: 30, type: 'projectile' },
            2: { cd: 0, maxCd: 180, cost: 50, type: 'aoe' },
            3: { cd: 0, maxCd: 600, cost: 100, type: 'dash' }
        };
    }

    update() {
        // Movement
        const input = this.game.input.moveVector;
        if (input.x !== 0 || input.y !== 0) {
            this.vx = input.x * this.speed;
            this.vy = input.y * this.speed;
            this.angle = Math.atan2(input.y, input.x);
        } else {
            this.vx = 0;
            this.vy = 0;
        }

        // Apply Velocity with Map Bounds
        this.x = MathUtils.clamp(this.x + this.vx, 0, CONFIG.MAP_WIDTH);
        this.y = MathUtils.clamp(this.y + this.vy, 0, CONFIG.MAP_HEIGHT);

        // Regen
        this.mana = Math.min(this.mana + 0.1, this.maxMana);
        this.hp = Math.min(this.hp + 0.2, this.maxHp);

        // Cooldowns
        this.attackCooldown--;
        for (let key in this.skills) {
            if (this.skills[key].cd > 0) this.skills[key].cd--;
            this.updateSkillUI(key);
        }
    }

    autoAttack() {
        if (this.attackCooldown > 0) return;
        
        // Find nearest enemy
        let target = null;
        let minDst = this.attackRange;

        // Check minions and heroes
        const enemies = [...this.game.minions, ...this.game.enemies, ...this.game.towers];
        for (let e of enemies) {
            if (e.team !== this.team && !e.markedForDeletion) {
                const dst = MathUtils.dist(this.x, this.y, e.x, e.y);
                if (dst < minDst) {
                    minDst = dst;
                    target = e;
                }
            }
        }

        if (target) {
            this.attackCooldown = 30; // 0.5s at 60fps
            this.game.audio.playAttack();
            this.game.projectiles.push(new Projectile(this.game, this.x, this.y, target.x, target.y, this.team, 40));
            // Face target
            this.angle = Math.atan2(target.y - this.y, target.x - this.x);
        }
    }

    castSkill(key) {
        const skill = this.skills[key];
        if (skill.cd > 0 || this.mana < skill.cost) return;

        this.mana -= skill.cost;
        skill.cd = skill.maxCd;
        
        const aimX = this.x + Math.cos(this.angle) * 300;
        const aimY = this.y + Math.sin(this.angle) * 300;

        if (skill.type === 'projectile') {
            this.game.audio.playSkill1();
            // Fire large projectile
            this.game.projectiles.push(new Projectile(this.game, this.x, this.y, aimX, aimY, this.team, 120, 15, 12));
        } 
        else if (skill.type === 'aoe') {
            this.game.audio.playSkill2();
            // Damage around player
            this.game.effects.push(new AreaEffect(this.game, this.x, this.y, 150));
            const targets = [...this.game.minions, ...this.game.enemies];
            targets.forEach(t => {
                if(t.team !== this.team && MathUtils.dist(this.x, this.y, t.x, t.y) < 150) {
                    t.takeDamage(100);
                }
            });
        }
        else if (skill.type === 'dash') {
            this.game.audio.playUlt();
            this.game.camera.shake(10);
            const dashDist = 400;
            this.x += Math.cos(this.angle) * dashDist;
            this.y += Math.sin(this.angle) * dashDist;
            // Trail damage
            this.game.effects.push(new AreaEffect(this.game, this.x, this.y, 100, '#e67e22'));
        }
    }

    updateSkillUI(key) {
        const btn = document.querySelector(`.skill-btn[data-key="${key}"]`);
        const overlay = btn.parentElement.querySelector('circle');
        const text = btn.parentElement.querySelector('.cd-text');
        const skill = this.skills[key];

        if (skill.cd > 0) {
            btn.classList.add('disabled');
            const pct = skill.cd / skill.maxCd;
            overlay.style.strokeDashoffset = 200 * (1 - pct); // 200 is dasharray
            text.textContent = Math.ceil(skill.cd / 60);
        } else {
            btn.classList.remove('disabled');
            overlay.style.strokeDashoffset = 200;
            text.textContent = '';
        }
    }

    draw(ctx) {
        // Draw Hero Body
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Selection Circle
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.COLORS.hero;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Direction Indicator
        ctx.beginPath();
        ctx.moveTo(this.radius, 0);
        ctx.lineTo(this.radius + 15, 0);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.stroke();

        ctx.restore();
        this.drawHealthBar(ctx);
    }
}

class Minion extends Unit {
    constructor(game, x, y, team, laneY) {
        super(game, x, y, 12, team, 150, 2);
        this.laneY = laneY;
        this.targetBaseX = team === 1 ? CONFIG.MAP_WIDTH : 0;
        this.currentState = 'MOVE';
        this.attackCooldown = 0;
    }

    update() {
        // Simple AI: Move to lane Y, then move to enemy base X
        // Check for enemies
        let target = null;
        let minDst = 100; // Agro range

        const potentialTargets = this.team === 1 ? 
            [...this.game.enemies, ...this.game.minions.filter(m=>m.team===2), ...this.game.towers.filter(t=>t.team===2)] : 
            [this.game.player, ...this.game.minions.filter(m=>m.team===1), ...this.game.towers.filter(t=>t.team===1)];

        for (let e of potentialTargets) {
            if (!e.markedForDeletion) {
                const d = MathUtils.dist(this.x, this.y, e.x, e.y);
                if (d < minDst) {
                    minDst = d;
                    target = e;
                }
            }
        }

        if (target && minDst < 100) {
            this.currentState = 'ATTACK';
            if (this.attackCooldown <= 0) {
                this.game.projectiles.push(new Projectile(this.game, this.x, this.y, target.x, target.y, this.team, 10));
                this.attackCooldown = 60;
            }
        } else {
            this.currentState = 'MOVE';
            // Move logic
            const dx = this.targetBaseX - this.x;
            const dy = this.laneY - this.y;
            
            // If far from lane Y, correct Y first slightly
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * this.speed;
            this.y += Math.sin(angle) * (Math.abs(dy) > 10 ? this.speed : 0);
        }

        this.attackCooldown--;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
        ctx.fillStyle = this.team === 1 ? '#3498db' : '#e74c3c';
        ctx.fill();
        this.drawHealthBar(ctx);
    }
}

class Projectile extends Entity {
    constructor(game, x, y, tx, ty, team, damage, speed = 8, radius = 5) {
        super(game, x, y, radius, team);
        this.damage = damage;
        const angle = Math.atan2(ty - y, tx - x);
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 100; // Frames
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;

        if (this.life <= 0 || this.x < 0 || this.x > CONFIG.MAP_WIDTH) {
            this.markedForDeletion = true;
            return;
        }

        // Collision
        const targets = this.team === 1 ? 
            [...this.game.enemies, ...this.game.minions.filter(m=>m.team===2), ...this.game.towers.filter(t=>t.team===2)] : 
            [this.game.player, ...this.game.minions.filter(m=>m.team===1), ...this.game.towers.filter(t=>t.team===1)];

        for (let t of targets) {
            if (MathUtils.circleIntersect(this, t)) {
                t.takeDamage(this.damage);
                this.markedForDeletion = true;
                // Impact Effect
                this.game.particles.push(new Particle(this.x, this.y, '#fff'));
                break;
            }
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
        ctx.fillStyle = CONFIG.COLORS.bullet;
        ctx.fill();
    }
}

class Tower extends Unit {
    constructor(game, x, y, team) {
        super(game, x, y, 40, team, 2000, 0);
        this.cooldown = 0;
    }
    update() {
        if (this.cooldown > 0) this.cooldown--;
        else {
            // Find target
            const range = 250;
            const targets = this.team === 1 ? 
                [...this.game.enemies, ...this.game.minions.filter(m=>m.team===2)] :
                [this.game.player, ...this.game.minions.filter(m=>m.team===1)];
            
            for(let t of targets) {
                if(MathUtils.dist(this.x, this.y, t.x, t.y) < range) {
                    this.game.projectiles.push(new Projectile(this.game, this.x, this.y, t.x, t.y, this.team, 80, 10, 8));
                    this.cooldown = 90; // Slow but hurts
                    break;
                }
            }
        }
    }
    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
        ctx.fillStyle = this.team === 1 ? '#8e44ad' : '#c0392b';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
        this.drawHealthBar(ctx);
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = MathUtils.rand(-2, 2);
        this.vy = MathUtils.rand(-2, 2);
        this.life = 1.0;
        this.color = color;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.05;
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, 4, 4);
        ctx.globalAlpha = 1.0;
    }
}

class AreaEffect {
    constructor(game, x, y, radius, color = 'rgba(52, 152, 219, 0.5)') {
        this.game = game;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.life = 20;
        this.color = color;
    }
    update() { this.life--; }
    draw(ctx) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }
}

class FloatingText {
    constructor(text, x, y, color) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.color = color;
        this.life = 30;
    }
    update() {
        this.y -= 1;
        this.life--;
    }
    draw(ctx) {
        ctx.globalAlpha = this.life / 30;
        ctx.fillStyle = this.color;
        ctx.font = 'bold 20px Arial';
        ctx.fillText(this.text, this.x, this.y);
        ctx.globalAlpha = 1.0;
    }
}

// --- GAME CORE ---
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.audio = new AudioEngine();
        this.input = new InputManager(this);
        
        // Resize Handling
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Game State
        this.started = false;
        this.lastTime = 0;
        
        // Camera
        this.camera = {
            x: 0, y: 0,
            shakeStr: 0,
            shake: (amount) => { this.camera.shakeStr = amount; }
        };

        // Entities
        this.player = new Hero(this, 200, CONFIG.LANE_MID_Y);
        this.minions = [];
        this.enemies = []; // Enemy Heroes
        this.towers = [];
        this.projectiles = [];
        this.particles = [];
        this.effects = []; // AoE visual effects
        this.floatingTexts = [];

        // Spawn Towers
        this.towers.push(new Tower(this, 500, CONFIG.LANE_MID_Y, 1)); // Allied T1
        this.towers.push(new Tower(this, 2500, CONFIG.LANE_MID_Y, 2)); // Enemy T1

        // Spawn a dummy enemy hero
        this.enemies.push(new Unit(this, 2800, CONFIG.LANE_MID_Y, 25, 2, 1000, 3));

        // UI Binding
        document.getElementById('game-message').addEventListener('click', () => {
            if (!this.started) {
                this.audio.init();
                document.getElementById('game-message').style.display = 'none';
                this.started = true;
                this.loop(0);
                this.startSpawner();
            }
        });
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    startSpawner() {
        setInterval(() => {
            // Spawn Minions for both teams in mid lane
            this.minions.push(new Minion(this, 100, CONFIG.LANE_MID_Y, 1, CONFIG.LANE_MID_Y));
            this.minions.push(new Minion(this, CONFIG.MAP_WIDTH - 100, CONFIG.LANE_MID_Y, 2, CONFIG.LANE_MID_Y));
        }, 5000);
    }

    update(dt) {
        if (!this.started) return;

        // Update Camera
        const targetCamX = this.player.x - this.canvas.width / 2;
        const targetCamY = this.player.y - this.canvas.height / 2;
        this.camera.x = MathUtils.lerp(this.camera.x, targetCamX, 0.1);
        this.camera.y = MathUtils.lerp(this.camera.y, targetCamY, 0.1);
        
        // Clamp Camera
        this.camera.x = MathUtils.clamp(this.camera.x, 0, CONFIG.MAP_WIDTH - this.canvas.width);
        this.camera.y = MathUtils.clamp(this.camera.y, 0, CONFIG.MAP_HEIGHT - this.canvas.height);

        // Shake decay
        if (this.camera.shakeStr > 0) {
            this.camera.x += (Math.random() - 0.5) * this.camera.shakeStr;
            this.camera.y += (Math.random() - 0.5) * this.camera.shakeStr;
            this.camera.shakeStr *= 0.9;
            if(this.camera.shakeStr < 0.5) this.camera.shakeStr = 0;
        }

        // Entity Updates
        this.player.update();
        [...this.minions, ...this.enemies, ...this.towers, ...this.projectiles, ...this.particles, ...this.effects, ...this.floatingTexts]
            .forEach(e => e.update());

        // Cleanup
        this.minions = this.minions.filter(e => !e.markedForDeletion);
        this.enemies = this.enemies.filter(e => !e.markedForDeletion);
        this.towers = this.towers.filter(e => !e.markedForDeletion);
        this.projectiles = this.projectiles.filter(e => !e.markedForDeletion);
        this.particles = this.particles.filter(e => e.life > 0);
        this.effects = this.effects.filter(e => e.life > 0);
        this.floatingTexts = this.floatingTexts.filter(e => e.life > 0);

        // Update HUD
        document.getElementById('hud-hp-bar').style.width = (this.player.hp / this.player.maxHp * 100) + '%';
        document.getElementById('hud-mana-bar').style.width = (this.player.mana / this.player.maxMana * 100) + '%';
        
        // Simple Enemy AI (Chase Player)
        this.enemies.forEach(enemy => {
            if (MathUtils.dist(enemy.x, enemy.y, this.player.x, this.player.y) < 200) {
                // Move towards player
                const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
                enemy.x += Math.cos(angle) * 3;
                enemy.y += Math.sin(angle) * 3;
            }
        });
    }

    draw() {
        // Clear background
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(-this.camera.x, -this.camera.y);

        // Draw Map Background
        this.ctx.fillStyle = CONFIG.COLORS.ground;
        this.ctx.fillRect(0, 0, CONFIG.MAP_WIDTH, CONFIG.MAP_HEIGHT);

        // Draw Lanes (Simple visualization)
        this.ctx.fillStyle = CONFIG.COLORS.lane;
        this.ctx.fillRect(0, CONFIG.LANE_MID_Y - 50, CONFIG.MAP_WIDTH, 100);
        this.ctx.fillRect(0, CONFIG.LANE_TOP_Y - 40, CONFIG.MAP_WIDTH, 80);
        this.ctx.fillRect(0, CONFIG.LANE_BOT_Y - 40, CONFIG.MAP_WIDTH, 80);

        // Draw Jungle/Walls (Abstract)
        this.ctx.fillStyle = CONFIG.COLORS.grass;
        this.ctx.fillRect(400, 400, 200, 400); // Jungle block
        this.ctx.fillRect(1000, 1200, 300, 300); // Jungle block

        // Draw Entities
        // Layering: Ground FX -> Dead bodies -> Minions -> Heroes -> Particles -> Flying UI
        this.effects.forEach(e => e.draw(this.ctx));
        this.towers.forEach(e => e.draw(this.ctx));
        this.minions.forEach(e => e.draw(this.ctx));
        this.enemies.forEach(e => e.draw(this.ctx));
        this.player.draw(this.ctx);
        this.projectiles.forEach(e => e.draw(this.ctx));
        this.particles.forEach(e => e.draw(this.ctx));
        this.floatingTexts.forEach(e => e.draw(this.ctx));

        this.ctx.restore();
    }

    loop(timestamp) {
        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;

        this.update(dt);
        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }
}

// Start Game
window.onload = () => {
    const game = new Game();
};

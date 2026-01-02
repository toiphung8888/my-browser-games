/**
 * MOBA ENGINE CORE V2
 * -------------------
 * Architecture: Game Loop -> Physics Update -> Render
 */

// --- 1. CONFIG & CONSTANTS ---
const CONFIG = {
    MAP_W: 2400,
    MAP_H: 1600,
    COLORS: {
        bg: '#121212',
        grid: '#1e1e1e',
        wall: '#333',
        grass: '#1e2b1e',
        lane: '#1a1a1a',
        hero_ally: '#3498db',
        hero_enemy: '#e74c3c',
        minion_ally: '#5dade2',
        minion_enemy: '#ec7063',
        tower_ally: '#2980b9',
        tower_enemy: '#c0392b'
    },
    LAYERS: {
        GROUND: 0,
        WALL: 1,
        UNIT: 2,
        PROJECTILE: 3,
        EFFECT: 4,
        UI: 5
    }
};

// Logger để debug màn hình đen
const Debug = {
    log: (msg) => {
        console.log(msg);
        const el = document.getElementById('debug-log');
        if(el) el.textContent = `LOG: ${msg}`;
    },
    error: (msg) => {
        console.error(msg);
        const el = document.getElementById('debug-log');
        if(el) {
            el.textContent = `ERR: ${msg}`;
            el.style.color = 'red';
        }
    }
};

// --- 2. MATH UTILS ---
const Vec2 = {
    add: (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y }),
    sub: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y }),
    mul: (v, s) => ({ x: v.x * s, y: v.y * s }),
    mag: (v) => Math.hypot(v.x, v.y),
    norm: (v) => {
        const m = Math.hypot(v.x, v.y);
        return m === 0 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
    },
    dist: (v1, v2) => Math.hypot(v2.x - v1.x, v2.y - v1.y),
    lerp: (a, b, t) => a + (b - a) * t
};

// --- 3. ENTITY SYSTEM BASE ---
class Entity {
    constructor(game, x, y, radius, team) {
        this.game = game;
        this.pos = { x, y };
        this.radius = radius;
        this.team = team; // 1: Ally, 2: Enemy
        this.markedForDeletion = false;
        this.zIndex = CONFIG.LAYERS.UNIT;
    }
    update(dt) {}
    draw(ctx) {}
}

class MobileUnit extends Entity {
    constructor(game, x, y, radius, team, speed, hp) {
        super(game, x, y, radius, team);
        this.velocity = { x: 0, y: 0 };
        this.speed = speed;
        this.hp = hp;
        this.maxHp = hp;
        this.angle = 0;
        this.isMoving = false;
    }

    move(dt, dirVector) {
        if (dirVector.x === 0 && dirVector.y === 0) {
            this.isMoving = false;
            return;
        }
        
        this.isMoving = true;
        this.angle = Math.atan2(dirVector.y, dirVector.x);

        // Calculate potential new position
        let nextX = this.pos.x + dirVector.x * this.speed * dt;
        let nextY = this.pos.y + dirVector.y * this.speed * dt;

        // --- COLLISION LOGIC (WALLS) ---
        // Simple bounding box check against map walls
        // Wall definition: Rectangles
        let collidedX = false;
        let collidedY = false;

        for (let w of this.game.map.walls) {
            // Check X axis movement
            if (nextX + this.radius > w.x && nextX - this.radius < w.x + w.w &&
                this.pos.y + this.radius > w.y && this.pos.y - this.radius < w.y + w.h) {
                collidedX = true;
            }
            // Check Y axis movement
            if (this.pos.x + this.radius > w.x && this.pos.x - this.radius < w.x + w.w &&
                nextY + this.radius > w.y && nextY - this.radius < w.y + w.h) {
                collidedY = true;
            }
        }

        if (!collidedX) this.pos.x = nextX;
        if (!collidedY) this.pos.y = nextY;

        // Map Boundaries
        this.pos.x = Math.max(this.radius, Math.min(CONFIG.MAP_W - this.radius, this.pos.x));
        this.pos.y = Math.max(this.radius, Math.min(CONFIG.MAP_H - this.radius, this.pos.y));
    }

    takeDamage(amount, source) {
        this.hp -= amount;
        this.game.addFloatingText(Math.floor(amount), this.pos.x, this.pos.y - 30, '#fff');
        if (this.hp <= 0) {
            this.hp = 0;
            this.die();
        }
    }

    die() {
        this.markedForDeletion = true;
        this.game.audio.play('die');
        // Spawn particles
        for(let i=0; i<5; i++) this.game.addParticle(this.pos.x, this.pos.y, '#555');
    }

    drawHealthBar(ctx) {
        const w = this.radius * 2;
        const h = 6;
        const x = this.pos.x - w/2;
        const y = this.pos.y - this.radius - 12;
        
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, w, h);
        
        const pct = this.hp / this.maxHp;
        ctx.fillStyle = this.team === 1 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(x+1, y+1, (w-2)*pct, h-2);
    }
}

// --- 4. GAME OBJECTS ---

class Hero extends MobileUnit {
    constructor(game) {
        super(game, 200, CONFIG.MAP_H / 2, 25, 1, 280, 1000); // Speed increased
        this.mana = 500;
        this.maxMana = 500;
        this.cooldowns = { 1: 0, 2: 0, 3: 0, atk: 0 };
        this.maxCooldowns = { 1: 2, 2: 8, 3: 40, atk: 0.6 }; // Seconds
        this.level = 1;
        this.range = 180;
    }

    update(dt) {
        // Handle input movement
        const input = this.game.input.joystick;
        this.move(dt, input);

        // Regen
        this.hp = Math.min(this.hp + 2 * dt, this.maxHp);
        this.mana = Math.min(this.mana + 4 * dt, this.maxMana);

        // Reduce Cooldowns
        for(let k in this.cooldowns) {
            if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt;
        }
        
        this.game.ui.updateStats(this);
    }

    castSkill(key) {
        if (this.cooldowns[key] > 0) return;
        
        // Skill Logic
        switch(key) {
            case 'atk':
                this.performAutoAttack();
                break;
            case 1: // Q: Skillshot Line
                if (this.mana >= 40) {
                    this.mana -= 40;
                    this.cooldowns[1] = this.maxCooldowns[1];
                    this.game.addProjectile(this.pos.x, this.pos.y, this.angle, 600, 150, this.team, 'linear');
                    this.game.audio.play('shoot');
                }
                break;
            case 2: // W: AOE
                if (this.mana >= 70) {
                    this.mana -= 70;
                    this.cooldowns[2] = this.maxCooldowns[2];
                    this.game.addEffect(this.pos.x, this.pos.y, 150, '#f1c40f', 0.5);
                    this.game.dealAreaDamage(this.pos.x, this.pos.y, 150, 120, this.team);
                    this.game.audio.play('aoe');
                }
                break;
            case 3: // R: Dash + Big Damage
                if (this.mana >= 100) {
                    this.mana -= 100;
                    this.cooldowns[3] = this.maxCooldowns[3];
                    const dashDist = 400;
                    this.pos.x += Math.cos(this.angle) * dashDist;
                    this.pos.y += Math.sin(this.angle) * dashDist;
                    this.game.camera.shake(15);
                    this.game.dealAreaDamage(this.pos.x, this.pos.y, 200, 300, this.team);
                    this.game.audio.play('ult');
                }
                break;
        }
    }

    performAutoAttack() {
        // Find nearest enemy in range
        const target = this.game.getNearestEnemy(this, this.range);
        if (target) {
            this.cooldowns['atk'] = this.maxCooldowns['atk'];
            // Visual for melee hit or instant projectile
            this.game.addProjectile(this.pos.x, this.pos.y, Math.atan2(target.pos.y - this.pos.y, target.pos.x - this.pos.x), 800, 60, this.team, 'tracking', target);
            this.game.audio.play('atk');
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        
        // Draw Range (very faint)
        // ctx.beginPath(); ctx.arc(0, 0, this.range, 0, Math.PI*2); 
        // ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.stroke();

        ctx.rotate(this.angle);

        // Body
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.COLORS.hero_ally;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.stroke();

        // Weapon/Indicator
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(35, 0); ctx.lineTo(10, 10); ctx.fill();

        ctx.restore();
        this.drawHealthBar(ctx);
    }
}

class Minion extends MobileUnit {
    constructor(game, x, y, team, waypoints) {
        super(game, x, y, 15, team, 100, 300);
        this.waypoints = waypoints;
        this.wpIndex = 0;
        this.attackTimer = 0;
    }

    update(dt) {
        if (this.attackTimer > 0) this.attackTimer -= dt;

        // AI Logic:
        // 1. Look for enemies nearby
        const target = this.game.getNearestEnemy(this, 120);

        if (target) {
            // Attack State
            if (this.attackTimer <= 0) {
                this.game.addProjectile(this.pos.x, this.pos.y, 0, 400, 20, this.team, 'tracking', target);
                this.attackTimer = 1.5;
            }
        } else {
            // Move State
            if (this.wpIndex < this.waypoints.length) {
                const wp = this.waypoints[this.wpIndex];
                const d = Vec2.dist(this.pos, wp);
                if (d < 10) {
                    this.wpIndex++;
                } else {
                    const dir = Vec2.norm(Vec2.sub(wp, this.pos));
                    this.move(dt, dir);
                }
            }
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI*2);
        ctx.fillStyle = this.team === 1 ? CONFIG.COLORS.minion_ally : CONFIG.COLORS.minion_enemy;
        ctx.fill();
        this.drawHealthBar(ctx);
    }
}

class Tower extends Entity {
    constructor(game, x, y, team) {
        super(game, x, y, 40, team);
        this.hp = 3000;
        this.maxHp = 3000;
        this.range = 300;
        this.cooldown = 0;
        this.zIndex = CONFIG.LAYERS.WALL; // Draw behind units
    }

    update(dt) {
        if (this.hp <= 0) {
            this.markedForDeletion = true;
            this.game.addEffect(this.pos.x, this.pos.y, 100, '#555', 2); // Rubble
            return;
        }

        if (this.cooldown > 0) this.cooldown -= dt;
        else {
            const target = this.game.getNearestEnemy(this, this.range);
            if (target) {
                // Tower shot
                this.game.addProjectile(this.pos.x, this.pos.y - 40, 0, 600, 150, this.team, 'tracking', target);
                this.cooldown = 1.2;
                this.game.audio.play('tower');
            }
        }
    }

    draw(ctx) {
        // Base
        ctx.fillStyle = '#444';
        ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.radius + 5, 0, Math.PI*2); ctx.fill();
        
        // Tower Body
        ctx.fillStyle = this.team === 1 ? CONFIG.COLORS.tower_ally : CONFIG.COLORS.tower_enemy;
        ctx.fillRect(this.pos.x - 20, this.pos.y - 60, 40, 60);

        // Crystal
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y - 60, 15, 0, Math.PI*2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        // HP Bar
        const pct = this.hp / this.maxHp;
        ctx.fillStyle = 'red'; ctx.fillRect(this.pos.x - 30, this.pos.y - 80, 60, 8);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(this.pos.x - 30, this.pos.y - 80, 60 * pct, 8);
    }
}

class Projectile extends Entity {
    constructor(game, x, y, angle, speed, damage, team, type, target = null) {
        super(game, x, y, 6, team);
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.speed = speed;
        this.damage = damage;
        this.type = type; // 'linear' or 'tracking'
        this.target = target;
        this.life = 2.0; // Seconds
    }

    update(dt) {
        this.life -= dt;
        if (this.life <= 0) { this.markedForDeletion = true; return; }

        if (this.type === 'tracking' && this.target && !this.target.markedForDeletion) {
            // Homing logic
            const dir = Vec2.norm(Vec2.sub(this.target.pos, this.pos));
            this.vx = dir.x * this.speed;
            this.vy = dir.y * this.speed;
        }

        this.pos.x += this.vx * dt;
        this.pos.y += this.vy * dt;

        // Collision Check
        const hit = this.game.checkCollision(this, this.radius);
        if (hit && hit.team !== this.team) {
            hit.takeDamage(this.damage, this);
            this.markedForDeletion = true;
            this.game.addEffect(this.pos.x, this.pos.y, 20, '#fff', 0.1);
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI*2);
        ctx.fillStyle = '#f1c40f';
        ctx.fill();
        ctx.shadowBlur = 10; ctx.shadowColor = 'orange'; // Glow
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// --- 5. AUDIO & INPUT ---
class AudioSys {
    constructor() {
        this.ctx = null;
    }
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    play(type) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        const now = this.ctx.currentTime;
        if (type === 'atk') {
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'shoot') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, now);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        }
    }
}

class InputSys {
    constructor(game) {
        this.game = game;
        this.joystick = { x: 0, y: 0 };
        this.touchId = null;
        this.origin = { x: 0, y: 0 };
        this.setup();
    }
    
    setup() {
        const zone = document.getElementById('joystick-zone');
        const stick = document.getElementById('joystick-stick');
        const base = document.getElementById('joystick-base');

        // Joystick Logic
        const handleMove = (x, y) => {
            const maxDist = 60;
            let dx = x - this.origin.x;
            let dy = y - this.origin.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist > maxDist) {
                const angle = Math.atan2(dy, dx);
                dx = Math.cos(angle) * maxDist;
                dy = Math.sin(angle) * maxDist;
            }

            stick.style.transform = `translate(${dx}px, ${dy}px)`;
            this.joystick = { x: dx / maxDist, y: dy / maxDist };
        };

        zone.addEventListener('touchstart', e => {
            e.preventDefault();
            const t = e.changedTouches[0];
            this.touchId = t.identifier;
            
            const rect = zone.getBoundingClientRect();
            this.origin = { x: t.clientX - rect.left, y: t.clientY - rect.top };
            
            base.style.display = 'block';
            base.style.left = (this.origin.x - 60) + 'px';
            base.style.top = (this.origin.y - 60) + 'px';
            stick.style.transform = `translate(0px, 0px)`;
            this.joystick = { x: 0, y: 0 };
        }, {passive: false});

        zone.addEventListener('touchmove', e => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.touchId) {
                    const t = e.changedTouches[i];
                    const rect = zone.getBoundingClientRect();
                    handleMove(t.clientX - rect.left, t.clientY - rect.top);
                }
            }
        }, {passive: false});

        const end = (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.touchId) {
                    this.touchId = null;
                    this.joystick = { x: 0, y: 0 };
                    base.style.display = 'none';
                }
            }
        };
        zone.addEventListener('touchend', end);
        zone.addEventListener('touchcancel', end);

        // Buttons
        const bindBtn = (id, key) => {
            const btn = document.getElementById(id);
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent ghost clicks
                this.game.hero.castSkill(key);
                btn.style.transform = 'scale(0.9)';
            });
            btn.addEventListener('touchend', () => btn.style.transform = 'scale(1)');
        };

        bindBtn('btn-s1', 1);
        bindBtn('btn-s2', 2);
        bindBtn('btn-ult', 3);
        bindBtn('btn-atk', 'atk');
    }
}

// --- 6. MAIN GAME CLASS ---
class Game {
    constructor() {
        Debug.log('Initializing Game...');
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false }); // Opt for speed
        this.resize();

        this.audio = new AudioSys();
        this.ui = {
            updateStats: (hero) => {
                document.getElementById('hud-hp').style.width = (hero.hp/hero.maxHp*100) + '%';
                document.getElementById('text-hp').textContent = `${Math.ceil(hero.hp)}/${hero.maxHp}`;
                document.getElementById('hud-mp').style.width = (hero.mana/hero.maxMana*100) + '%';
                
                // CD Updates
                [1,2,3].forEach(k => {
                   const cd = hero.cooldowns[k];
                   const max = hero.maxCooldowns[k];
                   const el = document.querySelector(`.skill-btn[data-key="${k}"]`).parentElement;
                   const svg = el.querySelector('circle');
                   const txt = el.querySelector('.cd-number');
                   
                   if (cd > 0) {
                       svg.style.strokeDashoffset = 200 * (1 - cd/max);
                       txt.textContent = Math.ceil(cd);
                       el.querySelector('button').style.filter = 'grayscale(100%)';
                   } else {
                       svg.style.strokeDashoffset = 200;
                       txt.textContent = '';
                       el.querySelector('button').style.filter = 'none';
                   }
                });
            }
        };

        // World Setup
        this.map = {
            walls: [
                {x: 600, y: 400, w: 200, h: 400}, // Left Jungle
                {x: 1600, y: 800, w: 200, h: 400}, // Right Jungle
                {x: 0, y: 0, w: 2400, h: 50}, // Top Border
                {x: 0, y: 1550, w: 2400, h: 50} // Bot Border
            ]
        };

        this.entities = [];
        this.hero = new Hero(this);
        this.entities.push(this.hero);
        this.input = new InputSys(this);
        
        this.camera = { x: 0, y: 0, shakeVal: 0, shake: (v) => this.camera.shakeVal = v };
        
        // Spawn Towers
        this.entities.push(new Tower(this, 400, CONFIG.MAP_H/2, 1));
        this.entities.push(new Tower(this, 2000, CONFIG.MAP_H/2, 2));

        // Start Loop
        this.lastTime = 0;
        this.isRunning = false;

        window.addEventListener('resize', () => this.resize());
        
        // Setup Start Button
        document.getElementById('start-btn').addEventListener('click', () => {
            this.start();
        });
        
        Debug.log('Wait for User Start...');
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    start() {
        if (this.isRunning) return;
        document.getElementById('start-screen').style.display = 'none';
        this.audio.init();
        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame(t => this.loop(t));
        
        // Spawner
        setInterval(() => this.spawnWave(), 10000); // 10s per wave
        this.spawnWave();
        Debug.log('Game Started!');
    }

    spawnWave() {
        const waypointsAlly = [{x: 2400, y: CONFIG.MAP_H/2}];
        const waypointsEnemy = [{x: 0, y: CONFIG.MAP_H/2}];
        
        for(let i=0; i<3; i++) {
            setTimeout(() => {
                this.entities.push(new Minion(this, 100, CONFIG.MAP_H/2 + Math.random()*40-20, 1, waypointsAlly));
                this.entities.push(new Minion(this, 2300, CONFIG.MAP_H/2 + Math.random()*40-20, 2, waypointsEnemy));
            }, i * 800);
        }
    }

    loop(now) {
        const dt = Math.min((now - this.lastTime) / 1000, 0.1); // Cap dt
        this.lastTime = now;

        try {
            this.update(dt);
            this.render();
        } catch (e) {
            Debug.error(e.message);
            return; // Stop loop on error
        }

        requestAnimationFrame(t => this.loop(t));
    }

    update(dt) {
        // Update Camera
        let tx = this.hero.pos.x - this.canvas.width/2;
        let ty = this.hero.pos.y - this.canvas.height/2;
        
        // Shake
        if (this.camera.shakeVal > 0) {
            tx += (Math.random() - 0.5) * this.camera.shakeVal;
            ty += (Math.random() - 0.5) * this.camera.shakeVal;
            this.camera.shakeVal *= 0.9;
        }

        this.camera.x += (tx - this.camera.x) * 0.1; // Smooth
        this.camera.y += (ty - this.camera.y) * 0.1;
        
        // Clamp Camera
        this.camera.x = Math.max(0, Math.min(this.camera.x, CONFIG.MAP_W - this.canvas.width));
        this.camera.y = Math.max(0, Math.min(this.camera.y, CONFIG.MAP_H - this.canvas.height));

        // Update Entities
        this.entities = this.entities.filter(e => !e.markedForDeletion);
        this.entities.forEach(e => e.update(dt));
    }

    render() {
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset Identity
        ctx.fillStyle = CONFIG.COLORS.bg;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Translate Camera
        ctx.translate(-this.camera.x, -this.camera.y);

        // 1. Draw Ground Grid
        ctx.strokeStyle = CONFIG.COLORS.grid;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for(let x=0; x<=CONFIG.MAP_W; x+=100) { ctx.moveTo(x,0); ctx.lineTo(x, CONFIG.MAP_H); }
        for(let y=0; y<=CONFIG.MAP_H; y+=100) { ctx.moveTo(0,y); ctx.lineTo(CONFIG.MAP_W, y); }
        ctx.stroke();

        // 2. Draw Lane (Mid)
        ctx.fillStyle = CONFIG.COLORS.lane;
        ctx.fillRect(0, CONFIG.MAP_H/2 - 100, CONFIG.MAP_W, 200);

        // 3. Draw Walls
        ctx.fillStyle = CONFIG.COLORS.wall;
        this.map.walls.forEach(w => {
            ctx.fillRect(w.x, w.y, w.w, w.h);
            ctx.strokeStyle = '#555'; ctx.strokeRect(w.x, w.y, w.w, w.h);
        });

        // 4. Draw Entities (Sorted by Y for depth)
        this.entities.sort((a,b) => a.pos.y - b.pos.y);
        this.entities.forEach(e => e.draw(ctx));

        // 5. Floating Text (In entity list ideally, but kept simple here)
        this.floatingTexts = this.floatingTexts ? this.floatingTexts.filter(t => t.life > 0) : [];
        this.floatingTexts.forEach(t => {
            t.y -= 20 * 0.016; t.life -= 0.016;
            ctx.fillStyle = t.color; ctx.font = 'bold 24px Arial'; ctx.fillText(t.val, t.x, t.y);
        });
    }

    addProjectile(x, y, angle, speed, dmg, team, type, target) {
        this.entities.push(new Projectile(this, x, y, angle, speed, dmg, team, type, target));
    }

    addEffect(x, y, r, color, time) {
        // Simple visual filler
        // In full engine, push to particle system
    }

    addFloatingText(val, x, y, color) {
        if(!this.floatingTexts) this.floatingTexts = [];
        this.floatingTexts.push({val, x, y, color, life: 1.0});
    }
    
    addParticle(x, y, color) {
        // Particle implementation
    }

    getNearestEnemy(source, range) {
        let nearest = null;
        let minD = range;
        for(let e of this.entities) {
            if (e.team !== source.team && e.hp > 0 && (e instanceof MobileUnit || e instanceof Tower)) {
                const d = Vec2.dist(source.pos, e.pos);
                if (d < minD) { minD = d; nearest = e; }
            }
        }
        return nearest;
    }

    checkCollision(circle, radius) {
        for(let e of this.entities) {
            if (e === circle || e instanceof Projectile) continue;
            const d = Vec2.dist(circle.pos, e.pos);
            if (d < radius + e.radius) return e;
        }
        return null;
    }
    
    dealAreaDamage(x, y, radius, damage, sourceTeam) {
        this.entities.forEach(e => {
            if (e.team !== sourceTeam && (e instanceof MobileUnit || e instanceof Tower)) {
                if (Vec2.dist({x,y}, e.pos) < radius + e.radius) {
                    e.takeDamage(damage);
                }
            }
        });
    }
}

// Init
window.onload = () => {
    try {
        window.game = new Game();
    } catch(e) {
        document.body.innerHTML = `<h1 style="color:white">FATAL ERROR: ${e.message}</h1>`;
    }
};

/* =========================================
   VOID CORRIDOR - NIGHTMARE MODE
   ========================================= */

// --- CONFIGURATION ---
const CONFIG = {
    fov: 0.66,
    resX: 320, 
    rotSpeed: 0.002, 
    moveSpeed: 0.08,
    dashSpeed: 0.15,
    maxHeat: 100,
    coolRate: 0.6,
    shootCost: 12,
    renderDist: 25,
    spawnRate: 2000, // Thời gian spawn quái mới (ms) - 2 giây ra 1 con
    maxEnemies: 30   // Tối đa số lượng entity cùng lúc
};

// --- GLOBAL STATE ---
const state = {
    running: false,
    lastTime: 0,
    lastSpawn: 0, // Timer cho spawn
    keys: {},
    player: { x: 2.5, y: 2.5, dirX: -1, dirY: 0, planeX: 0, planeY: 0.66, hp: 100, heat: 0, overheated: false },
    map: [],
    entities: [],
    zBuffer: [],
    audioCtx: null,
    wobble: 0,
    mouseDown: false
};

// --- DOM ELEMENTS ---
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });
const els = {
    hp: document.getElementById('hp-bar'),
    heat: document.getElementById('heat-bar'),
    msg: document.getElementById('message-log'),
    dmg: document.getElementById('damage-overlay'),
    radar: document.getElementById('radar'),
    cont: document.getElementById('game-container'),
    startScreen: document.getElementById('start-screen'),
    deathScreen: document.getElementById('death-screen')
};

// --- MAP GENERATION ---
const MAP_SIZE = 24;
// 1 = Wall, 0 = Floor, 2 = Red Wall
const rawMap = 
"111111111111111111111111" +
"100000001000000000000001" +
"100000001001111111000001" +
"100000000001000000000001" +
"100000000001011100000001" +
"101111110000010100000001" +
"100000010001010100011111" +
"100000010000000000010001" +
"111001111111000000010001" +
"100000000001000000000001" +
"100000000001111011110001" +
"101101111100000000010001" +
"101000000000000000000001" +
"101000000000000000000001" +
"101111111001110111000001" +
"100000000001000100000001" +
"100000000001000100000001" +
"100111111111000111110001" +
"100000000000000000000001" +
"100000000000000000000001" +
"111110001111110001111111" +
"100000000000000000000001" +
"100000000000000000000001" +
"111111111111111111111111";

function initMap() {
    state.map = [];
    for(let y=0; y<MAP_SIZE; y++) {
        let row = [];
        for(let x=0; x<MAP_SIZE; x++) {
            row.push(parseInt(rawMap[y*MAP_SIZE + x]));
        }
        state.map.push(row);
    }
}

// --- AUDIO ENGINE ---
class AudioSys {
    constructor() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
    }

    playTone(freq, type, dur, vol = 1, slide = 0) {
        if (!state.running) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, this.ctx.currentTime + dur);
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + dur);
    }

    noise(dur, vol = 1, highPass = false) {
        if (!state.running) return;
        const bufferSize = this.ctx.sampleRate * dur;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);

        let node = noise;
        if (highPass) {
            const filter = this.ctx.createBiquadFilter();
            filter.type = "highpass";
            filter.frequency.value = 1000;
            noise.connect(filter);
            node = filter;
        }

        node.connect(gain);
        gain.connect(this.master);
        noise.start();
    }

    shoot() { this.noise(0.15, 0.6, true); this.playTone(200, 'sawtooth', 0.15, 0.4, -100); }
    step() { this.noise(0.05, 0.1, false); }
    hit() { this.playTone(100, 'square', 0.1, 0.5, -50); }
    enemyAlert() { this.playTone(600, 'sine', 0.5, 0.2, 200); }
    empty() { this.playTone(800, 'sine', 0.05, 0.2); }
    heartbeat() { this.playTone(60, 'sine', 0.1, 1.0); }
    
    // MỚI: Âm thanh spawn đáng sợ
    spawnAlert() {
        // Tạo hợp âm nghịch (Dissonance)
        this.playTone(150, 'sawtooth', 0.8, 0.6, -20);
        this.playTone(215, 'square', 0.8, 0.4, -30); // ~Tritone
        this.noise(0.5, 0.3); // Tiếng xì xào nền
    }
}
let audio = null;

// --- ENTITIES ---
class Entity {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 0: Stalker, 1: Phaser, 2: Brute, 3: Med, 4: Cell
        this.active = true;
        this.hp = type === 2 ? 150 : (type < 2 ? 60 : 1);
        this.seen = false;
        this.timer = Math.random() * 1000;
    }

    update(dt, pX, pY) {
        if (!this.active) return;
        const dx = pX - this.x;
        const dy = pY - this.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (this.type === 0) { // Stalker
            if ((!this.seen && dist > 1) || dist < 2) {
                this.x += (dx/dist) * 0.035; // Nhanh hơn một chút
                this.y += (dy/dist) * 0.035;
            }
            if (dist < 1.0 && Math.random() < 0.03) {
                damagePlayer(5);
                audio.playTone(150, 'sawtooth', 0.1);
            }
        } 
        else if (this.type === 1) { // Phaser
            this.timer += dt;
            if (this.timer > 2000) {
                if (Math.random() > 0.6 && dist < 10) {
                    const angle = Math.random() * Math.PI * 2;
                    const tx = pX + Math.cos(angle) * 3;
                    const ty = pY + Math.sin(angle) * 3;
                    if (ty > 0 && ty < MAP_SIZE && tx > 0 && tx < MAP_SIZE && state.map[Math.floor(ty)][Math.floor(tx)] === 0) {
                        this.x = tx; this.y = ty;
                        audio.enemyAlert();
                    }
                }
                this.timer = 0;
            }
            if (dist > 2) {
                this.x += (dx/dist) * 0.02;
                this.y += (dy/dist) * 0.02;
            }
            if (dist < 1.5 && Math.random() < 0.02) damagePlayer(2);
        } 
        else if (this.type === 2) { // Brute
            if (dist < 15) {
                this.x += (dx/dist) * 0.028;
                this.y += (dy/dist) * 0.028;
                if (dist < 4) {
                    state.wobble = 5;
                    if (Math.random() < 0.05) audio.step();
                }
                if (dist < 1.2 && Math.random() < 0.05) {
                    damagePlayer(15);
                    audio.noise(0.3, 1);
                }
            }
        }
    }
}

function spawnEntities() {
    state.entities = [];
    // Spawn ban đầu
    state.entities.push(new Entity(10, 5, 0)); 
    state.entities.push(new Entity(12, 5, 0));
    state.entities.push(new Entity(15, 10, 1));
    state.entities.push(new Entity(20, 20, 2));
    
    // Items
    state.entities.push(new Entity(5, 5, 3)); 
    state.entities.push(new Entity(8, 8, 4)); 
}

// MỚI: Hàm spawn quái ngẫu nhiên
function spawnDynamic() {
    if (state.entities.length >= CONFIG.maxEnemies) return;

    let attempts = 0;
    let spawned = false;
    
    while (!spawned && attempts < 10) {
        attempts++;
        // Chọn vị trí ngẫu nhiên
        let rx = Math.floor(Math.random() * MAP_SIZE);
        let ry = Math.floor(Math.random() * MAP_SIZE);

        // 1. Phải là sàn nhà (0)
        if (state.map[ry][rx] === 0) {
            // 2. Tính khoảng cách tới người chơi
            const dist = Math.hypot(rx - state.player.x, ry - state.player.y);
            
            // 3. Không spawn quá gần (tránh chết ngay) nhưng cũng không quá xa
            if (dist > 5) {
                // Random loại quái: 60% Stalker, 30% Phaser, 10% Brute
                let rand = Math.random();
                let type = 0;
                if (rand > 0.9) type = 2;
                else if (rand > 0.6) type = 1;
                
                // Đôi khi spawn item thay vì quái
                if (Math.random() < 0.2) type = Math.random() > 0.5 ? 3 : 4;

                state.entities.push(new Entity(rx + 0.5, ry + 0.5, type));
                spawned = true;

                // Chỉ chơi âm thanh nếu đó là quái vật
                if (type <= 2) {
                    audio.spawnAlert();
                    els.msg.innerText = "WARNING: ENTITY DETECTED";
                    els.msg.style.opacity = 1;
                    setTimeout(() => els.msg.style.opacity = 0.7, 1000);
                }
            }
        }
    }
}

// --- RAYCASTING RENDERER ---
function render() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height / 2); // Ceiling
    ctx.fillStyle = '#222';
    ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2); // Floor

    state.zBuffer = new Array(CONFIG.resX).fill(0);

    for (let x = 0; x < CONFIG.resX; x++) {
        const cameraX = 2 * x / CONFIG.resX - 1;
        const rayDirX = state.player.dirX + state.player.planeX * cameraX;
        const rayDirY = state.player.dirY + state.player.planeY * cameraX;

        let mapX = Math.floor(state.player.x);
        let mapY = Math.floor(state.player.y);

        let sideDistX, sideDistY;
        const deltaDistX = Math.abs(1 / rayDirX);
        const deltaDistY = Math.abs(1 / rayDirY);
        let perpWallDist;
        let stepX, stepY;
        let hit = 0;
        let side;

        if (rayDirX < 0) { stepX = -1; sideDistX = (state.player.x - mapX) * deltaDistX; }
        else { stepX = 1; sideDistX = (mapX + 1.0 - state.player.x) * deltaDistX; }
        if (rayDirY < 0) { stepY = -1; sideDistY = (state.player.y - mapY) * deltaDistY; }
        else { stepY = 1; sideDistY = (mapY + 1.0 - state.player.y) * deltaDistY; }

        let safeLoop = 0;
        while (hit === 0 && safeLoop < 50) {
            safeLoop++;
            if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
            else { sideDistY += deltaDistY; mapY += stepY; side = 1; }
            
            if (mapX < 0 || mapX >= MAP_SIZE || mapY < 0 || mapY >= MAP_SIZE) { hit = 1; }
            else if (state.map[mapY][mapX] > 0) hit = 1;
        }

        if (side === 0) perpWallDist = (mapX - state.player.x + (1 - stepX) / 2) / rayDirX;
        else perpWallDist = (mapY - state.player.y + (1 - stepY) / 2) / rayDirY;

        state.zBuffer[x] = perpWallDist;

        const h = canvas.height;
        const lineHeight = Math.floor(h / perpWallDist);
        const drawStart = Math.max(0, -lineHeight / 2 + h / 2 + state.wobble);
        
        let shade = 255 / (perpWallDist * 0.7); 
        if(shade > 255) shade = 255;
        if(side === 1) shade *= 0.6;

        let r=shade*0.1, g=shade*0.8, b=shade*0.4;
        if (mapX >= 0 && mapX < MAP_SIZE && mapY >= 0 && mapY < MAP_SIZE && state.map[mapY][mapX] === 2) {
             r=shade*0.8; g=shade*0.1; b=shade*0.1;
        }

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        const w = Math.ceil(canvas.width / CONFIG.resX);
        ctx.fillRect(x * w, drawStart, w, lineHeight);
    }

    renderSprites();
    renderWeapon();
}

function renderSprites() {
    state.entities.forEach(e => {
        e.dist = ((state.player.x - e.x) ** 2 + (state.player.y - e.y) ** 2);
    });
    state.entities.sort((a, b) => b.dist - a.dist);

    state.entities.forEach(ent => {
        if (!ent.active) return;
        ent.seen = false;

        const spriteX = ent.x - state.player.x;
        const spriteY = ent.y - state.player.y;

        const invDet = 1.0 / (state.player.planeX * state.player.dirY - state.player.dirX * state.player.planeY);
        const transformX = invDet * (state.player.dirY * spriteX - state.player.dirX * spriteY);
        const transformY = invDet * (-state.player.planeY * spriteX + state.player.planeX * spriteY);

        if (transformY <= 0.1) return;

        const spriteScreenX = Math.floor((CONFIG.resX / 2) * (1 + transformX / transformY));
        const spriteHeight = Math.abs(Math.floor(canvas.height / transformY));
        const spriteWidth = Math.abs(Math.floor(canvas.height / transformY)); 
        const drawStartY = -spriteHeight / 2 + canvas.height / 2 + state.wobble;
        const drawStartX = -spriteWidth / 2 + spriteScreenX;

        if (spriteScreenX > 0 && spriteScreenX < CONFIG.resX && transformY < state.zBuffer[spriteScreenX]) {
            ent.seen = true;
        }

        const stripeWidth = Math.ceil(canvas.width / CONFIG.resX);

        for (let stripe = drawStartX; stripe < drawStartX + spriteWidth; stripe++) {
            const texX = Math.floor(stripe);
            if (texX > 0 && texX < CONFIG.resX && transformY < state.zBuffer[texX]) {
                const xPos = texX * stripeWidth;
                
                if (ent.type === 0) ctx.fillStyle = '#eee';
                else if (ent.type === 1) ctx.fillStyle = `rgba(0, 255, 255, ${Math.random()})`;
                else if (ent.type === 2) ctx.fillStyle = '#c33';
                else if (ent.type === 3) ctx.fillStyle = '#0f0';
                else if (ent.type === 4) ctx.fillStyle = '#fb0';

                ctx.fillRect(xPos, drawStartY, stripeWidth, spriteHeight);

                if (ent.type <= 2) {
                    const progress = (stripe - drawStartX) / spriteWidth;
                    if (progress > 0.3 && progress < 0.7) {
                        ctx.fillStyle = '#000';
                        ctx.fillRect(xPos, drawStartY + spriteHeight*0.2, stripeWidth, spriteHeight*0.1);
                    }
                }
            }
        }
    });
}

// --- WEAPON & LOGIC ---
let gunRecoil = 0;

function renderWeapon() {
    const w = canvas.width;
    const h = canvas.height;
    const bob = Math.sin(Date.now() / 150) * (state.keys['KeyW'] || state.keys['KeyS'] ? 10 : 0);
    const gx = w * 0.6; 
    const gy = h - bob + gunRecoil;

    ctx.fillStyle = '#444';
    ctx.fillRect(gx - 20, gy - 60, 40, 100);
    
    const heatColor = `rgb(0, ${255 - state.player.heat*2}, 255)`;
    ctx.fillStyle = heatColor;
    ctx.fillRect(gx - 5, gy - 60, 10, 60);

    if (gunRecoil > 15) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(gx, gy - 70, 20 + Math.random()*20, 0, Math.PI*2);
        ctx.fill();
    }
}

function update(dt) {
    if (state.player.hp <= 0) { die(); return; }

    const speed = state.keys['ShiftLeft'] ? CONFIG.dashSpeed : CONFIG.moveSpeed;
    
    if (state.keys['KeyW']) move(speed);
    if (state.keys['KeyS']) move(-speed);
    
    // Strafe logic (Corrected)
    if (state.keys['KeyA']) {
        const dx = -state.player.dirY * speed;
        const dy = state.player.dirX * speed;
        checkMove(dx, dy);
    }
    if (state.keys['KeyD']) {
        const dx = state.player.dirY * speed;
        const dy = -state.player.dirX * speed;
        checkMove(dx, dy);
    }

    if (state.player.heat > 0) state.player.heat -= CONFIG.coolRate;
    else state.player.heat = 0;
    
    if (state.player.heat < 70) state.player.overheated = false;
    if (gunRecoil > 0) gunRecoil -= 2;

    // --- LOGIC SPAWN QUÁI LIÊN TỤC ---
    if (Date.now() - state.lastSpawn > CONFIG.spawnRate) {
        spawnDynamic();
        state.lastSpawn = Date.now();
    }

    state.entities.forEach(ent => ent.update(dt, state.player.x, state.player.y));
    
    state.entities = state.entities.filter(ent => {
        const dist = Math.hypot(ent.x - state.player.x, ent.y - state.player.y);
        
        if (ent.type === 3 && dist < 0.8) {
            state.player.hp = Math.min(100, state.player.hp + 25);
            audio.playTone(400, 'sine', 0.1);
            return false;
        }
        if (ent.type === 4 && dist < 0.8) {
            state.player.heat = 0;
            audio.playTone(600, 'sine', 0.1);
            return false;
        }
        if (ent.hp <= 0) return false;
        return true;
    });

    if (state.player.hp < 30 && Date.now() % 1000 < 50) audio.heartbeat();
    if (state.wobble > 0) state.wobble *= 0.9;
    
    updateHUD();
}

function checkMove(dx, dy) {
    const nextX = state.player.x + dx;
    const nextY = state.player.y + dy;
    if (state.map[Math.floor(state.player.y)][Math.floor(nextX + 0.2*Math.sign(dx))] === 0) state.player.x = nextX;
    if (state.map[Math.floor(nextY + 0.2*Math.sign(dy))][Math.floor(state.player.x)] === 0) state.player.y = nextY;
}

function move(speed) {
    checkMove(state.player.dirX * speed, state.player.dirY * speed);
    if (Date.now() % 450 < 20) audio.step();
}

function fire() {
    if (state.player.overheated) { audio.empty(); return; }
    
    state.player.heat += CONFIG.shootCost;
    if (state.player.heat >= CONFIG.maxHeat) {
        state.player.heat = CONFIG.maxHeat;
        state.player.overheated = true;
        audio.playTone(100, 'sawtooth', 0.3);
    }

    gunRecoil = 20;
    audio.shoot();
    
    let spread = state.player.heat * 0.002;
    let aimX = state.player.dirX + (Math.random()-0.5)*spread;
    let aimY = state.player.dirY + (Math.random()-0.5)*spread;

    let closest = null;
    let minD = 1000;

    state.entities.forEach(ent => {
        if (ent.type > 2) return;
        let dx = ent.x - state.player.x;
        let dy = ent.y - state.player.y;
        let dist = Math.hypot(dx, dy);
        let dot = (aimX * dx + aimY * dy) / dist;
        
        if (dot > 0.9 && dist < minD) {
            minD = dist;
            closest = ent;
        }
    });

    if (closest) {
        closest.hp -= 25;
        closest.x += aimX * 0.4;
        closest.y += aimY * 0.4;
        audio.hit();
        els.cont.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        setTimeout(() => els.cont.style.backgroundColor = 'transparent', 50);
    }
}

function damagePlayer(amt) {
    state.player.hp -= amt;
    state.wobble = 15;
    els.dmg.style.opacity = 1;
    setTimeout(() => els.dmg.style.opacity = 0, 200);
}

function updateHUD() {
    els.hp.style.width = Math.max(0, state.player.hp) + '%';
    els.heat.style.width = state.player.heat + '%';
    if(state.player.overheated) els.heat.style.backgroundColor = 'red';
    else els.heat.style.backgroundColor = '#fa0';
    
    let threat = state.entities.some(e => e.type <= 2 && Math.hypot(e.x-state.player.x, e.y-state.player.y) < 6);
    els.radar.style.opacity = threat ? 1 : 0;
}

function die() {
    state.running = false;
    document.exitPointerLock();
    els.deathScreen.classList.add('visible');
}

// --- LOOP ---
function loop(timestamp) {
    if (!state.running) return;
    const dt = timestamp - state.lastTime;
    state.lastTime = timestamp;

    update(dt);
    render();
    if(state.mouseDown && Date.now() % 100 < 20) fire();
    requestAnimationFrame(loop);
}

// --- EVENTS ---
document.addEventListener('keydown', e => state.keys[e.code] = true);
document.addEventListener('keyup', e => state.keys[e.code] = false);

document.addEventListener('mousemove', e => {
    if (state.running) {
        const oldDirX = state.player.dirX;
        const rot = -e.movementX * CONFIG.rotSpeed;
        state.player.dirX = state.player.dirX * Math.cos(rot) - state.player.dirY * Math.sin(rot);
        state.player.dirY = oldDirX * Math.sin(rot) + state.player.dirY * Math.cos(rot);
        const oldPlaneX = state.player.planeX;
        state.player.planeX = state.player.planeX * Math.cos(rot) - state.player.planeY * Math.sin(rot);
        state.player.planeY = oldPlaneX * Math.sin(rot) + state.player.planeY * Math.cos(rot);
    }
});

document.addEventListener('mousedown', () => {
    if(state.running) {
        state.mouseDown = true;
        fire();
    }
});
document.addEventListener('mouseup', () => state.mouseDown = false);

document.getElementById('start-btn').addEventListener('click', () => {
    if(!audio) audio = new AudioSys();
    state.running = true;
    state.player.hp = 100;
    state.player.x = 2.5; 
    state.player.y = 2.5;
    initMap();
    spawnEntities();
    state.lastSpawn = Date.now(); // Reset timer spawn
    els.startScreen.classList.remove('visible');
    canvas.requestPointerLock();
    state.lastTime = performance.now();
    loop(performance.now());
});

document.getElementById('restart-btn').addEventListener('click', () => location.reload());

window.addEventListener('resize', () => {
    canvas.width = CONFIG.resX;
    canvas.height = CONFIG.resX * (window.innerHeight/window.innerWidth);
});

// Init
canvas.width = CONFIG.resX;
canvas.height = CONFIG.resX * (window.innerHeight/window.innerWidth);
initMap();
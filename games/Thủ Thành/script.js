const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- CẤU HÌNH ---
const TILE_SIZE = 64;
const COLS = 15;
const ROWS = 10;
// MAP đã sửa: 1 ở đầu để vào, 1 ở cuối để ra
const MAP = [
    [2, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 2],
    [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0],
    [0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    [0, 0, 1, 1, 1, 1, 0, 2, 0, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    [2, 0, 1, 0, 0, 1, 1, 1, 1, 1, 0, 3, 0, 0, 0],
    [0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2]
];

// --- HỆ THỐNG ÂM THANH ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sounds = {
    shoot: (type) => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;
        
        if (type === 'cannon') {
            osc.type = 'square'; osc.frequency.setValueAtTime(150, now); 
            osc.frequency.exponentialRampToValueAtTime(40, now+0.3);
            gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0, now+0.3);
            osc.start(now); osc.stop(now+0.3);
        } else {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(200, now+0.1);
            gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.1);
            osc.start(now); osc.stop(now+0.1);
        }
    },
    build: () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination); const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(400, now); osc.frequency.linearRampToValueAtTime(800, now+0.15);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.15);
        osc.start(now); osc.stop(now+0.15);
    },
    baseHit: () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        // Tiếng nổ trầm và lớn khi công thành
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = 'sawtooth'; osc.connect(gain); gain.connect(audioCtx.destination); const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(100, now); osc.frequency.exponentialRampToValueAtTime(20, now+0.5);
        gain.gain.setValueAtTime(0.4, now); gain.gain.linearRampToValueAtTime(0, now+0.5);
        osc.start(now); osc.stop(now+0.5);
    }
};

// --- TÌM ĐƯỜNG & THÀNH TRÌ ---
let path = [];
let baseCoords = {x:0, y:0}; // Tọa độ thành trì

function findPath() {
    path = [];
    let startR = MAP.findIndex(row => row[0] === 1);
    if (startR === -1) { console.error("Lỗi Map!"); return; }
    let curr = {c: 0, r: startR};
    let visited = new Set();
    
    while(true) {
        const posX = curr.c * TILE_SIZE + TILE_SIZE/2;
        const posY = curr.r * TILE_SIZE + TILE_SIZE/2;
        path.push({x: posX, y: posY});
        visited.add(`${curr.c},${curr.r}`);
        
        // Cập nhật tọa độ thành trì là điểm cuối cùng của con đường
        baseCoords = {x: posX, y: posY};

        if (curr.c === COLS - 1 || curr.r === ROWS - 1) break;

        const neighbors = [{c:curr.c+1,r:curr.r},{c:curr.c,r:curr.r+1},{c:curr.c,r:curr.r-1},{c:curr.c-1,r:curr.r}];
        let foundNext = false;
        for (let n of neighbors) {
            if (n.c >= 0 && n.c < COLS && n.r >= 0 && n.r < ROWS && MAP[n.r][n.c] === 1 && !visited.has(`${n.c},${n.r}`)) {
                curr = n; foundNext = true; break;
            }
        }
        if (!foundNext) break;
    }
}

// --- GAME STATE ---
let state = {
    active: false, frame: 0, gold: 400, lives: 20, wave: 1,
    enemies: [], towers: [], bullets: [], particles: [],
    buildMode: null, skillCD: 0, spawnCount: 0
};

// --- CLASSES ---
class Particle {
    constructor(x, y, color, speed, size, lifeDecay = 0.05) {
        this.x = x; this.y = y; this.color = color; this.size = size;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
        this.life = 1.0; this.lifeDecay = lifeDecay;
    }
    update() { this.x += this.vx; this.y += this.vy; this.life -= this.lifeDecay; this.size *= 0.95; }
    draw() {
        ctx.globalAlpha = this.life; ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class Enemy {
    constructor(type) {
        if (path.length === 0) { this.dead = true; return; }
        this.pathIdx = 0; this.x = path[0].x; this.y = path[0].y;
        this.type = type; this.dead = false;
        const scale = Math.pow(1.2, state.wave - 1);
        if (type === 'goblin') { this.hp=40*scale; this.maxHp=this.hp; this.speed=3; this.reward=10; }
        else if (type === 'orc') { this.hp=120*scale; this.maxHp=this.hp; this.speed=1.5; this.reward=25; }
        else if (type === 'boss') { this.hp=600*scale; this.maxHp=this.hp; this.speed=0.8; this.reward=100; }
        this.wobble = Math.random() * 100;
    }
    update() {
        if (this.dead) return;
        const target = path[this.pathIdx + 1];
        if (!target) {
            // --- ĐÃ ĐẾN THÀNH TRÌ ---
            this.dead = true;
            state.lives--;
            sounds.baseHit(); // Âm thanh nổ lớn
            // Hiệu ứng nổ tại thành trì
            for(let i=0; i<30; i++) {
                state.particles.push(new Particle(baseCoords.x, baseCoords.y, ['orange','red','yellow'][Math.floor(Math.random()*3)], 8, 15, 0.02));
            }
            // Rung màn hình
            canvas.style.transform = `translate(${Math.random()*10-5}px, ${Math.random()*10-5}px)`;
            setTimeout(() => canvas.style.transform = 'none', 100);
            return;
        }
        const dx = target.x - this.x; const dy = target.y - this.y; const dist = Math.hypot(dx, dy);
        if (dist < this.speed) { this.pathIdx++; this.x = target.x; this.y = target.y; }
        else { this.x += (dx/dist) * this.speed; this.y += (dy/dist) * this.speed; }
        if (state.frame % 15 === 0) state.particles.push(new Particle(this.x, this.y+10, 'rgba(100,100,100,0.4)', 0.5, 3));
    }
    draw() {
        if (this.dead) return;
        const anim = Math.sin((state.frame + this.wobble) * 0.2) * 3;
        ctx.save(); ctx.translate(this.x, this.y + anim);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 15, 10, 5, 0, 0, Math.PI*2); ctx.fill();
        if (this.type === 'goblin') {
            ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(-4, -2, 5, 0, Math.PI*2); ctx.arc(4, -2, 5, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(-4, -2, 2, 0, Math.PI*2); ctx.arc(4, -2, 2, 0, Math.PI*2); ctx.fill();
        } else if (this.type === 'orc') {
            ctx.fillStyle = '#c0392b'; ctx.fillRect(-12, -14, 24, 28);
            ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(-6, 14); ctx.lineTo(-2, 8); ctx.fill();
            ctx.beginPath(); ctx.moveTo(6, 8); ctx.lineTo(6, 14); ctx.lineTo(2, 8); ctx.fill();
        } else if (this.type === 'boss') {
            ctx.fillStyle = '#8e44ad'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'gold'; ctx.fillRect(-10, -25, 20, 10); ctx.fillStyle = 'red'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill();
        }
        const hpPct = this.hp / this.maxHp; ctx.fillStyle = 'red'; ctx.fillRect(-15, -25, 30, 4);
        ctx.fillStyle = '#00ff00'; ctx.fillRect(-15, -25, 30 * hpPct, 4);
        ctx.restore();
    }
    takeDmg(amount) {
        this.hp -= amount; for(let i=0; i<2; i++) state.particles.push(new Particle(this.x, this.y, 'red', 2, 2));
        if (this.hp <= 0) { this.dead = true; state.gold += this.reward; state.particles.push(new Particle(this.x, this.y, 'grey', 0, 15)); }
    }
}

class Tower {
    constructor(c, r, type) {
        this.c = c; this.r = r; this.x = c * TILE_SIZE + TILE_SIZE/2; this.y = r * TILE_SIZE + TILE_SIZE/2;
        this.type = type; this.angle = 0; this.cd = 0;
        if (type === 'archer') { this.range=160; this.dmg=25; this.reload=35; }
        else if (type === 'cannon') { this.range=140; this.dmg=50; this.reload=90; }
        else if (type === 'laser') { this.range=180; this.dmg=3; this.reload=0; }
    }
    update() {
        if (this.cd > 0) this.cd--;
        let target = state.enemies.find(e => !e.dead && Math.hypot(e.x - this.x, e.y - this.y) <= this.range);
        if (target) {
            this.angle = Math.atan2(target.y - this.y, target.x - this.x);
            if (this.type === 'laser') {
                target.takeDmg(this.dmg);
                ctx.lineWidth=3; ctx.strokeStyle='#00ffff'; ctx.shadowBlur=10; ctx.shadowColor='#00ffff';
                ctx.beginPath(); ctx.moveTo(this.x, this.y-10); ctx.lineTo(target.x, target.y); ctx.stroke();
                ctx.shadowBlur=0; ctx.lineWidth=1;
            } else if (this.cd <= 0) {
                state.bullets.push({x:this.x, y:this.y-10, type:this.type, target:target, dmg:this.dmg, speed:10});
                sounds.shoot(this.type); // Âm thanh bắn
                this.cd = this.reload;
            }
        }
    }
    draw() {
        ctx.save(); ctx.translate(this.x, this.y);
        ctx.fillStyle = '#95a5a6'; ctx.beginPath(); ctx.arc(0,0, 20, 0, Math.PI*2); ctx.fill();
        ctx.rotate(this.angle);
        if (this.type === 'archer') {
            ctx.fillStyle = '#d35400'; ctx.fillRect(-10, -10, 20, 20); ctx.fillStyle = 'white'; ctx.fillRect(0, -2, 20, 4);
        } else if (this.type === 'cannon') {
            ctx.fillStyle = '#2c3e50'; ctx.fillRect(-15, -15, 30, 30); ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill(); ctx.fillRect(0, -10, 25, 20);
        } else if (this.type === 'laser') {
            ctx.fillStyle = '#2980b9'; ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(10, 10); ctx.lineTo(0, -15); ctx.fill(); ctx.fillStyle = '#0ff'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    }
}

// --- MAIN LOOP ---
function drawMapAndBase() {
    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            const x = c*TILE_SIZE, y = r*TILE_SIZE; const type = MAP[r][c];
            if (type === 1) {
                ctx.fillStyle = '#d7ccc8'; ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.strokeRect(x,y,TILE_SIZE,TILE_SIZE);
            } else {
                ctx.fillStyle = '#e6c288'; ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                if (type === 2) { ctx.fillStyle = '#795548'; ctx.beginPath(); ctx.arc(x+32, y+32, 15, 0, Math.PI*2); ctx.fill(); }
                else if (type === 3) { ctx.fillStyle = '#5d4037'; ctx.fillRect(x+30, y+10, 4, 40); ctx.fillRect(x+20, y+20, 24, 4); }
            }
        }
    }
    // VẼ THÀNH TRÌ (Ở tọa độ baseCoords)
    ctx.save(); ctx.translate(baseCoords.x, baseCoords.y);
    // Hào quang
    ctx.beginPath(); ctx.arc(0,0,45,0,Math.PI*2); ctx.fillStyle='rgba(241, 196, 15, 0.2)'; ctx.fill();
    ctx.strokeStyle='rgba(241, 196, 15, 0.5)'; ctx.lineWidth=2; ctx.stroke();
    // Tường thành
    ctx.fillStyle = '#34495e'; ctx.fillRect(-32, -32, 64, 64);
    // Cổng
    ctx.fillStyle = '#2c3e50'; ctx.fillRect(-15, 0, 30, 32);
    // Tháp canh
    ctx.fillStyle = '#95a5a6'; ctx.fillRect(-32, -40, 20, 20); ctx.fillRect(12, -40, 20, 20);
    ctx.restore();
}

function gameLoop() {
    if (!state.active) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.frame++;
    drawMapAndBase();

    if (state.frame % 50 === 0 && state.spawnCount > 0) {
        let type = 'goblin'; if (state.wave > 2 && state.spawnCount % 3 === 0) type = 'orc'; if (state.wave % 5 === 0 && state.spawnCount === 1) type = 'boss';
        state.enemies.push(new Enemy(type)); state.spawnCount--;
    } else if (state.enemies.length === 0 && state.spawnCount === 0) {
        state.wave++; state.spawnCount = 5 + state.wave * 2; state.gold += 100;
    }

    state.towers.forEach(t => { t.update(); t.draw(); });
    state.enemies = state.enemies.filter(e => !e.dead); state.enemies.forEach(e => { e.update(); e.draw(); });
    state.bullets.forEach((b, i) => {
        if (b.target.dead) { state.bullets.splice(i, 1); return; }
        const dx = b.target.x - b.x; const dy = b.target.y - b.y; const dist = Math.hypot(dx, dy);
        if (dist < b.speed) {
            if (b.type === 'cannon') {
                state.particles.push(new Particle(b.x, b.y, 'orange', 4, 20));
                state.enemies.forEach(e => { if (Math.hypot(e.x - b.x, e.y - b.y) < 70) e.takeDmg(b.dmg); });
            } else { b.target.takeDmg(b.dmg); }
            state.bullets.splice(i, 1);
        } else {
            b.x += (dx/dist) * b.speed; b.y += (dy/dist) * b.speed;
            ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI*2); ctx.fill();
        }
    });
    state.particles = state.particles.filter(p => p.life > 0); state.particles.forEach(p => { p.update(); p.draw(); });

    if (state.buildMode && state.mouse) {
        const c = Math.floor(state.mouse.x / TILE_SIZE); const r = Math.floor(state.mouse.y / TILE_SIZE);
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
            const x = c*TILE_SIZE, y = r*TILE_SIZE; const valid = MAP[r][c] === 0 && !state.towers.some(t => t.c === c && t.r === r);
            ctx.fillStyle = valid ? 'rgba(0,255,0,0.3)' : 'rgba(255,0,0,0.3)'; ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            if (valid) { ctx.beginPath(); ctx.arc(x+32, y+32, state.buildMode=='cannon'?140:(state.buildMode=='laser'?180:160), 0, Math.PI*2); ctx.strokeStyle='white'; ctx.stroke(); }
        }
    }
    document.getElementById('lives').innerText = state.lives; document.getElementById('gold').innerText = Math.floor(state.gold); document.getElementById('wave').innerText = state.wave;
    if (state.lives <= 0) { alert("THÀNH TRÌ SỤP ĐỔ! Wave: " + state.wave); location.reload(); } else { requestAnimationFrame(gameLoop); }
    if (state.skillCD > 0) state.skillCD--;
    document.getElementById('skill-timer').innerText = state.skillCD > 0 ? Math.ceil(state.skillCD/60)+"s" : "Sẵn sàng";
}

// --- INPUTS ---
canvas.addEventListener('mousemove', e => { const rect = canvas.getBoundingClientRect(); state.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top }; });
canvas.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume(); // Kích hoạt âm thanh khi click
    if (!state.buildMode || !state.mouse) return;
    const c = Math.floor(state.mouse.x / TILE_SIZE); const r = Math.floor(state.mouse.y / TILE_SIZE);
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS && MAP[r][c] === 0) {
        if (state.towers.some(t => t.c === c && t.r === r)) return;
        let cost = 70; if (state.buildMode === 'cannon') cost = 120; if (state.buildMode === 'laser') cost = 180;
        if (state.gold >= cost) { state.gold -= cost; state.towers.push(new Tower(c, r, state.buildMode)); sounds.build(); }
    }
});
window.setMode = (t) => { state.buildMode = t; document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('active')); document.getElementById('btn-'+t).classList.add('active'); };
window.triggerSkill = () => { if (state.skillCD > 0) return; state.skillCD = 1000; state.enemies.forEach(e => e.takeDmg(500)); sounds.baseHit(); canvas.style.filter = "brightness(1.5)"; setTimeout(() => canvas.style.filter = "none", 100); };
window.initGame = () => {
    document.getElementById('start-overlay').style.display = 'none';
    if (audioCtx.state === 'suspended') audioCtx.resume(); // Kích hoạt âm thanh
    findPath(); if (path.length === 0) { alert("Lỗi Map!"); return; }
    state.active = true; state.spawnCount = 5; gameLoop();
};
/**
 * PRO FISHING SIMULATOR V2 - LOGIC & GRAPHICS ENGINE
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- GAME DATA & CONFIG ---
const STATE = { MENU: 0, SHOP: 1, IDLE: 2, CASTING: 3, WAITING: 4, HOOKED: 5, RESULT: 6 };
let gameState = STATE.MENU;
let width, height, frameCount = 0;

// Kinh tế
let userCoins = 50; // Tiền khởi đầu
let sessionScore = 0;

// Dữ liệu Mồi (Shop)
const BAITS = {
    worm: { id: 'worm', name: 'Giun Đất', price: 0, icon: '🪱', level: 1, desc: 'Miễn phí, cá nhỏ' },
    shrimp: { id: 'shrimp', name: 'Tôm Tươi', price: 20, icon: '🦐', level: 2, desc: 'Cá biển tầm trung' },
    squid: { id: 'squid', name: 'Mực Ống', price: 50, icon: '🦑', level: 3, desc: 'Săn cá to, hiếm' },
    lure: { id: 'lure', name: 'Mồi Giả PRO', price: 150, icon: '✨', level: 4, desc: 'Săn thủy quái' }
};

// Dữ liệu Cá (Mở rộng cho biển đảo)
const FISH_DB = [
    // Level 1: Giun
    { id: 'ca_he', name: 'Cá Hề', baseVal: 5, wRange: [0.1, 0.5], str: 0.4, spd: 0.5, icon: '🐠', minBait: 1 },
    { id: 'ca_nuc', name: 'Cá Nục', baseVal: 10, wRange: [0.3, 0.8], str: 0.6, spd: 0.6, icon: '🐟', minBait: 1 },
    // Level 2: Tôm
    { id: 'muc', name: 'Mực Nang', baseVal: 25, wRange: [0.5, 2.0], str: 0.8, spd: 0.8, icon: '🦑', minBait: 2 },
    { id: 'ca_mu', name: 'Cá Song', baseVal: 40, wRange: [1.5, 5.0], str: 1.2, spd: 0.7, icon: '🐡', minBait: 2 },
    // Level 3: Mực
    { id: 'ca_ngu', name: 'Cá Ngừ', baseVal: 80, wRange: [5.0, 15.0], str: 1.8, spd: 1.2, icon: '🦈', minBait: 3 },
    { id: 'ca_duoi', name: 'Cá Đuối', baseVal: 100, wRange: [8.0, 20.0], str: 2.0, spd: 0.9, icon: '🌥️', minBait: 3 },
    // Level 4: Mồi Giả (Boss)
    { id: 'ca_map', name: 'Cá Mập', baseVal: 300, wRange: [20, 50], str: 3.0, spd: 1.5, icon: '🦈', minBait: 4 },
    { id: 'ca_kiem', name: 'Cá Kiếm', baseVal: 500, wRange: [30, 80], str: 3.5, spd: 2.0, icon: '🗡️', minBait: 4 }
];

// Gameplay Variables
let currentBaitKey = null;
let currentFish = null;
let castPower = 0, castGrowing = true, castDir = 0;
let tension = 0, fishDist = 100, safeZone = 30, safeWidth = 40;
let isSpace = false;

// Physics Objects
const rod = { x: 0, y: 0, tipX: 0, tipY: 0, bend: 0, targetBend: 0 };
const bobber = { x: 0, y: 0, active: false };

// Môi trường (Tàu thuyền)
let ships = [];

// Audio Context (Giữ nguyên logic cũ, tối ưu gọn hơn)
const AudioSys = {
    ctx: new (window.AudioContext || window.webkitAudioContext)(),
    play: (freq, type, dur) => {
        if(AudioSys.ctx.state === 'suspended') AudioSys.ctx.resume();
        const osc = AudioSys.ctx.createOscillator();
        const g = AudioSys.ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, AudioSys.ctx.currentTime);
        g.gain.setValueAtTime(0.1, AudioSys.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, AudioSys.ctx.currentTime + dur);
        osc.connect(g); g.connect(AudioSys.ctx.destination);
        osc.start(); osc.stop(AudioSys.ctx.currentTime + dur);
    }
};

// --- CORE FUNCTIONS ---
function init() {
    resize();
    window.addEventListener('resize', resize);
    renderShop();
    updateUI();

    // Event Listeners
    document.getElementById('btn-start').onclick = () => { changeState(STATE.SHOP); AudioSys.ctx.resume(); };
    document.getElementById('btn-continue').onclick = () => { changeState(STATE.SHOP); }; // Quay lại shop
    
    // Controls
    window.onmousemove = e => { if(gameState <= STATE.CASTING) castDir = (e.clientX/width - 0.5); };
    window.onmousedown = () => { if(gameState === STATE.IDLE) { gameState = STATE.CASTING; castPower = 0; } };
    window.onmouseup = () => { if(gameState === STATE.CASTING) performCast(); };
    window.onkeydown = e => { if(e.code === 'Space') { isSpace = true; e.preventDefault(); } };
    window.onkeyup = e => { if(e.code === 'Space') isSpace = false; };

    // Khởi tạo thuyền
    setInterval(() => {
        if(Math.random() < 0.3) spawnShip();
    }, 5000);

    loop();
}

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}

function updateUI() {
    document.getElementById('user-coins').innerText = userCoins;
}

function renderShop() {
    const container = document.querySelector('.bait-container');
    container.innerHTML = '';
    Object.keys(BAITS).forEach(key => {
        const b = BAITS[key];
        const div = document.createElement('div');
        div.className = `bait-item ${userCoins < b.price ? 'locked' : ''}`;
        div.innerHTML = `
            <div class="icon">${b.icon}</div>
            <span class="name">${b.name}</span>
            <span class="price">${b.price === 0 ? 'FREE' : b.price + ' xu'}</span>
            <span class="desc">${b.desc}</span>
        `;
        div.onclick = () => buyBait(key);
        container.appendChild(div);
    });
}

function buyBait(key) {
    const bait = BAITS[key];
    if (userCoins >= bait.price) {
        if (bait.price > 0) {
            userCoins -= bait.price;
            updateUI();
        }
        currentBaitKey = key;
        document.getElementById('bait-display').innerText = `Mồi: ${bait.name}`;
        changeState(STATE.IDLE);
    } else {
        // Hiệu ứng không đủ tiền
        AudioSys.play(150, 'sawtooth', 0.2);
    }
}

function changeState(st) {
    gameState = st;
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('tension-container').style.display = 'none';
    document.getElementById('fish-distance-container').style.display = 'none';

    if (st === STATE.SHOP) {
        renderShop(); // Cập nhật lại trạng thái khóa/mở dựa trên tiền hiện tại
        document.getElementById('bait-screen').classList.add('active');
    } else if (st === STATE.IDLE) {
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('instruction').innerText = "Giữ CHUỘT TRÁI để chọn lực quăng";
    } else if (st === STATE.HOOKED) {
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('tension-container').style.display = 'block';
        document.getElementById('fish-distance-container').style.display = 'flex';
        document.getElementById('instruction').innerText = "Nhấp nhả SPACE để giữ thanh trong vùng an toàn";
    } else if (st === STATE.RESULT) {
        document.getElementById('result-screen').classList.add('active');
    }
}

// --- GAMEPLAY LOGIC ---
function performCast() {
    gameState = STATE.WAITING;
    AudioSys.play(600, 'triangle', 0.3);
    document.getElementById('instruction').innerText = "Đợi cá cắn...";
    
    // Tính vị trí phao
    let dist = 300 + (castPower/100) * (height * 0.3);
    bobber.x = width/2 + Math.sin(castDir)*dist*1.5;
    bobber.y = height * 0.55 - (castPower/100 * 100); // Gần đường chân trời hơn
    bobber.active = true;

    let wait = 2000 + Math.random() * 3000;
    setTimeout(() => { if(gameState === STATE.WAITING) triggerBite(); }, wait);
}

function triggerBite() {
    AudioSys.play(100, 'sawtooth', 0.5);
    
    // Chọn cá dựa trên mồi
    const baitLevel = BAITS[currentBaitKey].level;
    // Lọc cá phù hợp với mồi (Cá to không ăn mồi dởm, Cá nhỏ ăn mồi xịn vẫn được)
    let potentialFish = FISH_DB.filter(f => f.minBait <= baitLevel);
    // Random có trọng số (Mồi xịn tăng tỉ lệ ra cá xịn)
    // Đơn giản hóa: Random trong list
    currentFish = potentialFish[Math.floor(Math.random() * potentialFish.length)];
    
    // Random cân nặng
    let w = (Math.random() * (currentFish.wRange[1] - currentFish.wRange[0]) + currentFish.wRange[0]);
    currentFish.weight = parseFloat(w.toFixed(2));
    
    // Reset minigame
    tension = 20; fishDist = 100; safeZone = 30 + Math.random()*20; safeWidth = 35;
    changeState(STATE.HOOKED);
}

function updatePhysics() {
    // 1. Logic Thuyền
    ships.forEach(s => s.x += s.speed);
    ships = ships.filter(s => s.x < width + 100 && s.x > -100);

    // 2. Logic Câu cá
    if (gameState === STATE.HOOKED) {
        // Tension
        let force = isSpace ? 1.5 : -0.8;
        let struggle = Math.sin(Date.now()/150) * currentFish.str * 2;
        tension += force + (struggle * 0.15);
        tension = Math.max(0, Math.min(100, tension));

        // Progress
        let inZone = tension >= safeZone && tension <= safeZone + safeWidth;
        const fill = document.getElementById('tension-fill');
        const warn = document.getElementById('warning-msg');

        if (inZone) {
            fishDist -= 0.3; // Kéo vào
            rod.targetBend = 30 + currentFish.weight * 2;
            fill.style.background = '#2ecc71';
            warn.classList.remove('alert');
        } else {
            fishDist += 0.15; // Cá chạy
            rod.targetBend = tension > 80 ? 120 : 10;
            fill.style.background = tension > 80 ? '#e74c3c' : '#f1c40f';
            
            if(tension > 95 || tension < 5) warn.classList.add('alert');
            else warn.classList.remove('alert');

            // Đứt dây check
            if (tension >= 99 && Math.random() < 0.05) endGame(false, "ĐỨT CƯỚC!");
        }

        // Safezone di chuyển (Khó hơn với cá to)
        safeZone += Math.sin(Date.now()/1000) * (currentFish.spd * 0.5);
        if(safeZone < 10) safeZone = 10; if(safeZone > 90 - safeWidth) safeZone = 90 - safeWidth;

        // UI Updates
        document.getElementById('distance-fill').style.height = `${fishDist}%`;
        fill.style.width = `${tension}%`;
        const szDiv = document.getElementById('safe-zone');
        szDiv.style.left = `${safeZone}%`; szDiv.style.width = `${safeWidth}%`;

        if (fishDist <= 0) endGame(true);
        if (fishDist >= 120) endGame(false, "CÁ THOÁT MẤT!");
    }
}

function endGame(success, msg) {
    bobber.active = false;
    rod.targetBend = 0;
    
    const title = document.getElementById('result-title');
    const rwMsg = document.getElementById('reward-msg');
    const fInfo = document.getElementById('fish-info');
    
    if (success) {
        AudioSys.play(800, 'sine', 0.5);
        title.innerText = "THÀNH CÔNG!"; title.style.color = "#2ecc71";
        fInfo.style.display = 'block';
        document.getElementById('fish-icon').innerText = currentFish.icon;
        document.getElementById('fish-name').innerText = currentFish.name;
        
        // Tính tiền: Giá gốc * Cân nặng
        let reward = Math.floor(currentFish.baseVal * currentFish.weight);
        document.getElementById('fish-stats').innerText = `${currentFish.weight}kg - Giá: ${reward} xu`;
        
        userCoins += reward;
        sessionScore++;
        document.getElementById('session-score').innerText = `Giỏ cá: ${sessionScore}`;
        rwMsg.innerText = `+${reward} Xu`;
        document.getElementById('fail-message').classList.add('hidden');
        updateUI();
    } else {
        AudioSys.play(150, 'sawtooth', 0.3);
        title.innerText = "THẤT BẠI!"; title.style.color = "#e74c3c";
        fInfo.style.display = 'none';
        rwMsg.innerText = "";
        document.getElementById('fail-message').innerText = msg;
        document.getElementById('fail-message').classList.remove('hidden');
    }
    changeState(STATE.RESULT);
}

// --- RENDERING ENGINE ---
function spawnShip() {
    let goRight = Math.random() > 0.5;
    ships.push({
        x: goRight ? -100 : width + 100,
        y: height * 0.4 - 10 - Math.random() * 20, // Trên đường chân trời
        speed: goRight ? 0.5 : -0.5,
        scale: 0.5 + Math.random() * 0.5,
        type: Math.random() > 0.5 ? 'sail' : 'cargo'
    });
}

function drawBackground() {
    // 1. Trời
    let sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#00bfff"); sky.addColorStop(1, "#cceeff");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);

    // 2. Biển xa & Mây
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    for(let i=0; i<5; i++) {
        let cx = (frameCount*0.2 + i*200) % (width + 200) - 100;
        ctx.beginPath(); ctx.arc(cx, height*0.2, 40, 0, Math.PI*2); ctx.fill();
    }

    // 3. Đảo dừa (Coconut Island)
    drawIsland(width * 0.2, height * 0.4);
    drawIsland(width * 0.8, height * 0.4);

    // 4. Thuyền bè
    ships.forEach(s => {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.scale(s.scale, s.scale);
        if(s.speed < 0) ctx.scale(-1, 1); // Lật hình nếu đi trái
        
        ctx.fillStyle = "#333";
        // Thân tàu
        ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.lineTo(15, 10); ctx.lineTo(-15, 10); ctx.fill();
        // Cánh buồm / Ống khói
        if(s.type === 'sail') {
            ctx.fillStyle = "#eee"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -30); ctx.lineTo(20, -10); ctx.fill();
        } else {
            ctx.fillStyle = "#555"; ctx.fillRect(-5, -15, 10, 15);
            // Khói
            ctx.fillStyle = "rgba(200,200,200,0.5)"; ctx.beginPath(); ctx.arc(10 + frameCount%20, -25 - frameCount%20/2, 5, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    });

    // 5. Mặt nước
    let sea = ctx.createLinearGradient(0, height * 0.4, 0, height);
    sea.addColorStop(0, "#006994"); sea.addColorStop(1, "#00334e");
    ctx.fillStyle = sea; ctx.fillRect(0, height * 0.4, width, height * 0.6);

    // Sóng lấp lánh
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    for(let i=0; i<30; i++) {
        let x = (Math.random() * width);
        let y = height * 0.4 + Math.random() * (height * 0.6);
        let l = Math.random() * 50;
        ctx.fillRect(x + Math.sin(frameCount/50)*10, y, l, 2);
    }
}

function drawIsland(x, y) {
    ctx.fillStyle = "#e6c288"; // Cát
    ctx.beginPath();
    ctx.ellipse(x, y, 100, 30, 0, Math.PI, 0); // Đảo hình vòm
    ctx.fill();

    // Cây dừa
    drawCoconutTree(x, y - 20, -0.2);
    drawCoconutTree(x + 20, y - 15, 0.2);
}

function drawCoconutTree(rootX, rootY, lean) {
    // Thân cây (cong)
    ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.quadraticCurveTo(rootX + lean*50, rootY - 40, rootX + lean*80, rootY - 80);
    ctx.stroke();

    // Lá dừa
    let topX = rootX + lean*80; let topY = rootY - 80;
    ctx.strokeStyle = "#2e7d32"; ctx.lineWidth = 3;
    for(let i=0; i<5; i++) {
        let angle = -Math.PI/2 + (i-2)*0.5;
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.quadraticCurveTo(topX + Math.cos(angle)*20, topY - 20, topX + Math.cos(angle)*40 + Math.sin(frameCount/20 + i)*5, topY + Math.sin(angle)*40);
        ctx.stroke();
    }
}

function renderPlayer() {
    // Tính toán độ cong cần
    if(gameState === STATE.HOOKED) rod.bend += (rod.targetBend - rod.bend) * 0.1;
    else if(gameState === STATE.CASTING) rod.bend = -castPower * 0.8;
    else rod.bend *= 0.9;

    let shake = (gameState === STATE.HOOKED) ? (Math.random()-0.5)*tension/5 : 0;
    
    // Gốc tay cầm (Góc phải dưới)
    let handX = width * 0.8 + shake;
    let handY = height + 50 + shake;
    
    // Đỉnh cần
    let tipBaseX = width * 0.5 + castDir * 300;
    let tipBaseY = height * 0.3;
    let tipX = tipBaseX;
    let tipY = tipBaseY + rod.bend * 3;

    rod.tipX = tipX; rod.tipY = tipY;

    // --- VẼ CẦN ---
    ctx.beginPath();
    ctx.strokeStyle = "#222"; ctx.lineWidth = 6; // Cần carbon đen
    ctx.moveTo(handX - 50, handY - 150); // Cán cần
    // Đường cong Bezier cho thân cần
    ctx.quadraticCurveTo((handX + tipX)/2, (handY + tipY)/2 - 200 + rod.bend, tipX, tipY);
    ctx.stroke();
    
    // Khoen cần
    ctx.fillStyle = "silver";
    ctx.beginPath(); ctx.arc(tipX, tipY, 3, 0, Math.PI*2); ctx.fill();

    // --- VẼ TAY (Realistic Style) ---
    // 1. Cánh tay (Forearm)
    let skinGrad = ctx.createLinearGradient(handX, handY, handX - 100, handY - 200);
    skinGrad.addColorStop(0, "#e0ac69"); skinGrad.addColorStop(1, "#c68c53"); // Màu da rám nắng
    
    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(-Math.PI / 6); // Nghiêng tay
    
    // Cánh tay dưới
    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.rect(-60, -250, 100, 300); 
    ctx.fill();
    
    // 2. Bàn tay nắm cần
    // Vẽ cán cần phần dưới tay nắm trước
    ctx.fillStyle = "#111"; // Mút tay cầm
    ctx.fillRect(-30, -280, 40, 120);

    // Ngón cái đè lên cần
    ctx.fillStyle = "#e0ac69";
    ctx.beginPath();
    ctx.ellipse(10, -240, 15, 30, -0.2, 0, Math.PI*2); // Ngón cái
    ctx.fill();
    
    // Các ngón tay quấn quanh (Vẽ từng đốt ngón tay cho chi tiết)
    for(let i=0; i<4; i++) {
        ctx.beginPath();
        ctx.fillStyle = "#dba263"; // Bóng tối hơn chút giữa các ngón
        ctx.ellipse(-25, -260 + i*22, 18, 12, 0, 0, Math.PI*2);
        ctx.fill();
        // Móng tay (chi tiết nhỏ)
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.beginPath(); ctx.arc(-35, -260 + i*22, 3, 0, Math.PI*2); ctx.fill();
    }

    ctx.restore();

    // 3. Thanh lực CASTING (Vẽ cạnh tay)
    if(gameState === STATE.CASTING) {
        if(castGrowing) castPower += 1.5; else castPower -= 1.5;
        if(castPower > 100) castGrowing = false; if(castPower < 0) castGrowing = true;

        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.roundRect(width/2 - 150, height - 100, 300, 30, 15);
        ctx.fill();
        let pGrad = ctx.createLinearGradient(width/2 - 150, 0, width/2 + 150, 0);
        pGrad.addColorStop(0, "#00ff00"); pGrad.addColorStop(1, "#ff0000");
        ctx.fillStyle = pGrad;
        ctx.beginPath(); ctx.roundRect(width/2 - 145, height - 95, castPower * 2.9, 20, 10); ctx.fill();
        ctx.fillStyle = "white"; ctx.font = "bold 14px Arial"; ctx.fillText("LỰC QUĂNG", width/2 - 40, height - 80);
    }
}

function drawBobber() {
    if(!bobber.active) return;
    let bY = bobber.y + Math.sin(frameCount/15)*3;
    
    // Dây cước
    ctx.beginPath(); ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1;
    let midX = (rod.tipX + bobber.x)/2;
    let midY = (rod.tipY + bY)/2 + (gameState === STATE.HOOKED ? 0 : 50); // Dây chùng hoặc căng
    ctx.moveTo(rod.tipX, rod.tipY);
    ctx.quadraticCurveTo(midX, midY, bobber.x, bY);
    ctx.stroke();

    // Phao
    ctx.fillStyle = "#ff4444"; ctx.beginPath(); ctx.arc(bobber.x, bY, 6, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(bobber.x, bY-6, 6, 0, Math.PI*2); ctx.fill();
    
    // Sóng lan toả
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath(); ctx.ellipse(bobber.x, bY+5, 15 + Math.sin(frameCount/10)*5, 5, 0, 0, Math.PI*2); ctx.stroke();
}

function loop() {
    frameCount++;
    updatePhysics();
    
    // Draw Layer
    ctx.clearRect(0,0,width,height);
    drawBackground();
    drawBobber();
    renderPlayer();
    
    requestAnimationFrame(loop);
}

window.onload = init;
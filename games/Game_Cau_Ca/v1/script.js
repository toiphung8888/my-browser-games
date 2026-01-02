/**
 * PRO FISHING SIMULATOR - GAME LOGIC
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State Enum
const STATE = {
    MENU: 0,
    SELECT_BAIT: 1,
    IDLE: 2,        // Đang cầm cần, chờ quăng
    CASTING: 3,     // Đang tích lực quăng
    WAITING: 4,     // Phao đang dưới nước
    HOOKED: 5,      // Cá đã cắn, đang kéo (Mini-game)
    RESULT: 6       // Kết quả (Bắt được hoặc đứt dây)
};

// Cấu hình Game
let gameState = STATE.MENU;
let width, height;
let frameCount = 0;
let score = 0; // Số cá bắt được

// Các biến vật lý & Gameplay
let currentBait = null;
let castPower = 0;      // Lực quăng (0-100)
let castDirection = 0;  // -1 (trái) đến 1 (phải)
let castPowerGrowing = true; // Animation thanh lực quăng

// Biến logic câu cá (Mini-game)
let fish = null;
let tension = 0;        // Lực căng dây (0-100)
let fishDistance = 100; // Khoảng cách cá (100 là xa, 0 là bắt được)
let safeZoneStart = 30; // Điểm bắt đầu vùng an toàn (0-100)
let safeZoneWidth = 40; // Độ rộng vùng an toàn
let isSpacePressed = false;

// Dữ liệu cá
const FISH_TYPES = [
    { id: 'ro', name: 'Cá Rô Đồng', weightRange: [0.2, 0.8], strength: 0.5, speed: 0.5, icon: '🐟', color: '#a8a878' },
    { id: 'chep', name: 'Cá Chép', weightRange: [1.0, 4.0], strength: 1.0, speed: 0.8, icon: '🐠', color: '#ffcc00' },
    { id: 'loc', name: 'Cá Lóc', weightRange: [2.0, 6.0], strength: 1.5, speed: 1.2, icon: '🦈', color: '#333333' },
    { id: 'thu', name: 'Cá Thu Khổng Lồ', weightRange: [10.0, 25.0], strength: 2.5, speed: 1.5, icon: '🐋', color: '#004488' } // Boss
];

// Đối tượng Cần & Tay
const rod = {
    startX: 0, startY: 0, // Vị trí tay cầm
    endX: 0, endY: 0,     // Vị trí đầu cần
    bend: 0,              // Độ cong hiện tại
    targetBend: 0,        // Độ cong mục tiêu (dựa trên tension)
    color: '#5d4037',     // Màu gỗ
    length: 0             // Chiều dài cần vẽ trên màn hình
};

const bobber = {
    x: 0, y: 0,
    active: false,
    sinkOffset: 0 // Độ chìm khi cá rỉa
};

// === HỆ THỐNG ÂM THANH (Dùng Web Audio API cơ bản) ===
// Lưu ý: Chrome yêu cầu tương tác người dùng mới được phát tiếng.
const AudioSys = {
    ctx: new (window.AudioContext || window.webkitAudioContext)(),
    playTone: function(freq, type, duration) {
        if(this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    playCast: () => AudioSys.playTone(600, 'triangle', 0.3),
    playSplash: () => AudioSys.playTone(100, 'sawtooth', 0.5),
    playSnap: () => AudioSys.playTone(800, 'square', 0.1),
    playWin: () => {
        AudioSys.playTone(400, 'sine', 0.2);
        setTimeout(() => AudioSys.playTone(600, 'sine', 0.4), 200);
    }
};

// === KHỞI TẠO ===
function init() {
    resize();
    window.addEventListener('resize', resize);
    
    // UI Event Listeners
    document.getElementById('btn-start').addEventListener('click', () => {
        changeState(STATE.SELECT_BAIT);
        AudioSys.ctx.resume();
    });

    document.querySelectorAll('.bait-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const type = item.getAttribute('data-bait');
            selectBait(type);
        });
    });

    // Input Events
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            isSpacePressed = true;
            e.preventDefault(); // Chặn scroll trang
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') isSpacePressed = false;
    });

    // Các nút kết quả
    document.getElementById('btn-keep').addEventListener('click', () => { score++; resetGame(); });
    document.getElementById('btn-release').addEventListener('click', () => { resetGame(); });
    document.getElementById('btn-retry').addEventListener('click', () => { resetGame(); });

    loop();
}

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    
    // Cập nhật vị trí cần câu dựa trên màn hình
    rod.startX = width * 0.7; 
    rod.startY = height * 1.2; // Tay nằm dưới đáy màn hình
    rod.length = height * 0.6;
}

function changeState(newState) {
    gameState = newState;
    
    // Ẩn tất cả panels
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('tension-container').style.display = 'none';
    document.getElementById('fish-distance-container').style.display = 'none';

    if (newState === STATE.MENU) {
        document.getElementById('start-screen').classList.add('active');
    } else if (newState === STATE.SELECT_BAIT) {
        document.getElementById('bait-screen').classList.add('active');
    } else if (newState === STATE.IDLE) {
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('instruction').innerText = "Nhấn và giữ CHUỘT TRÁI để chọn lực quăng";
    } else if (newState === STATE.HOOKED) {
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('instruction').innerText = "NHẤP NHẢ SPACE để giữ lực căng trong vùng an toàn!";
        document.getElementById('tension-container').style.display = 'block';
        document.getElementById('fish-distance-container').style.display = 'flex';
    } else if (newState === STATE.RESULT) {
        document.getElementById('result-screen').classList.add('active');
    }
}

function selectBait(type) {
    currentBait = type;
    document.getElementById('bait-display').innerText = `Mồi: ${type.toUpperCase()}`;
    changeState(STATE.IDLE);
}

function resetGame() {
    fish = null;
    tension = 0;
    fishDistance = 100;
    bobber.active = false;
    rod.targetBend = 0;
    changeState(STATE.IDLE);
    document.getElementById('score-display').innerText = `Giỏ cá: ${score}`;
}

// === XỬ LÝ INPUT ===
function handleMouseMove(e) {
    if (gameState === STATE.IDLE || gameState === STATE.CASTING) {
        // Di chuyển cần qua lại theo chuột
        let ratio = (e.clientX / width) - 0.5; // -0.5 đến 0.5
        castDirection = ratio;
    }
}

function handleMouseDown(e) {
    if (gameState === STATE.IDLE) {
        gameState = STATE.CASTING;
        castPower = 0;
        castPowerGrowing = true;
    }
}

function handleMouseUp(e) {
    if (gameState === STATE.CASTING) {
        performCast();
    }
}

// === LOGIC GAMEPLAY ===

function performCast() {
    gameState = STATE.WAITING;
    AudioSys.playCast();
    document.getElementById('instruction').innerText = "Đang đợi cá cắn...";

    // Tính điểm rơi của phao
    let distance = 200 + (castPower / 100) * (height * 0.4);
    let angle = -Math.PI / 2 + (castDirection * 0.5); // Góc quăng
    
    // Animation đơn giản: đặt phao luôn ở vị trí đích (thực tế cần đạn đạo học, nhưng ở đây làm đơn giản)
    bobber.x = width/2 + Math.sin(castDirection) * distance * 2; // Spread theo chiều ngang
    bobber.y = height - (height * 0.3) - (castPower/100 * 200); // Độ sâu xa gần
    bobber.active = true;

    // Logic cá cắn (Random timer)
    let waitTime = 2000 + Math.random() * 4000; // 2-6 giây
    if (currentBait === 'lure') waitTime += 2000; // Mồi xịn chờ lâu hơn nhưng cá to

    setTimeout(() => {
        if (gameState === STATE.WAITING) {
            triggerBite();
        }
    }, waitTime);
}

function triggerBite() {
    AudioSys.playSplash();
    document.getElementById('instruction').innerText = "CÁ CẮN! NHẤN SPACE ĐỂ KÉO!";
    
    // Tạo cá ngẫu nhiên
    let rand = Math.random();
    if (currentBait === 'worm') {
        fish = rand > 0.7 ? FISH_TYPES[1] : FISH_TYPES[0];
    } else if (currentBait === 'shrimp') {
        fish = rand > 0.8 ? FISH_TYPES[2] : FISH_TYPES[1];
    } else {
        fish = rand > 0.9 ? FISH_TYPES[3] : FISH_TYPES[2];
    }
    
    // Tính chất lượng cá cụ thể
    fish.currentWeight = (Math.random() * (fish.weightRange[1] - fish.weightRange[0]) + fish.weightRange[0]).toFixed(2);
    
    // Setup mini-game
    tension = 30;
    fishDistance = 100;
    
    // Vùng an toàn ngẫu nhiên
    safeZoneWidth = 30 + Math.random() * 20; // 30-50
    changeState(STATE.HOOKED);
}

function updateFishingLogic() {
    if (gameState !== STATE.HOOKED) return;

    // 1. Tính toán lực căng (Tension)
    // Nếu nhấn Space: Tăng lực căng. Nếu thả: Giảm lực căng.
    // Tốc độ tăng giảm phụ thuộc sức mạnh cá (fish.strength)
    let tensionChange = isSpacePressed ? 1.5 : -1.0; 
    
    // Cá giãy: Tạo nhiễu động lực căng
    let struggle = Math.sin(Date.now() / 200) * fish.strength * 2;
    
    tension += tensionChange + (struggle * 0.1);
    
    // Giới hạn tension 0-100
    if (tension < 0) tension = 0;
    if (tension > 100) tension = 100;

    // 2. Cập nhật thanh UI Tension
    const tensionFill = document.getElementById('tension-fill');
    tensionFill.style.width = `${tension}%`;
    
    // Di chuyển vùng an toàn (Cho khó hơn: Vùng an toàn di chuyển chậm)
    // Ở đây giữ cố định hoặc dao động nhẹ
    safeZoneStart = 30 + Math.sin(Date.now() / 1000) * 10; 
    const safeZoneDiv = document.getElementById('safe-zone');
    safeZoneDiv.style.left = `${safeZoneStart}%`;
    safeZoneDiv.style.width = `${safeZoneWidth}%`;

    // 3. Kiểm tra logic thắng thua
    let warningMsg = document.getElementById('warning-msg');
    
    if (tension >= safeZoneStart && tension <= (safeZoneStart + safeZoneWidth)) {
        // Trong vùng an toàn -> Kéo cá lại gần
        fishDistance -= 0.3; // Tốc độ kéo
        tensionFill.style.background = "#00ff00"; // Xanh
        warningMsg.classList.remove('alert');
        rod.targetBend = 40 + (fish.weightRange[1] * 5); // Cong vừa phải
    } else {
        // Ngoài vùng an toàn
        if (tension > safeZoneStart + safeZoneWidth) {
            // Căng quá -> Cá bơi ra xa một chút, nguy cơ đứt dây
            fishDistance += 0.1;
            tensionFill.style.background = "#ff0000"; // Đỏ
            warningMsg.innerText = "CĂNG QUÁ!!";
            warningMsg.classList.add('alert');
            rod.targetBend = 100; // Cong cực đại
            
            // Nếu Max tension quá lâu (random break chance)
            if (tension > 95 && Math.random() < 0.05) {
                endGame(false, "ĐỨT DÂY CƯỚC!");
            }
        } else {
            // Trùng quá -> Cá bơi đi nhanh
            fishDistance += 0.5 * fish.speed;
            tensionFill.style.background = "#ffff00"; // Vàng
            warningMsg.innerText = "DÂY TRÙNG!";
            warningMsg.classList.add('alert');
            rod.targetBend = 10; // Cần thẳng lại
        }
    }

    // Cập nhật thanh khoảng cách
    document.getElementById('distance-fill').style.height = `${fishDistance}%`;

    // Kết quả
    if (fishDistance <= 0) {
        endGame(true);
    } else if (fishDistance >= 120) { // Cá chạy quá xa
        endGame(false, "CÁ ĐÃ THOÁT!");
    }
}

function endGame(success, message = "") {
    gameState = STATE.RESULT;
    document.getElementById('hud').classList.add('hidden');
    
    const title = document.getElementById('result-title');
    const failMsg = document.getElementById('fail-message');
    const actions = document.querySelector('.actions');
    const btnKeep = document.getElementById('btn-keep');
    const btnRelease = document.getElementById('btn-release');
    const btnRetry = document.getElementById('btn-retry');

    if (success) {
        AudioSys.playWin();
        title.innerText = "BẮT ĐƯỢC RỒI!";
        title.style.color = "#2ecc71";
        document.getElementById('fish-icon').innerText = fish.icon;
        document.getElementById('fish-name').innerText = fish.name;
        document.getElementById('fish-weight').innerText = `${fish.currentWeight} kg`;
        failMsg.classList.add('hidden');
        document.getElementById('fish-info').style.display = 'block';
        
        btnKeep.classList.remove('hidden');
        btnRelease.classList.remove('hidden');
        btnRetry.classList.add('hidden');
    } else {
        AudioSys.playSnap();
        title.innerText = "THẤT BẠI!";
        title.style.color = "#e74c3c";
        document.getElementById('fish-info').style.display = 'none';
        failMsg.innerText = message;
        failMsg.classList.remove('hidden');
        
        btnKeep.classList.add('hidden');
        btnRelease.classList.add('hidden');
        btnRetry.classList.remove('hidden');
    }
    
    changeState(STATE.RESULT);
}

// === HỆ THỐNG VẼ (RENDER SYSTEM) ===
function draw() {
    // Xóa màn hình
    ctx.clearRect(0, 0, width, height);

    // 1. Vẽ Bầu trời (Gradient theo thời gian thực)
    let skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, "#87CEEB"); // Xanh trời
    skyGrad.addColorStop(1, "#E0F7FA"); // Trắng chân trời
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Vẽ Núi/Cây xa xa (Parallax đơn giản)
    ctx.fillStyle = "#2E7D32";
    ctx.beginPath();
    ctx.moveTo(0, height * 0.4);
    // Vẽ đường núi gợn sóng
    for(let i=0; i<=width; i+=50) {
        ctx.lineTo(i, height * 0.4 - Math.sin(i/200)*30);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fill();

    // 3. Vẽ Mặt nước (Sông lớn)
    let waterGrad = ctx.createLinearGradient(0, height * 0.4, 0, height);
    waterGrad.addColorStop(0, "#0288D1");
    waterGrad.addColorStop(1, "#01579B");
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, height * 0.4, width, height * 0.6);

    // Hiệu ứng sóng nước
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    for(let i=0; i<10; i++) {
        let y = height * 0.5 + i * 50;
        let offset = (frameCount * 0.05 + i) % 100;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for(let x=0; x<width; x+=20) {
            ctx.lineTo(x, y + Math.sin(x/100 + frameCount/50)*5);
        }
        ctx.stroke();
    }

    // 4. Vẽ Phao (Bobber)
    if (bobber.active) {
        let bobberY = bobber.y + Math.sin(frameCount/20)*5; // Dập dềnh
        if (gameState === STATE.WAITING && frameCount % 100 > 95) bobberY += 10; // Cá rỉa nhẹ

        ctx.fillStyle = "red";
        ctx.beginPath();
        ctx.arc(bobber.x, bobberY, 5, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(bobber.x, bobberY - 5, 5, 0, Math.PI*2);
        ctx.fill();
        
        // Vẽ dây từ đầu cần đến phao
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1;
        ctx.moveTo(rod.endX, rod.endY);
        // Dây cong tự nhiên (Catenary curve simulation đơn giản)
        let midX = (rod.endX + bobber.x) / 2;
        let midY = (rod.endY + bobberY) / 2 + 50; // Dây trùng xuống
        if (gameState === STATE.HOOKED) midY = (rod.endY + bobberY) / 2; // Dây căng khi kéo
        
        ctx.quadraticCurveTo(midX, midY, bobber.x, bobberY);
        ctx.stroke();
        
        // Sóng lan ra từ phao
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.beginPath();
        ctx.ellipse(bobber.x, bobberY + 4, 15 + Math.sin(frameCount/10)*5, 5, 0, 0, Math.PI*2);
        ctx.stroke();
    }

    // 5. Vẽ Cần Câu & Tay (Góc nhìn thứ nhất)
    renderPlayer();
}

function renderPlayer() {
    // Tính toán vị trí cần câu dựa trên input chuột và trạng thái game
    
    // Góc xoay cơ bản
    let angleOffset = castDirection * 0.5;
    
    // Hiệu ứng "Giật" khi kéo
    let shakeX = 0;
    let shakeY = 0;
    if (gameState === STATE.HOOKED) {
        rod.bend = rod.bend * 0.9 + rod.targetBend * 0.1; // Smooth transition
        shakeX = (Math.random() - 0.5) * (tension/10); 
        shakeY = (Math.random() - 0.5) * (tension/10);
    } else if (gameState === STATE.CASTING) {
        // Cần cong ra sau khi tích lực
        rod.bend = -castPower * 0.5;
    } else {
        rod.bend = 0;
    }

    // Vị trí gốc cần (Tay phải)
    let rx = width * 0.7 + shakeX;
    let ry = height + shakeY;
    
    // Vị trí ngọn cần (Tính toán dựa trên góc và độ cong)
    // Cần dài hướng ra giữa hồ
    let tipX = width * 0.5 + (castDirection * 200);
    let tipY = height * 0.3 + (rod.bend * 2); // Cong xuống khi kéo cá
    
    // Nếu đang Cast power, cần giơ cao lên
    if (gameState === STATE.CASTING) {
        tipY -= castPower * 2;
        tipX += castPower; // Đưa ra sau
    }

    rod.endX = tipX;
    rod.endY = tipY;

    // Vẽ Cần (Thân cần) - Dùng Bezier Curve để vẽ cần cong
    ctx.beginPath();
    ctx.strokeStyle = "#3e2723"; // Màu gỗ tối
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.moveTo(rx, ry); // Gốc
    
    // Điểm điều khiển (Control Point) để tạo độ cong
    // Nếu bend > 0 (cá kéo), control point hạ thấp xuống
    let cpX = (rx + tipX) / 2;
    let cpY = (ry + tipY) / 2 - 100 + rod.bend; 
    
    ctx.quadraticCurveTo(cpX, cpY, tipX, tipY);
    ctx.stroke();

    // Vẽ khoen cần (các điểm trên đường cong) - Để đẹp hơn thì cần thuật toán phức tạp, 
    // ở đây vẽ đơn giản đầu cần
    ctx.fillStyle = "silver";
    ctx.beginPath();
    ctx.arc(tipX, tipY, 3, 0, Math.PI*2);
    ctx.fill();

    // 6. Vẽ Tay Người (Hình khối đơn giản đại diện)
    // Tay phải cầm cần
    ctx.fillStyle = "#ffcc80"; // Màu da
    ctx.beginPath();
    ctx.ellipse(rx - 20, ry - 50, 40, 60, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Ngón tay cái
    ctx.beginPath();
    ctx.ellipse(rx - 40, ry - 80, 15, 25, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    // Tay trái (Nếu đang quay máy câu - giả lập)
    if (gameState === STATE.HOOKED && isSpacePressed) {
        // Vẽ tay trái đang quay máy
        let reelX = rx - 50;
        let reelY = ry - 30;
        ctx.beginPath();
        ctx.ellipse(reelX + Math.cos(frameCount/2)*10, reelY + Math.sin(frameCount/2)*10, 30, 30, 0, 0, Math.PI*2);
        ctx.fill();
    }
    
    // 7. Vẽ thanh lực quăng (Nếu đang casting)
    if (gameState === STATE.CASTING) {
        // Logic tăng giảm thanh lực
        if (castPowerGrowing) {
            castPower += 2;
            if (castPower >= 100) castPowerGrowing = false;
        } else {
            castPower -= 2;
            if (castPower <= 0) castPowerGrowing = true;
        }

        // Vẽ thanh bên cạnh người chơi
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(width/2 - 100, height - 150, 200, 20);
        
        let grad = ctx.createLinearGradient(width/2 - 100, 0, width/2 + 100, 0);
        grad.addColorStop(0, "yellow");
        grad.addColorStop(1, "red");
        ctx.fillStyle = grad;
        ctx.fillRect(width/2 - 100, height - 150, castPower * 2, 20);
        
        ctx.fillStyle = "white";
        ctx.font = "16px Arial";
        ctx.fillText("LỰC QUĂNG", width/2 - 40, height - 160);
    }
}

// === GAME LOOP ===
function loop() {
    frameCount++;
    
    // Logic cập nhật trạng thái
    updateFishingLogic();
    
    // Logic vẽ
    draw();
    
    requestAnimationFrame(loop);
}

// Khởi chạy
window.onload = init;
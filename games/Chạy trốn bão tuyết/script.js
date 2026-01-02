/**
 * AVALANCHE RUN - LOGIC CORE
 * Sử dụng Three.js
 */

// --- CẤU HÌNH GAME ---
const CONFIG = {
    worldWidth: 60,         // Độ rộng con đường
    chunkLength: 200,       // Độ dài mỗi đoạn đường sinh ra
    fogDensity: 0.015,      // Độ dày sương mù
    baseSpeed: 0.8,         // Tốc độ chạy cơ bản
    maxSpeed: 2.5,          // Tốc độ tối đa
    acceleration: 0.0005,   // Tăng tốc theo thời gian
    snowballCount: 15,      // Số lượng cầu tuyết tối đa trên màn hình
    treeDensity: 40,        // Mật độ cây bên đường
    playerSensitivity: 0.8, // Độ nhạy khi di chuyển trái phải
    bobbingSpeed: 12,       // Tốc độ rung đầu
    bobbingAmount: 0.3      // Độ biên độ rung đầu
};

// --- BIẾN TOÀN CỤC ---
let scene, camera, renderer;
let clock, deltaTime;
let isPlaying = false;
let score = 0;
let speed = CONFIG.baseSpeed;
let distanceTraveled = 0;

// Các đối tượng trong game
let player = { x: 0, targetX: 0, z: 0 };
let terrainChunks = [];
let snowballs = [];
let trees = [];
let particles; // Tuyết rơi

// Audio Context
let audioCtx;
let audioMasterGain;

// Input
let keys = { left: false, right: false };

// Texture Gen (Tự tạo texture để không cần load ảnh ngoài)
const textureLoader = new THREE.TextureLoader();
const snowTexture = createNoiseTexture(512, '#ffffff', '#e0e0ff');
const rockTexture = createNoiseTexture(256, '#505050', '#303030');

// --- HỆ THỐNG ÂM THANH (WEB AUDIO API) ---
class SoundManager {
    constructor() {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.context.destination);
        
        this.windNode = null;
    }

    startWind() {
        if (this.windNode) return;
        // Tạo tiếng gió bằng Pink Noise
        const bufferSize = 2 * this.context.sampleRate;
        const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5; 
        }
        var lastOut = 0;

        const noise = this.context.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        
        // Filter để làm tiếng gió trầm hơn
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        const gain = this.context.createGain();
        gain.gain.value = 0.1;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        noise.start();
        this.windNode = { source: noise, gain: gain, filter: filter };
    }

    updateWind(speedRatio) {
        if (!this.windNode) return;
        // Gió to hơn khi chạy nhanh hơn
        const targetFreq = 400 + (speedRatio * 600);
        const targetGain = 0.1 + (speedRatio * 0.2);
        
        this.windNode.filter.frequency.setTargetAtTime(targetFreq, this.context.currentTime, 0.1);
        this.windNode.gain.gain.setTargetAtTime(targetGain, this.context.currentTime, 0.1);
    }

    playCrash() {
        // Tiếng va chạm mạnh
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        
        osc.frequency.setValueAtTime(100, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.context.currentTime + 0.5);
        
        osc.type = 'sawtooth';
        
        gain.gain.setValueAtTime(0.8, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.5);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.context.currentTime + 0.5);
    }

    playWhoosh() {
        // Tiếng vật vụt qua (khi né được)
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, this.context.currentTime);
        osc.frequency.linearRampToValueAtTime(100, this.context.currentTime + 0.2);
        
        gain.gain.setValueAtTime(0.05, this.context.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.context.currentTime + 0.2);
    }
}
const audioManager = new SoundManager();


// --- HÀM KHỞI TẠO (INIT) ---
function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa8d5e5); // Màu bầu trời băng giá
    scene.fog = new THREE.FogExp2(0xa8d5e5, CONFIG.fogDensity);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(0, 2.5, 0); // Độ cao mắt người

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 4. Lighting
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);

    // 5. Init Objects
    createSnowParticles();
    
    // Tạo 3 chunk đất đầu tiên
    for(let i=0; i<3; i++) {
        createChunk(i * CONFIG.chunkLength);
    }

    // Input Listeners
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    // Start Loop
    clock = new THREE.Clock();
    animate();
}

// --- WORLD GENERATION ---

// Tạo texture ồn (Noise) để làm tuyết trông thật hơn
function createNoiseTexture(size, color1, color2) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = color1;
    ctx.fillRect(0,0,size,size);
    
    // Draw noise
    for(let i=0; i<4000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * 2 + 1;
        ctx.fillStyle = Math.random() > 0.5 ? color2 : '#ffffff';
        ctx.globalAlpha = 0.1;
        ctx.beginPath();
        ctx.arc(x,y,r,0,Math.PI*2);
        ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function createChunk(zPosition) {
    // 1. Mặt đất (Tuyết)
    const geometry = new THREE.PlaneGeometry(CONFIG.worldWidth * 2, CONFIG.chunkLength, 50, 50);
    
    // Tạo độ lồi lõm cho địa hình
    const positionAttribute = geometry.attributes.position;
    for ( let i = 0; i < positionAttribute.count; i ++ ) {
        const x = positionAttribute.getX( i );
        // Chỉ làm gồ ghề ở hai bên lề đường, giữa đường phẳng hơn
        const distFromCenter = Math.abs(x);
        let noise = 0;
        
        if (distFromCenter > 10) {
            noise = (Math.random() - 0.5) * 4; // Gồ ghề nhiều ở xa
            positionAttribute.setY( i, noise + (distFromCenter / 5) ); // Nâng cao dần về 2 phía (thung lũng)
        } else {
            noise = (Math.random() - 0.5) * 0.5; // Gồ ghề ít ở giữa
            positionAttribute.setY( i, noise );
        }
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ 
        map: snowTexture,
        roughness: 0.8,
        metalness: 0.1,
        color: 0xffffff
    });
    
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = zPosition - CONFIG.chunkLength / 2; // Đặt về phía trước (âm Z)
    ground.receiveShadow = true;
    scene.add(ground);
    
    terrainChunks.push(ground);

    // 2. Cây cối bên đường (Low poly pines)
    for (let i = 0; i < CONFIG.treeDensity; i++) {
        const side = Math.random() > 0.5 ? 1 : -1;
        const x = (Math.random() * 20 + 15) * side; // Cách tâm ít nhất 15m
        const z = zPosition - Math.random() * CONFIG.chunkLength;
        
        createTree(x, 0, z); // 0 là độ cao tương đối, sẽ điều chỉnh sau
    }

    // 3. Đá tảng (Obstacles tĩnh bên lề)
    for (let i = 0; i < 5; i++) {
        const side = Math.random() > 0.5 ? 1 : -1;
        const x = (Math.random() * 5 + 20) * side;
        const z = zPosition - Math.random() * CONFIG.chunkLength;
        createRock(x, z);
    }
}

function createTree(x, y, z) {
    const height = Math.random() * 5 + 5;
    const geometry = new THREE.ConeGeometry(1.5, height, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x1a472a, roughness: 0.9 });
    const tree = new THREE.Mesh(geometry, material);
    
    tree.position.set(x, y + height/2, z);
    tree.castShadow = true;
    
    // Thêm chút tuyết trên tán cây
    const snowCapGeo = new THREE.ConeGeometry(1.6, height * 0.3, 8);
    const snowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const snowCap = new THREE.Mesh(snowCapGeo, snowMat);
    snowCap.position.y = height * 0.3;
    tree.add(snowCap);

    scene.add(tree);
    trees.push(tree);
}

function createRock(x, z) {
    const size = Math.random() * 2 + 1;
    const geometry = new THREE.DodecahedronGeometry(size, 0);
    const material = new THREE.MeshStandardMaterial({ map: rockTexture });
    const rock = new THREE.Mesh(geometry, material);
    rock.position.set(x, size/2, z);
    rock.castShadow = true;
    scene.add(rock);
    trees.push(rock); // Gộp chung vào mảng trees để dọn dẹp
}

// --- SNOWBALL LOGIC ---
function spawnSnowball() {
    if (snowballs.length >= CONFIG.snowballCount) return;

    const radius = Math.random() * 1.5 + 1.5; // Bán kính 1.5 - 3m
    const geometry = new THREE.IcosahedronGeometry(radius, 1);
    
    // Làm méo quả cầu cho tự nhiên
    const pos = geometry.attributes.position;
    for(let i=0; i<pos.count; i++){
        pos.setXYZ(i, 
            pos.getX(i) + (Math.random()-0.5)*0.5,
            pos.getY(i) + (Math.random()-0.5)*0.5,
            pos.getZ(i) + (Math.random()-0.5)*0.5
        );
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ 
        color: 0xeeeeff, 
        roughness: 0.5,
        map: snowTexture 
    });
    
    const ball = new THREE.Mesh(geometry, material);
    
    // Vị trí xuất hiện: Trước mặt người chơi xa xa
    const spawnZ = player.z - 150 - Math.random() * 50;
    // Random làn đường (-10 đến 10)
    const spawnX = (Math.random() - 0.5) * 20; 
    
    ball.position.set(spawnX, radius, spawnZ);
    ball.castShadow = true;
    ball.receiveShadow = true;
    
    // Gán thuộc tính vật lý giả lập
    ball.userData = {
        radius: radius,
        rotSpeed: Math.random() * 0.1 + 0.05,
        velocityZ: Math.random() * 0.5 + 0.2, // Lăn về phía người chơi (hoặc chậm hơn người chơi)
        velocityX: (Math.random() - 0.5) * 0.1 // Lăn lệch nhẹ
    };

    scene.add(ball);
    snowballs.push(ball);
}

// --- PARTICLE SYSTEM (TUYẾT RƠI) ---
function createSnowParticles() {
    const count = 3000;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    
    for(let i=0; i<count; i++) {
        positions.push((Math.random() - 0.5) * 100); // x
        positions.push(Math.random() * 50);          // y
        positions.push((Math.random() - 0.5) * 100); // z
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.3,
        transparent: true,
        opacity: 0.8
    });
    
    particles = new THREE.Points(geometry, material);
    scene.add(particles);
}

// --- INPUT HANDLING ---
function handleKeyDown(e) {
    if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = true;
    if (e.key === 'd' || e.key === 'ArrowRight') keys.right = true;
}

function handleKeyUp(e) {
    if (e.key === 'a' || e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'd' || e.key === 'ArrowRight') keys.right = false;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- GAME LOOP LOGIC ---

function updatePlayer(dt) {
    // 1. Di chuyển ngang (trái phải)
    const moveSpeed = 30 * dt;
    if (keys.left) player.targetX -= moveSpeed;
    if (keys.right) player.targetX += moveSpeed; // Lưu ý: camera nhìn về -Z, nên phải trái đảo ngược logic tọa độ chút

    // Giới hạn đường chạy
    player.targetX = Math.max(-12, Math.min(12, player.targetX));

    // Smooth movement (Lerp)
    player.x += (player.targetX - player.x) * CONFIG.playerSensitivity * 5 * dt;

    // 2. Di chuyển thẳng (tự động)
    speed = Math.min(CONFIG.maxSpeed, speed + CONFIG.acceleration * dt);
    const moveStep = speed * 40 * dt; // Biến đổi để scale phù hợp
    player.z -= moveStep; // Đi về phía âm Z
    distanceTraveled += moveStep;

    // 3. Camera Update
    camera.position.x = player.x;
    camera.position.z = player.z + 5; // Camera sau lưng một chút nếu muốn TPS, hoặc trùng Z nếu FPS
    // Chế độ FPS: Camera tại Z player
    camera.position.z = player.z;

    // Head Bobbing (Rung đầu)
    const bobOffset = Math.sin(clock.getElapsedTime() * CONFIG.bobbingSpeed) * CONFIG.bobbingAmount * (speed/CONFIG.baseSpeed);
    camera.position.y = 2.5 + bobOffset;

    // Cập nhật đèn đi theo người
    // (Ta giữ đèn Directional cố định tương đối với người chơi để bóng đổ đẹp)
    scene.children.forEach(child => {
        if (child.isDirectionalLight) {
            child.position.z = player.z + 50;
            child.target.position.z = player.z - 50;
            child.target.updateMatrixWorld();
        }
    });

    // Cập nhật hệ thống hạt tuyết đi theo người
    particles.position.x = player.x;
    particles.position.z = player.z;
    // Hiệu ứng rơi
    const positions = particles.geometry.attributes.position.array;
    for(let i=1; i<positions.length; i+=3) {
        positions[i] -= 10 * dt; // Rơi xuống
        if (positions[i] < 0) positions[i] = 50; // Reset lên trên
    }
    particles.geometry.attributes.position.needsUpdate = true;
}

function updateWorld() {
    // 1. Sinh terrain mới
    const lastChunk = terrainChunks[terrainChunks.length - 1];
    if (lastChunk.position.z > player.z - CONFIG.chunkLength * 2) {
        // Cần sinh thêm chunk mới phía trước
        createChunk(lastChunk.position.z - CONFIG.chunkLength);
    }

    // 2. Xóa object cũ phía sau lưng quá xa để nhẹ máy
    if (terrainChunks[0].position.z > player.z + 50) {
        const oldChunk = terrainChunks.shift();
        scene.remove(oldChunk);
        oldChunk.geometry.dispose(); // Dọn bộ nhớ
        oldChunk.material.dispose();
    }
    
    // Dọn cây cối/đá
    trees = trees.filter(tree => {
        if (tree.position.z > player.z + 20) {
            scene.remove(tree);
            return false;
        }
        return true;
    });
}

function updateSnowballs(dt) {
    // Spawn ngẫu nhiên
    if (Math.random() < 0.05) spawnSnowball();

    snowballs.forEach((ball, index) => {
        // Lăn cầu
        ball.rotation.x -= ball.userData.rotSpeed; // Lăn về phía người chơi
        
        // Di chuyển vật lý
        // Cầu tuyết cũng tự lăn về phía dương Z (ngược chiều người chơi đang chạy về âm Z)
        // Tạo cảm giác vận tốc tương đối cực lớn
        ball.position.z += ball.userData.velocityZ; 
        ball.position.x += ball.userData.velocityX;

        // Kiểm tra va chạm
        // Khoảng cách giữa 2 tâm < tổng bán kính
        // Player bán kính coi như 0.5m
        const dx = ball.position.x - player.x;
        const dz = ball.position.z - player.z;
        const dist = Math.sqrt(dx*dx + dz*dz);

        if (dist < ball.userData.radius + 0.5) {
            gameOver();
        }

        // Dọn dẹp cầu đã qua mặt
        if (ball.position.z > player.z + 10) {
            scene.remove(ball);
            snowballs.splice(index, 1);
            
            // Cộng điểm khi né được
            score += 10; 
            updateUI();
            audioManager.playWhoosh();
        }
    });
}

function updateUI() {
    document.getElementById('score').innerText = Math.floor(Math.abs(player.z));
    document.getElementById('speed').innerText = Math.floor(speed * 30); // Giả lập km/h
}

function gameOver() {
    isPlaying = false;
    document.getElementById('game-ui').classList.add('hidden');
    document.getElementById('game-over-screen').classList.remove('hidden');
    document.getElementById('health-overlay').style.opacity = 1;
    document.getElementById('final-score-val').innerText = Math.floor(Math.abs(player.z));
    audioManager.playCrash();
    
    // Dừng gió
    if (audioManager.windNode) audioManager.windNode.source.stop();
    audioManager.windNode = null;
}

function resetGame() {
    // Reset biến
    player = { x: 0, targetX: 0, z: 0 };
    speed = CONFIG.baseSpeed;
    score = 0;
    
    // Xóa hết vật thể cũ
    snowballs.forEach(b => scene.remove(b));
    snowballs = [];
    terrainChunks.forEach(c => scene.remove(c));
    terrainChunks = [];
    trees.forEach(t => scene.remove(t));
    trees = [];
    
    // Init lại terrain
    for(let i=0; i<3; i++) createChunk(i * -CONFIG.chunkLength);
    
    // UI
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-ui').classList.remove('hidden');
    document.getElementById('health-overlay').style.opacity = 0;
    
    // Audio
    audioManager.context.resume();
    audioManager.startWind();
    
    isPlaying = true;
}


// --- MAIN LOOP ---
function animate() {
    requestAnimationFrame(animate);

    if (!isPlaying) return;

    deltaTime = clock.getDelta();
    
    updatePlayer(deltaTime);
    updateWorld();
    updateSnowballs(deltaTime);
    updateUI();
    
    // Update Audio Wind dynamic
    audioManager.updateWind(speed / CONFIG.maxSpeed);

    renderer.render(scene, camera);
}


// --- UI EVENTS ---
document.getElementById('start-btn').addEventListener('click', () => {
    init(); // Init scene nếu chưa
    resetGame();
});

document.getElementById('restart-btn').addEventListener('click', () => {
    resetGame();
});

// Chạy init lần đầu để load assets (nếu có)
// Nhưng game thực sự bắt đầu khi bấm nút
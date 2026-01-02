// --- CẤU HÌNH ---
const CONFIG = {
    fieldSize: 120, // Map vừa phải
    riceCount: 15000, // Số lượng lúa cực nhiều
    holeCount: 25,
    walkSpeed: 6.0,   // Đi bộ chậm
    runSpeed: 12.0,   // Chạy chậm (như đi nhanh)
    gravity: 800.0,
    mouseWaitTime: 5000 
};

// --- AUDIO ---
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);
    }
    playTone(freq, type, duration, vol=0.5) {
        if(this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(); osc.stop(this.ctx.currentTime + duration);
    }
    playNoise(duration, vol=0.5) {
        if(this.ctx.state === 'suspended') this.ctx.resume();
        const bSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for(let i=0; i<bSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);
        noise.connect(gain); gain.connect(this.masterGain);
        noise.start();
    }
    sfxRustle() { // Tiếng lúa xào xạc (tiếng ồn tần số thấp)
        this.playNoise(0.2, 0.15); 
    }
    sfxStep() { this.playNoise(0.1, 0.2); }
    sfxFire() { this.playNoise(1.5, 0.4); }
    sfxSmoke() { this.playNoise(2.0, 0.1); } 
    sfxDrink() { this.playTone(600, 'sine', 0.5, 0.3); }
    sfxCatch() { this.playTone(800, 'triangle', 0.1, 0.3); setTimeout(()=>this.playTone(1200, 'triangle', 0.2, 0.3), 100); }
}
const audio = new SoundManager();

// --- BIẾN TOÀN CỤC ---
let camera, scene, renderer, controls, raycaster;
let moveForward=false, moveBackward=false, moveLeft=false, moveRight=false, isRunning=false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let prevTime = performance.now();

let hands, rightHandGroup, heldItemMesh, cageMouseMesh;
let holes = [];
let trucks = [];
let farmers = [];
let riceMesh;
let trees = [];
let particles = []; // Khói/Lửa

let stamina = 100;
let inventory = [
    { id: 'straw', name: 'Rơm khô', icon: '🌾', count: 99 },
    { id: 'lighter', name: 'Bật lửa', icon: '🔥', count: 1 },
    { id: 'net', name: 'Lưới', icon: '🕸️', count: 10 },
    { id: 'cage', name: 'Lồng sắt', icon: '📦', count: 1 },
    { id: 'flag', name: 'Cờ đỏ', icon: '🚩', count: 20 },
    { id: 'water', name: 'Nước', icon: '💧', count: 5 },
    { id: 'cig', name: 'Thuốc lá', icon: '🚬', count: 20 }
];
let currentItem = null;
let capturedMice = 0;
let isInventoryOpen = false;
let footstepTimer = 0;
let isSwinging = false;

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 10, 90);

    camera = new THREE.PerspectiveCamera(65, window.innerWidth/window.innerHeight, 0.1, 300);
    camera.position.y = 1.6;

    // Ánh sáng
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffdf90, 1.0);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048,2048);
    scene.add(dirLight);

    controls = new THREE.PointerLockControls(camera, document.body);
    
    document.getElementById('instructions').addEventListener('click', () => {
        controls.lock(); audio.ctx.resume();
    });
    controls.addEventListener('lock', () => {
        document.getElementById('blocker').style.display = 'none';
    });
    controls.addEventListener('unlock', () => {
        if (!isInventoryOpen) document.getElementById('blocker').style.display = 'flex';
    });

    // Input (Bỏ Space nhảy)
    document.addEventListener('keydown', (e) => {
        switch(e.code) {
            case 'KeyW': moveForward = true; break;
            case 'KeyA': moveLeft = true; break;
            case 'KeyS': moveBackward = true; break;
            case 'KeyD': moveRight = true; break;
            case 'ShiftLeft': isRunning = true; break;
            case 'KeyE': toggleInventory(); break;
        }
    });
    document.addEventListener('keyup', (e) => {
        switch(e.code) {
            case 'KeyW': moveForward = false; break;
            case 'KeyA': moveLeft = false; break;
            case 'KeyS': moveBackward = false; break;
            case 'KeyD': moveRight = false; break;
            case 'ShiftLeft': isRunning = false; break;
        }
    });
    document.addEventListener('mousedown', onMouseClick);

    createWorld();
    createRiceField();
    createHands(); // Tạo tay sau camera
    createHoles();
    createRoadAndTraffic();
    updateInventoryUI();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth/window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    raycaster = new THREE.Raycaster();
}

function createWorld() {
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(CONFIG.fieldSize, CONFIG.fieldSize),
        new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 1.0 })
    );
    ground.rotation.x = -Math.PI/2;
    ground.receiveShadow = true;
    scene.add(ground);
}

function createRiceField() {
    // Lúa mỏng như sợi chỉ (ConeGeometry 3 cạnh)
    const geo = new THREE.ConeGeometry(0.015, 0.9, 3);
    geo.translate(0, 0.45, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xcccc00 }); // Vàng đậm
    riceMesh = new THREE.InstancedMesh(geo, mat, CONFIG.riceCount);
    
    const dummy = new THREE.Object3D();
    for(let i=0; i<CONFIG.riceCount; i++) {
        let x = (Math.random()-0.5)*CONFIG.fieldSize;
        let z = (Math.random()-0.5)*CONFIG.fieldSize;
        if(Math.abs(z - 48) < 10) continue; // Tránh đường
        dummy.position.set(x, 0, z);
        dummy.rotation.y = Math.random()*Math.PI;
        // Nghiêng ngẫu nhiên nhiều hướng
        dummy.rotation.z = (Math.random()-0.5)*0.2; 
        dummy.rotation.x = (Math.random()-0.5)*0.2;
        dummy.scale.set(1, 0.8+Math.random()*0.5, 1);
        dummy.updateMatrix();
        riceMesh.setMatrixAt(i, dummy.matrix);
    }
    riceMesh.receiveShadow = true; 
    scene.add(riceMesh);
}

function createHands() {
    hands = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xeebb99 }); // Da sáng hơn chút

    // Tay Trái (Chìa ra)
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), skinMat);
    leftArm.position.set(-0.3, -0.3, -0.4); 
    leftArm.rotation.x = Math.PI/2.5;
    leftArm.rotation.z = -0.2;
    hands.add(leftArm);

    // Tay Phải (Cầm đồ)
    rightHandGroup = new THREE.Group();
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), skinMat);
    rightArm.position.set(0, 0, 0); 
    rightHandGroup.add(rightArm);
    
    rightHandGroup.position.set(0.3, -0.3, -0.4);
    rightHandGroup.rotation.x = Math.PI/2.5;
    rightHandGroup.rotation.z = 0.2;
    hands.add(rightHandGroup);

    // Đẩy tay ra phía trước camera một chút để không bị che
    hands.position.set(0, -0.1, -0.1);

    camera.add(hands);
}

function updateHandItemVisual() {
    if(heldItemMesh) {
        rightHandGroup.remove(heldItemMesh);
        heldItemMesh = null;
    }
    if(!currentItem) return;

    if(currentItem.id === 'cage') {
        heldItemMesh = new THREE.Group();
        // Lồng sắt
        const cageGeo = new THREE.BoxGeometry(0.25, 0.25, 0.35);
        const cageMat = new THREE.MeshBasicMaterial({color: 0x222222, wireframe: true});
        const cage = new THREE.Mesh(cageGeo, cageMat);
        heldItemMesh.add(cage);

        if(capturedMice > 0) {
            cageMouseMesh = new THREE.Group();
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({color: 0x666666}));
            body.scale.set(1, 0.7, 1.5);
            cageMouseMesh.add(body);
            heldItemMesh.add(cageMouseMesh);
        }
        // Đặt lồng lên đầu tay phải
        heldItemMesh.position.set(0, 0.35, 0);
    } else if(currentItem.id === 'lighter') {
        heldItemMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.02), new THREE.MeshStandardMaterial({color: 0xff0000}));
        heldItemMesh.position.set(0, 0.3, 0);
    } else if(currentItem.id === 'flag') {
        heldItemMesh = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6), new THREE.MeshStandardMaterial({color: 0x8B4513}));
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), new THREE.MeshBasicMaterial({color: 0xff0000, side: THREE.DoubleSide}));
        flag.position.set(0.1, 0.15, 0);
        heldItemMesh.add(pole, flag);
        heldItemMesh.position.set(0, 0.4, 0);
    } else if(currentItem.id === 'straw') {
        heldItemMesh = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), new THREE.MeshStandardMaterial({color: 0xDAA520}));
        heldItemMesh.rotation.z = Math.PI;
        heldItemMesh.position.set(0, 0.3, 0);
    }
    
    if(heldItemMesh) rightHandGroup.add(heldItemMesh);
}

// --- VISUAL EFFECTS ---
function spawnParticle(pos, type) {
    // Type: 'smoke' (xám), 'fire' (đỏ/vàng), 'cig' (trắng)
    let color = type==='fire' ? (Math.random()>0.5?0xff4500:0xffd700) : (type==='smoke'?0x333333:0xaaaaaa);
    let size = type==='fire' ? 0.2 : 0.3;
    let opacity = type==='fire' ? 0.8 : 0.4;
    
    const mat = new THREE.MeshBasicMaterial({color:color, transparent:true, opacity:opacity});
    const geo = type==='fire' ? new THREE.TetrahedronGeometry(size) : new THREE.SphereGeometry(size, 4, 4);
    const p = new THREE.Mesh(geo, mat);
    
    p.position.copy(pos);
    // Random offset
    p.position.x += (Math.random()-0.5)*0.2;
    p.position.z += (Math.random()-0.5)*0.2;
    
    scene.add(p);
    particles.push({
        mesh: p, 
        life: 1.0 + Math.random(), 
        vy: type==='fire'?0.05:0.02, // Lửa bay nhanh hơn khói
        type: type
    });
}

function createRoadAndTraffic() {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.fieldSize, 12), new THREE.MeshStandardMaterial({color: 0x555555}));
    road.rotation.x = -Math.PI/2; road.position.set(0, 0.02, 48);
    scene.add(road);

    // Xe tải
    for(let i=0; i<3; i++) {
        const truck = buildTruck(i%2==0 ? 0xff0000 : 0x0000ff);
        // Xe đi từ trái sang phải (+X)
        truck.position.set(-60 + i*50, 0, 48);
        scene.add(truck);
        trucks.push({mesh: truck, speed: 4.0}); 
    }
    
    // Nông dân
    for(let i=0; i<4; i++) {
        const farmer = buildFarmer();
        const dir = i%2==0 ? 1 : -1;
        farmer.position.set(Math.random()*20, 0, 48 + dir*4);
        farmer.rotation.y = dir === 1 ? Math.PI/2 : -Math.PI/2;
        scene.add(farmer);
        farmers.push({mesh: farmer, dir: dir, speed: 1.0});
    }
}

function buildTruck(color) {
    const g = new THREE.Group();
    // Khung gầm
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 3.5), new THREE.MeshStandardMaterial({color:0x222}));
    chassis.position.y = 1; g.add(chassis);
    
    // Cabin (đầu xe) - Đặt ở phía +X
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3, 3.5), new THREE.MeshStandardMaterial({color:color}));
    cab.position.set(2.5, 2.5, 0); // Dịch về phía trước
    g.add(cab);

    // Thùng xe (chở lúa) - Đặt ở phía -X
    const bed = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2, 3.6), new THREE.MeshStandardMaterial({color:0x8B4513}));
    bed.position.set(-1.5, 2.5, 0); 
    g.add(bed);

    // Bánh xe
    const wheelGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.6, 12);
    const wheelMat = new THREE.MeshStandardMaterial({color:0x111});
    g.userData.wheels = [];
    const pos = [[2.5, 1.8], [2.5, -1.8], [-2.5, 1.8], [-2.5, -1.8]]; // Tọa độ X, Z
    pos.forEach(p => {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.x = Math.PI/2; // Bánh xe xoay ngang
        w.position.set(p[0], 0.8, p[1]);
        g.add(w);
        g.userData.wheels.push(w);
    });
    return g;
}

function buildFarmer() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 8), new THREE.MeshStandardMaterial({color: 0x8B5A2B}));
    body.position.y = 1.4; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25), new THREE.MeshStandardMaterial({color:0xffccaa}));
    head.position.y = 2.2; g.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.2, 16), new THREE.MeshStandardMaterial({color:0xDAA520}));
    hat.position.y = 2.45; g.add(hat);
    
    const legGeo = new THREE.BoxGeometry(0.15, 0.8, 0.15);
    const legMat = new THREE.MeshStandardMaterial({color: 0x333});
    const lLeg = new THREE.Mesh(legGeo, legMat); lLeg.position.set(-0.15, 0.4, 0);
    const rLeg = new THREE.Mesh(legGeo, legMat); rLeg.position.set(0.15, 0.4, 0);
    g.userData.lLeg = lLeg; g.userData.rLeg = rLeg;
    g.add(lLeg); g.add(rLeg);
    return g;
}

function createHoles() {
    const geo = new THREE.CircleGeometry(0.5, 16);
    const mat = new THREE.MeshStandardMaterial({color: 0x3e2723});
    
    for(let i=0; i<CONFIG.holeCount; i++) {
        let x = (Math.random()-0.5)*(CONFIG.fieldSize-10);
        let z = (Math.random()-0.5)*(CONFIG.fieldSize-10);
        if(z > 40 && z < 56) continue;

        const hole = new THREE.Mesh(geo, mat);
        hole.rotation.x = -Math.PI/2;
        hole.position.set(x, 0.03, z);
        scene.add(hole);
        
        holes.push({
            mesh: hole, 
            state: 'empty', 
            mice: Math.floor(Math.random()*4)+1,
            isSmoking: false // Cờ hiệu để bốc khói mãi mãi
        });
    }
}

// --- LOGIC TƯƠNG TÁC ---
function toggleInventory() {
    isInventoryOpen = !isInventoryOpen;
    const panel = document.getElementById('inventory-panel');
    if(isInventoryOpen) {
        panel.classList.remove('hidden'); controls.unlock(); document.getElementById('blocker').style.display = 'none';
    } else {
        panel.classList.add('hidden'); controls.lock();
    }
    updateInventoryUI();
}

function updateInventoryUI() {
    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';
    inventory.forEach(item => {
        const el = document.createElement('div');
        el.className = `item-slot ${currentItem && currentItem.id === item.id ? 'active' : ''}`;
        el.innerHTML = `<div class="item-icon">${item.icon}</div><div>${item.name} (${item.count})</div>`;
        el.onclick = () => { currentItem = item; updateInventoryUI(); updateHandItemVisual(); };
        grid.appendChild(el);
    });
    if(currentItem) document.getElementById('hand-item').innerText = currentItem.name;
    if(currentItem && currentItem.id === 'cage') updateHandItemVisual();
}

function notify(msg) {
    const n = document.getElementById('notification');
    n.innerText = msg; n.style.opacity = 1;
    setTimeout(()=> n.style.opacity = 0, 2000);
}

function spawnCigSmoke() {
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const pos = camera.position.clone().add(dir.multiplyScalar(0.5));
    pos.y -= 0.2;
    spawnParticle(pos, 'cig');
}

function swingHand() {
    if(isSwinging) return;
    isSwinging = true;
    let duration = 300; let start = performance.now();
    function animateSwing() {
        let now = performance.now(); let progress = (now - start) / duration;
        if(progress > 1) {
            isSwinging = false; rightHandGroup.rotation.x = Math.PI/2.5; return;
        }
        let angle = Math.PI/2.5 + Math.sin(progress * Math.PI) * 0.5;
        rightHandGroup.rotation.x = angle;
        requestAnimationFrame(animateSwing);
    }
    animateSwing();
}

function onMouseClick() {
    if(!controls.isLocked) return;
    swingHand(); 

    if(currentItem && currentItem.id === 'cig' && currentItem.count > 0) {
        currentItem.count--; stamina = Math.min(stamina + 20, 100);
        audio.sfxSmoke(); for(let i=0; i<5; i++) setTimeout(spawnCigSmoke, i*100);
        notify("Hút thuốc..."); updateInventoryUI(); return;
    }
    if(currentItem && currentItem.id === 'water' && currentItem.count > 0) {
        currentItem.count--; stamina = Math.min(stamina + 40, 100);
        audio.sfxDrink(); notify("Uống nước..."); updateInventoryUI(); return;
    }

    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const intersects = raycaster.intersectObjects(holes.map(h=>h.mesh));
    
    if(intersects.length > 0 && intersects[0].distance < 4) {
        const hole = holes.find(h=>h.mesh === intersects[0].object);
        if(!currentItem) return;

        if(hole.state === 'empty' && currentItem.id === 'straw') {
            hole.state = 'straw';
            const straw = new THREE.Mesh(new THREE.ConeGeometry(0.4,0.3,8), new THREE.MeshLambertMaterial({color:0xDAA520}));
            straw.rotation.x=Math.PI/2; hole.mesh.add(straw);
            currentItem.count--; notify("Đã đặt rơm.");
        } 
        else if(hole.state === 'straw' && currentItem.id === 'lighter') {
            hole.state = 'burning';
            hole.burnTime = Date.now();
            audio.sfxFire(); notify("Đã đốt lửa!");
        }
        else if(hole.state === 'burning' && currentItem.id === 'net' && !hole.hasNet) {
            hole.hasNet = true;
            const net = new THREE.Mesh(new THREE.RingGeometry(0.2,0.6,16), new THREE.MeshBasicMaterial({color:0xffffff, wireframe:true}));
            hole.mesh.add(net);
            currentItem.count--; notify("Đã đặt lưới.");
        }
        else if(hole.state === 'caught' && currentItem.id === 'cage') {
            capturedMice += hole.mice;
            document.getElementById('score').innerText = capturedMice;
            audio.sfxCatch(); notify(`Bắt được ${hole.mice} con!`);
            
            hole.mesh.clear();
            hole.state = 'cleared';
            hole.isSmoking = true; // Bắt đầu khói vĩnh viễn
            updateHandItemVisual();
        }
        else if(hole.state === 'cleared' && currentItem.id === 'flag') {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,1.0), new THREE.MeshStandardMaterial({color:0x8B4513}));
            pole.rotation.x = Math.PI/2;
            const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4,0.3), new THREE.MeshBasicMaterial({color:0xff0000, side:THREE.DoubleSide}));
            flag.position.y = 0.3; flag.rotation.x = Math.PI/2; flag.rotation.y = Math.PI/2;
            hole.mesh.add(pole); pole.add(flag);
            
            hole.state = 'flagged'; // Cắm cờ xong vẫn bốc khói
            currentItem.count--; notify("Đã cắm cờ.");
        }
        updateInventoryUI();
    }
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = (time - prevTime)/1000;
    prevTime = time;

    document.getElementById('stamina-bar').style.width = stamina + '%';
    document.getElementById('stamina-bar').style.background = stamina < 20 ? 'red' : (stamina < 50 ? 'orange' : '#00ff00');

    if(controls.isLocked) {
        // Physics
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= CONFIG.gravity * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        const speed = (isRunning && stamina > 0) ? CONFIG.runSpeed : CONFIG.walkSpeed;
        if(isRunning && (moveForward||moveBackward||moveLeft||moveRight)) stamina = Math.max(0, stamina - 10*delta);
        else if(!isRunning && stamina < 100) stamina = Math.min(100, stamina + 5*delta);

        if(moveForward||moveBackward) velocity.z -= direction.z * speed * 10.0 * delta;
        if(moveLeft||moveRight) velocity.x -= direction.x * speed * 10.0 * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        controls.getObject().position.y += velocity.y * delta;

        if(controls.getObject().position.y < 1.6) {
            velocity.y = 0; controls.getObject().position.y = 1.6;
        }

        // Tường vô hình
        const pos = controls.getObject().position;
        const limit = CONFIG.fieldSize/2;
        pos.x = Math.max(-limit, Math.min(limit, pos.x));
        pos.z = Math.max(-limit, Math.min(limit, pos.z));

        // Âm thanh bước chân & Lúa xào xạc
        const isMoving = moveForward||moveBackward||moveLeft||moveRight;
        if(isMoving) {
            footstepTimer += delta;
            if(footstepTimer > (isRunning?0.35:0.6)) {
                audio.sfxStep(); footstepTimer=0;
            }
            hands.position.y = -0.1 + Math.sin(time*0.01) * 0.015;

            // Xào xạc nếu đi vào ruộng lúa (vùng Z khác đường đi)
            if(Math.abs(pos.z - 48) > 10) {
                if(Math.random() > 0.92) audio.sfxRustle();
            }
        }
    }

    // Animation Objects
    if(cageMouseMesh) {
        cageMouseMesh.position.x = Math.sin(time*0.02) * 0.05;
        cageMouseMesh.rotation.y += delta * 5;
    }

    trucks.forEach(t => {
        t.mesh.position.x += t.speed * delta;
        // Bánh xe quay
        t.mesh.userData.wheels.forEach(w => w.rotation.z -= t.speed * delta * 0.5); 
        // Reset vị trí
        if(t.mesh.position.x > CONFIG.fieldSize/2 + 20) t.mesh.position.x = -CONFIG.fieldSize/2 - 20;
    });

    farmers.forEach(f => {
        f.mesh.position.x += f.speed * f.dir * delta;
        const walkCycle = Math.sin(time * 0.003); // Nông dân đi chậm lại
        f.mesh.userData.lLeg.position.z = walkCycle * 0.2;
        f.mesh.userData.rLeg.position.z = -walkCycle * 0.2;
        if(Math.abs(f.mesh.position.x) > CONFIG.fieldSize/2) f.dir *= -1;
        f.mesh.rotation.y = f.dir === 1 ? Math.PI/2 : -Math.PI/2;
    });

    // Particle System (Khói/Lửa)
    for(let i=particles.length-1; i>=0; i--) {
        const p = particles[i];
        p.life -= delta;
        p.mesh.position.y += p.vy;
        p.mesh.material.opacity = p.life * (p.type==='fire'?0.8:0.4);
        if(p.life <= 0) {
            scene.remove(p.mesh); particles.splice(i, 1);
        }
    }

    // Hole Logic
    holes.forEach(hole => {
        if(hole.state === 'burning') {
            // Tạo lửa và khói liên tục
            if(Math.random() > 0.8) spawnParticle(hole.mesh.position, 'fire');
            if(Math.random() > 0.9) spawnParticle(hole.mesh.position, 'smoke');

            if(Date.now() - hole.burnTime > CONFIG.mouseWaitTime) {
                if(hole.hasNet) {
                    hole.state = 'caught';
                    hole.mesh.children.forEach(c => { if(c.geometry.type==='RingGeometry') c.material.color.setHex(0x00ff00); });
                    notify("Lưới rung mạnh!");
                } else {
                    hole.state = 'cleared';
                    hole.isSmoking = true; // Chuột chạy mất thì lỗ vẫn cháy âm ỉ
                    hole.mesh.clear();
                    notify("Chuột chạy mất!");
                }
            }
        }
        // Khói vĩnh viễn cho hang đã xong
        if(hole.isSmoking) {
             if(Math.random() > 0.92) spawnParticle(hole.mesh.position, 'smoke');
        }
    });

    renderer.render(scene, camera);
}
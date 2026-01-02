/**
 * GAME KÍCH CÁ GIẢ LẬP V3 - BẢO VỆ CỰC GẮT
 */

const CONFIG = {
    moveSpeed: 8.0,
    shockRange: 15.0,
    shockCooldown: 1000,
    fishCount: 50,
    waterLevel: 0,
    armBobbingSpeed: 5,
    armBobbingAmount: 0.05,
    guardChaseTime: 12.0, // Tăng thời gian đuổi lên chút cho kịch tính
    guardSpeed: 7.9, 
    chaseThresholds: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
};

// --- QUẢN LÝ ÂM THANH (Cải tiến tiếng chửi và còi) ---
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.whistleInterval = null;
        this.shoutInterval = null;
    }

    ensureContext() { if (this.ctx.state === 'suspended') this.ctx.resume(); }

    playZap() {
        this.ensureContext();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + 0.3);
    }

    playSplash() {
        this.ensureContext();
        const bufferSize = this.ctx.sampleRate * 0.5;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource(); noise.buffer = noiseBuffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
        noise.connect(gain); gain.connect(this.ctx.destination); noise.start();
    }

    playCollect() {
        this.ensureContext();
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + 0.1);
    }

    // Tiếng còi bảo vệ (Tuýt... Tuýt...)
    startWhistle() {
        this.ensureContext();
        if (this.whistleInterval) return;
        this.whistleInterval = setInterval(() => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square'; // Tiếng còi chói hơn
            osc.frequency.setValueAtTime(3000, this.ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(2500, this.ctx.currentTime + 0.1);
            
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
            
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(); osc.stop(this.ctx.currentTime + 0.15);
        }, 400); // 0.4s tuýt 1 cái
    }

    stopWhistle() {
        if (this.whistleInterval) { clearInterval(this.whistleInterval); this.whistleInterval = null; }
        if (this.shoutInterval) { clearInterval(this.shoutInterval); this.shoutInterval = null; }
    }

    // GIẢ LẬP TIẾNG CHỬI (Ồm ồm méo mó)
    playAngryShout() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        // Dùng sóng răng cưa tần số thấp để tạo giọng ồm
        osc.type = 'sawtooth';
        
        // Thay đổi tần số liên tục để giống tiếng nói/quát
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.linearRampToValueAtTime(200, t + 0.1);
        osc.frequency.linearRampToValueAtTime(120, t + 0.3);
        osc.frequency.linearRampToValueAtTime(180, t + 0.5);

        gain.gain.setValueAtTime(0.5, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.6);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(t + 0.6);
    }

    startShouting() {
        if (this.shoutInterval) return;
        // Chửi ngẫu nhiên mỗi 1-2 giây
        this.shoutInterval = setInterval(() => {
            if(Math.random() > 0.3) this.playAngryShout();
        }, 1500);
    }
}

// --- CLASS CÁ ---
class Fish {
    constructor(scene, bounds) {
        this.scene = scene;
        this.bounds = bounds;
        this.isStunned = false;
        this.isCaught = false;
        this.fishGroup = new THREE.Group();
        
        const sizeScale = 0.7 + Math.random() * 0.6;
        const fishColor = new THREE.Color().setHSL(Math.random() * 0.1 + 0.05, 0.7, 0.5);

        const bodyGeo = new THREE.CylinderGeometry(0.1 * sizeScale, 0.15 * sizeScale, 0.8 * sizeScale, 12);
        bodyGeo.rotateZ(Math.PI / 2);
        const bodyMat = new THREE.MeshLambertMaterial({ color: fishColor });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        this.fishGroup.add(body);

        const tailGeo = new THREE.ConeGeometry(0.2 * sizeScale, 0.3 * sizeScale, 4);
        tailGeo.rotateZ(-Math.PI / 2);
        tailGeo.scale(1, 0.3, 1);
        const tail = new THREE.Mesh(tailGeo, bodyMat);
        tail.position.set(-0.55 * sizeScale, 0, 0);
        this.fishGroup.add(tail);

        const finGeo = new THREE.ConeGeometry(0.1 * sizeScale, 0.2 * sizeScale, 3);
        const fin = new THREE.Mesh(finGeo, bodyMat);
        fin.position.set(0, 0.1 * sizeScale, 0);
        this.fishGroup.add(fin);
        
        this.mesh = this.fishGroup;
        this.originalColor = fishColor;
        this.reset();
        scene.add(this.mesh);
    }

    reset() {
        const x = (Math.random() - 0.5) * this.bounds;
        const z = (Math.random() - 0.5) * this.bounds;
        const y = -0.5 - Math.random() * 2;
        this.mesh.position.set(x, y, z);
        this.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1);
        this.isStunned = false;
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.children.forEach(child => { if(child.material) child.material.color.copy(this.originalColor); });
    }

    update(dt, playerPos) {
        if (this.isCaught) return;
        if (this.isStunned) {
            if (this.mesh.position.y < -0.1) {
                this.mesh.position.y += 1.5 * dt;
                this.mesh.rotation.x += 2 * dt;
                this.mesh.rotation.y += 1 * dt;
            }
            this.mesh.children.forEach(child => { if(child.material) child.material.color.setHex(0xFFFFFF); });
        } else {
            this.mesh.position.add(this.velocity);
            this.mesh.lookAt(this.mesh.position.clone().add(this.velocity));
            if (Math.abs(this.mesh.position.x) > this.bounds / 2) this.velocity.x *= -1;
            if (Math.abs(this.mesh.position.z) > this.bounds / 2) this.velocity.z *= -1;
            const dist = this.mesh.position.distanceTo(playerPos);
            if (dist < 6) {
                const escapeDir = this.mesh.position.clone().sub(playerPos).normalize();
                this.velocity.add(escapeDir.multiplyScalar(0.008));
                this.velocity.clampLength(0, 0.2);
            }
        }
    }

    shock(position, range) {
        if (this.isStunned) return;
        const fishPos2D = new THREE.Vector2(this.mesh.position.x, this.mesh.position.z);
        const shockPos2D = new THREE.Vector2(position.x, position.z);
        if (fishPos2D.distanceTo(shockPos2D) + Math.abs(this.mesh.position.y)*2 < range) this.isStunned = true;
    }
}

// --- CLASS BẢO VỆ (GUARD) ---
class Guard {
    constructor(scene) {
        this.scene = scene;
        this.isActive = false;
        
        this.group = new THREE.Group();
        
        // Thân (Dùng Cylinder cho an toàn mọi phiên bản)
        const bodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x000055 }); 
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.95;
        this.group.add(body);

        // Đầu
        const headGeo = new THREE.SphereGeometry(0.2, 16, 16);
        const skinMat = new THREE.MeshLambertMaterial({ color: 0xeebb99 });
        const head = new THREE.Mesh(headGeo, skinMat);
        head.position.y = 1.6;
        this.group.add(head);

        // Nón cối
        const hatGeo = new THREE.ConeGeometry(0.25, 0.2, 16);
        const hatMat = new THREE.MeshLambertMaterial({ color: 0x223322 });
        const hat = new THREE.Mesh(hatGeo, hatMat);
        hat.position.y = 1.8;
        this.group.add(hat);

        // Tay cầm đèn
        const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.6);
        const arm = new THREE.Mesh(armGeo, bodyMat);
        arm.position.set(0.35, 1.3, 0.2);
        arm.rotation.x = Math.PI / 3; // Giơ tay về phía trước
        this.group.add(arm);

        // Đèn pin (Spotlight) CỰC MẠNH
        this.flashLight = new THREE.SpotLight(0xffffff, 10); // Cường độ 10 (rất sáng)
        this.flashLight.angle = Math.PI / 8; // Góc chiếu hẹp để tập trung
        this.flashLight.penumbra = 0.1;
        this.flashLight.distance = 40;
        this.flashLight.castShadow = true;
        
        // Gắn đèn vào đầu tay
        this.flashLight.position.set(0.35, 1.3, 0.5); 
        this.group.add(this.flashLight);

        // Target của đèn (Sẽ update theo player liên tục)
        this.lightTarget = new THREE.Object3D();
        this.scene.add(this.lightTarget);
        this.flashLight.target = this.lightTarget;

        this.group.visible = false;
        scene.add(this.group);
    }

    spawn(playerPos, playerDir) {
        this.isActive = true;
        this.group.visible = true;
        const spawnPos = playerPos.clone().sub(playerDir.multiplyScalar(20));
        spawnPos.y = 0.5;
        this.group.position.copy(spawnPos);
    }

    despawn() {
        this.isActive = false;
        this.group.visible = false;
        this.flashLight.intensity = 0; // Tắt đèn khi biến mất
    }

    update(dt, playerPos) {
        if (!this.isActive) return false;

        // 1. Bảo vệ luôn nhìn về phía người chơi
        this.group.lookAt(playerPos.x, this.group.position.y, playerPos.z);
        
        // 2. CẬP NHẬT ĐÈN PIN: Luôn chiếu thẳng vào mặt người chơi
        this.lightTarget.position.copy(playerPos);
        this.flashLight.intensity = 10; // Đảm bảo đèn luôn sáng

        // 3. Di chuyển đuổi theo
        const direction = playerPos.clone().sub(this.group.position).normalize();
        direction.y = 0; 
        this.group.position.add(direction.multiplyScalar(CONFIG.guardSpeed * dt));
        this.group.position.y = Math.max(0.5, this.group.position.y);

        if (this.group.position.distanceTo(playerPos) < 1.5) {
            return true; // Bắt được
        }
        return false;
    }
}


// --- GAME ENGINE ---
class Game {
    constructor() {
        this.score = 0;
        this.battery = 100;
        this.lastShockTime = 0;
        this.isGameOver = false;
        this.isChasing = false;
        this.chaseTimer = 0;
        this.nextChaseThresholdIndex = 0;
        this.statusMsg = document.getElementById('status-msg');
        
        this.init();
        this.setupAudio();
        this.setupPlayer();
        this.setupWorld();
        this.setupGuard();
        this.animate();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x051a24);
        this.scene.fog = new THREE.FogExp2(0x051a24, 0.015);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        const ambient = new THREE.AmbientLight(0x222222);
        this.scene.add(ambient);
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.2);
        this.scene.add(hemiLight);

        this.playerSpotLight = new THREE.SpotLight(0xffffe0, 1.5);
        this.playerSpotLight.angle = Math.PI / 5;
        this.playerSpotLight.penumbra = 0.4;
        this.playerSpotLight.distance = 50;
        this.playerSpotLight.castShadow = true;
        this.camera.add(this.playerSpotLight);
        this.playerSpotLight.target.position.set(0, 0, -1);
        this.camera.add(this.playerSpotLight.target);
        this.scene.add(this.camera);

        this.controls = new THREE.PointerLockControls(this.camera, document.body);
        
        const blocker = document.getElementById('blocker');
        const instructions = document.getElementById('instructions');
        instructions.addEventListener('click', () => { if(!this.isGameOver) this.controls.lock(); });
        this.controls.addEventListener('lock', () => { blocker.style.display = 'none'; });
        this.controls.addEventListener('unlock', () => { if(!this.isGameOver) blocker.style.display = 'flex'; });

        window.addEventListener('resize', () => this.onWindowResize(), false);

        this.moveForward = false; this.moveBackward = false;
        this.moveLeft = false; this.moveRight = false;
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));

        this.clock = new THREE.Clock();
    }

    setupAudio() { this.soundManager = new SoundManager(); }

    setupPlayer() {
        this.playerGroup = new THREE.Group();
        this.camera.add(this.playerGroup);

        // --- TAY PHẢI (KÍCH) ---
        const rightArmGroup = new THREE.Group();
        rightArmGroup.position.set(0.4, -0.3, -0.5);
        const armGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.6, 12);
        const skinMat = new THREE.MeshLambertMaterial({ color: 0xeebb99 });
        const armMesh = new THREE.Mesh(armGeo, skinMat);
        armMesh.rotation.x = Math.PI / 2.5;
        rightArmGroup.add(armMesh);

        const bambooGeo = new THREE.CylinderGeometry(0.02, 0.03, 1.8, 8);
        const bambooMat = new THREE.MeshLambertMaterial({ color: 0x8B5A2B });
        this.rightPole = new THREE.Mesh(bambooGeo, bambooMat);
        this.rightPole.position.set(0, 0, -0.7);
        this.rightPole.rotation.x = Math.PI / 2;
        rightArmGroup.add(this.rightPole);

        const tipGeo = new THREE.ConeGeometry(0.02, 0.1, 8);
        const tipMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 100, emissive: 0x111111 });
        this.rightTip = new THREE.Mesh(tipGeo, tipMat);
        this.rightTip.position.set(0, -0.95, 0);
        this.rightPole.add(this.rightTip);

        const wireGeo = new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(0.2, 0.8, 0.5), new THREE.Vector3(0, 0.5, 1.2)]), 8, 0.008, 4, false
        );
        const wireMat = new THREE.MeshLambertMaterial({ color: 0xffd700 });
        this.rightPole.add(new THREE.Mesh(wireGeo, wireMat));
        this.playerGroup.add(rightArmGroup);
        this.rightArm = rightArmGroup;

        // --- TAY TRÁI (VỢT) - ĐÃ SỬA GÓC ---
        const leftArmGroup = new THREE.Group();
        // Vị trí vẫn ở bên trái
        leftArmGroup.position.set(-0.4, -0.4, -0.4); 
        
        // SỬA: Xoay cả group tay trái để hướng xuống nước tự nhiên hơn
        // Xoay trục X ít hơn để tay duỗi ra trước, hơi chúc xuống
        leftArmGroup.rotation.set(-0.2, 0.1, 0); 

        const leftArmMesh = new THREE.Mesh(armGeo, skinMat);
        // Xoay mesh tay nằm ngang hướng về trước
        leftArmMesh.rotation.x = Math.PI / 2; 
        leftArmGroup.add(leftArmMesh);

        // Cán vợt
        const netHandle = new THREE.Mesh(bambooGeo, bambooMat);
        // Đẩy cán vợt ra xa hơn chút
        netHandle.position.set(0, 0, -0.8); 
        netHandle.rotation.x = Math.PI / 2;
        leftArmGroup.add(netHandle);

        const netRing = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.015, 8, 16), tipMat);
        netRing.position.set(0, -0.95, 0); 
        netHandle.add(netRing);
        
        const netBag = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12, 0, Math.PI*2, 0, Math.PI/2), new THREE.MeshBasicMaterial({ color: 0xaaaaaa, wireframe: true, transparent: true, opacity: 0.4 }));
        netBag.rotation.x = Math.PI; 
        netRing.add(netBag);

        this.playerGroup.add(leftArmGroup);
        this.leftArm = leftArmGroup;
    }

    setupWorld() {
        const waterGeo = new THREE.PlaneGeometry(250, 250);
        const waterMat = new THREE.MeshPhongMaterial({ color: 0x003344, transparent: true, opacity: 0.7, shininess: 100, reflectivity: 0.8 });
        this.water = new THREE.Mesh(waterGeo, waterMat);
        this.water.rotation.x = -Math.PI / 2;
        this.scene.add(this.water);

        const groundGeo = new THREE.PlaneGeometry(250, 250, 64, 64);
        const posAttr = groundGeo.attributes.position;
        const simplex = new SimplexNoise();
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i); const y = posAttr.getY(i);
            posAttr.setZ(i, simplex.noise2D(x * 0.03, y * 0.03) * 1.5 - 2.5);
        }
        groundGeo.computeVertexNormals();
        const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ color: 0x2b2b1a }));
        ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
        this.scene.add(ground);

        for(let i=0; i<150; i++) {
            const h = Math.random() * 3 + 1;
            const grass = new THREE.Mesh(new THREE.ConeGeometry(0.15, h, 5), new THREE.MeshLambertMaterial({ color: 0x114411 }));
            grass.position.set((Math.random()-0.5)*200, -0.2, (Math.random()-0.5)*200);
            this.scene.add(grass);
        }

        this.fishes = [];
        for(let i=0; i<CONFIG.fishCount; i++) this.fishes.push(new Fish(this.scene, 120));

        this.shockLight = new THREE.PointLight(0x55FFFF, 0, 25);
        this.scene.add(this.shockLight);
    }
    
    setupGuard() { this.guard = new Guard(this.scene); }

    onKeyDown(e) {
        switch (e.code) {
            case 'ArrowUp': case 'KeyW': this.moveForward = true; break;
            case 'ArrowLeft': case 'KeyA': this.moveLeft = true; break;
            case 'ArrowDown': case 'KeyS': this.moveBackward = true; break;
            case 'ArrowRight': case 'KeyD': this.moveRight = true; break;
        }
        // Thêm chạy nhanh (Sprint)
        if (e.shiftKey) CONFIG.moveSpeed = 12.0; 
    }
    onKeyUp(e) {
        switch (e.code) {
            case 'ArrowUp': case 'KeyW': this.moveForward = false; break;
            case 'ArrowLeft': case 'KeyA': this.moveLeft = false; break;
            case 'ArrowDown': case 'KeyS': this.moveBackward = false; break;
            case 'ArrowRight': case 'KeyD': this.moveRight = false; break;
        }
        if (!e.shiftKey) CONFIG.moveSpeed = 8.0;
    }
    onMouseDown(e) {
        if (!this.controls.isLocked || this.isGameOver) return;
        if (e.button === 2) this.triggerShock();
        else if (e.button === 0) this.triggerScoop();
    }

    triggerShock() {
        const now = Date.now();
        if (now - this.lastShockTime < CONFIG.shockCooldown || this.battery <= 0) return;
        this.lastShockTime = now;
        this.battery = Math.max(0, this.battery - 3);
        document.getElementById('battery').innerText = `Pin ắc quy: ${this.battery}%`;
        this.soundManager.playZap();
        
        const overlay = document.getElementById('flash-overlay');
        overlay.style.opacity = 0.6; setTimeout(() => overlay.style.opacity = 0, 120);

        const tipWorldPos = new THREE.Vector3();
        this.rightTip.getWorldPosition(tipWorldPos);
        this.shockLight.position.copy(tipWorldPos);
        this.shockLight.intensity = 8; setTimeout(() => this.shockLight.intensity = 0, 150);
        
        this.rightArm.position.y += 0.08; setTimeout(() => this.rightArm.position.y -= 0.08, 100);
        this.fishes.forEach(fish => fish.shock(tipWorldPos, CONFIG.shockRange));
    }

    triggerScoop() {
        const initialRot = this.leftArm.rotation.x;
        this.leftArm.rotation.x -= 0.8; // Gập mạnh hơn xuống nước
        setTimeout(() => this.leftArm.rotation.x = initialRot, 300);

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        
        const stunnedFishMeshes = [];
        this.fishes.forEach(f => { if(f.isStunned && !f.isCaught) stunnedFishMeshes.push(f.mesh); });
        const intersects = raycaster.intersectObjects(stunnedFishMeshes, true);

        if (intersects.length > 0 && intersects[0].distance < 9) {
            let hitMesh = intersects[0].object;
            while(hitMesh.parent && !this.fishes.some(f => f.mesh === hitMesh)) hitMesh = hitMesh.parent;
            const fishObj = this.fishes.find(f => f.mesh === hitMesh);
            if (fishObj) this.collectFish(fishObj);
        }
    }

    collectFish(fish) {
        fish.isCaught = true; fish.mesh.visible = false;
        this.score++;
        document.getElementById('score').innerText = `Cá trong balo: ${this.score}`;
        this.soundManager.playCollect();
        setTimeout(() => { fish.mesh.visible = true; fish.isCaught = false; fish.reset(); }, 5000);

        if (this.nextChaseThresholdIndex < CONFIG.chaseThresholds.length) {
            if (this.score >= CONFIG.chaseThresholds[this.nextChaseThresholdIndex]) {
                this.startChase();
                this.nextChaseThresholdIndex++;
            }
        }
    }
    
    startChase() {
        if(this.isChasing) return;
        this.isChasing = true;
        this.chaseTimer = CONFIG.guardChaseTime;
        this.statusMsg.innerText = "BẢO VỆ PHÁT HIỆN! CHẠY NGAY!";
        this.soundManager.startWhistle();
        this.soundManager.startShouting(); // Kích hoạt tiếng chửi

        const playerDir = new THREE.Vector3();
        this.camera.getWorldDirection(playerDir);
        this.guard.spawn(this.camera.position, playerDir);
    }
    
    endChase() {
        this.isChasing = false;
        this.statusMsg.innerText = "";
        this.soundManager.stopWhistle();
        this.guard.despawn();
    }

    gameOver() {
        this.isGameOver = true;
        this.controls.unlock();
        this.soundManager.stopWhistle();
        document.getElementById('game-over').style.display = 'flex';
        document.getElementById('blocker').style.display = 'none';
    }

    animate() {
        if (this.isGameOver) return;
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        if (this.controls.isLocked) {
            const velocity = new THREE.Vector3();
            const direction = new THREE.Vector3();
            direction.z = Number(this.moveForward) - Number(this.moveBackward);
            direction.x = Number(this.moveRight) - Number(this.moveLeft);
            direction.normalize();
            if (this.moveForward || this.moveBackward) velocity.z -= direction.z * CONFIG.moveSpeed * delta;
            if (this.moveLeft || this.moveRight) velocity.x -= direction.x * CONFIG.moveSpeed * delta;
            this.controls.moveRight(-velocity.x);
            this.controls.moveForward(-velocity.z);
            this.camera.position.y = 1.6;

            if (direction.length() > 0) {
                const bob = Math.sin(time * CONFIG.armBobbingSpeed) * CONFIG.armBobbingAmount;
                this.playerGroup.position.y = bob;
                this.playerGroup.position.x = Math.cos(time * CONFIG.armBobbingSpeed / 2) * 0.02;
                if (Math.sin(time * CONFIG.armBobbingSpeed) > 0.9 && !this.playedStep) {
                    this.soundManager.playSplash(); this.playedStep = true;
                }
                if (Math.sin(time * CONFIG.armBobbingSpeed) < 0) this.playedStep = false;
            } else {
                this.playerGroup.position.y = Math.sin(time * 2) * 0.008;
            }
            
            if (this.isChasing) {
                this.chaseTimer -= delta;
                this.statusMsg.innerText = `BỊ ĐUỔI: ${Math.ceil(this.chaseTimer)}s - GIỮ SHIFT ĐỂ CHẠY!`;
                
                const caught = this.guard.update(delta, this.camera.position);
                if (caught) this.gameOver();

                if (this.chaseTimer <= 0) {
                    this.endChase();
                    this.statusMsg.innerText = "Đã cắt đuôi được bảo vệ.";
                    setTimeout(() => this.statusMsg.innerText = "", 3000);
                }
            }
        }

        const playerPos = this.camera.position.clone();
        this.fishes.forEach(fish => fish.update(delta, playerPos));
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

const game = new Game();
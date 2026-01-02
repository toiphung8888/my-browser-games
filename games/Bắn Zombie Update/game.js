import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ==========================================
// 1. ASSET GENERATOR (Tạo Texture bằng code)
// ==========================================
function createTexture(color, type) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Nền
    ctx.fillStyle = color;
    ctx.fillRect(0,0,64,64);

    if (type === 'brick') { // Gạch
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.fillRect(0, 30, 64, 4);
        ctx.fillRect(30, 0, 4, 32);
        ctx.fillRect(0, 0, 4, 32);
    } else if (type === 'window') { // Cửa sổ sáng
        ctx.fillStyle = "#87CEEB"; // Kính xanh
        ctx.fillRect(4, 4, 56, 56);
        ctx.fillStyle = "#fff"; // Phản chiếu
        ctx.beginPath(); ctx.moveTo(4,60); ctx.lineTo(60,4); ctx.lineTo(64,0); ctx.lineTo(0,64); ctx.fill();
    } else if (type === 'asphalt') { // Đường nhựa
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        for(let i=0; i<50; i++) ctx.fillRect(Math.random()*64, Math.random()*64, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter; // Pixel art style
    return tex;
}

const TEXTURES = {
    brick: createTexture('#a05a2c', 'brick'),
    concrete: createTexture('#777777', 'brick'),
    window: createTexture('#333', 'window'),
    asphalt: createTexture('#333333', 'asphalt')
};

// ==========================================
// 2. CONFIG & STATE
// ==========================================
const SETTINGS = {
    speed: 12, runSpeed: 20, gravity: 40, jump: 18,
    zombieSpeed: 3.5 // Chậm đúng chất zombie
};
const STATE = {
    hp: 100, score: 0, wave: 1, active: false
};

let camera, scene, renderer, controls;
const objects = []; // Colliders
const bullets = [];
const zombies = [];
const particles = [];

let moveF=false, moveB=false, moveL=false, moveR=false, canJump=false, running=false;
let velocity = new THREE.Vector3();
let prevTime = performance.now();

// ==========================================
// 3. ZOMBIE CLASS (Có Animation)
// ==========================================
class Zombie {
    constructor(x, z) {
        this.hp = 100 + (STATE.wave * 20);
        this.speed = SETTINGS.zombieSpeed + Math.random(); 
        
        // Group chứa toàn bộ bộ phận
        this.mesh = new THREE.Group();
        this.mesh.position.set(x, 0, z);

        // Vật liệu
        const skinMat = new THREE.MeshLambertMaterial({ color: 0x6e8c63 }); // Xanh lá zombie
        const shirtMat = new THREE.MeshLambertMaterial({ color: Math.random()>0.5 ? 0x3d5c75 : 0x753d3d }); // Áo xanh/đỏ rách
        const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });

        // 1. Thân
        const torsoGeo = new THREE.BoxGeometry(0.6, 0.9, 0.4);
        this.torso = new THREE.Mesh(torsoGeo, shirtMat);
        this.torso.position.y = 1.4;
        this.mesh.add(this.torso);

        // 2. Đầu
        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        this.head = new THREE.Mesh(headGeo, skinMat);
        this.head.position.y = 0.7; // Tương đối với torso
        this.torso.add(this.head);

        // 3. Tay (Hai tay giơ ra trước)
        const armGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
        
        this.armL = new THREE.Mesh(armGeo, skinMat);
        this.armL.position.set(-0.4, 0.3, 0.4); // Gắn vào vai
        this.armL.rotation.x = -Math.PI / 2; // Giơ thẳng tay
        this.torso.add(this.armL);

        this.armR = new THREE.Mesh(armGeo, skinMat);
        this.armR.position.set(0.4, 0.3, 0.4);
        this.armR.rotation.x = -Math.PI / 2;
        this.torso.add(this.armR);

        // 4. Chân
        const legGeo = new THREE.BoxGeometry(0.25, 0.9, 0.25);
        
        this.legL = new THREE.Mesh(legGeo, pantsMat);
        this.legL.position.set(-0.2, 0.45, 0);
        this.mesh.add(this.legL);

        this.legR = new THREE.Mesh(legGeo, pantsMat);
        this.legR.position.set(0.2, 0.45, 0);
        this.mesh.add(this.legR);

        scene.add(this.mesh);
        
        // Offset cho animation để chúng không đi đều bước
        this.animOffset = Math.random() * 100;
    }

    update(dt, playerPos) {
        const dist = this.mesh.position.distanceTo(playerPos);
        
        // Logic di chuyển
        if (dist > 1.5) {
            const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position).normalize();
            dir.y = 0;
            this.mesh.lookAt(playerPos.x, 0, playerPos.z);
            this.mesh.position.add(dir.multiplyScalar(this.speed * dt));

            // ANIMATION ĐI BỘ (Walking)
            const time = performance.now() * 0.005 + this.animOffset;
            this.legL.rotation.x = Math.sin(time) * 0.5;
            this.legR.rotation.x = Math.sin(time + Math.PI) * 0.5;
            
            // Tay đung đưa nhẹ kiểu zombie
            this.armL.rotation.z = Math.sin(time * 0.5) * 0.1;
            this.armR.rotation.z = Math.cos(time * 0.5) * 0.1;
        } else {
            // Tấn công
            attackPlayer();
        }

        // Kiểm tra va chạm đạn
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            // Hitbox đơn giản
            if (Math.abs(b.pos.x - this.mesh.position.x) < 0.6 &&
                Math.abs(b.pos.z - this.mesh.position.z) < 0.6 &&
                b.pos.y > 0 && b.pos.y < 2.5) {
                
                this.hp -= b.dmg;
                spawnBlood(b.pos, 0x00ff00); // Máu xanh zombie
                b.remove(); // Xóa đạn
                bullets.splice(i, 1);

                // Hiệu ứng giật lùi
                this.mesh.position.sub(this.mesh.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.5));

                if (this.hp <= 0) return true; // Dead
            }
        }
        return false;
    }

    remove() {
        scene.remove(this.mesh);
        spawnBlood(this.mesh.position.clone().add(new THREE.Vector3(0,1,0)), 0x00ff00, 20);
        STATE.score += 50;
        updateUI();
    }
}

// ==========================================
// 4. ENVIRONMENT (City Generator)
// ==========================================
function generateCity() {
    // 1. Mặt đất (Cỏ nền)
    const groundGeo = new THREE.PlaneGeometry(300, 300);
    groundGeo.rotateX(-Math.PI/2);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2618 }); // Cỏ tối
    const ground = new THREE.Mesh(groundGeo, groundMat);
    scene.add(ground);

    // 2. Hệ thống đường xá (Grid)
    const roadWidth = 8;
    const blockSize = 30;
    
    // Vật liệu đường
    const roadMat = new THREE.MeshStandardMaterial({ map: TEXTURES.asphalt });
    
    // Quy hoạch thành phố: Loop qua Grid
    for(let x = -120; x <= 120; x += blockSize) {
        for(let z = -120; z <= 120; z += blockSize) {
            
            // Xác suất: 30% là đường, 70% là nhà
            const isRoad = (Math.abs(x) < roadWidth || Math.abs(z) < roadWidth || Math.random() > 0.6);

            if (isRoad) {
                // Tạo đường
                const roadGeo = new THREE.PlaneGeometry(blockSize, blockSize);
                roadGeo.rotateX(-Math.PI/2);
                const road = new THREE.Mesh(roadGeo, roadMat);
                road.position.set(x, 0.05, z); // Cao hơn cỏ xíu
                scene.add(road);
                
                // Nếu là đường thẳng, thêm vạch kẻ đường
                // (Giản lược để code ngắn: ta để đường trơn)
            } else {
                // Tạo tòa nhà (Building)
                createBuilding(x, z, blockSize - 4);
            }
            
            // Tạo cây ở rìa block
            if (Math.random() > 0.7) {
                createTree(x + (Math.random()-0.5)*20, z + (Math.random()-0.5)*20);
            }
        }
    }
    
    // Đèn đường (Street Lamps)
    for(let i=0; i<20; i++) {
        const lx = (Math.random()-0.5)*200;
        const lz = (Math.random()-0.5)*200;
        const lamp = new THREE.PointLight(0xffaa00, 0.8, 30);
        lamp.position.set(lx, 8, lz);
        scene.add(lamp);
        
        // Cột đèn
        const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 8);
        const pole = new THREE.Mesh(poleGeo, new THREE.MeshPhongMaterial({color:0x222}));
        pole.position.set(lx, 4, lz);
        scene.add(pole);
        objects.push(pole); // Cản đường
    }
}

function createBuilding(x, z, size) {
    const height = 10 + Math.random() * 30;
    const geo = new THREE.BoxGeometry(size, height, size);
    
    // Map texture cửa sổ lên các mặt bên, mặt trên là bê tông
    const mats = [
        new THREE.MeshStandardMaterial({ map: TEXTURES.window }), // Right
        new THREE.MeshStandardMaterial({ map: TEXTURES.window }), // Left
        new THREE.MeshStandardMaterial({ map: TEXTURES.concrete }), // Top
        new THREE.MeshStandardMaterial({ map: TEXTURES.concrete }), // Bottom
        new THREE.MeshStandardMaterial({ map: TEXTURES.window }), // Front
        new THREE.MeshStandardMaterial({ map: TEXTURES.window }), // Back
    ];
    
    const building = new THREE.Mesh(geo, mats);
    building.position.set(x, height/2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);
    objects.push(building); // Thêm vào mảng va chạm
}

function createTree(x, z) {
    // Thân cây
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 3);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 1.5, z);
    
    // Tán cây (Low poly)
    const leavesGeo = new THREE.ConeGeometry(2, 5, 8);
    const leavesMat = new THREE.MeshLambertMaterial({ color: 0x2d5a27 });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.y = 3;
    trunk.add(leaves);
    
    scene.add(trunk);
    objects.push(trunk);
}

// ==========================================
// 5. GAME ENGINE
// ==========================================

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x201826); // Bầu trời tím tối (Dusk)
    scene.fog = new THREE.FogExp2(0x201826, 0.015); // Sương mù dày

    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 500);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Ánh sáng
    const hemiLight = new THREE.HemisphereLight(0x443366, 0x111122, 0.6);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffaa55, 1.2); // Ánh nắng chiều tà cam
    dirLight.position.set(50, 80, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.left = -100; dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100; dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);

    // Controls
    controls = new PointerLockControls(camera, document.body);
    const startBtn = document.querySelector('.start-btn');
    startBtn.addEventListener('click', () => controls.lock());

    controls.addEventListener('lock', () => {
        document.getElementById('blocker').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        STATE.active = true;
    });
    controls.addEventListener('unlock', () => {
        document.getElementById('blocker').style.display = 'flex';
        document.getElementById('hud').style.display = 'none';
        STATE.active = false;
    });
    scene.add(controls.getObject());

    // Inputs
    document.addEventListener('keydown', (e) => onKey(e, true));
    document.addEventListener('keyup', (e) => onKey(e, false));
    document.addEventListener('mousedown', shoot);
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth/window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    generateCity();
    animate();
}

function onKey(e, down) {
    switch(e.code) {
        case 'KeyW': moveF = down; break;
        case 'KeyS': moveB = down; break;
        case 'KeyA': moveL = down; break;
        case 'KeyD': moveR = down; break;
        case 'Space': if(down && canJump) { velocity.y += SETTINGS.jump; canJump = false; } break;
        case 'ShiftLeft': running = down; break;
    }
}

function shoot() {
    if (!STATE.active) return;
    
    // Hiệu ứng giật camera
    camera.rotation.x += 0.05;
    setTimeout(() => camera.rotation.x -= 0.05, 50);

    // Tạo đạn
    const bullet = {
        pos: controls.getObject().position.clone(),
        dir: camera.getWorldDirection(new THREE.Vector3()),
        speed: 150,
        dmg: 35,
        mesh: new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.1, 1),
            new THREE.MeshBasicMaterial({color: 0xffff00})
        )
    };
    bullet.pos.y -= 0.2; // Thấp hơn mắt xíu
    bullet.mesh.position.copy(bullet.pos);
    bullet.mesh.lookAt(bullet.pos.clone().add(bullet.dir));
    scene.add(bullet.mesh);
    
    // Phương thức xóa nhanh
    bullet.remove = () => scene.remove(bullet.mesh);
    
    bullets.push(bullet);
}

function attackPlayer() {
    // Zombie đánh người
    if (Math.random() < 0.05) { // Tỉ lệ đánh trúng thấp để game dễ thở
        STATE.hp -= 5;
        updateUI();
        
        // Màn hình đỏ
        const div = document.createElement('div');
        div.style.position = 'absolute'; div.style.width='100%'; div.style.height='100%';
        div.style.background = 'red'; div.style.opacity = 0.3; div.style.pointerEvents = 'none';
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 100);

        if (STATE.hp <= 0) {
            STATE.active = false;
            controls.unlock();
            alert("BẠN ĐÃ BỊ ĂN THỊT!");
            location.reload();
        }
    }
}

function spawnBlood(pos, color, count=5) {
    for(let i=0; i<count; i++) {
        const p = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.2, 0.2),
            new THREE.MeshBasicMaterial({color: color})
        );
        p.position.copy(pos);
        scene.add(p);
        particles.push({
            mesh: p,
            vel: new THREE.Vector3((Math.random()-0.5)*5, Math.random()*5, (Math.random()-0.5)*5),
            life: 1.0
        });
    }
}

function updateUI() {
    document.getElementById('hp-val').innerText = STATE.hp;
    document.getElementById('score-val').innerText = STATE.score;
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const dt = Math.min((time - prevTime) / 1000, 0.1);
    prevTime = time;

    if (STATE.active) {
        // 1. Physics Player
        velocity.x -= velocity.x * 10.0 * dt;
        velocity.z -= velocity.z * 10.0 * dt;
        velocity.y -= SETTINGS.gravity * dt;

        const spd = running ? SETTINGS.runSpeed : SETTINGS.speed;
        const dir = new THREE.Vector3();
        dir.z = Number(moveF) - Number(moveB);
        dir.x = Number(moveR) - Number(moveL);
        dir.normalize();

        if (moveF || moveB) velocity.z -= dir.z * spd * 10.0 * dt;
        if (moveL || moveR) velocity.x -= dir.x * spd * 10.0 * dt;

        controls.moveRight(-velocity.x * dt);
        controls.moveForward(-velocity.z * dt);
        controls.getObject().position.y += velocity.y * dt;

        // Va chạm đất/vật thể (đơn giản hóa: chỉ check mặt đất Y=1.8)
        if (controls.getObject().position.y < 1.8) {
            velocity.y = 0;
            controls.getObject().position.y = 1.8;
            canJump = true;
        }

        // 2. Bullets Update
        for (let i = bullets.length-1; i>=0; i--) {
            const b = bullets[i];
            b.pos.add(b.dir.clone().multiplyScalar(b.speed * dt));
            b.mesh.position.copy(b.pos);
            
            // Xóa nếu bay quá xa
            if (b.pos.distanceTo(controls.getObject().position) > 100) {
                b.remove(); bullets.splice(i,1);
            }
        }

        // 3. Zombies Update
        const playerPos = controls.getObject().position;
        for (let i = zombies.length-1; i>=0; i--) {
            const dead = zombies[i].update(dt, playerPos);
            if (dead) {
                zombies[i].remove();
                zombies.splice(i, 1);
            }
        }

        // 4. Particles Update
        for(let i=particles.length-1; i>=0; i--) {
            const p = particles[i];
            p.life -= dt * 2;
            p.vel.y -= 20 * dt;
            p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
            p.mesh.scale.setScalar(p.life);
            if(p.life <= 0) { scene.remove(p.mesh); particles.splice(i,1); }
        }

        // 5. Game Logic (Wave)
        if (zombies.length < 3 + STATE.wave && Math.random() < 0.02) {
            // Spawn xa người chơi
            const angle = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 20;
            const zx = playerPos.x + Math.cos(angle)*r;
            const zz = playerPos.z + Math.sin(angle)*r;
            zombies.push(new Zombie(zx, zz));
        }
        
        // Tăng Wave mỗi 500 điểm
        if (STATE.score > STATE.wave * 500) {
            STATE.wave++;
            document.getElementById('wave-text').innerText = STATE.wave;
            const msg = document.getElementById('msg-center');
            msg.innerText = "WAVE " + STATE.wave + " START!";
            msg.style.opacity = 1;
            setTimeout(() => msg.style.opacity = 0, 3000);
        }
    }
    renderer.render(scene, camera);
}

init();
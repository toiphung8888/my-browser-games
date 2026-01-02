import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ==========================================
// 1. SOUND SYSTEM
// ==========================================
class SoundSynth {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.2;
        this.gain.connect(this.ctx.destination);
    }
    playShot() {
        if(this.ctx.state === 'suspended') this.ctx.resume();
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.gain);
        o.type='square'; // Tiếng đanh
        o.frequency.setValueAtTime(800, t); 
        o.frequency.exponentialRampToValueAtTime(100, t+0.1);
        g.gain.setValueAtTime(0.5, t); 
        g.gain.exponentialRampToValueAtTime(0.01, t+0.1);
        o.start(t); o.stop(t+0.1);
    }
    playMoan() {
        if(Math.random()>0.05) return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.gain);
        o.type='sawtooth'; 
        o.frequency.setValueAtTime(100, t); 
        o.frequency.linearRampToValueAtTime(50, t+0.8);
        g.gain.setValueAtTime(0.1, t); 
        g.gain.linearRampToValueAtTime(0, t+0.8);
        o.start(t); o.stop(t+0.8);
    }
}

// ==========================================
// 2. TEXTURE GENERATOR (Nền Nâu như yêu cầu)
// ==========================================
function createTexture(type) {
    const cvs = document.createElement('canvas');
    cvs.width = 64; cvs.height = 64;
    const ctx = cvs.getContext('2d');

    if (type === 'ground') {
        // Nền nâu chocolate
        ctx.fillStyle = '#6d4c41'; 
        ctx.fillRect(0,0,64,64);
        // Hoa văn đốm sáng tối
        ctx.fillStyle = '#8d6e63'; 
        for(let i=0; i<30; i++) {
            const size = Math.random() * 8 + 4;
            ctx.fillRect(Math.random()*60, Math.random()*60, size, size);
        }
        ctx.fillStyle = '#4e342e'; 
        for(let i=0; i<15; i++) {
            ctx.fillRect(Math.random()*60, Math.random()*60, 4, 4);
        }
    } else if (type === 'window') {
        ctx.fillStyle = "#87CEEB"; ctx.fillRect(4,4,56,56);
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(4,60); ctx.lineTo(60,4); ctx.lineTo(64,0); ctx.lineTo(0,64); ctx.fill();
    } else if (type === 'asphalt') {
        ctx.fillStyle = "#333"; ctx.fillRect(0,0,64,64);
    }
    
    const tex = new THREE.CanvasTexture(cvs);
    tex.magFilter = THREE.NearestFilter; 
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

const TEX = {
    ground: createTexture('ground'),
    win: createTexture('window'),
    road: createTexture('asphalt')
};

// ==========================================
// 3. CONFIG & GLOBALS
// ==========================================
const SETTINGS = {
    speed: 12, runSpeed: 24, gravity: 50, jump: 18,
    zombieSpeed: 4.5,
    mapLimit: 140,
    blockSize: 30
};
const STATE = { hp: 100, score: 0, wave: 1, active: false, scoping: false };

let camera, scene, renderer, controls, sound;
const colliders = [];
const bullets = [], zombies = [], particles = [], tracers = [];
let moveF=false, moveB=false, moveL=false, moveR=false, canJump=false, running=false;
let velocity = new THREE.Vector3();
let prevTime = performance.now();
const raycaster = new THREE.Raycaster();

// ==========================================
// 4. ZOMBIE CLASS
// ==========================================
class Zombie {
    constructor(x, z) {
        this.hp = 100 + (STATE.wave * 20);
        this.speed = SETTINGS.zombieSpeed + Math.random(); 
        this.lastAttack = 0;

        this.mesh = new THREE.Group();
        this.mesh.position.set(x, 0, z);
        this.mesh.userData = { isZombie: true, ref: this };

        // Hitbox ẩn
        const hb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 1.5), new THREE.MeshBasicMaterial({visible:false}));
        hb.position.y = 1.25;
        hb.userData = { isZombie: true, ref: this };
        this.mesh.add(hb);

        // Visuals
        const skin = new THREE.MeshLambertMaterial({ color: 0x4CAF50 });
        const shirt = new THREE.MeshLambertMaterial({ color: Math.random()>0.5 ? 0x795548 : 0x607D8B });
        
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), shirt);
        torso.position.y = 1.4; this.mesh.add(torso);
        
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
        head.position.y = 0.7; torso.add(head);

        this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), skin);
        this.armL.position.set(-0.4, 0.3, 0.4); this.armL.rotation.x = -1.5; torso.add(this.armL);

        this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), skin);
        this.armR.position.set(0.4, 0.3, 0.4); this.armR.rotation.x = -1.5; torso.add(this.armR);

        this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), shirt);
        this.legL.position.set(-0.2, 0.45, 0); this.mesh.add(this.legL);
        this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), shirt);
        this.legR.position.set(0.2, 0.45, 0); this.mesh.add(this.legR);

        scene.add(this.mesh);
        this.animOffset = Math.random() * 100;
    }

    update(dt, playerPos) {
        const dist = this.mesh.position.distanceTo(playerPos);
        
        if(dist < 20) sound.playMoan();

        if (dist > 2.0) { 
            const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position).normalize();
            dir.y = 0;
            this.mesh.lookAt(playerPos.x, 0, playerPos.z);
            this.mesh.position.add(dir.multiplyScalar(this.speed * dt));

            const t = performance.now() * 0.005 + this.animOffset;
            this.legL.rotation.x = Math.sin(t) * 0.8;
            this.legR.rotation.x = Math.sin(t + Math.PI) * 0.8;
        } else {
            // Tấn công
            const now = performance.now();
            if (now - this.lastAttack > 1000) { 
                attackPlayer();
                this.lastAttack = now;
                this.armL.rotation.x = -2.5; setTimeout(()=>this.armL.rotation.x=-1.5, 150);
                this.armR.rotation.x = -2.5; setTimeout(()=>this.armR.rotation.x=-1.5, 150);
            }
        }
    }
    
    takeDamage(dmg) {
        this.hp -= dmg;
        spawnBlood(this.mesh.position.clone().add(new THREE.Vector3(0,1.5,0)));
        this.mesh.position.sub(this.mesh.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.8));
        if (this.hp <= 0) {
            scene.remove(this.mesh);
            return true;
        }
        return false;
    }
}

// ==========================================
// 5. CITY GENERATOR
// ==========================================
function generateCity() {
    // Sàn Nâu
    const floorGeo = new THREE.PlaneGeometry(400, 400);
    const floorMat = new THREE.MeshStandardMaterial({ map: TEX.ground });
    TEX.ground.repeat.set(50, 50); 
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI/2;
    scene.add(floor);

    // Bầu trời
    createSky();

    // Grid
    const bs = SETTINGS.blockSize;
    for(let x = -120; x <= 120; x += bs) {
        for(let z = -120; z <= 120; z += bs) {
            if (Math.abs(x) < 15 || Math.abs(z) < 15 || Math.random() > 0.7) {
                if (Math.random() > 0.5) createLamp(x, z);
            } else {
                createBuilding(x, z, bs - 4);
            }
        }
    }

    // Tường map
    const limit = SETTINGS.mapLimit;
    const wMat = new THREE.MeshBasicMaterial({color: 0x550000, transparent: true, opacity: 0.1});
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(300, 50, 1), wMat); w1.position.set(0,25,-limit); scene.add(w1);
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(300, 50, 1), wMat); w2.position.set(0,25,limit); scene.add(w2);
    const w3 = new THREE.Mesh(new THREE.BoxGeometry(1, 50, 300), wMat); w3.position.set(-limit,25,0); scene.add(w3);
    const w4 = new THREE.Mesh(new THREE.BoxGeometry(1, 50, 300), wMat); w4.position.set(limit,25,0); scene.add(w4);
}

function createBuilding(x, z, s) {
    const h = 10 + Math.random()*25;
    const b = new THREE.Mesh(new THREE.BoxGeometry(s, h, s), new THREE.MeshStandardMaterial({map: TEX.win}));
    b.position.set(x, h/2, z);
    scene.add(b);
    colliders.push({x:x, z:z, s:s/2 + 0.8});
}

function createLamp(x, z) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,8), new THREE.MeshPhongMaterial({color:0x111}));
    p.position.set(x, 4, z); scene.add(p);
    const l = new THREE.PointLight(0xffaa00, 40, 20);
    l.position.set(x, 7.5, z); scene.add(l);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshBasicMaterial({color:0xffaa00}));
    b.position.set(x, 7.5, z); scene.add(b);
}

function createSky() {
    const starGeo = new THREE.BufferGeometry();
    const pos = [];
    for(let i=0; i<1000; i++) pos.push((Math.random()-.5)*400, Math.random()*200+50, (Math.random()-.5)*400);
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({color:0xffffff, size:0.8})));
    
    const moon = new THREE.Mesh(new THREE.SphereGeometry(10), new THREE.MeshBasicMaterial({color:0xffffee}));
    moon.position.set(80, 150, -80); scene.add(moon);
}

// ==========================================
// 6. LOGIC CHÍNH
// ==========================================
function init() {
    sound = new SoundSynth();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111122);
    scene.fog = new THREE.FogExp2(0x111122, 0.015);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth/innerHeight, 0.1, 500);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dl = new THREE.DirectionalLight(0xaaccff, 0.6);
    dl.position.set(80, 150, -80);
    scene.add(dl);

    controls = new PointerLockControls(camera, document.body);
    document.querySelector('.start-btn').addEventListener('click', () => controls.lock());

    controls.addEventListener('lock', () => {
        document.getElementById('blocker').style.display='none';
        document.getElementById('hud').style.display='block';
        STATE.active=true; sound.ctx.resume();
    });
    controls.addEventListener('unlock', () => {
        document.getElementById('blocker').style.display='flex';
        document.getElementById('hud').style.display='none';
        STATE.active=false; toggleScope(false);
    });
    scene.add(controls.getObject());

    document.addEventListener('keydown', (e)=>onKey(e,true));
    document.addEventListener('keyup', (e)=>onKey(e,false));
    document.addEventListener('mousedown', (e) => {
        if(!STATE.active) return;
        if(e.button === 0) shoot();
        if(e.button === 2) toggleScope(true);
    });
    document.addEventListener('mouseup', (e) => {
        if(e.button === 2) toggleScope(false);
    });
    window.addEventListener('resize', ()=>{ camera.aspect=window.innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,innerHeight); });

    generateCity();
    animate();
}

function onKey(e, d) {
    switch(e.code) {
        case 'KeyW': moveF=d; break; case 'KeyS': moveB=d; break;
        case 'KeyA': moveL=d; break; case 'KeyD': moveR=d; break;
        case 'Space': if(d&&canJump){velocity.y+=SETTINGS.jump; canJump=false;} break;
        case 'ShiftLeft': running=d; break;
        case 'KeyR': document.getElementById('ammo-count').innerText="..."; setTimeout(()=>document.getElementById('ammo-count').innerText="30 / ∞", 1000); break;
    }
}

function toggleScope(on) {
    STATE.scoping = on;
    const ol = document.getElementById('thermal-overlay');
    const ch = document.getElementById('scope-crosshair');
    if (on) { camera.fov = 25; ol.style.opacity = 1; ch.style.opacity = 1; }
    else { camera.fov = 75; ol.style.opacity = 0; ch.style.opacity = 0; }
    camera.updateProjectionMatrix();
}

function checkCollision(pos) {
    const l = SETTINGS.mapLimit - 2;
    if(pos.x < -l || pos.x > l || pos.z < -l || pos.z > l) return true;
    for(let c of colliders) {
        if (Math.abs(pos.x - c.x) < c.s && Math.abs(pos.z - c.z) < c.s) return true;
    }
    return false;
}

function shoot() {
    sound.playShot();
    
    // RECOIL: Chỉ nảy nhẹ vị trí, KHÔNG XOAY CAMERA (Sửa lỗi lộn ngược)
    camera.position.y += 0.05; 
    setTimeout(() => camera.position.y -= 0.05, 50);

    const pos = controls.getObject().position.clone(); pos.y -= 0.2;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    raycaster.set(camera.position, dir);
    
    const intersects = raycaster.intersectObjects(scene.children, true);
    let target = pos.clone().add(dir.multiplyScalar(100));

    for (let i=0; i<intersects.length; i++) {
        let obj = intersects[i].object;
        let parent = obj;
        while(parent) {
            if(parent.userData && parent.userData.isZombie) {
                const z = parent.userData.ref;
                const dead = z.takeDamage(35);
                target = intersects[i].point;
                if(dead) {
                    const idx = zombies.indexOf(z);
                    if(idx>-1) zombies.splice(idx,1);
                    STATE.score+=50;
                    document.getElementById('score-val').innerText = STATE.score;
                }
                break;
            }
            parent = parent.parent;
        }
        if(parent && parent.userData.isZombie) break;
    }
    createTracer(pos, target);
}

function createTracer(start, end) {
    const dist = start.distanceTo(end);
    const geo = new THREE.CylinderGeometry(0.03, 0.03, dist, 4);
    geo.rotateX(-Math.PI/2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color:0xffff00}));
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.lookAt(end);
    scene.add(mesh);
    tracers.push({m:mesh, l:1});
}

function attackPlayer() {
    STATE.hp -= 20;
    document.getElementById('hp-val').innerText = STATE.hp;
    
    // HIỆU ỨNG MÁU ĐỎ
    const overlay = document.getElementById('damage-overlay');
    overlay.style.opacity = 1;
    setTimeout(() => overlay.style.opacity = 0, 300);

    if (STATE.hp <= 0) {
        STATE.active = false; controls.unlock();
        alert("BẠN ĐÃ CHẾT! ĐIỂM: " + STATE.score);
        location.reload();
    }
}

function spawnBlood(pos) {
    for(let i=0; i<8; i++){
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.1), new THREE.MeshBasicMaterial({color:0x00ff00}));
        m.position.copy(pos); scene.add(m);
        particles.push({m:m, v:new THREE.Vector3((Math.random()-.5)*5, Math.random()*5, (Math.random()-.5)*5), l:1});
    }
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const dt = Math.min((time-prevTime)/1000, 0.1);
    prevTime = time;

    if(STATE.active) {
        velocity.x -= velocity.x * 10.0 * dt;
        velocity.z -= velocity.z * 10.0 * dt;
        velocity.y -= SETTINGS.gravity * dt;

        const spd = running ? SETTINGS.runSpeed : SETTINGS.speed;
        const dir = new THREE.Vector3();
        dir.z = Number(moveF) - Number(moveB);
        dir.x = Number(moveR) - Number(moveL);
        dir.normalize();

        if(moveF||moveB) velocity.z -= dir.z * spd * 10.0 * dt;
        if(moveL||moveR) velocity.x -= dir.x * spd * 10.0 * dt;

        const oldPos = controls.getObject().position.clone();
        controls.moveRight(-velocity.x * dt);
        controls.moveForward(-velocity.z * dt);

        if (checkCollision(controls.getObject().position)) {
            const bad = controls.getObject().position.clone();
            controls.getObject().position.copy(oldPos);
            controls.getObject().position.x = bad.x;
            if(checkCollision(controls.getObject().position)) controls.getObject().position.x = oldPos.x;
            controls.getObject().position.z = bad.z;
            if(checkCollision(controls.getObject().position)) controls.getObject().position.z = oldPos.z;
        }

        controls.getObject().position.y += velocity.y * dt;
        if(controls.getObject().position.y < 1.8) { velocity.y=0; controls.getObject().position.y=1.8; canJump=true; }

        // CAMERA STABILITY FIX: Đã xóa hoàn toàn code xoay camera tự động ở đây.
        // Chỉ để lại giảm độ nảy vị trí y (nếu có) nhưng ở đây ta làm đơn giản trong shoot() rồi.

        const pPos = controls.getObject().position;
        for(let z of zombies) z.update(dt, pPos);
        for(let i=tracers.length-1; i>=0; i--){ 
            const t=tracers[i]; t.l-=dt*15; t.m.material.opacity=t.l; t.m.material.transparent=true; 
            if(t.l<=0){scene.remove(t.m); tracers.splice(i,1);} 
        }
        for(let i=particles.length-1; i>=0; i--){ 
            const p=particles[i]; p.l-=dt*3; p.v.y-=20*dt; p.m.position.add(p.v.clone().multiplyScalar(dt)); 
            if(p.l<=0){scene.remove(p.m); particles.splice(i,1);} 
        }

        if(zombies.length < 5+STATE.wave && Math.random()<0.03) {
            const a=Math.random()*Math.PI*2, r=30+Math.random()*20;
            const zx=pPos.x+Math.cos(a)*r, zz=pPos.z+Math.sin(a)*r;
            if(!checkCollision({x:zx, z:zz})) zombies.push(new Zombie(zx, zz));
        }
        if(STATE.score > STATE.wave*500) { STATE.wave++; document.getElementById('wave-text').innerText=STATE.wave; }
    }
    renderer.render(scene, camera);
}

init();
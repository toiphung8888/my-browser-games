window.onload = function() {
    /** CONFIG */
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    const radarCtx = document.getElementById('radar').getContext('2d');
    let W, H;
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize); resize();

    /** AUDIO */
    const Audio = {
        ctx: null,
        init() { window.AudioContext = window.AudioContext || window.webkitAudioContext; this.ctx = new AudioContext(); },
        play(f, t, d, v=0.1) {
            if (!this.ctx) return;
            const o=this.ctx.createOscillator(), g=this.ctx.createGain();
            o.type=t; o.frequency.setValueAtTime(f, this.ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(f*0.1, this.ctx.currentTime+d);
            g.gain.setValueAtTime(v, this.ctx.currentTime);
            g.gain.linearRampToValueAtTime(0, this.ctx.currentTime+d);
            o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime+d);
        }
    };

    /** INPUT */
    const Input = {
        active: false, cx:0, cy:0, ox:0, oy:0, vx:0, vy:0,
        init() {
            const zone = document.getElementById('joystick-zone');
            const start = (x,y) => { this.active=true; this.ox=x; this.oy=y; this.cx=x; this.cy=y; this.update(); };
            const move = (x,y) => { if(this.active){ this.cx=x; this.cy=y; this.update(); }};
            const end = () => { this.active=false; this.vx=0; this.vy=0; };
            zone.addEventListener('touchstart', e=>{ e.preventDefault(); start(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
            zone.addEventListener('touchmove', e=>{ e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
            zone.addEventListener('touchend', end);
            let d = false;
            zone.addEventListener('mousedown', e=>{ d=true; start(e.clientX, e.clientY); });
            window.addEventListener('mousemove', e=>{ if(d) move(e.clientX, e.clientY); });
            window.addEventListener('mouseup', ()=>{ d=false; end(); });
        },
        update() {
            let dx = this.cx - this.ox, dy = this.cy - this.oy;
            const dist = Math.sqrt(dx*dx+dy*dy), max=60;
            if(dist>max) { dx*=max/dist; dy*=max/dist; }
            this.vx=dx/max; this.vy=dy/max;
        }
    };

    /** CLASSES */
    class Camera {
        constructor(){ this.x=0; this.y=0; this.shake=0; }
        follow(t) {
            this.x += (t.x - W/2 - this.x) * 0.1;
            this.y += (t.y - H/2 - this.y) * 0.1;
            if(this.shake>0) {
                this.x+=(Math.random()-0.5)*this.shake; this.y+=(Math.random()-0.5)*this.shake;
                this.shake*=0.9; if(this.shake<0.5) this.shake=0;
            }
        }
    }

    class Particle {
        constructor(x, y, color, speed, life) {
            this.x=x; this.y=y; this.color=color; this.life=life; this.maxLife=life;
            const a=Math.random()*Math.PI*2, v=Math.random()*speed;
            this.vx=Math.cos(a)*v; this.vy=Math.sin(a)*v;
        }
        update() { this.x+=this.vx; this.y+=this.vy; this.life--; }
        draw(ctx) {
            ctx.globalAlpha = this.life/this.maxLife; ctx.fillStyle=this.color;
            ctx.beginPath(); ctx.arc(this.x, this.y, Math.random()*3, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    class Meteor {
        constructor() {
            const side = Math.floor(Math.random()*4), off = 400;
            if(side===0) { this.x=Game.player.x+(Math.random()*W)-W/2; this.y=Game.player.y-H/2-off; this.vx=(Math.random()-0.5)*5; this.vy=5+Math.random()*5; }
            else if(side===1) { this.x=Game.player.x+W/2+off; this.y=Game.player.y+(Math.random()*H)-H/2; this.vx=-(5+Math.random()*5); this.vy=(Math.random()-0.5)*5; }
            else if(side===2) { this.x=Game.player.x+(Math.random()*W)-W/2; this.y=Game.player.y+H/2+off; this.vx=(Math.random()-0.5)*5; this.vy=-(5+Math.random()*5); }
            else { this.x=Game.player.x-W/2-off; this.y=Game.player.y+(Math.random()*H)-H/2; this.vx=5+Math.random()*5; this.vy=(Math.random()-0.5)*5; }
            this.r = 25 + Math.random()*25;
        }
        update() { this.x+=this.vx; this.y+=this.vy; }
        draw(ctx) {
            ctx.save(); ctx.translate(this.x, this.y);
            const g=ctx.createRadialGradient(0,0,0, 0,0,this.r);
            g.addColorStop(0,'#fff'); g.addColorStop(0.5,'#0ff'); g.addColorStop(1,'transparent');
            ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
            ctx.restore();
        }
    }

    class Player {
        constructor() {
            this.x=0; this.y=0; this.hp=100; this.maxHp=100; this.xp=0; this.maxXp=100; this.level=1;
            this.speed=5; this.angle=0; this.color='#00ffff'; this.freezeTimer=0; this.invulnTimer=0;
            this.treasures=0; this.orbitAngle=0;
            this.skills = {
                tele: {cd:0, max:300}, shield: {cd:0, max:900, active:0}, 
                laser: {cd:0, max:700, active:0}, hole: {cd:0, max:1500}
            };
            this.shootTimer=0;
        }
        update() {
            if(this.freezeTimer>0) { this.freezeTimer--; document.getElementById('freeze-fx').style.display='block'; return; }
            document.getElementById('freeze-fx').style.display='none';

            this.x += Input.vx * this.speed; this.y += Input.vy * this.speed;
            if(this.invulnTimer > 0) this.invulnTimer--;
            this.orbitAngle += 0.1;

            if(this.skills.shield.active>0) this.skills.shield.active--;
            if(this.skills.laser.active>0) this.skills.laser.active--;
            for(let k in this.skills) {
                if(this.skills[k].cd>0) {
                    this.skills[k].cd--;
                    let id = k==='tele'?'s1':k==='shield'?'s2':k==='laser'?'s3':'s4';
                    document.getElementById('cd-'+id).style.height = (this.skills[k].cd/this.skills[k].max*100)+'%';
                }
            }

            let target=null, minD=700;
            // Ưu tiên bắn Boss/Rival
            Game.enemies.forEach(e=>{
                if(e.type==='rival' || e.type==='queen') { const d=Math.hypot(e.x-this.x, e.y-this.y); if(d<minD){minD=d; target=e;} }
            });
            if(!target) Game.enemies.forEach(e=>{const d=Math.hypot(e.x-this.x, e.y-this.y); if(d<minD){minD=d; target=e;}});
            if(!target) Game.treasures.forEach(t=>{const d=Math.hypot(t.x-this.x, t.y-this.y); if(d<400 && d<minD){minD=d; target=t;}});
            
            if(target) this.angle = Math.atan2(target.y-this.y, target.x-this.x);
            else if(Input.vx||Input.vy) this.angle = Math.atan2(Input.vy, Input.vx);

            if(this.shootTimer++ > Math.max(8, 25-this.level*2)) { 
                this.shootTimer=0;
                if(target) {
                    const dmg = 10 + this.level*3;
                    Game.projectiles.push(new Projectile(this.x, this.y, this.angle, false, this.color, dmg));
                    Audio.play(400+this.level*50, 'triangle', 0.1);
                }
            }
            if(this.skills.laser.active>0) {
                Game.enemies.forEach(e=>{
                    const d = Math.hypot(e.x-this.x, e.y-this.y);
                    const ang = Math.atan2(e.y-this.y, e.x-this.x);
                    const diff = Math.abs(ang-this.angle);
                    if(d<700 && (diff<0.3 || diff>Math.PI*2-0.3)) {
                        e.takeDmg(3);
                        if(Math.random()<0.3) Game.particles.push(new Particle(e.x, e.y, '#f05', 4, 10));
                    }
                });
            }
        }
        draw(ctx) {
            if(this.invulnTimer > 0 && Math.floor(Date.now()/50)%2===0) return;
            ctx.save(); ctx.translate(this.x, this.y);
            if(this.skills.shield.active>0) {
                ctx.beginPath(); ctx.arc(0,0,65,0,Math.PI*2);
                ctx.strokeStyle='#0f0'; ctx.lineWidth=3; ctx.stroke();
                ctx.fillStyle='rgba(0,255,0,0.15)'; ctx.fill();
            }
            if(this.skills.laser.active>0) {
                ctx.save(); ctx.rotate(this.angle);
                ctx.shadowBlur=20; ctx.shadowColor='#f05';
                ctx.fillStyle='#f05'; ctx.fillRect(0,-8,700,16);
                ctx.fillStyle='#fff'; ctx.fillRect(0,-3,700,6);
                ctx.restore();
            }
            ctx.rotate(this.angle); 
            for(let i=0; i<5; i++) {
                const r = this.orbitAngle + (i * Math.PI*2/5);
                const ox = Math.cos(r)*40, oy = Math.sin(r)*40;
                ctx.shadowBlur=15; ctx.shadowColor=this.color; ctx.fillStyle=this.color;
                ctx.beginPath(); ctx.arc(ox,oy,6,0,Math.PI*2); ctx.fill();
            }
            ctx.strokeStyle=this.color; ctx.lineWidth=3;
            ctx.beginPath(); ctx.arc(0,0,40,0,Math.PI*2); ctx.stroke();
            ctx.fillStyle='#fff'; ctx.shadowBlur=30; ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2); ctx.fill();
            ctx.restore();
        }
        takeDamage(amount) {
            if(this.invulnTimer > 0 || this.skills.shield.active > 0) return;
            this.hp -= amount;
            this.invulnTimer = 45; 
            Game.cam.shake = 15;
            if(this.hp <= 0) Game.over();
        }
        addXp(v) {
            this.xp+=v; if(this.xp>=this.maxXp) { this.xp=0; this.levelUp(); }
            document.getElementById('xp-bar').style.width = (this.xp/this.maxXp*100)+'%';
        }
        levelUp() {
            this.level++; this.maxXp = Math.floor(this.maxXp*1.5);
            this.hp = this.maxHp = 100 + this.level*20;
            this.color = this.level===2?'#0f0': this.level===3?'#f05': this.level>=4?'#a0f':'#0ff';
            if(this.level>=1) document.getElementById('btn-s1').classList.remove('locked');
            if(this.level>=2) document.getElementById('btn-s2').classList.remove('locked');
            if(this.level>=3) document.getElementById('btn-s3').classList.remove('locked');
            if(this.level>=4) document.getElementById('btn-s4').classList.remove('locked');
            const msg = document.getElementById('center-msg');
            msg.style.opacity=1; msg.style.transform="translate(-50%,-50%) scale(1.5)";
            msg.innerText = "LEVEL " + this.level + "!";
            setTimeout(()=>{ msg.style.opacity=0; msg.style.transform="translate(-50%,-50%) scale(1)"; }, 1500);
            document.getElementById('ui-lvl').innerText = this.level;
            document.getElementById('ui-lvl').style.color = this.color;
            Game.effects.push({type:'nova', x:this.x, y:this.y, color:this.color, life:60, max:60});
            Audio.play(800,'sine',1);
        }
        useSkill(id) {
            if(this.freezeTimer>0) return;
            if(id===1 && this.level>=1 && this.skills.tele.cd<=0) {
                this.skills.tele.cd = 300; 
                const a = (Input.vx||Input.vy) ? Math.atan2(Input.vy, Input.vx) : this.angle;
                this.x += Math.cos(a)*300; this.y += Math.sin(a)*300;
                Game.effects.push({type:'nova', x:this.x, y:this.y, color:'#0ff', life:30, max:30});
                Audio.play(600,'sawtooth',0.2);
            }
            if(id===2 && this.level>=2 && this.skills.shield.cd<=0) {
                this.skills.shield.cd = 900; this.skills.shield.active = 240; 
                Audio.play(500,'sine',0.5);
            }
            if(id===3 && this.level>=3 && this.skills.laser.cd<=0) {
                this.skills.laser.cd = 700; this.skills.laser.active = 120; 
                Audio.play(200,'square',1);
            }
            if(id===4 && this.level>=4 && this.skills.hole.cd<=0) {
                this.skills.hole.cd = 1500; 
                Game.effects.push({type:'hole', x:this.x, y:this.y, life:150});
                Game.enemies.forEach(e=>{ if(Math.hypot(e.x-this.x, e.y-this.y)<800) e.hp=0; });
                Game.cam.shake=60;
                Audio.play(100,'sawtooth',2);
            }
        }
    }

    // --- NEW: RIVAL BOSS & DECOYS ---
    class Rival {
        constructor(x, y, level) {
            this.x=x; this.y=y; this.level=level; this.type='rival';
            this.hp = 300 + level*50; this.maxHp=this.hp;
            this.angle=0; this.speed=4.5; this.r=35; this.color='#ff0000';
            this.shootTimer=0; this.cloneTimer=0; this.state='chase';
        }
        update() {
            const dist = Math.hypot(Game.player.x-this.x, Game.player.y-this.y);
            const a = Math.atan2(Game.player.y-this.y, Game.player.x-this.x);
            this.angle = a;
            
            // Di chuyển
            if(dist > 200) {
                this.x += Math.cos(a)*this.speed; this.y += Math.sin(a)*this.speed;
            }

            // Kỹ năng 1: Phân thân (Decoys)
            if(this.cloneTimer++ > 300) { // 5s một lần
                this.cloneTimer = 0;
                for(let i=0; i<3; i++) {
                    const da = a + (i-1)*0.5;
                    Game.enemies.push(new RivalDecoy(this.x + Math.cos(da)*100, this.y + Math.sin(da)*100, this.angle));
                }
                Audio.play(600, 'square', 0.2);
            }

            // Kỹ năng 2: Bắn đạn chùm
            if(this.shootTimer++ > 80) {
                this.shootTimer = 0;
                for(let i=0; i<8; i++) {
                    const sa = this.angle + i*(Math.PI/4);
                    Game.projectiles.push(new Projectile(this.x, this.y, sa, true, '#f00', 15));
                }
            }
            
            // Va chạm
            Game.enemies.forEach(e=>{
                if(e!==this && Math.hypot(e.x-this.x, e.y-this.y) < this.r+e.r) {
                    this.x -= (e.x-this.x)*0.05; this.y -= (e.y-this.y)*0.05;
                }
            });
        }
        draw(ctx) {
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
            ctx.shadowBlur=20; ctx.shadowColor='#f00'; ctx.fillStyle='#f00';
            // Hình dạng phi thuyền ngầu
            ctx.beginPath();
            ctx.moveTo(35,0); ctx.lineTo(-20,30); ctx.lineTo(-10,0); ctx.lineTo(-20,-30);
            ctx.fill();
            // Lõi
            ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill();
            ctx.restore();
            // HP Bar nhỏ trên đầu
            ctx.fillStyle='#f00'; ctx.fillRect(this.x-25, this.y-50, 50, 5);
            ctx.fillStyle='#fff'; ctx.fillRect(this.x-25, this.y-50, 50*(this.hp/this.maxHp), 5);
        }
        takeDmg(d) { this.hp -= d; return this.hp <= 0; }
    }

    class RivalDecoy {
        constructor(x, y, angle) {
            this.x=x; this.y=y; this.angle=angle; this.type='decoy';
            this.hp=50; this.r=30; this.color='rgba(255,0,0,0.5)';
            this.life=300; // Tồn tại 5s
        }
        update() { this.life--; }
        draw(ctx) {
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
            ctx.fillStyle=this.color; ctx.shadowBlur=0;
            ctx.beginPath();
            ctx.moveTo(35,0); ctx.lineTo(-20,30); ctx.lineTo(-10,0); ctx.lineTo(-20,-30);
            ctx.fill();
            ctx.restore();
        }
        takeDmg(d) { this.hp-=d; return this.hp<=0 || this.life<=0; }
    }

    class Enemy {
        constructor(x,y, type, nest) {
            this.x=x; this.y=y; this.type=type; this.nest=nest;
            this.angle=0; this.shootTimer=Math.random()*100;
            const s = 1 + Game.player.level*0.25;
            
            if(type==='kamikaze') { this.speed=5.5; this.hp=30*s; this.color='#ff3333'; this.r=18; }
            else if(type==='tank') { this.speed=1.5; this.hp=200*s; this.color='#ff8800'; this.r=35; } 
            else if(type==='elite') { this.speed=2.5; this.hp=120*s; this.color='#aa00ff'; this.r=25; }
            else { this.speed=3; this.hp=50*s; this.color='#00ff00'; this.r=20; } 
        }
        update() {
            let tx = Game.player.x, ty = Game.player.y;
            if (this.nest && this.nest.hp>0 && Math.hypot(tx-this.x, ty-this.y) > 900) {
                tx = this.nest.x + Math.cos(Date.now()/1000 + this.x)*150; 
                ty = this.nest.y + Math.sin(Date.now()/1000 + this.y)*150;
            }
            const a = Math.atan2(ty-this.y, tx-this.x);
            this.x += Math.cos(a)*this.speed; this.y += Math.sin(a)*this.speed;
            this.angle = a;
            const dist = Math.hypot(Game.player.x-this.x, Game.player.y-this.y);
            if(dist < 800) {
                if(this.type === 'shooter' && this.shootTimer++ > 100) {
                    this.shootTimer=0; Game.projectiles.push(new Projectile(this.x, this.y, a, true, '#0f0', 10));
                }
                if(this.type === 'tank' && this.shootTimer++ > 150) {
                    this.shootTimer=0; for(let i=-1; i<=1; i++) Game.projectiles.push(new Projectile(this.x, this.y, a+i*0.3, true, '#f80', 15));
                }
                if(this.type === 'elite' && this.shootTimer++ > 80) {
                    this.shootTimer=0; Game.projectiles.push(new Projectile(this.x, this.y, a + Math.sin(Date.now()/100), true, '#a0f', 12));
                }
            }
            Game.enemies.forEach(e=>{
                if(e!==this && Math.hypot(e.x-this.x, e.y-this.y) < this.r+e.r) {
                    this.x -= (e.x-this.x)*0.03; this.y -= (e.y-this.y)*0.03;
                }
            });
        }
        draw(ctx) {
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
            ctx.fillStyle=this.color; ctx.shadowBlur=10; ctx.shadowColor=this.color;
            ctx.beginPath();
            if(this.type==='tank') { ctx.fillRect(-20,-20,40,40); }
            else if(this.type==='kamikaze') { ctx.moveTo(25,0); ctx.lineTo(-15,10); ctx.lineTo(-15,-10); } 
            else if(this.type==='elite') { ctx.moveTo(20,0); ctx.lineTo(-10,20); ctx.lineTo(-20,0); ctx.lineTo(-10,-20); }
            else { ctx.moveTo(20,0); ctx.lineTo(-15,15); ctx.lineTo(-5,0); ctx.lineTo(-15,-15); }
            ctx.fill(); 
            ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-10,0,4,0,Math.PI*2); ctx.fill();
            ctx.restore();
        }
        takeDmg(d) { this.hp -= d; return this.hp <= 0; }
    }

    class Projectile {
        constructor(x,y,a,isEnemy,c,dmg) {
            this.x=x; this.y=y; this.vx=Math.cos(a)*14; this.vy=Math.sin(a)*14;
            this.isEnemy=isEnemy; this.c=c; this.dmg=dmg; this.life=50;
        }
        update() { this.x+=this.vx; this.y+=this.vy; this.life--; }
        draw(ctx) { ctx.fillStyle=this.c; ctx.shadowBlur=5; ctx.shadowColor=this.c; ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, Math.PI*2); ctx.fill(); }
    }

    class Treasure {
        constructor(x,y) { this.x=x; this.y=y; this.hp=400; this.maxHp=400; this.r=45; }
        draw(ctx) {
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(Date.now()/500);
            ctx.shadowBlur=30; ctx.shadowColor='#ffcc00'; ctx.fillStyle='#ffcc00';
            ctx.fillRect(-25,-25,50,50); ctx.strokeStyle='#fff'; ctx.lineWidth=4; ctx.strokeRect(-25,-25,50,50);
            ctx.restore();
            ctx.fillStyle='red'; ctx.fillRect(this.x-30, this.y-55, 60, 6);
            ctx.fillStyle='#0f0'; ctx.fillRect(this.x-30, this.y-55, 60*(this.hp/this.maxHp), 6);
        }
    }

    /** GAME ENGINE */
    const Game = {
        player: null, enemies: [], treasures: [], projectiles: [], particles: [], effects: [], meteors: [],
        cam: new Camera(), running: false, score: 0, stars: [],

        init() {
            Input.init();
            for(let i=0; i<200; i++) this.stars.push({x:Math.random()*W*2, y:Math.random()*H*2, z:Math.random()*2});
            document.getElementById('btn-start').onclick = () => this.start();
            document.getElementById('btn-restart').onclick = () => location.reload();
            
            const bind = (id, sId) => {
                const el = document.getElementById(id);
                const act = (e) => { e.preventDefault(); e.stopPropagation(); this.player.useSkill(sId); };
                el.addEventListener('touchstart', act); el.addEventListener('mousedown', act);
            };
            bind('btn-s1', 1); bind('btn-s2', 2); bind('btn-s3', 3); bind('btn-s4', 4);
            this.drawBackground(ctx);
        },

        start() {
            Audio.init();
            this.player = new Player();
            this.enemies=[]; this.treasures=[]; this.projectiles=[]; this.particles=[]; this.meteors=[];
            this.running = true;
            document.getElementById('menu-start').classList.add('hidden');
            // Spawn nhiều kho báu ban đầu
            for(let i=0; i<3; i++) this.spawnNest(1000 + i*1500);
            this.loop();
        },

        spawnNest(dist) {
            const a = Math.random()*Math.PI*2;
            const tx = this.player.x + Math.cos(a)*dist;
            const ty = this.player.y + Math.sin(a)*dist;
            const t = new Treasure(tx, ty);
            this.treasures.push(t);
            // Spawn RẤT NHIỀU QUÁI quanh kho báu
            const count = 15 + this.player.level*2; 
            for(let i=0; i<count; i++) {
                const type = Math.random()<0.3 ? 'tank' : (Math.random()<0.3 ? 'elite' : 'shooter');
                this.enemies.push(new Enemy(tx+(Math.random()-0.5)*400, ty+(Math.random()-0.5)*400, type, t));
            }
        },

        // SPAWN RIVAL (BOSS)
        spawnRival(x, y) {
            const r = new Rival(x, y, this.player.level);
            this.enemies.push(r);
            // Kèm theo đám đệ tử
            for(let i=0; i<5; i++) this.enemies.push(new Enemy(x+(Math.random()-0.5)*200, y+(Math.random()-0.5)*200, 'kamikaze', null));
            const w = document.getElementById('boss-warning');
            w.style.display = 'block'; setTimeout(()=>w.style.display='none', 3000);
            Audio.play(200, 'sawtooth', 1);
        },

        drawBackground(c) {
            c.fillStyle = '#010103'; c.fillRect(0,0,W,H);
            c.fillStyle = '#fff';
            this.stars.forEach(s => {
                let sx = (s.x - this.cam.x*0.5)%W; if(sx<0) sx+=W;
                let sy = (s.y - this.cam.y*0.5)%H; if(sy<0) sy+=H;
                c.globalAlpha = Math.random()*0.5+0.2; c.fillRect(sx, sy, 2, 2);
            });
            c.globalAlpha = 1;
        },

        update() {
            if(!this.running) return;
            this.player.update();
            this.cam.follow(this.player);

            // LOGIC TÁI TẠO KHO BÁU VÔ TẬN
            // Nếu ít hơn 15 kho báu, spawn thêm
            if(this.treasures.length < 15) {
                // Spawn ở phía trước hướng di chuyển của player
                const a = (Input.vx||Input.vy) ? Math.atan2(Input.vy, Input.vx) : Math.random()*Math.PI*2;
                const dist = 1500 + Math.random()*1500;
                const tx = this.player.x + Math.cos(a)*dist + (Math.random()-0.5)*1000;
                const ty = this.player.y + Math.sin(a)*dist + (Math.random()-0.5)*1000;
                // Tạo mới thủ công để không dùng hàm cũ (tránh trùng lặp logic)
                const t = new Treasure(tx, ty);
                this.treasures.push(t);
                for(let i=0; i<15; i++) {
                     const type = Math.random()<0.3 ? 'tank' : (Math.random()<0.3 ? 'elite' : 'shooter');
                     this.enemies.push(new Enemy(tx+(Math.random()-0.5)*400, ty+(Math.random()-0.5)*400, type, t));
                }
            }
            // Xóa kho báu quá xa để tiết kiệm bộ nhớ
            this.treasures = this.treasures.filter(t => Math.hypot(t.x-this.player.x, t.y-this.player.y) < 5000);

            if(Math.random()<0.08) this.enemies.push(new Enemy(this.player.x+Math.cos(Math.random()*6)*900, this.player.y+Math.sin(Math.random()*6)*900, 'kamikaze', null));
            if(Math.random()<0.01) this.meteors.push(new Meteor());

            this.meteors.forEach((m,i)=>{
                m.update();
                if(Math.hypot(m.x-this.player.x, m.y-this.player.y) < m.r+20) {
                    if(this.player.skills.shield.active<=0) { this.player.freezeTimer = 60; Audio.play(100,'noise',0.5); }
                    this.meteors.splice(i,1);
                } else if(Math.hypot(m.x-this.player.x, m.y-this.player.y)>2000) this.meteors.splice(i,1);
            });

            this.projectiles.forEach((p,i)=>{
                p.update();
                if(p.life<=0) { this.projectiles.splice(i,1); return; }
                if(p.isEnemy) {
                    if(Math.hypot(p.x-this.player.x, p.y-this.player.y) < 20) {
                        this.player.takeDamage(15); this.projectiles.splice(i,1);
                    }
                } else {
                    let hit=false;
                    for(let j=this.enemies.length-1; j>=0; j--) {
                        let e = this.enemies[j];
                        if(Math.hypot(p.x-e.x, p.y-e.y) < e.r+10) {
                            if(e.takeDmg(p.dmg)) this.killEnemy(e, j);
                            hit=true; this.projectiles.splice(i,1); break;
                        }
                    }
                    if(hit) return;
                    for(let k=this.treasures.length-1; k>=0; k--) {
                        let t = this.treasures[k];
                        if(Math.hypot(p.x-t.x, p.y-t.y) < t.r+10) {
                            t.hp-=p.dmg;
                            if(t.hp<=0) {
                                // XỬ LÝ KHI KHO BÁU NỔ
                                this.treasures.splice(k,1);
                                this.player.addXp(300); this.player.treasures++;
                                this.score+=2000;
                                this.effects.push({type:'nova', x:t.x, y:t.y, color:'#fc0', life:60, max:60});
                                this.cam.shake=40;
                                Audio.play(100,'sawtooth',0.8);
                                // Kill quái xung quanh
                                this.enemies.forEach(e=>{ if(Math.hypot(e.x-t.x, e.y-t.y)<1000 && e.type!=='rival') e.hp=0; });
                                // TRIỆU HỒI RIVAL (BOSS)
                                this.spawnRival(t.x, t.y);
                            }
                            this.projectiles.splice(i,1); break;
                        }
                    }
                }
            });

            this.enemies.forEach(e=>{
                e.update();
                if(Math.hypot(e.x-this.player.x, e.y-this.player.y) < e.r+20) {
                     this.player.takeDamage(10); if(e.type==='kamikaze') e.hp=0;
                }
            });
            this.enemies = this.enemies.filter(e => { if(e.hp<=0) { this.killEnemy(e, -1); return false; } return true; });
            // Xóa quái quá xa (trừ boss)
            this.enemies = this.enemies.filter(e => e.type==='rival' || Math.hypot(e.x-this.player.x, e.y-this.player.y) < 4000);

            this.particles.forEach((p,i)=>{p.update(); if(p.life<=0)this.particles.splice(i,1)});
            this.effects.forEach((e,i)=>{e.life--; if(e.life<=0)this.effects.splice(i,1)});

            document.getElementById('hp-bar').style.width = (this.player.hp/this.player.maxHp*100)+'%';
            document.getElementById('ui-score').innerText = this.score;
            document.getElementById('ui-treasure').innerText = this.player.treasures;
        },

        killEnemy(e, index) {
            if(index >= 0) this.enemies.splice(index, 1);
            const pts = e.type==='rival' ? 1000 : (e.type==='decoy'?0:50);
            this.score += pts; this.player.addXp(e.type==='rival'?200:20);
            for(let i=0; i<8; i++) this.particles.push(new Particle(e.x, e.y, e.color, 6, 30));
            Audio.play(150, 'noise', 0.1);
        },

        draw() {
            this.drawBackground(ctx);
            ctx.save(); ctx.translate(-this.cam.x, -this.cam.y);
            this.treasures.forEach(t=>t.draw(ctx));
            this.enemies.forEach(e=>e.draw(ctx));
            this.meteors.forEach(m=>m.draw(ctx));
            this.projectiles.forEach(p=>p.draw(ctx));
            this.particles.forEach(p=>p.draw(ctx));
            this.effects.forEach(e=>{
                if(e.type==='nova') {
                    ctx.beginPath(); ctx.arc(e.x, e.y, (e.max-e.life)*20, 0, Math.PI*2);
                    ctx.strokeStyle=e.color; ctx.lineWidth=e.life/4; ctx.stroke();
                } else if(e.type==='hole') {
                    ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(e.x, e.y, 80, 0, Math.PI*2); ctx.fill();
                    ctx.strokeStyle='#a0f'; ctx.lineWidth=3; ctx.stroke();
                }
            });
            this.player.draw(ctx);
            ctx.restore();

            radarCtx.clearRect(0,0,160,160); radarCtx.translate(80,80);
            const sc = 0.03; // Zoom out radar
            radarCtx.fillStyle='#fff'; radarCtx.beginPath(); radarCtx.arc(0,0,2,0,Math.PI*2); radarCtx.fill();
            this.treasures.forEach(t=>{
                let dx=(t.x-this.player.x)*sc, dy=(t.y-this.player.y)*sc;
                if(dx*dx+dy*dy<80*80) { radarCtx.fillStyle='#ff0'; radarCtx.beginPath(); radarCtx.arc(dx,dy,4,0,Math.PI*2); radarCtx.fill(); }
            });
            this.enemies.forEach(e=>{
                let dx=(e.x-this.player.x)*sc, dy=(e.y-this.player.y)*sc;
                if(dx*dx+dy*dy<80*80) { 
                    radarCtx.fillStyle = e.type==='rival'?'#f0f':'#f00'; 
                    radarCtx.beginPath(); radarCtx.arc(dx,dy,e.type==='rival'?4:2,0,Math.PI*2); radarCtx.fill(); 
                }
            });
            radarCtx.setTransform(1,0,0,1,0,0);
            
            if(Input.active) {
                ctx.fillStyle='rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(Input.ox, Input.oy, 50,0,Math.PI*2); ctx.fill();
                ctx.fillStyle=this.player.color; ctx.beginPath(); ctx.arc(Input.cx, Input.cy, 20,0,Math.PI*2); ctx.fill();
            }
        },

        loop() {
            if(!this.running) return;
            this.update(); this.draw();
            requestAnimationFrame(() => this.loop());
        },

        over() {
            this.running = false;
            for(let i=0; i<40; i++) this.particles.push(new Particle(this.player.x, this.player.y, this.player.color, 10, 80));
            this.draw();
            setTimeout(() => {
                document.getElementById('menu-over').classList.remove('hidden');
                document.getElementById('end-score').innerText = this.score;
                document.getElementById('end-treasure').innerText = this.player.treasures;
            }, 1000);
        }
    };

    Game.init();
};
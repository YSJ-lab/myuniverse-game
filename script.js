const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const player = {
    x: canvas.width/2-15,
    y: canvas.height-50,
    width: 30,
    height: 30,
    speed: 2,
    bulletSpeed: 8,   // 총알 속도
    gaugeSpeed: 1.5,  // 게이지 충전 속도
    color: "#0ff"
};

let bullets = [];
let enemyBullets = [];
let stars = [];
let nebula = [];
let score = 0;
let level = 1;
let gauge = 0; // 시작 시 빈 상태
let gameOver = false;
let flashAlpha = 0;
let gamePaused = false;

const keys = {};
document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

document.getElementById("startBtn").addEventListener("click", () => {
    // 메뉴 숨기기
    document.getElementById("menu").style.display = "none";
    // 게임 화면 보이기
    document.getElementById("gameScreen").style.display = "block";

    startGame(); // 게임 초기화
});

document.getElementById("restartBtn").addEventListener("click", () => {
    startGame();
    document.getElementById("restartBtn").style.display = "none"; // 버튼 숨김
});


// --- 배경 ---
const bgCanvas = document.getElementById("bgCanvas");
const bgCtx = bgCanvas.getContext("2d");
bgCanvas.width = window.innerWidth;
bgCanvas.height = window.innerHeight;
let gridOffset = 0;

window.addEventListener("resize", () => {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
});

function drawBackgroundGrid() {
    const size = 40;
    bgCtx.clearRect(0,0,bgCanvas.width,bgCanvas.height);
    bgCtx.strokeStyle="rgba(0,255,255,0.28)";
    bgCtx.lineWidth = 1.5;
    bgCtx.shadowBlur = 8;
    bgCtx.shadowColor = "#0ff";

    for(let x=-gridOffset; x<bgCanvas.width; x+=size){
        bgCtx.beginPath(); bgCtx.moveTo(x,0); bgCtx.lineTo(x,bgCanvas.height); bgCtx.stroke();
    }
    for(let y=-gridOffset; y<bgCanvas.height; y+=size){
        bgCtx.beginPath(); bgCtx.moveTo(0,y); bgCtx.lineTo(bgCanvas.width,y); bgCtx.stroke();
    }

    gridOffset += 0.2;
    if(gridOffset > size) gridOffset = 0;
}

function backgroundLoop() { drawBackgroundGrid(); requestAnimationFrame(backgroundLoop); }
backgroundLoop();

// --- 업그레이드 버튼 ---
document.getElementById("upgradeLeft").addEventListener("click", ()=>{ applyUpgrade("A"); closeUpgradeScreen(); });
document.getElementById("upgradeRight").addEventListener("click", ()=>{ applyUpgrade("B"); closeUpgradeScreen(); });

// --- 게임 상태 ---
let enemySpeedMultiplier = 1;
let spawnIntervalMultiplier = 1;
let nextLinear=0, nextWave=0, nextCircle=0;
let gameStarted = false;
let levelElapsed = 0;
let lastUpdateTime = Date.now();

// --- 유틸 함수 ---
function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }
function rectCircleColliding(rect, circle){
    const cx = circle.x || circle.cx || 0;
    const cy = circle.y || circle.cy || 0;
    const distX = Math.abs(cx - rect.x - rect.width/2);
    const distY = Math.abs(cy - rect.y - rect.height/2);
    if(distX > rect.width/2 + circle.radius) return false;
    if(distY > rect.height/2 + circle.radius) return false;
    if(distX <= rect.width/2 || distY <= rect.height/2) return true;
    const dx = distX - rect.width/2;
    const dy = distY - rect.height/2;
    return (dx*dx + dy*dy <= circle.radius*circle.radius);
}

// --- 배경 초기화 ---
function initBackground(){
    stars = Array.from({length:80}, ()=>({x:Math.random()*canvas.width, y:Math.random()*canvas.height, radius:Math.random()*2, speed:Math.random()*0.3+0.1}));
    nebula = Array.from({length:5}, ()=>({x:Math.random()*canvas.width, y:Math.random()*canvas.height, radius:Math.random()*100+50, color:`rgba(${Math.random()*255},${Math.random()*255},${Math.random()*255},0.2)`}));
}

function drawBackground(){
    const bg = ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,"#0a0a0a"); bg.addColorStop(1,"#1a1a2e");
    ctx.fillStyle = bg; ctx.fillRect(0,0,canvas.width,canvas.height);

    nebula.forEach(n=>{
        n.y+=0.1; if(n.y-n.radius>canvas.height) n.y=-n.radius;
        const grad = ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.radius);
        grad.addColorStop(0,n.color); grad.addColorStop(1,"rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(n.x,n.y,n.radius,0,Math.PI*2); ctx.fill();
    });

    stars.forEach(s=>{
        s.y+=s.speed; if(s.y>canvas.height) s.y=0;
        ctx.fillStyle="#0ff"; ctx.globalAlpha=0.5;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.radius,0,Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;
}

// --- 게이지 / 레벨업 표시 ---
function drawGauges(){
    // 총알 게이지
    const gx = canvas.width-30;
    const gh = canvas.height * (gauge/100);
    ctx.fillStyle="#0ff"; ctx.shadowColor="#0ff"; ctx.shadowBlur=15;
    ctx.fillRect(gx, canvas.height-gh, 20, gh);
    ctx.shadowBlur=0; ctx.strokeStyle="#0ff"; ctx.lineWidth=2;
    ctx.strokeRect(gx,0,20,canvas.height);

    // 레벨업 게이지
    const w = 400, h = 15;
    const x = (canvas.width - w)/2, y = 50;
    let levelProgress = clamp(levelElapsed/10000,0,1);
    ctx.fillStyle="rgba(0,255,255,0.1)"; ctx.fillRect(x,y,w,h);
    ctx.fillStyle="#0ff"; ctx.fillRect(x,y,w*levelProgress,h);
    ctx.strokeStyle="#0ff"; ctx.lineWidth=2; ctx.strokeRect(x,y,w,h);

    // 레벨업 체크
    if(levelProgress >= 1 && !gamePaused){
        level++; levelElapsed=0; flashAlpha=1;
        enemySpeedMultiplier *= 1.1; spawnIntervalMultiplier *= 0.9;
        showUpgradeScreen();
    }
}

let particles = []; // 파티클 저장 배열
function createParticles(x, y, count = 10){
    for(let i=0;i<count;i++){
        particles.push({
            x,
            y,
            radius: Math.random()*3 + 2,        // 크기
            speedX: (Math.random()-0.5)*4,     // 좌/우 확산
            speedY: (Math.random()-0.5)*4,
            alpha: 1                            // 투명도
        });
    }
}

function updateParticles(){
    for(let i = particles.length-1; i>=0; i--){
        let p = particles[i];
        p.x += p.speedX;
        p.y += p.speedY;
        p.alpha -= 0.03;               // 점점 사라짐

        if(p.alpha <= 0){
            particles.splice(i,1);
            continue;
        }

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = "yellow";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// --- 플레이어 총알 발사 ---
function fireBullet() {
    if(gauge >= 100 && bullets.length === 0){
        bullets.push({
            x: player.x + player.width/2 - 5,
            y: player.y,
            width: 10,
            height: 10,
            speed: player.bulletSpeed,
            color: "#0f0"
        });
        gauge = 0; // 발사 후 게이지 초기화
    }
}

// --- 업그레이드 ---
function applyUpgrade(choice){
    if(choice === "A"){ 
        player.speed += 1;  // 이동속도 증가
    } else if(choice === "B"){
        player.bulletSpeed += 2;  // 총알 속도 증가
        player.gaugeSpeed += 0.5; // 게이지 충전 속도도 증가
    }
}

function showUpgradeScreen(){ document.getElementById("upgradeScreen").style.display="flex"; gamePaused=true; }
function closeUpgradeScreen(){ document.getElementById("upgradeScreen").style.display="none"; gamePaused=false; }

// --- 적 탄막 생성 ---
function spawnLinear(){ const x=Math.random()*(canvas.width-40)+20; enemyBullets.push({x,y:50,radius:5,speed:2.5*enemySpeedMultiplier,color:"#f0f",type:"linear",trail:[]}); }
function spawnWave(){ const x=Math.random()*(canvas.width-40)+20; for(let i=-1;i<=1;i++){ enemyBullets.push({x:x+i*15,y:50,radius:5,speed:2.2*enemySpeedMultiplier,type:"wave",originalX:x+i*15,color:"#f6f",trail:[]}); } }
function spawnCircle(){ const x=Math.random()*(canvas.width-40)+20; const r=40; for(let i=0;i<8;i++){ enemyBullets.push({cx:x,cy:50,orbit:r,angle:(i/8)*Math.PI*2,speed:1.8*enemySpeedMultiplier,rotationSpeed:0.03,radius:5,color:"#0ff",type:"circle",trail:[]}); } }

// --- 게임 오버 ---
function endGame(){ if(gameOver) return; gameOver=true; document.getElementById("restartBtn").style.display="block"; }
function drawGameOverScreen(){
    if(!gameOver) return;
    ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#ff0066"; ctx.font="60px Arial"; ctx.textAlign="center";
    ctx.fillText("GAME OVER",canvas.width/2,canvas.height/2-20);
    ctx.font="30px Arial"; ctx.fillText(`점수: ${Math.floor(score)}  레벨: ${level}`,canvas.width/2,canvas.height/2+30);
}

// --- 게임 시작 ---
function startGame() {
    // --- 플레이어 초기화 ---
    player.x = canvas.width/2-15;
    player.y = canvas.height-50;
    player.speed = 2;
    player.bulletSpeed = 8;

    // --- 상태 초기화 ---
    bullets = [];
    enemyBullets = [];
    particles = [];
    score = 0;
    level = 1;
    gauge = 0;
    gameOver = false;
    gamePaused = false;
    flashAlpha = 0;

    // --- 스폰 패턴 초기화 ---
    nextLinear = 0;
    nextWave   = 0;
    nextCircle = 0;

    enemySpeedMultiplier = 1;
    spawnIntervalMultiplier = 1;
    levelElapsed = 0;

    lastUpdateTime = Date.now();

    // 🔥 별과 은하 초기화
    initBackground();

    gameStarted = true;
}


// --- 메인 루프 ---
function update(){
    const now = Date.now();
    const delta = now - lastUpdateTime;
    lastUpdateTime = now;

    drawBackground();

    if(gameStarted && !gamePaused && !gameOver){
        levelElapsed += delta;

        // 플레이어 이동
        if(keys["a"]) player.x = clamp(player.x-player.speed,0,canvas.width-player.width);
        if(keys["d"]) player.x = clamp(player.x+player.speed,0,canvas.width-player.width);
        if(keys["w"]) player.y = clamp(player.y-player.speed,0,canvas.height-player.height);
        if(keys["s"]) player.y = clamp(player.y+player.speed,0,canvas.height-player.height);

        if(keys[" "]) fireBullet();

        // 플레이어 렌더링
        ctx.fillStyle = player.color; ctx.shadowColor=player.color; ctx.shadowBlur=15;
        ctx.fillRect(player.x,player.y,player.width,player.height); ctx.shadowBlur=0;

        // 총알 업데이트
        bullets.forEach((b,i)=>{ 
            b.y-=b.speed; ctx.fillStyle=b.color; ctx.fillRect(b.x,b.y,b.width,b.height); 
            if(b.y<0) bullets.splice(i,1);
        });

        // 적 탄막 업데이트
        for(let i=enemyBullets.length-1;i>=0;i--){
            const b = enemyBullets[i]; if(!b.trail)b.trail=[];
            if(b.type==="linear") b.y+=b.speed;
            if(b.type==="wave"){ b.y+=b.speed; b.x=b.originalX+Math.sin(b.y/60)*15; }
            if(b.type==="circle"){ b.angle+=b.rotationSpeed; b.cy+=b.speed; b.x=b.cx+Math.cos(b.angle)*b.orbit; b.y=b.cy+Math.sin(b.angle)*b.orbit; }

            b.trail.push({x:b.x,y:b.y}); if(b.trail.length>10) b.trail.shift();
            b.trail.forEach((t,j)=>{ ctx.fillStyle=b.color; ctx.globalAlpha=j/10*0.5; ctx.beginPath(); ctx.arc(t.x,t.y,b.radius,0,Math.PI*2); ctx.fill(); });
            ctx.globalAlpha=1;

            ctx.fillStyle=b.color; ctx.shadowColor=b.color; ctx.shadowBlur=15;
            ctx.beginPath(); ctx.arc(b.x,b.y,b.radius,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;

            if(rectCircleColliding(player,b)) endGame();
            if(b.y>canvas.height||b.x<0||b.x>canvas.width) enemyBullets.splice(i,1);
        }

        /*********** [총알 vs 적 탄막 상쇄 적용] ***********/
        for(let i = bullets.length-1; i >= 0; i--){
            for(let j = enemyBullets.length-1; j >= 0; j--){
                let p = bullets[i];
                let e = enemyBullets[j];

                // 사각형 총알 vs 원형 탄막 충돌 체크
                let dx = e.x - (p.x + p.width/2);
                let dy = e.y - (p.y + p.height/2);
                let dist = Math.sqrt(dx*dx + dy*dy);

                if(dist < e.radius + p.width/2){  // 충돌하면 상쇄
                    createParticles(e.x, e.y, 18); //  폭발 파티클 생성

                    bullets.splice(i,1);
                    enemyBullets.splice(j,1);
                    break;
                }
            }
        }
        updateParticles();

        // 점수 증가
        score += 0.5;

        // 랜덤 스폰
        const now2 = Date.now();
        if(now2>nextLinear){ spawnLinear(); nextLinear = now2 + (1000+Math.random()*1500)*spawnIntervalMultiplier; }
        if(level>=2 && now2>nextWave){ spawnWave(); nextWave = now2 + (1500+Math.random()*2000)*spawnIntervalMultiplier; }
        if(level>=3 && now2>nextCircle){ spawnCircle(); nextCircle = now2 + (2000+Math.random()*2500)*spawnIntervalMultiplier; }

        // 레벨업 플래시
        if(flashAlpha>0){ ctx.fillStyle=`rgba(255,255,255,${flashAlpha})`; ctx.fillRect(0,0,canvas.width,canvas.height); flashAlpha-=0.05; if(flashAlpha<0) flashAlpha=0; }

        // 게이지 충전
        gauge = clamp(gauge+1.5,0,100);
    }

    drawGauges();

    // 점수/레벨 표시
    ctx.fillStyle="#0ff"; ctx.font="20px Arial"; ctx.shadowColor="#0ff"; ctx.shadowBlur=10;
    ctx.textAlign="center"; ctx.fillText(`점수:${Math.floor(score)}  레벨:${level}`, canvas.width/2,30); ctx.shadowBlur=0;

    drawGameOverScreen();
    requestAnimationFrame(update);
}

update();

// ============================================================
// Beach Run Adventure — Milestone 3: The World & Character
// ============================================================
import {
    PoseLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

// ======================== Global Variables ========================
let video;
let poseLandmarker;
let lastVideoTime = -1;
let results = undefined;
let isModelLoaded = false;

// Assets
// Assets
let bgImage;
let spriteDinoRun, spriteDinoJump, spriteDinoDuck, spriteDinoSquat;
let spriteSeagull, spriteRocket, imgShell;
let imgCastle;

// Game State
const STATE_WAITING = 0;
const STATE_COUNTDOWN = 1;
const STATE_LOCKED = 2;
const STATE_MENU = -1;
const STATE_VICTORY = 3;
let currentState = STATE_MENU;

// Calibration Data
let countdownStartTime = 0;
const COUNTDOWN_DURATION = 3000;
let referenceU = 0; // Initial "Unit of Measure" (Nose-to-Hip)

// Movement State
let movementState = "IDLE";

// Scale Invariance (Running Average of U)
let uHistory = [];
const U_WINDOW = 30;
let currentU = 0; // The active "Unit of Measure" for this frame

// Run detection (Alternating Ankle Lift)
let ankleDiffHistory = [];
const RUN_WINDOW = 40;
const MIN_RUN_SIGN_CHANGES = 2;
let runCooldown = 0;
const RUN_COOLDOWN_FRAMES = 30;

// Jump detection — velocity-based
let shoulderYHistory = [];
const JUMP_VELOCITY_WINDOW = 5;
let jumpCooldown = 0;
const JUMP_COOLDOWN_FRAMES = 20;

// Duck detection — Compactness + Velocity
let noseYHistory = [];
const DUCK_VELOCITY_WINDOW = 5;
let duckCooldown = 0;
const DUCK_COOLDOWN_FRAMES = 20;

// Deep Squat detection
let squatCooldown = 0;
const SQUAT_COOLDOWN_FRAMES = 20;
let squatConsecutiveFrames = 0;
const SQUAT_MIN_FRAMES = 3;

// Opposite-action lockout
const OPPOSITE_LOCKOUT_FRAMES = 30;
let jumpLockout = 0;
let duckLockout = 0;

// Background Scrolling
let bgX = 0;
const BG_SCROLL_SPEED = 10;

// Character
const GROUND_Y_RATIO = 0.82; // Ground line at 82% of canvas height
let dinoAnimTimer = 0;

// Debug / Dev Mode
const DEV_MODE = false;
let showDebug = true;
let debugInfo = {};

// Game Modes
const MODE_PRACTICE = 0;
const MODE_PLAY = 1;
let gameMode = MODE_PRACTICE;
let menuButtons = [];

// Level & Timer
const LEVEL_DURATION = 60;
let levelTimer = 0;
let levelStartTime = 0;
let obstacles = [];
let nextObstacleIndex = 0;
let score = 0;
let totalObstacles = 0;

// Stunned
let isStunned = false;
let stunnedTimer = 0;
const STUNNED_DURATION = 45;

// Audio
let audioCtx = null;

// Level Obstacle Sequence (time in seconds)
const LEVEL_SEQUENCE = [
    { t: 4, type: 'SHELL' },
    { t: 7, type: 'SEAGULL' },
    { t: 11, type: 'SHELL' },
    { t: 14, type: 'SHELL' },
    { t: 18, type: 'SEAGULL' },
    { t: 22, type: 'ROCKET' },
    { t: 26, type: 'SHELL' },
    { t: 29, type: 'SEAGULL' },
    { t: 33, type: 'SHELL' },
    { t: 36, type: 'SEAGULL' },
    { t: 40, type: 'ROCKET' },
    { t: 43, type: 'SHELL' },
    { t: 46, type: 'SEAGULL' },
    { t: 49, type: 'SHELL' },
    { t: 52, type: 'ROCKET' },
    { t: 55, type: 'SEAGULL' },
    { t: 58, type: 'SHELL' },
];

// ======================== Preload ========================
window.preload = function () {
    bgImage = loadImage("assets/beach_bg.png");
    
    // Load Sprite Sheets
    spriteDinoRun = loadImage("assets/dino_run_strip.png");
    spriteDinoJump = loadImage("assets/dino_jump_strip.png");
    spriteDinoDuck = loadImage("assets/dino_duck_strip.png");
    spriteDinoSquat = loadImage("assets/dino_squat_strip.png");
    
    // Obstacles
    spriteSeagull = loadImage("assets/obstacle_seagull_strip.png");
    spriteRocket = loadImage("assets/obstacle_rocket_strip.png");
    imgShell = loadImage("assets/obstacle_shell.png");
    
    imgCastle = loadImage("assets/goal_castle.png");
};

// ======================== MediaPipe Setup ========================
async function setupMediaPipe() {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
                delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });
        console.log("MediaPipe Pose loaded successfully");
        isModelLoaded = true;
        document.getElementById("loading").style.display = "none";
    } catch (error) {
        console.error("Error loading MediaPipe:", error);
        const el = document.getElementById("loading");
        el.innerText = "Error loading vision model: " + error.message;
        el.style.color = "red";
    }
}

// ======================== p5.js Setup ========================
window.setup = function () {
    const canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent("game-container");

    video = createCapture(VIDEO);
    video.size(640, 480);
    video.hide();

    setupMediaPipe();
    textAlign(CENTER, CENTER);
    textSize(24);
};

window.windowResized = function () {
    resizeCanvas(windowWidth, windowHeight);
};

window.keyPressed = function () {
    if ((key === "d" || key === "D") && DEV_MODE) {
        showDebug = !showDebug;
    }
    if ((key === "m" || key === "M") && currentState === STATE_LOCKED) {
        returnToMenu();
    }
};

// ======================== Main Draw Loop ========================
window.draw = function () {
    try {
        // Menu & Victory screens
        if (currentState === STATE_MENU) { drawMenu(); return; }
        if (currentState === STATE_VICTORY) { drawVictoryScreen(); return; }

        // Pose detection
        if (
            isModelLoaded && video && video.elt &&
            video.elt.readyState >= 2 &&
            video.elt.currentTime !== lastVideoTime
        ) {
            lastVideoTime = video.elt.currentTime;
            results = poseLandmarker.detectForVideo(video.elt, performance.now());
        }

        // Scene
        if (currentState === STATE_LOCKED) {
            drawGameWorld();
            updateLevel();
        } else {
            drawCalibrationScreen();
        }

        // State handling
        if (isModelLoaded) {
            if (results && results.landmarks && results.landmarks.length > 0) {
                const landmarks = results.landmarks[0];
                handleState(landmarks);
            } else {
                drawNoPlayerWarning();
                if (currentState === STATE_COUNTDOWN) {
                    currentState = STATE_WAITING;
                } else if (currentState === STATE_LOCKED) {
                    resetToWaiting();
                }
            }
        } else {
            drawLoadingOverlay();
        }

        // UI layers
        drawUI();
        drawGameHUD();
        drawPracticeHUD();

        if (currentState === STATE_LOCKED) {
            drawObstacles();
            drawWarningArrows();
            drawStunnedEffect();
        }

        if (currentState === STATE_LOCKED && video && video.width > 0) {
            drawWebcamMirror();
        }

        if (DEV_MODE) {
            drawDevOverlay();
            if (showDebug) drawDebugPanel();
        }

    } catch (err) {
        console.error("Error in draw loop:", err);
        fill(255, 0, 0);
        textSize(14);
        textAlign(LEFT, TOP);
        text("Error: " + err.message, 10, 10);
    }
};

// ======================== Scene Drawing ========================
function drawCalibrationScreen() {
    if (video && video.width > 0) {
        push();
        translate(width, 0);
        scale(-1, 1);
        image(video, 0, 0, width, height);
        pop();
    } else {
        background(135, 206, 235);
    }

    if (showDebug && results && results.landmarks && results.landmarks.length > 0) {
        drawSkeleton(results.landmarks[0]);
    }
}

function drawGameWorld() {
    if (bgImage) {
        const bgScale = height / bgImage.height;
        const bgW = bgImage.width * bgScale;

        if (movementState !== "IDLE") { // Scroll during RUN, JUMP, DUCK, SQUAT
            bgX -= BG_SCROLL_SPEED;
        }
        if (bgX <= -bgW) bgX += bgW;
        if (bgX > 0) bgX -= bgW;

        for (let x = bgX; x < width; x += bgW) {
            image(bgImage, x, 0, bgW, height);
        }
    } else {
        background(135, 206, 235);
        fill(244, 208, 63);
        noStroke();
        rect(0, height * GROUND_Y_RATIO, width, height * (1 - GROUND_Y_RATIO));
    }

    stroke(200, 170, 100, 80);
    strokeWeight(2);
    line(0, height * GROUND_Y_RATIO, width, height * GROUND_Y_RATIO);

    drawDino();
}

function drawNoPlayerWarning() {
    fill(255, 0, 0, 150);
    noStroke();
    rect(0, height - 60, width, 60);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(24);
    text("No player detected. Step into frame!", width / 2, height - 30);
}

function drawLoadingOverlay() {
    fill(0, 0, 0, 150);
    noStroke();
    rect(0, 0, width, 60);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(24);
    text("Initializing Vision System...", width / 2, 30);
}

function resetToWaiting() {
    currentState = STATE_WAITING;
    referenceU = 0;
    currentU = 0;
    uHistory = [];
    movementState = "IDLE";
    
    
    
    
    ankleDiffHistory = [];
    runCooldown = 0;
    shoulderYHistory = [];
    jumpCooldown = 0;
    noseYHistory = [];
    duckCooldown = 0;
    squatCooldown = 0;
    squatConsecutiveFrames = 0;
    jumpLockout = 0;
    duckLockout = 0;
    bgX = 0;
    dinoAnimTimer = 0;
    debugInfo = {};
}

function drawDevOverlay() {
    push();
    const badgeText = showDebug ? "DEV MODE (D: off)" : "DEV MODE (D: panel)";
    textSize(11);
    textAlign(RIGHT, TOP);
    noStroke();

    const badgeW = textWidth(badgeText) + 16;
    const badgeX = currentState === STATE_LOCKED ? width - 185 : width - 10;
    const badgeY = 5;

    fill(showDebug ? color(255, 152, 0, 200) : color(100, 100, 100, 150));
    rect(badgeX - badgeW, badgeY, badgeW, 22, 4);
    fill(255);
    text(badgeText, badgeX - 8, badgeY + 5);

    fill(0, 0, 0, 150);
    const fpsText = `FPS: ${Math.round(frameRate())}`;
    const fpsW = textWidth(fpsText) + 16;
    rect(badgeX - badgeW - fpsW - 5, badgeY, fpsW, 22, 4);
    fill(255);
    text(fpsText, badgeX - badgeW - 13, badgeY + 5);
    pop();
}

// ======================== Dinosaur Character ========================
function drawSprite(sheet, x, y, w, h, frames, speed, flip = false) {
    if (!sheet) return;
    const frameIndex = Math.floor(frameCount / speed) % frames;
    const fw = sheet.width / frames;
    const fh = sheet.height;
    
    push();
    translate(x + w/2, y + h/2);
    if (flip) scale(-1, 1);
    imageMode(CENTER);
    
    image(sheet, 0, 0, w, h, frameIndex * fw, 0, fw, fh);
    
    pop();
}

function drawDino() {
    const groundY = height * GROUND_Y_RATIO;
    const dinoSize = height * 0.35; 
    const dinoX = width * 0.2;

    dinoAnimTimer++;

    let sheet = spriteDinoRun;
    let frames = 4; 
    let speed = 5;  
    
    let y = groundY - dinoSize * 0.9; 
    let w = dinoSize; 
    let h = dinoSize;

    if (movementState === "JUMP") {
        sheet = spriteDinoJump;
        frames = 4; 
        speed = 8;
        y = groundY - dinoSize * 1.5; 
    } else if (movementState === "DUCK") {
        sheet = spriteDinoDuck;
        frames = 4;
        speed = 6;
        y = groundY - dinoSize * 0.75; 
        w = dinoSize * 1.2; 
        h = dinoSize * 0.8;
    } else if (movementState === "SQUAT") {
        sheet = spriteDinoSquat;
        frames = 4;
        speed = 4; 
        y = groundY - dinoSize * 0.6;
        w = dinoSize * 0.8;
        h = dinoSize * 0.8;
    } else {
        // Run/Idle
        speed = 6;
        y += Math.sin(dinoAnimTimer * 0.2) * (dinoSize * 0.02);
    }

    drawSprite(sheet, dinoX, y, w, h, frames, speed);
}

// ======================== Webcam Mirror ========================
function drawWebcamMirror() {
    const mirrorW = 160;
    const mirrorH = 120;
    const mirrorX = width - mirrorW - 15;
    const mirrorY = 15;

    stroke(255);
    strokeWeight(3);
    fill(0);
    rect(mirrorX - 2, mirrorY - 2, mirrorW + 4, mirrorH + 4, 8);

    push();
    translate(mirrorX + mirrorW, mirrorY);
    scale(-1, 1);
    image(video, 0, 0, mirrorW, mirrorH);
    pop();

    noStroke();
    fill(0, 0, 0, 150);
    rect(mirrorX, mirrorY + mirrorH - 20, mirrorW, 20, 0, 0, 8, 8);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(10);
    text("WEBCAM", mirrorX + mirrorW / 2, mirrorY + mirrorH - 10);
}

// ======================== UI Overlay ========================
function drawUI() {
    textAlign(CENTER, CENTER);
    fill(255);
    stroke(0);
    strokeWeight(3);

    if (currentState === STATE_WAITING) {
        noStroke();
        fill(0, 0, 0, 100);
        rect(width / 2 - 200, 30, 400, 50, 10);
        fill(255);
        stroke(0);
        strokeWeight(2);
        textSize(24);
        text("RAISE YOUR HAND TO START", width / 2, 55);

    } else if (currentState === STATE_COUNTDOWN) {
        const remaining = Math.ceil((COUNTDOWN_DURATION - (millis() - countdownStartTime)) / 1000);
        noStroke();
        fill(0, 0, 0, 120);
        ellipse(width / 2, height / 2, 200, 200);
        fill(255);
        textSize(96);
        stroke(0);
        strokeWeight(4);
        text(remaining, width / 2, height / 2);
        textSize(24);
        strokeWeight(2);
        text("Hold Still!", width / 2, height / 2 + 80);

    } else if (currentState === STATE_LOCKED) {
        const boxW = 80;
        const boxH = 45;
        const gap = 15;
        // Added FLAT to indicators
        const items = [
            { label: "JUMP", active: movementState === "JUMP", col: color(255, 235, 59) },
            { label: "RUN", active: movementState === "RUN", col: color(76, 175, 80) },
            { label: "DUCK", active: movementState === "DUCK", col: color(41, 182, 246) },
            { label: "SQUAT", active: movementState === "SQUAT", col: color(255, 87, 34) },
        ];

        const totalW = boxW * items.length + gap * (items.length - 1);
        const startX = (width - totalW) / 2;
        const startY = height - 70;

        for (let i = 0; i < items.length; i++) {
            const x = startX + i * (boxW + gap);
            fill(items[i].active ? items[i].col : color(60, 60, 60, 180));
            stroke(items[i].active ? 255 : 120);
            strokeWeight(items[i].active ? 3 : 1);
            rect(x, startY, boxW, boxH, 8);

            fill(items[i].active ? 0 : 200);
            noStroke();
            textSize(14);
            text(items[i].label, x + boxW / 2, startY + boxH / 2);
        }
    }
}

// ======================== Debug Panel ========================
function drawDebugPanel() {
    push();
    textAlign(LEFT, TOP);
    noStroke();

    // Background
    fill(0, 0, 0, 200);
    rect(10, 80, 400, 300, 8);

    fill(255);
    textSize(20);
    textStyle(BOLD);

    if (currentState !== STATE_LOCKED) {
        text("RAISE HAND TO START", 30, 100);
        pop();
        return;
    }

    const m = debugInfo.movement;
    if (!m) { pop(); return; }

    let y = 100;
    const dy = 35;

    // STATE
    textSize(30);
    fill(0, 255, 255);
    text(`STATE: ${m.state}`, 20, y);
    y += 45;

    textSize(18);
    fill(200);
    text(`Unit U: ${m.U}`, 20, y);
    y += dy;

    // SQUAT
    const squatVal = parseFloat(m.hipAnkDist); // Distance
    const squatThresh = (0.7 * parseFloat(m.U)).toFixed(2);
    if (squatVal < parseFloat(squatThresh)) fill(0, 255, 0); else fill(255);
    text(`SQUAT (Legs): ${squatVal} < ${squatThresh}`, 20, y);
    y += dy;

    // RUN
    const runVal = parseFloat(m.diffAmp);
    const runThresh = (0.10 * parseFloat(m.U)).toFixed(2);
    if (runVal > parseFloat(runThresh)) fill(0, 255, 0); else fill(255);
    text(`RUN (AnkAmp): ${runVal} > ${runThresh}`, 20, y);
    y += dy;

    // JUMP
    const jumpVal = parseFloat(m.jumpVel);
    const jumpThresh = (0.08 * parseFloat(m.U)).toFixed(2);
    if (jumpVal > parseFloat(jumpThresh)) fill(0, 255, 0); else fill(255);
    text(`JUMP (Vel): ${jumpVal} > ${jumpThresh}`, 20, y);
    y += dy;

    // DUCK
    const duckVal = parseFloat(m.compRatio);
    const duckThresh = 0.60;
    if (duckVal < duckThresh) fill(0, 255, 0); else fill(255);
    text(`DUCK (Cmpt): ${duckVal} < ${duckThresh}`, 20, y);

    pop();
}

function drawSkeleton(landmarks) {
    push();
    translate(width, 0);
    scale(-1, 1);
    stroke(0, 255, 0);
    strokeWeight(2);
    const connections = [
        [11, 12], [11, 23], [12, 24], [23, 24],
        [11, 13], [13, 15], [12, 14], [14, 16],
        [23, 25], [25, 27], [24, 26], [26, 28],
    ];
    for (const [s, e] of connections) {
        const a = landmarks[s], b = landmarks[e];
        if (a && b && a.visibility > 0.5 && b.visibility > 0.5) {
            line(a.x * width, a.y * height, b.x * width, b.y * height);
        }
    }
    noStroke();
    fill(255, 0, 0);
    for (const lm of landmarks) {
        if (lm && lm.visibility > 0.5) ellipse(lm.x * width, lm.y * height, 8, 8);
    }
    pop();
}

// ======================== Game State Machine ========================
function handleState(landmarks) {
    switch (currentState) {
        case STATE_WAITING:
            checkRaiseHand(landmarks);
            break;
        case STATE_COUNTDOWN:
            processCountdown(landmarks);
            break;
        case STATE_LOCKED:
            checkMovement(landmarks);
            break;
    }
}

function checkRaiseHand(landmarks) {
    const leftWrist = landmarks[15], rightWrist = landmarks[16];
    const leftEar = landmarks[7], rightEar = landmarks[8];
    let leftRaised = false, rightRaised = false;

    if (leftWrist && leftEar && leftWrist.visibility > 0.5 && leftEar.visibility > 0.5) {
        leftRaised = leftWrist.y < leftEar.y;
    }
    if (rightWrist && rightEar && rightWrist.visibility > 0.5 && rightEar.visibility > 0.5) {
        rightRaised = rightWrist.y < rightEar.y;
    }

    debugInfo.leftWrist = leftWrist;
    debugInfo.rightWrist = rightWrist;
    debugInfo.leftEar = leftEar;
    debugInfo.rightEar = rightEar;
    debugInfo.leftRaised = leftRaised;
    debugInfo.rightRaised = rightRaised;

    if (leftRaised || rightRaised) {
        currentState = STATE_COUNTDOWN;
        countdownStartTime = millis();
    }
}

function processCountdown(landmarks) {
    if (millis() - countdownStartTime >= COUNTDOWN_DURATION) {
        lockPlayer(landmarks);
    }
}

function lockPlayer(landmarks) {
    currentState = STATE_LOCKED;
    const nose = landmarks[0];
    const leftHip = landmarks[23], rightHip = landmarks[24];

    if (nose && leftHip && rightHip) {
        const midHipY = (leftHip.y + rightHip.y) / 2;
        referenceU = Math.abs(midHipY - nose.y); // Set initial Unit
        currentU = referenceU;
        uHistory = [referenceU];

        // Reset process
        runCooldown = 0;
        ankleDiffHistory = [];
        bgX = 0;
        console.log("Player Locked! Reference U:", referenceU);
        if (gameMode === MODE_PLAY) {
            levelStartTime = millis();
            nextObstacleIndex = 0;
            obstacles = [];
            score = 0;
            totalObstacles = 0;
            isStunned = false;
            stunnedTimer = 0;
        }
    }
}

// ======================== Start Menu ========================
function drawMenu() {
    background(30, 60, 90);

    push();
    textAlign(CENTER, CENTER);
    noStroke();

    // Beach gradient background
    for (let y = 0; y < height; y++) {
        const t = y / height;
        const r = lerp(100, 244, t);
        const g = lerp(180, 208, t);
        const b = lerp(255, 63, t);
        stroke(r, g, b);
        line(0, y, width, y);
    }
    noStroke();

    // Waves decoration
    for (let i = 0; i < 3; i++) {
        fill(65, 155, 220, 60 - i * 15);
        beginShape();
        for (let x = 0; x <= width; x += 20) {
            const waveY = height * 0.55 + i * 25 + sin(x * 0.02 + frameCount * 0.03 + i) * 15;
            vertex(x, waveY);
        }
        vertex(width, height);
        vertex(0, height);
        endShape(CLOSE);
    }

    // Sand
    fill(244, 220, 160);
    rect(0, height * 0.7, width, height * 0.3);

    // Title shadow
    fill(0, 0, 0, 80);
    textSize(min(72, width * 0.06));
    textStyle(BOLD);
    text("Beach Run Adventure", width / 2 + 3, height * 0.18 + 3);

    // Title
    fill(255, 220, 50);
    text("Beach Run Adventure", width / 2, height * 0.18);

    // Dino emoji
    textSize(80);
    text("🦖", width / 2, height * 0.32);

    // Subtitle
    fill(255, 255, 255, 200);
    textSize(20);
    textStyle(NORMAL);
    text("A Motion-Controlled Game for Kids", width / 2, height * 0.42);

    // Buttons
    const btnW = min(320, width * 0.35);
    const btnH = 65;
    const gap = 25;
    const btnX = width / 2 - btnW / 2;
    const btnY1 = height * 0.52;
    const btnY2 = btnY1 + btnH + gap;

    // Play button
    const h1 = mouseX > btnX && mouseX < btnX + btnW && mouseY > btnY1 && mouseY < btnY1 + btnH;
    fill(h1 ? color(76, 175, 80) : color(56, 142, 60));
    rect(btnX, btnY1, btnW, btnH, 14);
    if (h1) { stroke(255, 255, 255, 100); strokeWeight(2); rect(btnX, btnY1, btnW, btnH, 14); noStroke(); }
    fill(255);
    textSize(26);
    textStyle(BOLD);
    text("🎮  Play Game (60s)", width / 2, btnY1 + btnH / 2);

    // Practice button
    const h2 = mouseX > btnX && mouseX < btnX + btnW && mouseY > btnY2 && mouseY < btnY2 + btnH;
    fill(h2 ? color(41, 182, 246) : color(25, 118, 210));
    rect(btnX, btnY2, btnW, btnH, 14);
    if (h2) { stroke(255, 255, 255, 100); strokeWeight(2); rect(btnX, btnY2, btnW, btnH, 14); noStroke(); }
    fill(255);
    textSize(26);
    text("🏃  Practice Mode", width / 2, btnY2 + btnH / 2);

    menuButtons = [
        { x: btnX, y: btnY1, w: btnW, h: btnH, mode: MODE_PLAY },
        { x: btnX, y: btnY2, w: btnW, h: btnH, mode: MODE_PRACTICE },
    ];

    textStyle(NORMAL);
    pop();
}

window.mousePressed = function () {
    if (currentState === STATE_MENU) {
        for (const btn of menuButtons) {
            if (mouseX > btn.x && mouseX < btn.x + btn.w &&
                mouseY > btn.y && mouseY < btn.y + btn.h) {
                gameMode = btn.mode;
                currentState = STATE_WAITING;
                if (!audioCtx) {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
            }
        }
    } else if (currentState === STATE_VICTORY) {
        returnToMenu();
    }
};

function returnToMenu() {
    resetToWaiting();
    currentState = STATE_MENU;
    obstacles = [];
    nextObstacleIndex = 0;
    score = 0;
    totalObstacles = 0;
    isStunned = false;
    stunnedTimer = 0;
    levelTimer = 0;
}

// ======================== Obstacle System ========================
function spawnObstacle(type) {
    const groundY = height * GROUND_Y_RATIO;
    const ds = height * 0.35;
    let y, w, h, col, req;

    if (type === 'SHELL') { w = ds * 0.3; h = ds * 0.25; y = groundY - h; col = [244, 164, 96]; req = 'JUMP'; }
    else if (type === 'SEAGULL') { w = ds * 0.5; h = ds * 0.25; y = groundY - ds * 1.2; col = [255, 255, 255]; req = 'DUCK'; }
    else { w = ds * 0.4; h = ds * 0.2; y = groundY - ds * 0.7; col = [255, 69, 0]; req = 'SQUAT'; }

    obstacles.push({ type, x: width + 50, y, w, h, color: col, requiredAction: req, dodged: false, hit: false });
    totalObstacles++;
}

function updateObstacles() {
    const speed = BG_SCROLL_SPEED;
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        if (movementState !== "IDLE") o.x -= speed;
        if (o.x < -100) { obstacles.splice(i, 1); continue; }

        if (!o.dodged && !o.hit && !isStunned) {
            const dX = width * 0.2, ds = height * 0.35, dW = ds * 0.6;
            const gY = height * GROUND_Y_RATIO;
            const overlap = (dX + dW / 2) > (o.x - o.w / 2) && (dX - dW / 2) < (o.x + o.w / 2) &&
                gY > o.y && (gY - ds) < (o.y + o.h);
            if (overlap) {
                if (movementState === o.requiredAction) { o.dodged = true; score++; playSound('dodge'); }
                else { o.hit = true; isStunned = true; stunnedTimer = STUNNED_DURATION; playSound('hit'); }
            }
        }
    }
    if (isStunned) { stunnedTimer--; if (stunnedTimer <= 0) isStunned = false; }
}

function drawObstacles() {
    for (const o of obstacles) {
        let sheet, frames, speed, flip = false;
        let drawW = o.w * 1.3, drawH = o.h * 1.3;
        let drawY = o.y; 
        
        if (o.type === 'SHELL') {
            sheet = imgShell;
            frames = 1; speed = 1;
            drawW = o.w * 1.2; drawH = o.h * 1.2;
        } else if (o.type === 'SEAGULL') {
            sheet = spriteSeagull;
            frames = 4; speed = 6;
            drawY += Math.sin(frameCount * 0.1) * o.h * 0.1; 
        } else {
            sheet = spriteRocket;
            frames = 4; speed = 4;
        }

        if (frames > 1) {
            drawSprite(sheet, o.x, drawY, drawW, drawH, frames, speed, flip);
        } else {
            push();
            imageMode(CENTER);
            translate(o.x + o.w/2, drawY + o.h/2);
            if(sheet) image(sheet, 0, 0, drawW, drawH);
            pop();
        }

        if (o.dodged) {
            push();
            noStroke();
            fill(0, 255, 0, 200);
            textSize(32);
            textAlign(CENTER, CENTER);
            text("✓", o.x + o.w/2, o.y - 20);
            pop();
        }
    }
}

function drawWarningArrows() {
    const warnDist = width * 0.6;
    for (const o of obstacles) {
        if (o.dodged || o.hit || o.x <= width || o.x > width + warnDist) continue;
        push();
        const alpha = map(o.x, width + warnDist, width, 50, 255);
        const ax = width - 80, ay = o.y + o.h / 2;
        textAlign(CENTER, CENTER); textSize(48); noStroke();
        if (o.requiredAction === 'JUMP') { fill(76, 175, 80, alpha); text("⬆", ax, ay); textSize(16); text("JUMP!", ax, ay + 35); }
        else if (o.requiredAction === 'DUCK') { fill(41, 182, 246, alpha); text("⬇", ax, ay); textSize(16); text("DUCK!", ax, ay + 35); }
        else { fill(255, 87, 34, alpha); text("⏬", ax, ay); textSize(16); text("SQUAT!", ax, ay + 35); }
        pop();
    }
}

function drawStunnedEffect() {
    if (!isStunned) return;
    push();
    const dX = width * 0.2, gY = height * GROUND_Y_RATIO, ds = height * 0.35;
    if (frameCount % 6 < 3) { fill(255, 255, 255, 100); noStroke(); ellipse(dX, gY - ds * 0.5, ds, ds); }
    for (let i = 0; i < 5; i++) {
        const a = frameCount * 0.1 + i * TWO_PI / 5;
        fill(255, 255, 0); noStroke(); textSize(16);
        text("✦", dX + cos(a) * ds * 0.4, gY - ds * 0.8 + sin(a * 1.5) * ds * 0.2);
    }
    pop();
}

// ======================== Timer & Score HUD ========================
function drawGameHUD() {
    if (gameMode !== MODE_PLAY || currentState !== STATE_LOCKED) return;
    push();
    const elapsed = (millis() - levelStartTime) / 1000;
    const remaining = Math.max(0, LEVEL_DURATION - elapsed);

    noStroke(); fill(0, 0, 0, 150); rect(width / 2 - 80, 10, 160, 50, 10);
    fill(remaining < 10 ? color(255, 80, 80) : 255);
    textAlign(CENTER, CENTER); textSize(32); textStyle(BOLD);
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    text(`${mins}:${secs.toString().padStart(2, '0')}`, width / 2, 35);

    fill(0, 0, 0, 150); rect(10, 10, 150, 40, 10);
    fill(255); textSize(20); textAlign(LEFT, CENTER);
    text(`Score: ${score}/${totalObstacles}`, 20, 30);
    textStyle(NORMAL); pop();

    if (remaining <= 0) { currentState = STATE_VICTORY; playSound('victory'); }
}

function updateLevel() {
    if (gameMode !== MODE_PLAY || currentState !== STATE_LOCKED) return;
    const elapsed = (millis() - levelStartTime) / 1000;
    while (nextObstacleIndex < LEVEL_SEQUENCE.length && LEVEL_SEQUENCE[nextObstacleIndex].t <= elapsed) {
        spawnObstacle(LEVEL_SEQUENCE[nextObstacleIndex].type);
        nextObstacleIndex++;
    }
    updateObstacles();
}

// ======================== Victory Screen ========================
function drawVictoryScreen() {
    background(30, 60, 90);
    push(); textAlign(CENTER, CENTER); noStroke();

    for (let y = 0; y < height * 0.6; y++) {
        stroke(lerp(20, 135, y / (height * 0.6)), lerp(20, 206, y / (height * 0.6)), lerp(80, 235, y / (height * 0.6)));
        line(0, y, width, y);
    }
    noStroke();
    fill(244, 220, 160); rect(0, height * 0.6, width, height * 0.4);

    const castleSize = min(width, height) * 0.6;
    imageMode(CENTER);
    image(imgCastle, width/2, height * 0.6, castleSize, castleSize);
    imageMode(CORNER);

    fill(255, 215, 0); textSize(min(64, width * 0.08)); textStyle(BOLD);
    text("🎉 YOU WON! 🎉", width / 2, height * 0.15);
    stroke(0); strokeWeight(4); noFill();
    text("🎉 YOU WON! 🎉", width / 2, height * 0.15);

    fill(255); noStroke(); textSize(28); textStyle(NORMAL);
    text(`Dodged ${score} of ${totalObstacles} obstacles!`, width / 2, height * 0.9);

    for (let i = 0; i < 30; i++) {
        const px = (width * (i * 0.618 + frameCount * 0.001)) % width;
        const py = (height * (i * 0.314 + frameCount * 0.002)) % height;
        fill([255, 0, 100, 50, 255, 200][(i * 3) % 6], [215, 200, 255, 205, 100, 50][(i * 3 + 1) % 6], [0, 0, 100, 50, 50, 255][(i * 3 + 2) % 6], 200);
        const sz = 5 + sin(frameCount * 0.05 + i) * 3;
        if (i % 3 === 0) ellipse(px, py, sz, sz); else if (i % 3 === 1) rect(px, py, sz, sz * 1.5); else triangle(px, py - sz, px - sz, py + sz, px + sz, py + sz);
    }

    fill(255, 255, 255, 150 + sin(frameCount * 0.08) * 100); textSize(22);
    text("Click anywhere to return to menu", width / 2, height * 0.96);
    pop();
}

function drawPracticeHUD() {
    if (gameMode !== MODE_PRACTICE || currentState !== STATE_LOCKED) return;
    push(); noStroke();
    fill(0, 0, 0, 150); rect(width / 2 - 100, 10, 200, 35, 10);
    fill(41, 182, 246); textAlign(CENTER, CENTER); textSize(18); textStyle(BOLD);
    text("PRACTICE MODE", width / 2, 27);
    fill(0, 0, 0, 100); rect(width / 2 - 90, 50, 180, 25, 8);
    fill(200); textSize(12); textStyle(NORMAL);
    text("Press M to return to menu", width / 2, 62);
    pop();
}

// ======================== Audio ========================
function playSound(type) {
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        gain.gain.value = 0.15;
        const now = audioCtx.currentTime;
        if (type === 'dodge') {
            osc.frequency.setValueAtTime(523, now);
            osc.frequency.setValueAtTime(659, now + 0.05);
            osc.frequency.setValueAtTime(784, now + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'hit') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'victory') {
            osc.frequency.setValueAtTime(523, now);
            osc.frequency.setValueAtTime(659, now + 0.15);
            osc.frequency.setValueAtTime(784, now + 0.3);
            osc.frequency.setValueAtTime(1047, now + 0.45);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
            osc.start(now); osc.stop(now + 0.7);
        }
    } catch (e) { /* audio not available */ }
}
// ======================== Movement Detection ========================
function countSignChanges(history, noiseThresh) {
    let changes = 0, lastSign = 0;
    for (let i = 0; i < history.length; i++) {
        if (Math.abs(history[i]) < noiseThresh) continue;
        const sign = history[i] > 0 ? 1 : -1;
        if (lastSign !== 0 && sign !== lastSign) changes++;
        lastSign = sign;
    }
    return changes;
}

// --- Gesture Detectors ---

function detectSquat(leftAnkle, rightAnkle, midHipY, landmarks) {
    let isSquatting = false;
    let hipAnkleDist = null;

    if (leftAnkle && rightAnkle) {
        const midAnkleY = (leftAnkle.y + rightAnkle.y) / 2;
        hipAnkleDist = midAnkleY - midHipY;
        if (hipAnkleDist < 0.7 * currentU) {
            isSquatting = true;
        }
    }

    // Backup: Bounding Box Ratio
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (let lm of landmarks) {
        if (lm.x < minX) minX = lm.x;
        if (lm.x > maxX) maxX = lm.x;
        if (lm.y < minY) minY = lm.y;
        if (lm.y > maxY) maxY = lm.y;
    }
    const boxRatio = (maxX - minX) / (maxY - minY);
    if (boxRatio > 1.5) isSquatting = true;

    return { isSquatting, hipAnkleDist, boxRatio };
}

function detectRun(leftAnkle, rightAnkle, midHipY) {
    let isRunningFrame = false;
    let ankDiff = 0;

    if (leftAnkle && rightAnkle) {
        ankDiff = leftAnkle.y - rightAnkle.y;
        ankleDiffHistory.push(ankDiff);
        if (ankleDiffHistory.length > RUN_WINDOW) ankleDiffHistory.shift();

        const signChanges = countSignChanges(ankleDiffHistory, 0.05 * currentU);
        const ampStart = ankleDiffHistory.length - Math.min(10, ankleDiffHistory.length);
        let maxAmp = 0;
        for (let i = ampStart; i < ankleDiffHistory.length; i++) {
            if (Math.abs(ankleDiffHistory[i]) > maxAmp) maxAmp = Math.abs(ankleDiffHistory[i]);
        }

        // Anti-Jump Guard
        const avgAnkleY = (leftAnkle.y + rightAnkle.y) / 2;
        const isJumpSquat = (avgAnkleY - midHipY) < 0.5 * currentU;

        if (signChanges >= MIN_RUN_SIGN_CHANGES && maxAmp > 0.10 * currentU && !isJumpSquat) {
            isRunningFrame = true;
        }
    }
    return { isRunningFrame, ankDiff };
}

function detectJump(midShoulderY) {
    shoulderYHistory.push(midShoulderY);
    if (shoulderYHistory.length > JUMP_VELOCITY_WINDOW) shoulderYHistory.shift();

    const jumpVel = shoulderYHistory[0] - shoulderYHistory[shoulderYHistory.length - 1];
    const jumpThresh = 0.08 * currentU;
    return { isJumpingFrame: jumpVel > jumpThresh, jumpVel, jumpThresh };
}

function detectDuck(nose, midHipY, midShoulderX, midShoulderY, midHipX) {
    const compRatio = Math.abs(nose.y - midHipY) / currentU;

    noseYHistory.push(nose.y);
    if (noseYHistory.length > DUCK_VELOCITY_WINDOW) noseYHistory.shift();
    const duckVel = noseYHistory[noseYHistory.length - 1] - noseYHistory[0];
    const duckVelThresh = 0.12 * currentU;

    const dx = Math.abs(midShoulderX - midHipX);
    const dy = Math.abs(midShoulderY - midHipY);
    const isSpineVertical = degrees(Math.atan2(dx, dy)) < 30;

    return { isDuckingFrame: (compRatio < 0.60 || duckVel > duckVelThresh) && isSpineVertical, compRatio, duckVel };
}

// --- State Machine ---

function updateStateMachine(squat, run, jump, duck) {
    // Decrement cooldowns
    if (runCooldown > 0) runCooldown--;
    if (jumpCooldown > 0) jumpCooldown--;
    if (duckCooldown > 0) duckCooldown--;
    if (squatCooldown > 0) squatCooldown--;
    if (jumpLockout > 0) jumpLockout--;
    if (duckLockout > 0) duckLockout--;

    // Squat debounce: must persist for N consecutive frames
    squatConsecutiveFrames = squat.isSquatting ? squatConsecutiveFrames + 1 : 0;
    const squatConfirmed = squatConsecutiveFrames >= SQUAT_MIN_FRAMES;

    // --- State Transitions (priority order) ---
    // 1. SQUAT (highest, debounced)
    if (squatConfirmed && squatCooldown === 0) {
        movementState = "SQUAT";
        squatCooldown = SQUAT_COOLDOWN_FRAMES;
    }
    // 2. JUMP
    else if (jump.isJumpingFrame && jumpCooldown === 0 && jumpLockout === 0 && movementState !== "SQUAT" && (movementState !== "RUN" || jump.jumpVel > 0.15 * currentU)) {
        movementState = "JUMP";
        jumpCooldown = JUMP_COOLDOWN_FRAMES;
        duckLockout = OPPOSITE_LOCKOUT_FRAMES;
    }
    // 3. DUCK
    else if (duck.isDuckingFrame && duckCooldown === 0 && duckLockout === 0 && movementState !== "SQUAT" && movementState !== "JUMP") {
        movementState = "DUCK";
        duckCooldown = DUCK_COOLDOWN_FRAMES;
        jumpLockout = OPPOSITE_LOCKOUT_FRAMES;
    }
    // 4. RUN (can re-trigger while already running — keeps it smooth)
    else if (run.isRunningFrame && runCooldown === 0) {
        movementState = "RUN";
        runCooldown = RUN_COOLDOWN_FRAMES;
    }

    // --- IDLE Reset (always checked, outside else chain) ---
    if (movementState === "RUN" && runCooldown === 0 && !run.isRunningFrame) movementState = "IDLE";
    if (movementState === "JUMP" && jumpCooldown === 0) movementState = "IDLE";
    if (movementState === "DUCK" && duckCooldown === 0) movementState = "IDLE";
    if (movementState === "SQUAT" && squatCooldown === 0) movementState = "IDLE";
}

// --- Main Entry Point ---

function checkMovement(landmarks) {
    if (referenceU === 0) return;

    const nose = landmarks[0];
    const leftShoulder = landmarks[11], rightShoulder = landmarks[12];
    const leftHip = landmarks[23], rightHip = landmarks[24];

    if (!nose || !leftShoulder || !rightShoulder || !leftHip || !rightHip) return;

    const midHipY = (leftHip.y + rightHip.y) / 2;
    const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const midHipX = (leftHip.x + rightHip.x) / 2;
    const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;

    // Update 'U' (Running Average)
    const rawU = Math.abs(midHipY - nose.y);
    uHistory.push(rawU);
    if (uHistory.length > U_WINDOW) uHistory.shift();
    currentU = uHistory.reduce((a, b) => a + b, 0) / uHistory.length;

    // Detect gestures
    const leftAnkle = landmarks[27], rightAnkle = landmarks[28];
    const squat = detectSquat(leftAnkle, rightAnkle, midHipY, landmarks);
    const run = detectRun(leftAnkle, rightAnkle, midHipY);
    const jump = detectJump(midShoulderY);
    const duck = detectDuck(nose, midHipY, midShoulderX, midShoulderY, midHipX);

    // Update state machine
    updateStateMachine(squat, run, jump, duck);

    // Debug info
    debugInfo.movement = {
        U: currentU.toFixed(3),
        state: movementState,
        diffAmp: run.ankDiff.toFixed(3),
        jumpVel: jump.jumpVel.toFixed(3),
        jumpThresh: jump.jumpThresh.toFixed(3),
        compRatio: duck.compRatio.toFixed(2),
        duckVel: duck.duckVel.toFixed(3),
        hipAnkDist: squat.hipAnkleDist !== null ? squat.hipAnkleDist.toFixed(3) : "N/A",
        boxRatio: squat.boxRatio.toFixed(2),
        jLock: jumpLockout,
        dLock: duckLockout
    };
}


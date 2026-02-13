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
let bgImage;

// Game State
const STATE_WAITING = 0;
const STATE_COUNTDOWN = 1;
const STATE_LOCKED = 2;
let currentState = STATE_WAITING;

// Calibration Data
let countdownStartTime = 0;
const COUNTDOWN_DURATION = 3000;
let referenceU = 0; // Initial "Unit of Measure" (Nose-to-Hip)

// Movement State
let movementState = "IDLE";
let isRunning = false;
let isJumping = false;
let isDucking = false;
let isFlat = false;

// Scale Invariance (Running Average of U)
let uHistory = [];
const U_WINDOW = 30;
let currentU = 0; // The active "Unit of Measure" for this frame

// Run detection (Hip-Relative Knee Lift)
let kneeDiffHistory = [];
const RUN_WINDOW = 40;
const MIN_RUN_SIGN_CHANGES = 2;
let runCooldown = 0;
const RUN_COOLDOWN_FRAMES = 15;

// Jump detection — velocity-based
let shoulderYHistory = [];
const JUMP_VELOCITY_WINDOW = 5;
let jumpCooldown = 0;
const JUMP_COOLDOWN_FRAMES = 6;

// Duck detection — Compactness + Velocity
let noseYHistory = [];
const DUCK_VELOCITY_WINDOW = 5;
let duckCooldown = 0;
const DUCK_COOLDOWN_FRAMES = 6;

// Lying Flat detection (Spine Angle)
let flatCooldown = 0;
const FLAT_COOLDOWN_FRAMES = 10;

// Opposite-action lockout
const OPPOSITE_LOCKOUT_FRAMES = 20;
let jumpLockout = 0;
let duckLockout = 0;

// Background Scrolling
let bgX = 0;
const BG_SCROLL_SPEED = 10;

// Character
const GROUND_Y_RATIO = 0.82; // Ground line at 82% of canvas height
let dinoAnimTimer = 0;

// Debug / Dev Mode
const DEV_MODE = true;
let showDebug = true;
let debugInfo = {};

// ======================== Preload ========================
window.preload = function () {
    bgImage = loadImage("assets/beach_bg.png");
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
};

// ======================== Main Draw Loop ========================
window.draw = function () {
    try {
        if (
            isModelLoaded && video && video.elt &&
            video.elt.readyState >= 2 &&
            video.elt.currentTime !== lastVideoTime
        ) {
            lastVideoTime = video.elt.currentTime;
            results = poseLandmarker.detectForVideo(video.elt, performance.now());
        }

        if (currentState === STATE_LOCKED) {
            drawGameWorld();
        } else {
            drawCalibrationScreen();
        }

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

        drawUI();

        if (currentState === STATE_LOCKED && video && video.width > 0) {
            drawWebcamMirror();
        }

        if (DEV_MODE) {
            drawDevOverlay();
            if (showDebug) {
                drawDebugPanel();
            }
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

        if (isRunning) {
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
    isRunning = false;
    isJumping = false;
    isDucking = false;
    isFlat = false;
    kneeDiffHistory = [];
    runCooldown = 0;
    shoulderYHistory = [];
    jumpCooldown = 0;
    noseYHistory = [];
    duckCooldown = 0;
    flatCooldown = 0;
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
function drawDino() {
    const groundY = height * GROUND_Y_RATIO;
    const dinoSize = height * 0.12;
    const dinoX = width * 0.2;

    push();
    dinoAnimTimer++;

    let bodyY = groundY;

    if (movementState === "JUMP") {
        const jumpHeight = dinoSize * 2;
        bodyY = groundY - jumpHeight * 0.7;
    } else if (movementState === "DUCK") {
        bodyY = groundY;
    } else if (movementState === "FLAT") { // NEW: Flat state
        bodyY = groundY + dinoSize * 0.2; // Slightly lower visually
    }

    const bodyColor = color(76, 175, 80);
    const bellyColor = color(165, 214, 167);
    const eyeWhite = color(255);
    const eyePupil = color(33, 33, 33);

    noStroke();

    if (movementState === "FLAT") {
        // ---- LYING FLAT DINO (Pancake Mode) ----
        const flatH = dinoSize * 0.4;
        const flatW = dinoSize * 1.5;
        const flatY = bodyY - flatH;

        // Long flat body
        fill(bodyColor);
        rect(dinoX - flatW / 2, flatY, flatW, flatH, 10);

        // Head on ground
        fill(bodyColor);
        ellipse(dinoX + flatW / 2, flatY + flatH / 2, flatH * 1.2, flatH);

        // Eye (looking up/startled)
        fill(eyeWhite);
        ellipse(dinoX + flatW / 2 + 5, flatY + flatH / 2 - 5, 8, 8);
        fill(eyePupil);
        ellipse(dinoX + flatW / 2 + 5, flatY + flatH / 2 - 5, 4, 4);

    } else if (movementState === "DUCK") {
        // ---- DUCKING DINO (Crouched) ----
        const duckH = dinoSize * 0.5;
        const duckW = dinoSize * 1.2;
        const duckY = bodyY - duckH;

        fill(bodyColor);
        ellipse(dinoX, duckY + duckH * 0.4, duckW, duckH);
        fill(bellyColor);
        ellipse(dinoX, duckY + duckH * 0.5, duckW * 0.5, duckH * 0.5);
        fill(bodyColor);
        ellipse(dinoX + duckW * 0.35, duckY + duckH * 0.2, dinoSize * 0.35, dinoSize * 0.3);
        fill(eyeWhite);
        ellipse(dinoX + duckW * 0.42, duckY + duckH * 0.1, 8, 8);
        fill(eyePupil);
        ellipse(dinoX + duckW * 0.44, duckY + duckH * 0.1, 4, 4);

    } else {
        // ---- NORMAL / RUNNING / JUMPING ----
        const headSize = dinoSize * 0.4;
        const bodyW = dinoSize * 0.6;
        const bodyH = dinoSize * 0.7;
        const legLen = dinoSize * 0.3;

        const bodyTop = bodyY - bodyH - legLen;
        const bodyCenterY = bodyTop + bodyH / 2;

        // Tail
        fill(bodyColor);
        beginShape();
        vertex(dinoX - bodyW * 0.4, bodyCenterY - bodyH * 0.1);
        vertex(dinoX - bodyW * 1.3, bodyCenterY - bodyH * 0.3);
        vertex(dinoX - bodyW * 1.2, bodyCenterY + bodyH * 0.1);
        vertex(dinoX - bodyW * 0.4, bodyCenterY + bodyH * 0.2);
        endShape(CLOSE);

        // Body
        fill(bodyColor);
        ellipse(dinoX, bodyCenterY, bodyW, bodyH);
        fill(bellyColor);
        ellipse(dinoX + bodyW * 0.05, bodyCenterY + bodyH * 0.1, bodyW * 0.5, bodyH * 0.5);

        // Legs
        fill(bodyColor);
        if (movementState === "RUN") {
            const legPhase = dinoAnimTimer * 0.3;
            const leg1Angle = sin(legPhase) * 0.5;
            const leg2Angle = sin(legPhase + PI) * 0.5;

            push();
            translate(dinoX - bodyW * 0.15, bodyCenterY + bodyH * 0.35);
            rotate(leg1Angle);
            rect(-4, 0, 8, legLen, 3);
            ellipse(0, legLen, 14, 8);
            pop();

            push();
            translate(dinoX + bodyW * 0.15, bodyCenterY + bodyH * 0.35);
            rotate(leg2Angle);
            rect(-4, 0, 8, legLen, 3);
            ellipse(0, legLen, 14, 8);
            pop();

            // Arms
            push();
            translate(dinoX + bodyW * 0.25, bodyCenterY - bodyH * 0.05);
            rotate(sin(legPhase) * 0.4);
            rect(-3, 0, 6, dinoSize * 0.2, 3);
            pop();
        } else if (movementState === "JUMP") {
            fill(bodyColor);
            ellipse(dinoX - bodyW * 0.1, bodyCenterY + bodyH * 0.4, 12, 10);
            ellipse(dinoX + bodyW * 0.1, bodyCenterY + bodyH * 0.4, 12, 10);

            push();
            translate(dinoX + bodyW * 0.3, bodyCenterY - bodyH * 0.2);
            rotate(-0.8);
            rect(-3, -dinoSize * 0.2, 6, dinoSize * 0.2, 3);
            pop();
            push();
            translate(dinoX - bodyW * 0.1, bodyCenterY - bodyH * 0.3);
            rotate(0.5);
            rect(-3, -dinoSize * 0.15, 6, dinoSize * 0.15, 3);
            pop();
        } else {
            const idleBounce = sin(dinoAnimTimer * 0.08) * 2;
            rect(dinoX - bodyW * 0.18, bodyCenterY + bodyH * 0.35, 8, legLen + idleBounce, 3);
            rect(dinoX + bodyW * 0.08, bodyCenterY + bodyH * 0.35, 8, legLen + idleBounce, 3);
            ellipse(dinoX - bodyW * 0.14, bodyCenterY + bodyH * 0.35 + legLen + idleBounce, 14, 8);
            ellipse(dinoX + bodyW * 0.12, bodyCenterY + bodyH * 0.35 + legLen + idleBounce, 14, 8);
            push();
            translate(dinoX + bodyW * 0.25, bodyCenterY);
            rotate(0.3 + sin(dinoAnimTimer * 0.06) * 0.1);
            rect(-3, 0, 6, dinoSize * 0.2, 3);
            pop();
        }

        // Head
        fill(bodyColor);
        ellipse(dinoX + bodyW * 0.2, bodyTop - headSize * 0.2, headSize, headSize * 0.85);

        // Eye
        fill(eyeWhite);
        const eyeX = dinoX + bodyW * 0.3;
        const eyeY = bodyTop - headSize * 0.3;
        ellipse(eyeX, eyeY, 12, 12);
        fill(eyePupil);
        const pupilOffX = movementState === "RUN" ? 2 : 0;
        ellipse(eyeX + pupilOffX, eyeY, 5, 5);

        // Mouth
        stroke(color(40, 120, 40));
        strokeWeight(2);
        noFill();
        const mouthX = dinoX + bodyW * 0.4;
        const mouthY = bodyTop - headSize * 0.05;
        arc(mouthX, mouthY, headSize * 0.3, headSize * 0.15, 0, PI);

        // Spots
        noStroke();
        fill(56, 142, 60);
        ellipse(dinoX - bodyW * 0.1, bodyCenterY - bodyH * 0.25, 6, 6);
        ellipse(dinoX + bodyW * 0.05, bodyCenterY - bodyH * 0.3, 5, 5);
        ellipse(dinoX - bodyW * 0.2, bodyCenterY - bodyH * 0.15, 4, 4);
    }

    pop();
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
            { label: "FLAT", active: movementState === "FLAT", col: color(255, 87, 34) },
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

    if (currentState === STATE_WAITING || currentState === STATE_COUNTDOWN) {
        // ... (Keep existing waiting debug info)
        const safeVal = (obj, key) => {
            if (!obj || obj[key] === undefined) return "N/A";
            return typeof obj[key] === "number" ? obj[key].toFixed(3) : String(obj[key]);
        };
        const panels = [
            { label: "L HAND", wrist: debugInfo.leftWrist, ear: debugInfo.leftEar, raised: debugInfo.leftRaised, yOffset: 0 },
            { label: "R HAND", wrist: debugInfo.rightWrist, ear: debugInfo.rightEar, raised: debugInfo.rightRaised, yOffset: 75 },
        ];
        for (const p of panels) {
            fill(0, 0, 0, 180);
            rect(10, 100 + p.yOffset, 260, 65, 5);
            fill(p.raised ? color(0, 255, 100) : color(255, 80, 80));
            textSize(14);
            textStyle(BOLD);
            text(p.label + ": " + (p.raised ? "RAISED" : "DOWN"), 20, 105 + p.yOffset);
            textStyle(NORMAL);
            fill(255);
            textSize(12);
            text("Wrist Y: " + safeVal(p.wrist, "y") + "  Vis: " + safeVal(p.wrist, "visibility"), 20, 125 + p.yOffset);
            text("Ear  Y: " + safeVal(p.ear, "y") + "  Vis: " + safeVal(p.ear, "visibility"), 20, 140 + p.yOffset);
        }

    } else if (currentState === STATE_LOCKED && debugInfo.movement) {
        fill(0, 0, 0, 200);
        rect(10, 100, 500, 360, 8); // Taller panel for more info
        fill(255);
        textSize(22);
        textStyle(BOLD);
        text("MOVEMENT DATA", 20, 115);
        textStyle(NORMAL);
        textSize(16);

        const m = debugInfo.movement;

        // Col 1: Basics
        fill(255, 255, 0); text(`Unit U: ${m.U}`, 20, 145);
        fill(255); text(`State: ${m.state}`, 200, 145);

        // Col 2: Gestures
        fill(200); text("--- RUN (Hip-Rel Knees) ---", 20, 175);
        fill(255); text(`LKnee: ${m.lKnee}  RKnee: ${m.rKnee}`, 20, 195);
        text(`Amp: ${m.diffAmp}  Signs: ${m.signs}`, 20, 215);
        if (m.antiJump) { fill(255, 0, 0); text("ANTI-JUMP ACTIVE", 200, 215); }

        fill(200); text("--- JUMP (Vel) ---", 20, 245);
        fill(255); text(`Vel: ${m.jumpVel}  Thresh: ${m.jumpThresh}`, 20, 265);

        fill(200); text("--- DUCK (Compact/Vel) ---", 260, 175);
        fill(255); text(`Comp: ${m.compRatio}  Thresh: <0.65`, 260, 195);
        text(`Vel: ${m.duckVel}  Thresh: ${m.duckThresh}`, 260, 215);
        if (m.spineTilt) { fill(255, 0, 0); text("SPINE TILT > 60", 260, 235); }

        fill(200); text("--- FLAT (Angle) ---", 260, 245);
        fill(255); text(`Angle: ${m.spineAngle}°  BoxRatio: ${m.boxRatio}`, 260, 265);

        fill(150); text(`CD: R${m.rCD} J${m.jCD} D${m.dCD} F${m.fCD}`, 20, 320);
        text(`Lock: J${m.jLock} D${m.dLock}`, 20, 340);
    }

    fill(0, 0, 0, 180);
    rect(10, 470, 160, 25, 5);
    fill(255);
    textSize(12);
    const stateNames = ["WAITING", "COUNTDOWN", "LOCKED"];
    text("State: " + (stateNames[currentState] || "?"), 20, 475);

    fill(255, 255, 255, 100);
    textSize(10);
    text("Press D to toggle debug", 20, 500);
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
        kneeDiffHistory = [];
        bgX = 0;
        console.log("Player Locked! Reference U:", referenceU);
    }
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

function checkMovement(landmarks) {
    if (referenceU === 0) return;

    const nose = landmarks[0];
    const leftShoulder = landmarks[11], rightShoulder = landmarks[12];
    const leftHip = landmarks[23], rightHip = landmarks[24];
    const leftKnee = landmarks[25], rightKnee = landmarks[26];

    if (!nose || !leftShoulder || !rightShoulder || !leftHip || !rightHip) return;

    const midHipY = (leftHip.y + rightHip.y) / 2;
    const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const midHipX = (leftHip.x + rightHip.x) / 2;
    const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;

    // 0. Update 'U' (Runnning Average)
    const rawU = Math.abs(midHipY - nose.y);
    uHistory.push(rawU);
    if (uHistory.length > U_WINDOW) uHistory.shift();
    currentU = uHistory.reduce((a, b) => a + b, 0) / uHistory.length;

    // --- 1. Lying Flat Detection (Spine Angle) ---
    // Angle 0 = Upright (Vertical), 90 = Flat (Horizontal)
    // dx is x diff, dy is y diff (shoulder to hip)
    const dx = Math.abs(midShoulderX - midHipX);
    const dy = Math.abs(midShoulderY - midHipY);
    const spineAngleRad = Math.atan2(dx, dy);
    const spineAngleDeg = degrees(spineAngleRad);

    // Bounding Box Ratio check (backup)
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (let lm of landmarks) {
        if (lm.x < minX) minX = lm.x;
        if (lm.x > maxX) maxX = lm.x;
        if (lm.y < minY) minY = lm.y;
        if (lm.y > maxY) maxY = lm.y;
    }
    const boxW = maxX - minX;
    const boxH = maxY - minY;
    const boxRatio = boxW / boxH;

    const flatDetected = (spineAngleDeg > 60) || (boxRatio > 1.5);

    if (flatDetected) {
        flatCooldown = FLAT_COOLDOWN_FRAMES;
    } else if (flatCooldown > 0) flatCooldown--;
    isFlat = flatCooldown > 0;

    // --- 2. Run Detection (Hip-Relative Knees) ---
    // Sign changes in relative knee height
    let relKneeL = 0, relKneeR = 0;
    let kneeDataOk = false;
    if (leftKnee && rightKnee && leftKnee.visibility > 0.5 && rightKnee.visibility > 0.5) {
        // Higher value Y is lower on screen. 
        // Relative Height = constant - Y. Positive means "up".
        relKneeL = midHipY - leftKnee.y;  // e.g. Hip 0.6, Knee 0.8 -> Diff -0.2 (Knee below hip)
        // Knee raised: Hip 0.6, Knee 0.5 -> Diff 0.1 (Knee above hip)
        // Actually, let's just use difference between Left/Right relative heights
        // (midHipY - leftKneeY) - (midHipY - rightKneeY) = rightKneeY - leftKneeY
        // So raw Y diff is still equivalent for the *oscillation*, but checking individual knees helps anti-jump

        // Let's stick to the Oscillation Metric: RightKneeY - LeftKneeY
        // If > 0, Right is lower (Y is bigger), Left is higher. 
        const kneeOscillation = rightKnee.y - leftKnee.y;

        kneeDiffHistory.push(kneeOscillation);
        if (kneeDiffHistory.length > RUN_WINDOW) kneeDiffHistory.shift();
        kneeDataOk = true;
    } else {
        // fallback to wrist? nah, focus on knees for milestone 3 logic
        kneeDiffHistory.push(0);
        if (kneeDiffHistory.length > RUN_WINDOW) kneeDiffHistory.shift();
    }

    const signChanges = countSignChanges(kneeDiffHistory, 0.005);
    const diffAmp = kneeDiffHistory.length > 1
        ? Math.max(...kneeDiffHistory) - Math.min(...kneeDiffHistory)
        : 0;

    // Anti-Jump Guard: Are BOTH knees significantly lifted?
    // "Lifted" means y distance from hip is small (knees close to hip)
    // Normalized check: if (midHipY - kneeY) > -0.2 * U ? 
    // Standard standing: Knee is far below hip (large negative). High knees: closer to 0.
    // Let's use: if Knee Y is above (Hip Y + 2*U) ... Wait, Y grows down.
    // HipY is approx 0.5. KneeY approx 0.8. 
    // Run = one knee 0.8, one 0.6.
    // Jump = both knees 0.6? Or just whole body moves up.
    // Actually, "Run" is just detecting the *alternation*. 
    // The "Anti-Jump" logic in doc says: If LeftKneeUp AND RightKneeUp -> Not Run.
    // Let's define "Up" as: KneeY < HipY + 0.35 * U (Closer to hip than standing)
    const kneeThreshold = midHipY + 0.35 * currentU;
    const lKneeUp = leftKnee.y < kneeThreshold;
    const rKneeUp = rightKnee.y < kneeThreshold;
    const bothKneesUp = lKneeUp && rKneeUp;

    const runThresh = 0.02; // Keep raw or make U-based? 0.02 is ~1/50th screen. U is ~1/5th. 
    // So 0.1 * U is approx 0.02.
    const uRunAmp = 0.3 * currentU; // Require reasonable amplitude relative to body size

    const runDetected = signChanges >= MIN_RUN_SIGN_CHANGES && diffAmp > (0.15 * currentU) && !bothKneesUp;

    if (runDetected) runCooldown = RUN_COOLDOWN_FRAMES;
    else if (runCooldown > 0) runCooldown--;
    isRunning = runCooldown > 0;

    // --- 3. Jump Detection (U-Based Velocity) ---
    shoulderYHistory.push(midShoulderY);
    if (shoulderYHistory.length > JUMP_VELOCITY_WINDOW) shoulderYHistory.shift();

    let jumpVelocity = 0;
    if (shoulderYHistory.length === JUMP_VELOCITY_WINDOW) {
        jumpVelocity = shoulderYHistory[0] - shoulderYHistory[shoulderYHistory.length - 1];
    }

    const jumpThresh = 0.08 * currentU; // Scale invariant threshold!
    const jumpDetected = jumpVelocity > jumpThresh && jumpLockout === 0;

    if (jumpDetected) {
        jumpCooldown = JUMP_COOLDOWN_FRAMES;
        noseYHistory = []; // Reset duck history so landing doesn't trigger duck
    } else if (jumpCooldown > 0) {
        jumpCooldown--;
        if (jumpCooldown === 0) duckLockout = OPPOSITE_LOCKOUT_FRAMES;
    }
    if (jumpLockout > 0) jumpLockout--;
    isJumping = jumpCooldown > 0;

    // --- 4. Duck Detection (Compactness + Velocity) ---
    // Compactness: Body Height (Nose to Hip) vs U
    // When standing, BodyHeight = U. When ducking, BodyHeight < 0.7 * U
    const currentBodyH = Math.abs(midHipY - nose.y);
    const compactnessRatio = currentBodyH / currentU;

    // Velocity check (supplementary)
    noseYHistory.push(nose.y);
    if (noseYHistory.length > DUCK_VELOCITY_WINDOW) noseYHistory.shift();
    let duckVelocity = 0;
    if (noseYHistory.length === DUCK_VELOCITY_WINDOW) {
        duckVelocity = noseYHistory[noseYHistory.length - 1] - noseYHistory[0]; // Downward movement = positive Y diff
    }
    const duckVelThresh = 0.06 * currentU;

    // Combine checks: High Downward Vel OR Low Compactness
    // AND Ensure spine is vertical (not Lying Flat)
    const duckDetected = (compactnessRatio < 0.65 || duckVelocity > duckVelThresh)
        && !isFlat && duckLockout === 0 && spineAngleDeg < 45;

    if (duckDetected) {
        duckCooldown = DUCK_COOLDOWN_FRAMES;
        shoulderYHistory = [];
    } else if (duckCooldown > 0) {
        duckCooldown--;
        if (duckCooldown === 0) jumpLockout = OPPOSITE_LOCKOUT_FRAMES;
    }
    if (duckLockout > 0) duckLockout--;
    isDucking = duckCooldown > 0;


    // --- Priority State Machine ---
    if (isFlat) movementState = "FLAT";
    else if (isJumping) movementState = "JUMP";
    else if (isDucking) movementState = "DUCK";
    else if (isRunning) movementState = "RUN";
    else movementState = "IDLE";

    // --- Debug Info ---
    debugInfo.movement = {
        state: movementState,
        U: currentU.toFixed(3),
        jumpVel: jumpVelocity.toFixed(3), jumpThresh: jumpThresh.toFixed(3),
        duckVel: duckVelocity.toFixed(3), duckThresh: duckVelThresh.toFixed(3),
        compRatio: compactnessRatio.toFixed(2),
        spineAngle: Math.round(spineAngleDeg), boxRatio: boxRatio.toFixed(2),
        diffAmp: diffAmp.toFixed(3), signs: signChanges,
        antiJump: bothKneesUp, spineTilt: spineAngleDeg > 60,
        jLock: jumpLockout, dLock: duckLockout,
        rCD: runCooldown, jCD: jumpCooldown, dCD: duckCooldown, fCD: flatCooldown,
        lKnee: (midHipY - leftKnee.y).toFixed(2), rKnee: (midHipY - rightKnee.y).toFixed(2)
    };
}

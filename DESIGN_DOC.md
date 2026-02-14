## Project Title: Beach Run Adventure

**Objective:** A motion-controlled web game for a 4-year-old where physical actions (running, jumping, ducking) control a 2D character on a beach.

---

## 1. Environmental & Technical Context

* **Developer Environment:** Windows machine using **WSL (Ubuntu)**.
* **Deployment Target:** GitHub Pages (Static site).
* **Core Stack:** * **Logic/Rendering:** `p5.js`
* **Computer Vision:** `@mediapipe/tasks-vision` (Pose Landmarker).
* **Communication:** Zero-backend. All processing is client-side via WebGL/WebGPU.


* **Accessibility:** The game must be accessible via `localhost` from the Windows host browser during development.

---

## 2. Core Movement Logic (Normalized Physics)

To ensure the game works for a child at varying distances from the camera, all triggers must use **Normalized Height ()**.

* **Reference Unit (U):** The distance between `Nose` and `Mid-Hip`. Calculated continuously as a 30-frame running average to handle the child moving closer/further.
* **Detection Triggers:**
* **Running:** Triggered by **Alternating Ankle Lift**. Uses ankle position relative to hip to detect high steps. Includes Anti-Jump Guard.
* **Jumping:** Triggered if `Shoulder` -velocity exceeds `0.08 * U` (Rapid upward movement).
* **Ducking:** Triggered if **Compactness Ratio** (`BodyHeight / U`) < 0.65 OR if `Nose` downward velocity is high. Valid only if spine is vertical.
* **Deep Squat:** Triggered if **Leg Compression** (`|Hip.y - Ankle.y| < 0.6 * U`). Used to dodge Rockets. Priority state.



---

## 3. Game Flow & UX

* **Calibration (The Lock-In):**
1. User sees webcam feed.
2. User must **Raise Hand** (Wrist above ear) to initiate.
3. **3-Second Freeze:** A countdown (3, 2, 1) appears. System averages landmarks to set .
4. **Locking:** The system locks onto the person who raised their hand. If they leave the frame, the game pauses and returns to the "Raise Hand" screen.


* **Gameplay:**
* **Duration:** 90-second fixed level.
* **Obstacles:** Seashells (Jump), Seagulls (Duck), and Rockets (Deep Squat).
* **No Game Over:** If an obstacle is hit, play a "Stunned" animation (sparkles/dizzy) and let the player pass.
* **Visual Cues:** Large Up/Down arrows appear 2 seconds before an obstacle hits.
* **Goal:** Reach a large Sandcastle with a red flag.



---

## 4. Implementation Milestones (STOP & ASK FOR FEEDBACK AFTER EACH)

### Milestone 1: Vision Baseline & Calibration

* Setup project structure: `index.html`, `style.css`, `sketch.js`.
* Initialize MediaPipe Pose with the webcam.
* Implement the "Raise Hand" trigger and 3-second "Lock-In" countdown.
* **Success Criteria:** User can lock the session, and a "Player Locked" message appears with  calculated.

### Milestone 2: Gesture Engine (Logic Only)

* Implement the normalized math for Run, Jump, Duck, and Deep Squat.
* Create an on-screen debug UI: three boxes that light up when the corresponding action is detected.
* **Success Criteria:** Robust detection of all three movements at various distances from the camera. "Run" must not accidentally trigger "Jump."

### Milestone 3: The World & Character

* Integrate a 2D character sprite and a scrolling beach background.
* Map "Running" detection to background scroll speed (Binary: run = move, stop = still).
* Add character animations for Jump, Duck, and Squat.
* **Success Criteria:** The character responds fluidly to the physical movements.

### Milestone 4: Level Design & Audio

* Implement the 90-second level sequence with Shells and Seagulls.
* Add the "Stunned" logic and visual arrows for assistance.
* Add audio: "Boing" (jump), "Squawk" (bird), "Marching" (running), and victory music.
* **Success Criteria:** Full 90-second playability from start to Sandcastle victory.

### Milestone 5: Deployment Preparation

* Clean up code for production.
* Ensure the project is ready for GitHub Pages (relative paths, etc.).

---

## 5. Specific Instructions for Agent

* Use `modelComplexity: 1` for MediaPipe to balance accuracy and performance.
* Show a small, semi-transparent "Mirror" of the webcam feed in the corner during gameplay so the child stays centered.
* Always use a local server (e.g., `python3 -m http.server`) for testing and provide the URL.

---

**Asset Appendix** 

To make "Beach Run Adventure" look and sound like a real game, you’ll need a few key assets. Since this is for a 4-year-old, we want **bright, high-contrast, and "cartoonish"** styles.


---

### 1. Visual Assets (The "Beach" Look)

| Asset Name | Description | Recommended Source |
| --- | --- | --- |
| **Parallax Background** | A beach scene split into layers (Sky, Clouds, Sea, Sand) for a scrolling effect. | [CraftPix Beach Backgrounds](https://craftpix.net/freebies/free-beach-2d-game-backgrounds/) |
| **Character Sprite** | A simple boy/girl or animal (like a dinosaur or crab). Needs: `Idle`, `Run`, `Jump`, and `Hit` frames. | [GameArt2D "Cute Girl" or "Dino"](https://www.gameart2d.com/freebies.html) |
| **Obstacles** | A "Seashell" (low), a "Seagull" (high), and a "Rocket" (flying). Static PNGs are fine for now. | [Kenney.nl (Platformer Pack)](https://kenney.nl/assets/platformer-art-deluxe) |
| **Goal Post** | A large Sandcastle with a red flag. | [OpenGameArt](https://opengameart.org/) |
| **UI Arrows** | Large, pulsing green UP and yellow DOWN arrows. | Antigravity can generate these with CSS/p5.js shapes. |

### 2. Audio Assets (The "Feedback")

* **Running:** A rhythmic "Thump-thump" or "Pitter-patter."
* **Jumping:** A classic "Boing!" or "Swoosh."
* **Ducking:** A "Slide whistle" or "Whirr."
* **Obstacle Hit:** A "Dizzy" chime or a soft "Oops!" (Avoid loud/scary sounds).
* **Victory:** A fanfare or "confetti" sound.

**Where to find them:** * **[Kenney Assets](https://kenney.nl/assets):** The "gold standard" for free, public-domain game assets. Look for the "Digital Audio" or "Platformer Art" packs.

* **[Itch.io (Free Section)](https://itch.io/game-assets/free):** Great for unique, hand-drawn beach backgrounds.

---


> **Asset Loading Protocol:**
> 1. Start with colored placeholders (Rectangles for shells, Circles for birds).
> 2. Once Milestone 2 is verified, replace placeholders with assets from the recommended sources.
> 3. Use `p5.loadImage()` in the `preload()` function to handle assets.
> 4. Ensure all assets are stored in an `/assets` folder within the project directory.

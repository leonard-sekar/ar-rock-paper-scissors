let stableGesture = null;
let stableFrames = 0;
let countdownTimer = null;
let gameLocked = false;

let playerScore = 0;
let computerScore = 0;

const videoElement = document.getElementById("video");
const detectedEl = document.getElementById("detected");
const cameraSelect = document.getElementById("cameraSelect");
const resultEl = document.getElementById("result");

const sounds = {
  countdown: new Audio("https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg"),
  win: new Audio("https://actions.google.com/sounds/v1/cartoon/concussive_hit_guitar_boing.ogg"),
  lose: new Audio("https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg"),
  draw: new Audio("https://actions.google.com/sounds/v1/cartoon/pop.ogg")
};

let activeCamera = null;

/* ---------------- GESTURE LOGIC (UNCHANGED) ---------------- */

function getGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return "-";

  const fingerTips = [8, 12, 16, 20];
  const fingerPips = [6, 10, 14, 18];
  let extended = 0;

  for (let i = 0; i < 4; i++) {
    if (landmarks[fingerTips[i]].y < landmarks[fingerPips[i]].y) {
      extended++;
    }
  }

  if (extended === 0) return "Rock";
  if (extended === 2) return "Scissors";
  if (extended >= 4) return "Paper";
  return "-";
}

/* ---------------- GAME LOGIC ---------------- */

function startCountdown(gesture) {
  if (countdownTimer || gameLocked) return;

  let count = 3;
  document.getElementById("countdown").innerText = count;

  countdownTimer = setInterval(() => {
    count--;
    sounds.countdown.play();
    document.getElementById("countdown").innerText = count;

    if (count <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      lockMove(gesture);
    }
  }, 1000);
}

function lockMove(playerMove) {
  gameLocked = true;

  document.getElementById("yourMove").innerText = playerMove;

  const choices = ["Rock", "Paper", "Scissors"];
  const computerMove = choices[Math.floor(Math.random() * choices.length)];
  document.getElementById("computerMove").innerText = computerMove;

  determineWinner(playerMove, computerMove);

  setTimeout(resetRound, 3000);
}

function determineWinner(player, computer) {
  if (player === computer) {
    resultEl.innerText = "Draw 🤝";
    sounds.draw.play();
    return;
  }

  const win =
    (player === "Rock" && computer === "Scissors") ||
    (player === "Paper" && computer === "Rock") ||
    (player === "Scissors" && computer === "Paper");

  if (win) {
    resultEl.innerText = "You Win 🏆";
    playerScore++;
    sounds.win.play();
  } else {
    resultEl.innerText = "You Lose 😢";
    computerScore++;
    sounds.lose.play();
  }

  document.getElementById("playerScore").innerText = playerScore;
  document.getElementById("computerScore").innerText = computerScore;
}

function resetRound() {
  gameLocked = false;
  stableFrames = 0;
  stableGesture = null;

  ["detected", "countdown", "yourMove", "computerMove"].forEach(id => {
    document.getElementById(id).innerText = "-";
  });

  resultEl.innerText = "-";
}

/* ---------------- MEDIAPIPE ---------------- */

const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7,
});

hands.onResults((results) => {
  if (!results.multiHandLandmarks?.length) {
    detectedEl.innerText = "-";
    stableFrames = 0;
    stableGesture = null;
    return;
  }

  const gesture = getGesture(results.multiHandLandmarks[0]);
  detectedEl.innerText = gesture;

  if (gameLocked || gesture === "-") return;

  if (gesture === stableGesture) stableFrames++;
  else {
    stableGesture = gesture;
    stableFrames = 0;
  }

  if (stableFrames === 30) startCountdown(gesture);
});

/* ---------------- CAMERA HANDLING ---------------- */

async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === "videoinput");
}

async function startCamera(deviceId) {
  if (activeCamera) activeCamera.stop();

  activeCamera = new Camera(videoElement, {
    onFrame: async () => {
      await hands.send({ image: videoElement });
    },
    width: 480,
    height: 640,
    deviceId
  });

  activeCamera.start();
}

async function initCameraSelector() {
  const cams = await getCameras();
  cameraSelect.innerHTML = "";

  cams.forEach((cam, i) => {
    const opt = document.createElement("option");
    opt.value = cam.deviceId;
    opt.text = cam.label || `Camera ${i + 1}`;
    cameraSelect.appendChild(opt);
  });

  cameraSelect.value = cams[0].deviceId;
  startCamera(cams[0].deviceId);
}

cameraSelect.addEventListener("change", () => {
  startCamera(cameraSelect.value);
});

/* ---------------- RESTART BUTTON ---------------- */

document.getElementById("restartBtn").addEventListener("click", () => {
  playerScore = 0;
  computerScore = 0;
  document.getElementById("playerScore").innerText = 0;
  document.getElementById("computerScore").innerText = 0;
  resetRound();
});

initCameraSelector();

/* ---------------- FULLSCREEN AR (ADD-ONLY) ---------------- */

document.getElementById("fullscreenBtn").addEventListener("click", () => {
  const el = document.documentElement;

  if (!document.fullscreenElement) {
    el.requestFullscreen?.() ||
    el.webkitRequestFullscreen?.() ||
    el.msRequestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

/* ---------------- MULTIPLAYER (WEBRTC via PeerJS) ---------------- */

let peer = new Peer();
let conn = null;

peer.on("open", id => {
  console.log("Your Multiplayer ID:", id);
  alert("Your Multiplayer ID:\n" + id + "\nShare this with your friend");
});

peer.on("connection", connection => {
  conn = connection;
  setupConnection();
});

function connectToPeer(peerId) {
  conn = peer.connect(peerId);
  setupConnection();
}

function setupConnection() {
  conn.on("data", data => {
    if (data.type === "gesture") {
      document.getElementById("computerMove").innerText = data.gesture;
    }
    if (data.type === "score") {
      document.getElementById("computerScore").innerText = data.score;
    }
  });
}

/* send gesture after lock */
const originalLockMove = lockMove;
lockMove = function (gesture) {
  originalLockMove(gesture);

  if (conn?.open) {
    conn.send({ type: "gesture", gesture });
    conn.send({ type: "score", score: playerScore });
  }
};


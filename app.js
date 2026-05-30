const socket = io();

const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const errorBox = document.getElementById("errorBox");

const roomSection = document.getElementById("roomSection");
const gameSection = document.getElementById("gameSection");
const roomIdText = document.getElementById("roomIdText");
const inviteLink = document.getElementById("inviteLink");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const playersList = document.getElementById("playersList");
const gameTitle = document.getElementById("gameTitle");
const statusText = document.getElementById("statusText");
const gameArea = document.getElementById("gameArea");
const restartBtn = document.getElementById("restartBtn");

let currentRoom = null;
let mySocketId = null;

socket.on("connect", () => {
  mySocketId = socket.id;
});

function getName() {
  return nameInput.value.trim() || "玩家";
}

function showError(msg) {
  errorBox.textContent = msg || "";
}

function renderRoom(room) {
  currentRoom = room;
  roomSection.classList.remove("hidden");
  gameSection.classList.remove("hidden");

  roomIdText.textContent = room.roomId;
  inviteLink.value = `${location.origin}/?room=${room.roomId}`;

  playersList.innerHTML = "";
  room.players.forEach((p, index) => {
    const li = document.createElement("li");
    li.textContent = `${p.name}${p.id === mySocketId ? "（你）" : ""}${index === 0 ? " - 玩家1" : " - 玩家2"}`;
    playersList.appendChild(li);
  });

  renderGame(room);
}

function getMe(room) {
  return room.players.find(p => p.id === mySocketId);
}

function renderGame(room) {
  const game = room.selectedGame;
  const state = room.gameState;
  gameArea.innerHTML = "";

  if (game === "tictactoe") {
    gameTitle.textContent = "井字棋";
    renderTicTacToe(state, room);
  } else if (game === "gomoku") {
    gameTitle.textContent = "五子棋";
    renderGomoku(state, room);
  } else if (game === "rps") {
    gameTitle.textContent = "猜拳";
    renderRPS(state, room);
  }
}

function renderTicTacToe(state, room) {
  const mySymbol = state.symbols?.[mySocketId];
  if (state.winner) {
    statusText.textContent = `胜利方：${state.winner}`;
  } else if (state.draw) {
    statusText.textContent = "平局";
  } else {
    statusText.textContent = `当前回合：${state.currentTurn} ${mySymbol ? `｜你是 ${mySymbol}` : ""}`;
  }

  const board = document.createElement("div");
  board.className = "ttt-board";

  state.board.forEach((cell, index) => {
    const item = document.createElement("button");
    item.className = "ttt-cell";
    item.textContent = cell || "";
    item.onclick = () => {
      socket.emit("tictactoeMove", {
        roomId: room.roomId,
        index
      });
    };
    board.appendChild(item);
  });

  gameArea.appendChild(board);
}

function renderGomoku(state, room) {
  const myColor = state.symbols?.[mySocketId];
  if (state.winner) {
    statusText.textContent = `胜利方：${state.winner}`;
  } else {
    statusText.textContent = `当前回合：${state.currentTurn} ${myColor ? `｜你是 ${myColor}` : ""}`;
  }

  const board = document.createElement("div");
  board.className = "gomoku-board";

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cell = document.createElement("button");
      cell.className = "gomoku-cell";
      cell.onclick = () => {
        socket.emit("gomokuMove", {
          roomId: room.roomId,
          row: r,
          col: c
        });
      };

      const value = state.board[r][c];
      if (value) {
        const piece = document.createElement("div");
        piece.className = `gomoku-piece ${value}`;
        cell.appendChild(piece);
      }

      board.appendChild(cell);
    }
  }

  gameArea.appendChild(board);
}

function renderRPS(state, room) {
  statusText.textContent = "双方选择后自动结算";

  const wrap = document.createElement("div");
  wrap.className = "rps-buttons";

  ["rock", "scissors", "paper"].forEach((pick) => {
    const btn = document.createElement("button");
    btn.textContent =
      pick === "rock" ? "石头" :
      pick === "scissors" ? "剪刀" : "布";
    btn.onclick = () => {
      socket.emit("rpsPick", {
        roomId: room.roomId,
        pick
      });
    };
    wrap.appendChild(btn);
  });

  gameArea.appendChild(wrap);

  if (state.result) {
    const p1 = room.players.find(p => p.id === state.result.p1Id);
    const p2 = room.players.find(p => p.id === state.result.p2Id);

    const resultBox = document.createElement("div");
    resultBox.className = "rps-result";

    let winnerText = "平局";
    if (state.result.winner === "p1") {
      winnerText = `${p1?.name || "玩家1"} 获胜`;
    } else if (state.result.winner === "p2") {
      winnerText = `${p2?.name || "玩家2"} 获胜`;
    }

    resultBox.innerHTML = `
      <p>${p1?.name || "玩家1"}：${toCN(state.result.p1Pick)}</p >
      <p>${p2?.name || "玩家2"}：${toCN(state.result.p2Pick)}</p >
      <p><strong>${winnerText}</strong></p >
    `;

    gameArea.appendChild(resultBox);
  }
}

function toCN(v) {
  if (v === "rock") return "石头";
  if (v === "scissors") return "剪刀";
  if (v === "paper") return "布";
  return v;
}

createRoomBtn.onclick = () => {
  showError("");
  socket.emit("createRoom", { name: getName() });
};

joinRoomBtn.onclick = () => {
  showError("");
  const roomId = roomInput.value.trim().toUpperCase();
  if (!roomId) {
    showError("请输入房间号");
    return;
  }
  socket.emit("joinRoom", {
    roomId,
    name: getName()
  });
};

copyLinkBtn.onclick = async () => {
  try {
    await navigator.clipboard.writeText(inviteLink.value);
    copyLinkBtn.textContent = "已复制";
    setTimeout(() => {
      copyLinkBtn.textContent = "复制";
    }, 1200);
  } catch {
    alert("复制失败，请手动复制");
  }
};

document.querySelectorAll("[data-game]").forEach(btn => {
  btn.onclick = () => {
    if (!currentRoom) return;
    socket.emit("selectGame", {
      roomId: currentRoom.roomId,
      game: btn.dataset.game
    });
  };
});

restartBtn.onclick = () => {
  if (!currentRoom) return;
  socket.emit("restartGame", {
    roomId: currentRoom.roomId
  });
};

socket.on("roomUpdate", (room) => {
  showError("");
  renderRoom(room);
});

socket.on("errorMessage", (msg) => {
  showError(msg);
});

window.addEventListener("load", () => {
  const params = new URLSearchParams(location.search);
  const room = params.get("room");
  if (room) {
    roomInput.value = room.toUpperCase();
  }
});
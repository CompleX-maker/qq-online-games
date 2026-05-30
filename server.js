const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function emptyTicTacToe() {
  return {
    board: Array(9).fill(null),
    currentTurn: "X",
    winner: null,
    draw: false,
    symbols: {}
  };
}

function emptyGomoku() {
  return {
    board: Array.from({ length: 15 }, () => Array(15).fill(null)),
    currentTurn: "black",
    winner: null,
    draw: false,
    symbols: {}
  };
}

function emptyRPS() {
  return {
    picks: {},
    result: null
  };
}

function resetGameState(game) {
  if (game === "tictactoe") return emptyTicTacToe();
  if (game === "gomoku") return emptyGomoku();
  if (game === "rps") return emptyRPS();
  return null;
}

function ensureRoom(roomId) {
  return rooms[roomId];
}

function getPublicRoom(room) {
  return {
    roomId: room.roomId,
    players: room.players,
    selectedGame: room.selectedGame,
    gameState: room.gameState
  };
}

function assignPlayers(room) {
  const ids = room.players.map(p => p.id);

  if (room.selectedGame === "tictactoe") {
    room.gameState.symbols = {};
    if (ids[0]) room.gameState.symbols[ids[0]] = "X";
    if (ids[1]) room.gameState.symbols[ids[1]] = "O";
  }

  if (room.selectedGame === "gomoku") {
    room.gameState.symbols = {};
    if (ids[0]) room.gameState.symbols[ids[0]] = "black";
    if (ids[1]) room.gameState.symbols[ids[1]] = "white";
  }
}

function checkTicTacToeWinner(board) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of wins) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  if (board.every(cell => cell !== null)) return "draw";
  return null;
}

function checkGomokuWinner(board, row, col, color) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];

  for (const [dr, dc] of directions) {
    let count = 1;

    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < 15 && c >= 0 && c < 15 && board[r][c] === color) {
      count++;
      r += dr;
      c += dc;
    }

    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < 15 && c >= 0 && c < 15 && board[r][c] === color) {
      count++;
      r -= dr;
      c -= dc;
    }

    if (count >= 5) return color;
  }

  return null;
}

function judgeRPS(a, b) {
  if (a === b) return "draw";
  if (
    (a === "rock" && b === "scissors") ||
    (a === "scissors" && b === "paper") ||
    (a === "paper" && b === "rock")
  ) return "p1";
  return "p2";
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    const roomId = createRoomId();
    rooms[roomId] = {
      roomId,
      players: [{ id: socket.id, name: name || "玩家1" }],
      selectedGame: "tictactoe",
      gameState: emptyTicTacToe()
    };

    socket.join(roomId);
    assignPlayers(rooms[roomId]);
    socket.emit("roomUpdate", getPublicRoom(rooms[roomId]));
  });

  socket.on("joinRoom", ({ roomId, name }) => {
    const room = ensureRoom(roomId);
    if (!room) {
      socket.emit("errorMessage", "房间不存在");
      return;
    }
    if (room.players.length >= 2) {
      socket.emit("errorMessage", "房间已满");
      return;
    }

    room.players.push({ id: socket.id, name: name || "玩家2" });
    socket.join(roomId);
    assignPlayers(room);
    io.to(roomId).emit("roomUpdate", getPublicRoom(room));
  });

  socket.on("selectGame", ({ roomId, game }) => {
    const room = ensureRoom(roomId);
    if (!room) return;

    room.selectedGame = game;
    room.gameState = resetGameState(game);
    assignPlayers(room);
    io.to(roomId).emit("roomUpdate", getPublicRoom(room));
  });

  socket.on("restartGame", ({ roomId }) => {
    const room = ensureRoom(roomId);
    if (!room) return;

    room.gameState = resetGameState(room.selectedGame);
    assignPlayers(room);
    io.to(roomId).emit("roomUpdate", getPublicRoom(room));
  });

  socket.on("tictactoeMove", ({ roomId, index }) => {
    const room = ensureRoom(roomId);
    if (!room || room.selectedGame !== "tictactoe") return;

    const state = room.gameState;
    const symbol = state.symbols[socket.id];

    if (!symbol) return;
    if (state.winner || state.draw) return;
    if (state.currentTurn !== symbol) return;
    if (state.board[index] !== null) return;

    state.board[index] = symbol;

    const result = checkTicTacToeWinner(state.board);
    if (result === "draw") {
      state.draw = true;
    } else if (result) {
      state.winner = result;
    } else {
      state.currentTurn = state.currentTurn === "X" ? "O" : "X";
    }

    io.to(roomId).emit("roomUpdate", getPublicRoom(room));
  });

  socket.on("gomokuMove", ({ roomId, row, col }) => {
    const room = ensureRoom(roomId);
    if (!room || room.selectedGame !== "gomoku") return;

    const state = room.gameState;
    const color = state.symbols[socket.id];

    if (!color) return;
    if (state.winner || state.draw) return;
    if (state.currentTurn !== color) return;
    if (state.board[row][col] !== null) return;

    state.board[row][col] = color;

    const winner = checkGomokuWinner(state.board, row, col, color);
    if (winner) {
      state.winner = winner;
    } else {
      state.currentTurn = state.currentTurn === "black" ? "white" : "black";
    }

    io.to(roomId).emit("roomUpdate", getPublicRoom(room));
  });

  socket.on("rpsPick", ({ roomId, pick }) => {
    const room = ensureRoom(roomId);
    if (!room || room.selectedGame !== "rps") return;

    const state = room.gameState;
    state.picks[socket.id] = pick;

    if (room.players.length === 2) {
      const p1 = room.players[0]?.id;
      const p2 = room.players[1]?.id;

      if (state.picks[p1] && state.picks[p2]) {
        const result = judgeRPS(state.picks[p1], state.picks[p2]);
        state.result = {
          winner: result,
          p1Pick: state.picks[p1],
          p2Pick: state.picks[p2],
          p1Id: p1,
          p2Id: p2
        };
      }
    }

    io.to(roomId).emit("roomUpdate", getPublicRoom(room));
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const before = room.players.length;
      room.players = room.players.filter(p => p.id !== socket.id);

      if (room.players.length !== before) {
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          assignPlayers(room);
          io.to(roomId).emit("roomUpdate", getPublicRoom(room));
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
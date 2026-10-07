const STORAGE_KEY = "ahkChessState";
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PIECE_SYMBOLS = {
  white: {
    pawn: "♙",
    rook: "♖",
    knight: "♘",
    bishop: "♗",
    queen: "♕",
    king: "♔",
  },
  black: {
    pawn: "♟",
    rook: "♜",
    knight: "♞",
    bishop: "♝",
    queen: "♛",
    king: "♚",
  },
};

class ChessGame {
  constructor() {
    this.board = [];
    this.selected = null;
    this.legalMoves = [];
    this.turn = "white";
    this.moveHistory = [];
    this.captured = { white: [], black: [] };
    this.castling = {
      white: { king: true, queen: true },
      black: { king: true, queen: true },
    };
    this.enPassant = null;
    this.lastMove = null;
    this.pendingPromotion = null;
    this.gameOver = false;
    this.resultText = "";
    this.resultWinner = null;
    this.status = "White to Move";
    this.timers = { white: 600, black: 600 };
    this.lastTick = Date.now();
    this.undoStack = [];
    this.timerHandle = null;

    this.boardEl = null;
    this.statusTextEl = null;
    this.statusDetailEl = null;
    this.moveListEl = null;
    this.whiteCapturedEl = null;
    this.blackCapturedEl = null;
    this.whiteTimerEl = null;
    this.blackTimerEl = null;
    this.promotionModalEl = null;
    this.gameOverModalEl = null;
    this.gameOverTitleEl = null;
    this.gameOverTextEl = null;
    this.continueBtn = null;

    this.bindUI();
    this.initializeGame();
    this.startTimer();
    this.loadGame();
    this.renderAll();
    this.refreshContinueButton();
  }

  bindUI() {
    this.boardEl = document.getElementById("board");
    this.statusTextEl = document.getElementById("statusText");
    this.statusDetailEl = document.getElementById("statusDetail");
    this.moveListEl = document.getElementById("moveList");
    this.whiteCapturedEl = document.getElementById("whiteCaptured");
    this.blackCapturedEl = document.getElementById("blackCaptured");
    this.whiteTimerEl = document.getElementById("whiteTimer");
    this.blackTimerEl = document.getElementById("blackTimer");
    this.promotionModalEl = document.getElementById("promotionModal");
    this.gameOverModalEl = document.getElementById("gameOverModal");
    this.gameOverTitleEl = document.getElementById("gameOverTitle");
    this.gameOverTextEl = document.getElementById("gameOverText");
    this.continueBtn = document.getElementById("continueBtn");

    document.getElementById("newGameBtn").addEventListener("click", () => this.resetGame());
    document.getElementById("modalNewGameBtn").addEventListener("click", () => this.resetGame());
    document.getElementById("modalCloseBtn").addEventListener("click", () => this.hideGameOverModal());
    document.getElementById("undoBtn").addEventListener("click", () => this.undoMove());
    document.getElementById("drawBtn").addEventListener("click", () => this.offerDraw());
    document.getElementById("resignBtn").addEventListener("click", () => this.offerResign());
    this.continueBtn.addEventListener("click", () => this.continueSavedGame());

    document.querySelectorAll(".promotion-piece").forEach((button) => {
      button.addEventListener("click", () => {
        const pieceType = button.dataset.piece;
        if (this.pendingPromotion) {
          this.finalizePromotion(pieceType);
        }
      });
    });
  }

  initializeGame() {
    this.board = this.createBoard();
    this.selected = null;
    this.legalMoves = [];
    this.turn = "white";
    this.moveHistory = [];
    this.captured = { white: [], black: [] };
    this.castling = {
      white: { king: true, queen: true },
      black: { king: true, queen: true },
    };
    this.enPassant = null;
    this.lastMove = null;
    this.pendingPromotion = null;
    this.gameOver = false;
    this.resultText = "";
    this.resultWinner = null;
    this.status = "White to Move";
    this.timers = { white: 600, black: 600 };
    this.lastTick = Date.now();
    this.undoStack = [];
    this.hidePromotionModal();
    this.hideGameOverModal();
    this.renderAll();
  }

  createBoard() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));

    const whiteBackRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
    const blackBackRank = [...whiteBackRank];

    for (let col = 0; col < 8; col += 1) {
      board[0][col] = { type: blackBackRank[col], color: "black" };
      board[1][col] = { type: "pawn", color: "black" };
      board[6][col] = { type: "pawn", color: "white" };
      board[7][col] = { type: whiteBackRank[col], color: "white" };
    }

    return board;
  }

  startTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
    }

    this.timerHandle = setInterval(() => {
      this.updateClock();
    }, 250);
  }

  updateClock() {
    if (this.gameOver) {
      return;
    }

    const now = Date.now();
    const elapsedSeconds = (now - this.lastTick) / 1000;

    if (elapsedSeconds <= 0) {
      return;
    }

    this.lastTick = now;
    this.timers[this.turn] = Math.max(0, this.timers[this.turn] - elapsedSeconds);

    if (this.timers[this.turn] <= 0) {
      this.timers[this.turn] = 0;
      const winnerColor = this.getOpponent(this.turn);
      this.finishGame("TIME OUT", `${this.capitalize(winnerColor)} Wins`, winnerColor, "TIME OUT");
    }

    this.renderTimers();
    this.saveGame();
  }

  continueSavedGame() {
    const data = this.loadGameData();
    if (!data) {
      return;
    }

    this.restoreFromState(data);
    this.hidePromotionModal();
    this.renderAll();
  }

  resetGame() {
    const shouldReset = window.confirm("Start a new game? Current progress will be lost.");
    if (!shouldReset) {
      return;
    }

    this.initializeGame();
    this.saveGame();
    this.refreshContinueButton();
  }

  offerResign() {
    if (this.gameOver) {
      return;
    }

    const confirmed = window.confirm("Are you sure you want to resign?");
    if (!confirmed) {
      return;
    }

    const winner = this.getOpponent(this.turn);
    const winnerText = `${this.capitalize(winner)} Wins`;
    this.finishGame("RESIGN", winnerText, winner, `${this.capitalize(this.turn)} Resigned`);
  }

  offerDraw() {
    if (this.gameOver) {
      return;
    }

    const confirmed = window.confirm("Accept a draw by agreement?");
    if (!confirmed) {
      return;
    }

    this.finishGame("DRAW", "Draw", null, "DRAW");
  }

  finishGame(reason, displayText, winner, titleText = reason) {
    this.gameOver = true;
    this.resultText = displayText;
    this.resultWinner = winner;
    this.status = reason;
    this.selected = null;
    this.legalMoves = [];
    this.showGameOverModal(titleText, displayText);
    this.renderAll();
    this.saveGame();
  }

  showGameOverModal(title, description) {
    this.gameOverTitleEl.textContent = title;
    this.gameOverTextEl.textContent = description;
    this.gameOverModalEl.classList.remove("hidden");
  }

  hideGameOverModal() {
    this.gameOverModalEl.classList.add("hidden");
  }

  showPromotionModal(color, from, to) {
    this.pendingPromotion = { color, from, to };
    const buttons = document.querySelectorAll(".promotion-piece");
    buttons.forEach((button) => {
      const pieceType = button.dataset.piece;
      const symbol = PIECE_SYMBOLS[color][pieceType];
      button.innerHTML = symbol;
      button.setAttribute("aria-label", `Promote to ${pieceType}`);
    });
    this.promotionModalEl.classList.remove("hidden");
  }

  hidePromotionModal() {
    this.pendingPromotion = null;
    this.promotionModalEl.classList.add("hidden");
  }

  finalizePromotion(pieceType) {
    if (!this.pendingPromotion) {
      return;
    }

    const { from, to } = this.pendingPromotion;
    this.hidePromotionModal();
    this.makeMove(from, to, { promotion: pieceType });
  }

  renderAll() {
    this.renderBoard();
    this.renderStatus();
    this.renderMoveHistory();
    this.renderCapturedPieces();
    this.renderTimers();
    this.renderPlayerPanelHighlights();
  }

  renderBoard() {
    this.boardEl.innerHTML = "";

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const square = document.createElement("button");
        const squareColor = (row + col) % 2 === 0 ? "light" : "dark";
        const piece = this.board[row][col];
        const isSelected = this.selected && this.selected.row === row && this.selected.col === col;
        const isLastMove = this.lastMove && this.lastMove.from.row === row && this.lastMove.from.col === col
          || this.lastMove && this.lastMove.to.row === row && this.lastMove.to.col === col;
        const isLegal = this.legalMoves.some((move) => move.row === row && move.col === col);
        const isCapture = isLegal && piece && piece.color !== this.turn;
        const isCheck = this.isKingInCheck(this.board, this.turn) && this.findKingSquare(this.board, this.turn).row === row && this.findKingSquare(this.board, this.turn).col === col;

        square.type = "button";
        square.className = `square ${squareColor}`;
        if (isSelected) square.classList.add("selected");
        if (isLastMove) square.classList.add("last-move");
        if (isLegal && piece) square.classList.add("capture");
        else if (isLegal) square.classList.add("legal");
        if (isCheck) square.classList.add("check");
        square.dataset.row = String(row);
        square.dataset.col = String(col);
        square.setAttribute("role", "gridcell");
        square.setAttribute("aria-label", this.getSquareLabel(row, col, piece));

        if (piece) {
          const pieceEl = document.createElement("span");
          pieceEl.className = `piece ${piece.color}`;
          pieceEl.textContent = PIECE_SYMBOLS[piece.color][piece.type];
          square.appendChild(pieceEl);
        }

        if (col === 0) {
          const rankLabel = document.createElement("span");
          rankLabel.className = "coord coord-rank";
          rankLabel.textContent = String(8 - row);
          square.appendChild(rankLabel);
        }

        if (row === 7) {
          const fileLabel = document.createElement("span");
          fileLabel.className = "coord coord-file";
          fileLabel.textContent = FILES[col];
          square.appendChild(fileLabel);
        }

        square.addEventListener("click", () => {
          this.handleSquareClick(row, col);
        });

        this.boardEl.appendChild(square);
      }
    }
  }

  getSquareLabel(row, col, piece) {
    const file = FILES[col];
    const rank = 8 - row;
    let label = `${file}${rank}`;
    if (piece) {
      label += ` ${piece.color} ${piece.type}`;
    } else {
      label += " empty";
    }
    return label;
  }

  handleSquareClick(row, col) {
    if (this.gameOver || this.pendingPromotion) {
      return;
    }

    const clickedPiece = this.board[row][col];

    if (this.selected) {
      const selectedPiece = this.board[this.selected.row][this.selected.col];

      if (clickedPiece && clickedPiece.color === this.turn && !(this.selected.row === row && this.selected.col === col)) {
        this.selectPiece(row, col);
        return;
      }

      const targetMove = this.legalMoves.find((move) => move.row === row && move.col === col);
      if (targetMove && selectedPiece) {
        if (selectedPiece.type === "pawn" && (row === 0 || row === 7)) {
          const from = { row: this.selected.row, col: this.selected.col };
          const to = { row, col };
          this.showPromotionModal(selectedPiece.color, from, to);
          return;
        }

        this.makeMove({ row: this.selected.row, col: this.selected.col }, { row, col }, targetMove);
        return;
      }

      this.selected = null;
      this.legalMoves = [];
      this.renderBoard();
      return;
    }

    if (clickedPiece && clickedPiece.color === this.turn) {
      this.selectPiece(row, col);
    }
  }

  selectPiece(row, col) {
    this.selected = { row, col };
    this.legalMoves = this.getLegalMoves(row, col);
    this.renderBoard();
  }

  getLegalMoves(row, col) {
    const piece = this.board[row][col];
    if (!piece || piece.color !== this.turn) {
      return [];
    }

    const pseudoMoves = this.getPseudoMoves(row, col, piece);
    return pseudoMoves.filter((move) => this.isValidMove({ row, col }, { row: move.row, col: move.col }, move));
  }

  getPseudoMoves(row, col, piece) {
    const moves = [];
    const opponent = this.getOpponent(piece.color);

    if (piece.type === "pawn") {
      const direction = piece.color === "white" ? -1 : 1;
      const startRow = piece.color === "white" ? 6 : 1;
      const nextRow = row + direction;

      if (this.isInsideBoard(nextRow, col) && !this.board[nextRow][col]) {
        moves.push({ row: nextRow, col, capture: false, promotion: nextRow === 0 || nextRow === 7 });
        const twoStepRow = row + direction * 2;
        if (row === startRow && !this.board[twoStepRow][col]) {
          moves.push({ row: twoStepRow, col, capture: false, doubleStep: true });
        }
      }

      for (const deltaCol of [-1, 1]) {
        const nextCol = col + deltaCol;
        const enemy = this.board[row + direction]?.[nextCol];
        if (this.isInsideBoard(row + direction, nextCol) && enemy && enemy.color !== piece.color) {
          moves.push({ row: row + direction, col: nextCol, capture: true, promotion: row + direction === 0 || row + direction === 7 });
        }

        if (this.enPassant && this.enPassant.row === row + direction && this.enPassant.col === nextCol && !this.board[row + direction][nextCol]) {
          moves.push({ row: row + direction, col: nextCol, capture: true, enPassant: true });
        }
      }
    }

    if (piece.type === "rook" || piece.type === "bishop" || piece.type === "queen") {
      const directions = [];
      if (piece.type === "rook" || piece.type === "queen") {
        directions.push(...[
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]);
      }
      if (piece.type === "bishop" || piece.type === "queen") {
        directions.push(...[
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]);
      }

      for (const [deltaRow, deltaCol] of directions) {
        let r = row + deltaRow;
        let c = col + deltaCol;
        while (this.isInsideBoard(r, c)) {
          const occupant = this.board[r][c];
          if (!occupant) {
            moves.push({ row: r, col: c, capture: false });
          } else {
            if (occupant.color !== piece.color) {
              moves.push({ row: r, col: c, capture: true });
            }
            break;
          }
          r += deltaRow;
          c += deltaCol;
        }
      }
    }

    if (piece.type === "knight") {
      const offsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ];
      for (const [dRow, dCol] of offsets) {
        const r = row + dRow;
        const c = col + dCol;
        if (!this.isInsideBoard(r, c)) continue;
        const occupant = this.board[r][c];
        if (!occupant || occupant.color !== piece.color) {
          moves.push({ row: r, col: c, capture: !!occupant });
        }
      }
    }

    if (piece.type === "king") {
      for (let dRow = -1; dRow <= 1; dRow += 1) {
        for (let dCol = -1; dCol <= 1; dCol += 1) {
          if (dRow === 0 && dCol === 0) continue;
          const r = row + dRow;
          const c = col + dCol;
          if (!this.isInsideBoard(r, c)) continue;
          const occupant = this.board[r][c];
          if (!occupant || occupant.color !== piece.color) {
            moves.push({ row: r, col: c, capture: !!occupant });
          }
        }
      }

      const startRow = piece.color === "white" ? 7 : 0;
      const rights = this.castling[piece.color];
      if (row === startRow && col === 4) {
        const kingSideRook = this.board[startRow][7];
        const queenSideRook = this.board[startRow][0];

        if (rights.king && kingSideRook && kingSideRook.type === "rook" && kingSideRook.color === piece.color && !this.board[startRow][5] && !this.board[startRow][6]) {
          if (!this.isSquareUnderAttack(this.board, startRow, 4, opponent) && !this.isSquareUnderAttack(this.board, startRow, 5, opponent) && !this.isSquareUnderAttack(this.board, startRow, 6, opponent)) {
            moves.push({ row: startRow, col: 6, castling: "king", capture: false });
          }
        }

        if (rights.queen && queenSideRook && queenSideRook.type === "rook" && queenSideRook.color === piece.color && !this.board[startRow][1] && !this.board[startRow][2] && !this.board[startRow][3]) {
          if (!this.isSquareUnderAttack(this.board, startRow, 4, opponent) && !this.isSquareUnderAttack(this.board, startRow, 3, opponent) && !this.isSquareUnderAttack(this.board, startRow, 2, opponent)) {
            moves.push({ row: startRow, col: 2, castling: "queen", capture: false });
          }
        }
      }
    }

    return moves;
  }

  isValidMove(from, to, moveDetails = {}) {
    const piece = this.board[from.row][from.col];
    if (!piece) return false;

    const candidateBoard = this.cloneBoard(this.board);
    const movingPiece = { ...candidateBoard[from.row][from.col] };
    const destinationPiece = candidateBoard[to.row][to.col];

    if (movingPiece.type === "pawn" && !destinationPiece && from.col !== to.col) {
      candidateBoard[from.row][to.col] = null;
    }

    candidateBoard[to.row][to.col] = movingPiece;
    candidateBoard[from.row][from.col] = null;

    if (movingPiece.type === "king" && Math.abs(to.col - from.col) === 2) {
      const rookFromCol = to.col > from.col ? 7 : 0;
      const rookToCol = to.col > from.col ? 5 : 3;
      const rook = candidateBoard[from.row][rookFromCol];
      if (rook) {
        candidateBoard[from.row][rookToCol] = rook;
        candidateBoard[from.row][rookFromCol] = null;
      }
    }

    if (movingPiece.type === "pawn" && (to.row === 0 || to.row === 7)) {
      candidateBoard[to.row][to.col] = { type: "queen", color: movingPiece.color };
    }

    const kingSquare = this.findKingSquare(candidateBoard, piece.color);
    return kingSquare && !this.isSquareUnderAttack(candidateBoard, kingSquare.row, kingSquare.col, this.getOpponent(piece.color));
  }

  makeMove(from, to, moveDetails = {}) {
    if (this.gameOver) {
      return;
    }

    const piece = this.board[from.row][from.col];
    if (!piece || piece.color !== this.turn) {
      return;
    }

    const legalTarget = this.legalMoves.find((move) => move.row === to.row && move.col === to.col);
    if (!legalTarget && !moveDetails.promotion) {
      const currentLegal = this.getLegalMoves(from.row, from.col);
      const fallback = currentLegal.find((move) => move.row === to.row && move.col === to.col);
      if (!fallback) {
        return;
      }
    }

    this.undoStack.push(this.createSnapshot());

    const targetPiece = this.board[to.row][to.col];
    const movingPiece = this.board[from.row][from.col];

    if (movingPiece.type === "pawn" && !targetPiece && from.col !== to.col) {
      const capturedPawnRow = from.row;
      const capturedPawnCol = to.col;
      const capturedPiece = this.board[capturedPawnRow][capturedPawnCol];
      if (capturedPiece && capturedPiece.type === "pawn") {
        this.captured[movingPiece.color].push(capturedPiece);
      }
      this.board[capturedPawnRow][capturedPawnCol] = null;
    }

    if (targetPiece) {
      this.captured[movingPiece.color].push(targetPiece);
    }

    if (movingPiece.type === "pawn" && Math.abs(to.row - from.row) === 2) {
      this.enPassant = { row: (from.row + to.row) / 2, col: from.col };
    } else {
      this.enPassant = null;
    }

    this.board[to.row][to.col] = { ...movingPiece };
    this.board[from.row][from.col] = null;

    if (movingPiece.type === "king" && Math.abs(to.col - from.col) === 2) {
      const rookCol = to.col > from.col ? 7 : 0;
      const targetRookCol = to.col > from.col ? 5 : 3;
      const rook = this.board[from.row][rookCol];
      if (rook) {
        this.board[from.row][targetRookCol] = { ...rook };
        this.board[from.row][rookCol] = null;
      }
    }

    if (movingPiece.type === "pawn" && (to.row === 0 || to.row === 7)) {
      const promotionPiece = moveDetails.promotion || "queen";
      this.board[to.row][to.col] = { type: promotionPiece, color: movingPiece.color };
    }

    this.updateCastlingRights(from, to, movingPiece, targetPiece);
    this.lastMove = { from: { ...from }, to: { ...to } };
    const notation = this.buildMoveNotation(from, to, movingPiece, targetPiece, moveDetails, legalTarget);
    this.moveHistory.push(notation);

    this.turn = this.getOpponent(this.turn);
    const active = this.turn;
    this.lastTick = Date.now();
    this.status = active === "white" ? "White to Move" : "Black to Move";
    this.selected = null;
    this.legalMoves = [];

    if (this.isKingInCheck(this.board, active)) {
      const opponentLegalMoves = this.getAllLegalMovesForColor(active);
      if (opponentLegalMoves.length === 0) {
        const winner = this.getOpponent(active);
        this.finishGame("CHECKMATE", `${this.capitalize(winner)} Wins`, winner, "CHECKMATE");
        return;
      }
      this.status = "CHECK";
    } else {
      const legalMovesForActive = this.getAllLegalMovesForColor(active);
      if (legalMovesForActive.length === 0) {
        this.finishGame("STALEMATE", "Draw", null, "STALEMATE");
        return;
      }
    }

    this.renderAll();
    this.saveGame();
  }

  buildMoveNotation(from, to, movingPiece, targetPiece, moveDetails, legalTarget) {
    const file = FILES[from.col];
    const targetFile = FILES[to.col];
    const targetRank = 8 - to.row;

    let notation = "";
    if (movingPiece.type === "pawn") {
      if (targetPiece || moveDetails.enPassant || (from.col !== to.col && !targetPiece)) {
        notation = `${file}x${targetFile}${targetRank}`;
      } else {
        notation = `${targetFile}${targetRank}`;
      }
    } else {
      const symbolMap = {
        knight: "N",
        bishop: "B",
        rook: "R",
        queen: "Q",
        king: "K",
      };
      notation = symbolMap[movingPiece.type];
      if (targetPiece || (movingPiece.type === "pawn" && from.col !== to.col)) {
        notation += from.col !== to.col ? `${file}x` : "x";
      }
      notation += `${targetFile}${targetRank}`;
    }

    if (movingPiece.type === "king" && Math.abs(to.col - from.col) === 2) {
      notation = to.col === 6 ? "O-O" : "O-O-O";
    }

    if (moveDetails.promotion) {
      notation += `=${moveDetails.promotion.charAt(0).toUpperCase()}`;
    }

    return notation;
  }

  updateCastlingRights(from, to, movingPiece, capturedPiece) {
    const color = movingPiece.color;

    if (movingPiece.type === "king") {
      this.castling[color].king = false;
      this.castling[color].queen = false;
    }

    if (movingPiece.type === "rook") {
      if (from.row === 7 && from.col === 0 && color === "white") this.castling.white.queen = false;
      if (from.row === 7 && from.col === 7 && color === "white") this.castling.white.king = false;
      if (from.row === 0 && from.col === 0 && color === "black") this.castling.black.queen = false;
      if (from.row === 0 && from.col === 7 && color === "black") this.castling.black.king = false;
    }

    if (capturedPiece && capturedPiece.type === "rook") {
      const captureRow = to.row;
      const captureCol = to.col;
      if (captureRow === 7 && captureCol === 0) this.castling.white.queen = false;
      if (captureRow === 7 && captureCol === 7) this.castling.white.king = false;
      if (captureRow === 0 && captureCol === 0) this.castling.black.queen = false;
      if (captureRow === 0 && captureCol === 7) this.castling.black.king = false;
    }
  }

  renderPlayerPanelHighlights() {
    const players = document.querySelectorAll(".player-panel");
    players.forEach((panel) => {
      const playerColor = panel.dataset.player;
      panel.classList.toggle("active", this.turn === playerColor);
    });
  }

  renderStatus() {
    const activeColor = this.turn;
    const enemyColor = this.getOpponent(activeColor);
    const inCheck = this.isKingInCheck(this.board, activeColor);
    const statusBox = document.querySelector(".status-box");

    if (this.gameOver) {
      statusBox.classList.toggle("check", this.resultText === "CHECKMATE" || this.resultText === "TIME OUT");
      this.statusTextEl.textContent = this.status || "White to Move";
      this.statusDetailEl.textContent = this.resultText || "";
      return;
    }

    statusBox.classList.toggle("check", inCheck);
    this.statusTextEl.textContent = inCheck ? "CHECK" : (activeColor === "white" ? "White to Move" : "Black to Move");
    this.statusDetailEl.textContent = inCheck ? `${this.capitalize(activeColor)} king is in check` : "";
  }

  renderMoveHistory() {
    this.moveListEl.innerHTML = "";

    const groupedMoves = [];
    for (let index = 0; index < this.moveHistory.length; index += 2) {
      const whiteMove = this.moveHistory[index];
      const blackMove = this.moveHistory[index + 1] || "";
      groupedMoves.push({ number: Math.floor(index / 2) + 1, white: whiteMove, black: blackMove });
    }

    groupedMoves.forEach((entry) => {
      const item = document.createElement("li");
      const isLatest = entry.number === Math.ceil(this.moveHistory.length / 2);
      if (isLatest) item.classList.add("latest");

      item.innerHTML = `
        <span class="move-number">${entry.number}.</span>
        <span class="history-white">${entry.white || ""}</span>
        <span class="history-black">${entry.black || ""}</span>
      `;
      this.moveListEl.appendChild(item);
    });
  }

  renderCapturedPieces() {
    this.whiteCapturedEl.innerHTML = this.captured.white.map((piece) => PIECE_SYMBOLS.black[piece.type]).join(" ");
    this.blackCapturedEl.innerHTML = this.captured.black.map((piece) => PIECE_SYMBOLS.white[piece.type]).join(" ");
  }

  renderTimers() {
    this.whiteTimerEl.textContent = this.formatClock(this.timers.white);
    this.blackTimerEl.textContent = this.formatClock(this.timers.black);
  }

  formatClock(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  isSquareUnderAttack(board, row, col, byColor) {
    const attackerDirections = {
      pawn: byColor === "white" ? -1 : 1,
    };

    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const piece = board[r][c];
        if (!piece || piece.color !== byColor) continue;

        const deltaRow = row - r;
        const deltaCol = col - c;

        if (piece.type === "pawn") {
          const direction = byColor === "white" ? -1 : 1;
          const attackRows = [direction];
          const attackCols = [-1, 1];
          if (r + direction === row && (c + 1 === col || c - 1 === col)) {
            return true;
          }
          continue;
        }

        if (piece.type === "knight") {
          const knightMoves = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1],
          ];
          if (knightMoves.some(([dr, dc]) => r + dr === row && c + dc === col)) {
            return true;
          }
          continue;
        }

        if (piece.type === "king") {
          if (Math.abs(row - r) <= 1 && Math.abs(col - c) <= 1 && !(row === r && col === c)) {
            return true;
          }
          continue;
        }

        if (piece.type === "bishop" || piece.type === "queen") {
          if (Math.abs(deltaRow) === Math.abs(deltaCol) && deltaRow !== 0) {
            let rr = r + Math.sign(deltaRow);
            let cc = c + Math.sign(deltaCol);
            let clear = true;
            while (rr !== row || cc !== col) {
              if (board[rr][cc]) clear = false;
              rr += Math.sign(deltaRow);
              cc += Math.sign(deltaCol);
            }
            if (clear) return true;
          }
        }

        if (piece.type === "rook" || piece.type === "queen") {
          if (deltaRow === 0 || deltaCol === 0) {
            const stepRow = Math.sign(deltaRow);
            const stepCol = Math.sign(deltaCol);
            let rr = r + stepRow;
            let cc = c + stepCol;
            let clear = true;
            while (rr !== row || cc !== col) {
              if (board[rr][cc]) clear = false;
              rr += stepRow;
              cc += stepCol;
            }
            if (clear) return true;
          }
        }
      }
    }

    return false;
  }

  findKingSquare(board, color) {
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = board[row][col];
        if (piece && piece.type === "king" && piece.color === color) {
          return { row, col };
        }
      }
    }
    return null;
  }

  isKingInCheck(board, color) {
    const kingSquare = this.findKingSquare(board, color);
    if (!kingSquare) {
      return false;
    }

    return this.isSquareUnderAttack(board, kingSquare.row, kingSquare.col, this.getOpponent(color));
  }

  getAllLegalMovesForColor(color) {
    const moves = [];
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = this.board[row][col];
        if (!piece || piece.color !== color) continue;
        const legalMoves = this.getPseudoMoves(row, col, piece).filter((move) => this.isValidMove({ row, col }, { row: move.row, col: move.col }, move));
        legalMoves.forEach((move) => moves.push({ from: { row, col }, to: { row: move.row, col: move.col }, ...move }));
      }
    }
    return moves;
  }

  isCheckmate() {
    return this.gameOver && this.status === "CHECKMATE";
  }

  isStalemate() {
    return this.gameOver && this.status === "STALEMATE";
  }

  isInsideBoard(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  getOpponent(color) {
    return color === "white" ? "black" : "white";
  }

  capitalize(color) {
    return color.charAt(0).toUpperCase() + color.slice(1);
  }

  cloneBoard(board) {
    return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
  }

  createSnapshot() {
    return {
      board: this.cloneBoard(this.board),
      turn: this.turn,
      moveHistory: this.moveHistory.slice(),
      captured: {
        white: this.captured.white.slice(),
        black: this.captured.black.slice(),
      },
      castling: {
        white: { ...this.castling.white },
        black: { ...this.castling.black },
      },
      enPassant: this.enPassant ? { ...this.enPassant } : null,
      lastMove: this.lastMove ? { ...this.lastMove, from: { ...this.lastMove.from }, to: { ...this.lastMove.to } } : null,
      gameOver: this.gameOver,
      resultText: this.resultText,
      resultWinner: this.resultWinner,
      status: this.status,
      timers: { ...this.timers },
      lastTick: this.lastTick,
    };
  }

  undoMove() {
    if (this.gameOver || this.undoStack.length === 0) {
      return;
    }

    const previousState = this.undoStack.pop();
    if (!previousState) {
      return;
    }

    this.board = this.cloneBoard(previousState.board);
    this.turn = previousState.turn;
    this.moveHistory = previousState.moveHistory.slice();
    this.captured = {
      white: previousState.captured.white.slice(),
      black: previousState.captured.black.slice(),
    };
    this.castling = {
      white: { ...previousState.castling.white },
      black: { ...previousState.castling.black },
    };
    this.enPassant = previousState.enPassant ? { ...previousState.enPassant } : null;
    this.lastMove = previousState.lastMove ? { ...previousState.lastMove, from: { ...previousState.lastMove.from }, to: { ...previousState.lastMove.to } } : null;
    this.gameOver = previousState.gameOver;
    this.resultText = previousState.resultText;
    this.resultWinner = previousState.resultWinner;
    this.status = previousState.status;
    this.timers = { ...previousState.timers };
    this.lastTick = previousState.lastTick || Date.now();
    this.pendingPromotion = null;
    this.hidePromotionModal();
    this.hideGameOverModal();
    this.selected = null;
    this.legalMoves = [];
    this.renderAll();
    this.saveGame();
  }

  saveGame() {
    const payload = {
      board: this.board,
      turn: this.turn,
      moveHistory: this.moveHistory,
      captured: this.captured,
      castling: this.castling,
      enPassant: this.enPassant,
      lastMove: this.lastMove,
      gameOver: this.gameOver,
      resultText: this.resultText,
      resultWinner: this.resultWinner,
      status: this.status,
      timers: this.timers,
      lastTick: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    this.refreshContinueButton();
  }

  loadGameData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error("Failed to parse stored chess game.", error);
      return null;
    }
  }

  loadGame() {
    const data = this.loadGameData();
    if (!data) {
      this.initializeGame();
      return;
    }

    this.restoreFromState(data);
  }

  restoreFromState(data) {
    const safeBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = data.board?.[row]?.[col];
        safeBoard[row][col] = piece ? { ...piece } : null;
      }
    }

    this.board = safeBoard;
    this.turn = data.turn || "white";
    this.moveHistory = Array.isArray(data.moveHistory) ? data.moveHistory.slice() : [];
    this.captured = data.captured || { white: [], black: [] };
    this.castling = data.castling || {
      white: { king: true, queen: true },
      black: { king: true, queen: true },
    };
    this.enPassant = data.enPassant ? { ...data.enPassant } : null;
    this.lastMove = data.lastMove ? { ...data.lastMove, from: { ...data.lastMove.from }, to: { ...data.lastMove.to } } : null;
    this.gameOver = !!data.gameOver;
    this.resultText = data.resultText || "";
    this.resultWinner = data.resultWinner || null;
    this.status = data.status || "White to Move";
    this.timers = data.timers || { white: 600, black: 600 };
    this.lastTick = Date.now();

    const elapsed = (Date.now() - (data.lastTick || Date.now())) / 1000;
    if (!this.gameOver) {
      const active = this.turn;
      this.timers[active] = Math.max(0, this.timers[active] - elapsed);
    }

    this.selected = null;
    this.legalMoves = [];
    this.pendingPromotion = null;
    this.hidePromotionModal();
    this.hideGameOverModal();
    if (this.gameOver) {
      this.showGameOverModal(this.status, this.resultText);
    }
    this.renderAll();
  }

  refreshContinueButton() {
    if (localStorage.getItem(STORAGE_KEY)) {
      const payload = this.loadGameData();
      const hasSavedData = !!payload && !payload.gameOver;
      this.continueBtn.style.display = hasSavedData ? "inline-flex" : "none";
    } else {
      this.continueBtn.style.display = "none";
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const chessGame = new ChessGame();
  window.chessGame = chessGame;
});

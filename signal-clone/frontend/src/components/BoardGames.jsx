import React, { useCallback, useEffect, useMemo, useState } from 'react';

const PIECES = {
    r: '♜', n: '♞', b: '♝', q: '♛', k: '♚', p: '♟',
    R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔', P: '♙',
};

export const createChessBoard = () => [
    ...'rnbqkbnr', ...'pppppppp', ...Array(32).fill(null), ...'PPPPPPPP', ...'RNBQKBNR',
];
const isWhite = piece => Boolean(piece && piece === piece.toUpperCase());
const sameSide = (a, b) => Boolean(a && b && isWhite(a) === isWhite(b));
const row = index => Math.floor(index / 8);
const col = index => index % 8;
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

export const chessMoves = (board, from) => {
    if (!Array.isArray(board) || board.length !== 64 || !board[from]) return [];
    const piece = board[from];
    const lower = piece.toLowerCase();
    const white = isWhite(piece);
    const moves = [];
    const add = (r, c) => {
        if (!inside(r, c)) return false;
        const at = r * 8 + c;
        if (!board[at]) { moves.push(at); return true; }
        if (!sameSide(piece, board[at])) moves.push(at);
        return false;
    };
    if (lower === 'p') {
        const direction = white ? -1 : 1;
        const start = white ? 6 : 1;
        const one = (row(from) + direction) * 8 + col(from);
        if (inside(row(from) + direction, col(from)) && !board[one]) {
            moves.push(one);
            const two = (row(from) + direction * 2) * 8 + col(from);
            if (row(from) === start && !board[two]) moves.push(two);
        }
        [-1, 1].forEach(offset => {
            const r = row(from) + direction;
            const c = col(from) + offset;
            if (inside(r, c) && board[r * 8 + c] && !sameSide(piece, board[r * 8 + c])) moves.push(r * 8 + c);
        });
    } else if (lower === 'n') {
        [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => add(row(from) + dr, col(from) + dc));
    } else if (lower === 'k') {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) add(row(from) + dr, col(from) + dc);
    } else {
        const directions = lower === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]]
            : lower === 'r' ? [[-1,0],[1,0],[0,-1],[0,1]]
                : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
        directions.forEach(([dr, dc]) => {
            let r = row(from) + dr; let c = col(from) + dc;
            while (inside(r, c) && add(r, c)) { r += dr; c += dc; }
        });
    }
    return moves;
};

export const applyChessMove = (board, from, to) => {
    if (!chessMoves(board, from).includes(to)) return null;
    const next = [...board];
    next[to] = next[from]; next[from] = null;
    if (next[to] === 'P' && row(to) === 0) next[to] = 'Q';
    if (next[to] === 'p' && row(to) === 7) next[to] = 'q';
    return next;
};

const gameResult = board => {
    if (!board.includes('K')) return 'Black wins';
    if (!board.includes('k')) return 'White wins';
    return null;
};

const useLiveState = ({ socket, chatId, gameCode, enabled, initialState, validator }) => {
    const [state, setState] = useState(initialState);
    useEffect(() => {
        if (!enabled || !socket) return undefined;
        const receive = data => {
            if (data?.gameCode === gameCode && data?.gameState && validator(data.gameState)) setState(data.gameState);
        };
        socket.on('game_move_received', receive);
        return () => socket.off('game_move_received', receive);
    }, [enabled, socket, gameCode, validator]);
    const update = useCallback(next => {
        setState(next);
        if (enabled && socket) socket.emit('game_move', { chatId, gameCode, gameState: next });
    }, [enabled, socket, chatId, gameCode]);
    return [state, update];
};

const validChess = state => Array.isArray(state?.board) && state.board.length === 64
    && state.board.every(piece => piece === null || Object.hasOwn(PIECES, piece))
    && ['white', 'black'].includes(state.turn);

export const ChessGame = ({ gameCode, gameMode, creatorId, currentUserId, socket, chatId }) => {
    const multiplayer = gameMode === 'vs-friend';
    const initial = useMemo(() => ({ board: createChessBoard(), turn: 'white', lastMove: null }), []);
    const [state, setState] = useLiveState({ socket, chatId, gameCode, enabled: multiplayer, initialState: initial, validator: validChess });
    const [selected, setSelected] = useState(null);
    const myColor = multiplayer ? (String(creatorId) === String(currentUserId) ? 'white' : 'black') : 'white';
    const legal = selected === null ? [] : chessMoves(state.board, selected);
    const result = gameResult(state.board);

    const computerMove = nextState => {
        const choices = [];
        nextState.board.forEach((piece, from) => {
            if (piece && !isWhite(piece)) chessMoves(nextState.board, from).forEach(to => choices.push({ from, to, value: nextState.board[to] ? 'pnbrqk'.indexOf(nextState.board[to].toLowerCase()) + 1 : 0 }));
        });
        if (!choices.length) return;
        const best = Math.max(...choices.map(move => move.value));
        const pool = choices.filter(move => move.value === best);
        const move = pool[Math.floor(Math.random() * pool.length)];
        const board = applyChessMove(nextState.board, move.from, move.to);
        window.setTimeout(() => setState({ board, turn: 'white', lastMove: [move.from, move.to] }), 450);
    };

    const selectSquare = index => {
        if (result || state.turn !== myColor) return;
        const piece = state.board[index];
        if (selected === null) {
            if (piece && isWhite(piece) === (state.turn === 'white')) setSelected(index);
            return;
        }
        if (piece && sameSide(state.board[selected], piece)) { setSelected(index); return; }
        const board = applyChessMove(state.board, selected, index);
        setSelected(null);
        if (!board) return;
        const next = { board, turn: state.turn === 'white' ? 'black' : 'white', lastMove: [selected, index] };
        setState(next);
        if (!multiplayer && !gameResult(board)) computerMove(next);
    };

    const reset = () => { setSelected(null); setState({ board: createChessBoard(), turn: 'white', lastMove: null }); };
    return <div className="w-full max-w-xl text-white">
        <GameHeader icon="♟️" mode={gameMode} code={gameCode} detail={multiplayer ? `You are ${myColor}` : 'You are White'} />
        <div className="my-3 flex items-center justify-between rounded-xl bg-white/5 px-4 py-2 text-sm">
            <span>{result || `${state.turn === 'white' ? 'White' : 'Black'} to move`}</span>
            <button onClick={reset} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20">New game</button>
        </div>
        <div className="mx-auto grid w-full max-w-[520px] grid-cols-8 overflow-hidden rounded-xl border-4 border-amber-900 shadow-2xl">
            {state.board.map((piece, index) => <button key={index} onClick={() => selectSquare(index)}
                aria-label={`${String.fromCharCode(97 + col(index))}${8 - row(index)} ${piece || 'empty'}`}
                className={`aspect-square text-[clamp(1.55rem,7vw,3.2rem)] leading-none ${(row(index) + col(index)) % 2 ? 'bg-emerald-800' : 'bg-amber-100'} ${selected === index ? 'ring-4 ring-inset ring-yellow-400' : ''} ${legal.includes(index) ? 'after:block after:h-3 after:w-3 after:rounded-full after:bg-yellow-400/80' : ''} ${state.lastMove?.includes(index) ? 'brightness-125' : ''} flex items-center justify-center`}>
                <span className={piece && isWhite(piece) ? 'text-white drop-shadow-[0_1px_2px_#000]' : 'text-gray-950 drop-shadow-[0_1px_1px_#fff]'}>{PIECES[piece]}</span>
            </button>)}
        </div>
        <p className="mt-3 text-center text-xs text-white/50">Capture the king to win · Pawns auto-promote to queens</p>
    </div>;
};

const LUDO_COLORS = ['red', 'yellow'];
const START_OFFSET = { red: 0, yellow: 26 };
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const validLudo = state => Array.isArray(state?.tokens) && state.tokens.length === 2
    && state.tokens.every(set => Array.isArray(set) && set.length === 4 && set.every(pos => Number.isInteger(pos) && pos >= -1 && pos <= 56))
    && [0, 1].includes(state.turn) && (state.dice === null || (Number.isInteger(state.dice) && state.dice >= 1 && state.dice <= 6));
export const createLudoState = () => ({ tokens: [Array(4).fill(-1), Array(4).fill(-1)], turn: 0, dice: null, winner: null });

export const moveLudoToken = (state, tokenIndex) => {
    const roll = state.dice;
    const position = state.tokens[state.turn][tokenIndex];
    if (!roll || (position === -1 && roll !== 6) || (position >= 0 && position + roll > 56)) return null;
    const tokens = state.tokens.map(list => [...list]);
    tokens[state.turn][tokenIndex] = position === -1 ? 0 : position + roll;
    const landed = tokens[state.turn][tokenIndex];
    if (landed < 52) {
        const global = (START_OFFSET[LUDO_COLORS[state.turn]] + landed) % 52;
        if (!SAFE.has(global)) tokens[1 - state.turn] = tokens[1 - state.turn].map(enemy => enemy >= 0 && enemy < 52 && (START_OFFSET[LUDO_COLORS[1 - state.turn]] + enemy) % 52 === global ? -1 : enemy);
    }
    const winner = tokens[state.turn].every(pos => pos === 56) ? state.turn : null;
    return { tokens, turn: roll === 6 && winner === null ? state.turn : 1 - state.turn, dice: null, winner };
};

export const LudoGame = ({ gameCode, gameMode, creatorId, currentUserId, socket, chatId }) => {
    const multiplayer = gameMode === 'vs-friend';
    const initial = useMemo(createLudoState, []);
    const [state, setState] = useLiveState({ socket, chatId, gameCode, enabled: multiplayer, initialState: initial, validator: validLudo });
    const myPlayer = multiplayer ? (String(creatorId) === String(currentUserId) ? 0 : 1) : 0;
    const canAct = state.winner === null && state.turn === myPlayer;
    const movable = state.dice ? state.tokens[state.turn].map((pos, i) => moveLudoToken(state, i) ? i : null).filter(i => i !== null) : [];

    const botTurn = useCallback(current => {
        window.setTimeout(() => {
            const dice = 1 + Math.floor(Math.random() * 6);
            const rolled = { ...current, dice };
            const options = rolled.tokens[1].map((_, i) => moveLudoToken(rolled, i) ? i : null).filter(i => i !== null);
            const next = options.length ? moveLudoToken(rolled, options[Math.floor(Math.random() * options.length)]) : { ...rolled, turn: 0, dice: null };
            setState(next);
        }, 550);
    }, [setState]);

    const rollDice = () => {
        if (!canAct || state.dice) return;
        const dice = 1 + Math.floor(Math.random() * 6);
        const rolled = { ...state, dice };
        const hasMove = rolled.tokens[rolled.turn].some((_, i) => moveLudoToken(rolled, i));
        if (!hasMove) {
            const next = { ...rolled, dice: null, turn: 1 - rolled.turn };
            setState(next);
            if (!multiplayer && next.turn === 1) botTurn(next);
        } else setState(rolled);
    };
    const move = index => {
        if (!canAct || !movable.includes(index)) return;
        const next = moveLudoToken(state, index);
        setState(next);
        if (!multiplayer && next.winner === null && next.turn === 1) botTurn(next);
    };

    return <div className="w-full max-w-xl text-white">
        <GameHeader icon="🎲" mode={gameMode} code={gameCode} detail={multiplayer ? `You are ${LUDO_COLORS[myPlayer]}` : 'You are Red'} />
        <div className="my-4 rounded-3xl border border-white/10 bg-[#10151f] p-4 shadow-2xl">
            <div className="grid grid-cols-2 gap-3">
                {LUDO_COLORS.map((color, player) => <div key={color} className={`rounded-2xl border-2 p-3 ${state.turn === player ? color === 'red' ? 'border-red-400 bg-red-500/15' : 'border-yellow-300 bg-yellow-400/15' : 'border-white/5 bg-white/[.03]'}`}>
                    <div className="mb-2 flex items-center justify-between"><b className="capitalize">{color}</b><span className="text-xs text-white/50">{state.tokens[player].filter(p => p === 56).length}/4 home</span></div>
                    <div className="grid grid-cols-2 gap-2">{state.tokens[player].map((position, index) => <button key={index} onClick={() => player === state.turn && move(index)} disabled={!movable.includes(index)}
                        className={`aspect-square rounded-xl border text-xl font-black transition ${color === 'red' ? 'border-red-400/40 bg-red-500/25' : 'border-yellow-300/40 bg-yellow-400/25'} ${movable.includes(index) ? 'animate-pulse ring-2 ring-white hover:scale-105' : ''}`}>
                        <span className={`mx-auto block h-7 w-7 rounded-full border-2 border-white/80 shadow ${color === 'red' ? 'bg-red-500' : 'bg-yellow-400'}`} />
                        <span className="mt-1 block text-[10px] font-bold">{position === -1 ? 'YARD' : position === 56 ? 'HOME' : `${position}/56`}</span>
                    </button>)}</div>
                </div>)}
            </div>
            <div className="mt-4 flex items-center justify-center gap-4 rounded-2xl bg-white/5 p-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-3xl font-black text-gray-900 shadow-inner">{state.dice || '–'}</div>
                <div><p className="mb-2 text-sm font-bold">{state.winner !== null ? `🏆 ${LUDO_COLORS[state.winner]} wins!` : `${LUDO_COLORS[state.turn]} turn`}</p>
                    <button onClick={rollDice} disabled={!canAct || Boolean(state.dice)} className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-black disabled:opacity-40">Roll dice</button></div>
            </div>
            <button onClick={() => setState(createLudoState())} className="mt-3 w-full rounded-xl bg-white/5 py-2 text-xs font-bold text-white/70 hover:bg-white/10">Restart game</button>
        </div>
        <p className="text-center text-xs text-white/50">Roll 6 to leave the yard · Roll 6 to play again · Land on rivals to send them back</p>
    </div>;
};

const GameHeader = ({ icon, mode, code, detail }) => <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-r from-violet-950/70 to-indigo-950/70 p-3 text-center">
    <div className="font-black">{icon} {mode === 'vs-friend' ? 'Live with friend' : 'Playing with computer'}</div>
    <div className="mt-1 text-[11px] text-violet-200/70">{detail}{mode === 'vs-friend' && code ? ` · Room ${code}` : ''}</div>
</div>;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';

const ICON = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
const FILES = 'abcdefgh';
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const toSquare = i => `${FILES[i % 8]}${8 - Math.floor(i / 8)}`;

export const createChessBoard = () => new Chess().board().flat().map(p => p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : null);
export const chessMoves = (board, from) => {
    if (!Array.isArray(board) || board.length !== 64 || !board[from]) return [];
    try {
        const game = new Chess(); game.clear();
        board.forEach((p, i) => p && game.put({ type: p.toLowerCase(), color: p === p.toUpperCase() ? 'w' : 'b' }, toSquare(i)));
        game.setTurn(board[from] === board[from].toUpperCase() ? 'w' : 'b');
        return game.moves({ square: toSquare(from), verbose: true }).map(m => (8 - +m.to[1]) * 8 + FILES.indexOf(m.to[0]));
    } catch { return []; }
};
export const applyChessMove = (board, from, to) => {
    if (!chessMoves(board, from).includes(to)) return null;
    const next = [...board]; next[to] = next[from]; next[from] = null;
    if (next[to] === 'P' && to < 8) next[to] = 'Q';
    if (next[to] === 'p' && to >= 56) next[to] = 'q';
    return next;
};

const useLiveState = ({ socket, chatId, gameCode, enabled, initialState, validator }) => {
    const [state, setState] = useState(initialState);
    useEffect(() => {
        if (!enabled || !socket) return undefined;
        const receive = data => data?.gameCode === gameCode && validator(data?.gameState) && setState(data.gameState);
        socket.on('game_move_received', receive);
        return () => socket.off('game_move_received', receive);
    }, [enabled, socket, gameCode, validator]);
    const update = useCallback(next => {
        setState(next);
        if (enabled && socket) socket.emit('game_move', { chatId, gameCode, gameState: next });
    }, [enabled, socket, chatId, gameCode]);
    return [state, update];
};

const validChess = state => {
    if (typeof state?.fen !== 'string' || state.fen.length > 100) return false;
    try { new Chess(state.fen); return true; } catch { return false; }
};
const score = game => game.board().flat().reduce((n, p) => n + (p ? VALUE[p.type] * (p.color === 'b' ? 1 : -1) : 0), 0);
const computerMove = game => {
    let best = -Infinity; let candidates = [];
    game.moves({ verbose: true }).forEach(move => {
        game.move(move);
        let current = score(game) + (move.captured ? VALUE[move.captured] / 2 : 0) + (game.inCheck() ? 40 : 0);
        if (game.isCheckmate()) current = 100000;
        else {
            let reply = 0;
            game.moves({ verbose: true }).forEach(m => { game.move(m); reply = Math.max(reply, -score(game)); game.undo(); });
            current -= reply * 0.55;
        }
        game.undo();
        if (current > best) { best = current; candidates = [move]; } else if (current === best) candidates.push(move);
    });
    return candidates[Math.floor(Math.random() * candidates.length)];
};
const status = game => {
    if (game.isCheckmate()) return `Checkmate · ${game.turn() === 'w' ? 'Black' : 'White'} wins`;
    if (game.isStalemate()) return 'Draw by stalemate';
    if (game.isThreefoldRepetition()) return 'Draw by repetition';
    if (game.isInsufficientMaterial()) return 'Draw · insufficient material';
    if (game.isDraw()) return 'Draw';
    return `${game.turn() === 'w' ? 'White' : 'Black'} to move${game.inCheck() ? ' · Check!' : ''}`;
};

export const ChessGame = ({ gameCode, gameMode, creatorId, currentUserId, socket, chatId }) => {
    const live = gameMode === 'vs-friend';
    const initial = useMemo(() => ({ fen: new Chess().fen(), lastMove: null }), []);
    const [state, setState] = useLiveState({ socket, chatId, gameCode, enabled: live, initialState: initial, validator: validChess });
    const [selected, setSelected] = useState(null);
    const [thinking, setThinking] = useState(false);
    const game = useMemo(() => new Chess(state.fen), [state.fen]);
    const myColor = live && String(creatorId) !== String(currentUserId) ? 'b' : 'w';
    const reversed = myColor === 'b';
    const squares = useMemo(() => Array.from({ length: 64 }, (_, i) => reversed ? 63 - i : i), [reversed]);
    const legal = selected ? game.moves({ square: selected, verbose: true }).map(m => m.to) : [];
    const askComputer = fen => {
        setThinking(true);
        window.setTimeout(() => {
            const bot = new Chess(fen); const move = computerMove(bot);
            if (move) bot.move(move);
            setState({ fen: bot.fen(), lastMove: move ? [move.from, move.to] : null }); setThinking(false);
        }, 500);
    };
    const play = square => {
        if (game.isGameOver() || thinking || game.turn() !== myColor) return;
        const piece = game.get(square);
        if (!selected || piece?.color === myColor) { setSelected(piece?.color === myColor ? square : null); return; }
        const next = new Chess(state.fen); let move = null;
        try { move = next.move({ from: selected, to: square, promotion: 'q' }); } catch { /* illegal */ }
        setSelected(null); if (!move) return;
        setState({ fen: next.fen(), lastMove: [move.from, move.to] });
        if (!live && !next.isGameOver()) askComputer(next.fen());
    };
    const reset = () => { setSelected(null); setThinking(false); setState({ fen: new Chess().fen(), lastMove: null }); };
    return <div className="w-full max-w-[620px] text-white">
        <Header icon="♟️" title="Professional Chess" mode={gameMode} code={gameCode} detail={`You play ${myColor === 'w' ? 'White' : 'Black'}`} />
        <Toolbar title={thinking ? 'Computer is thinking…' : status(game)} subtitle="Standard FIDE movement rules" onReset={reset} />
        <div className="mx-auto grid w-full max-w-[560px] grid-cols-8 overflow-hidden rounded-lg border-[6px] border-[#3b2516] shadow-2xl">
            {squares.map(index => {
                const square = toSquare(index); const piece = game.get(square); const light = (Math.floor(index / 8) + index % 8) % 2 === 0;
                return <button key={square} onClick={() => play(square)} aria-label={`${square} ${piece?.type || 'empty'}`} className={`relative flex aspect-square items-center justify-center ${light ? 'bg-[#e8d2ad]' : 'bg-[#6d8b74]'} ${selected === square ? 'ring-4 ring-inset ring-yellow-300' : ''} ${state.lastMove?.includes(square) ? 'brightness-125' : ''}`}>
                    {legal.includes(square) && <span className={`absolute z-10 rounded-full ${piece ? 'inset-1 border-4 border-yellow-300/80' : 'h-[22%] w-[22%] bg-yellow-500/70'}`} />}
                    {piece && <span className={`text-[clamp(1.7rem,7vw,3.8rem)] leading-none ${piece.color === 'w' ? 'text-white drop-shadow-[0_2px_2px_#111]' : 'text-gray-950 drop-shadow-[0_1px_1px_#fff]'}`}>{ICON[piece.type]}</span>}
                    <span className={`absolute bottom-0 left-1 text-[8px] font-black ${light ? 'text-[#6d8b74]' : 'text-[#e8d2ad]'}`}>{(reversed ? index % 8 === 7 : index % 8 === 0) ? square[1] : ''}</span>
                    <span className={`absolute bottom-0 right-1 text-[8px] font-black ${light ? 'text-[#6d8b74]' : 'text-[#e8d2ad]'}`}>{(reversed ? index < 8 : index >= 56) ? square[0] : ''}</span>
                </button>;
            })}
        </div>
        <p className="mt-3 text-center text-xs text-white/50">Checkmate · castling · en passant · promotion · stalemate and draw detection</p>
    </div>;
};

const COLORS = ['red', 'yellow'];
const START = [0, 26];
export const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const PATH = [[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
const HOME = [Array.from({ length: 5 }, (_, i) => [7, i + 1]), Array.from({ length: 5 }, (_, i) => [7, 13 - i])];
const YARD = [[[1,1],[1,4],[4,1],[4,4]], [[10,10],[10,13],[13,10],[13,13]]];
export const createLudoState = () => ({ tokens: [Array(4).fill(-1), Array(4).fill(-1)], turn: 0, dice: null, winner: null, consecutiveSixes: 0 });
const validLudo = s => Array.isArray(s?.tokens) && s.tokens.length === 2 && s.tokens.every(t => Array.isArray(t) && t.length === 4 && t.every(p => Number.isInteger(p) && p >= -1 && p <= 57)) && [0, 1].includes(s.turn) && (s.dice === null || Number.isInteger(s.dice) && s.dice >= 1 && s.dice <= 6);
export const moveLudoToken = (state, token) => {
    const roll = state.dice; const position = state.tokens[state.turn][token];
    if (!roll || position === -1 && roll !== 6 || position >= 0 && position + roll > 57) return null;
    const tokens = state.tokens.map(t => [...t]); tokens[state.turn][token] = position === -1 ? 0 : position + roll;
    const landed = tokens[state.turn][token]; let captured = false;
    if (landed < 52) {
        const global = (START[state.turn] + landed) % 52;
        if (!SAFE_CELLS.has(global)) tokens[1 - state.turn] = tokens[1 - state.turn].map(enemy => {
            if (enemy >= 0 && enemy < 52 && (START[1 - state.turn] + enemy) % 52 === global) { captured = true; return -1; } return enemy;
        });
    }
    const winner = tokens[state.turn].every(p => p === 57) ? state.turn : null;
    const bonus = (roll === 6 || captured || landed === 57) && winner === null;
    return { tokens, turn: bonus ? state.turn : 1 - state.turn, dice: null, winner, consecutiveSixes: bonus && roll === 6 ? state.consecutiveSixes || 1 : 0 };
};
const coordinate = (player, position, token) => position === -1 ? YARD[player][token] : position < 52 ? PATH[(START[player] + position) % 52] : position < 57 ? HOME[player][position - 52] : [7, 7];

export const LudoGame = ({ gameCode, gameMode, creatorId, currentUserId, socket, chatId }) => {
    const live = gameMode === 'vs-friend'; const initial = useMemo(createLudoState, []);
    const [state, setState] = useLiveState({ socket, chatId, gameCode, enabled: live, initialState: initial, validator: validLudo });
    const me = live && String(creatorId) !== String(currentUserId) ? 1 : 0;
    const movable = state.dice ? state.tokens[state.turn].map((_, i) => moveLudoToken(state, i) ? i : null).filter(i => i !== null) : [];
    const canAct = state.winner === null && state.turn === me;
    const botTurn = useCallback(current => window.setTimeout(() => {
        const dice = 1 + Math.floor(Math.random() * 6);
        if (dice === 6 && current.consecutiveSixes >= 2) { const next = { ...current, turn: 0, dice: null, consecutiveSixes: 0 }; setState(next); return; }
        const rolled = { ...current, dice, consecutiveSixes: dice === 6 ? (current.consecutiveSixes || 0) + 1 : 0 };
        const options = rolled.tokens[1].map((_, i) => moveLudoToken(rolled, i) ? i : null).filter(i => i !== null);
        const next = options.length ? moveLudoToken(rolled, options.sort((a, b) => rolled.tokens[1][b] - rolled.tokens[1][a])[0]) : { ...rolled, turn: 0, dice: null };
        setState(next); if (next.winner === null && next.turn === 1) botTurn(next);
    }, 600), [setState]);
    const roll = () => {
        if (!canAct || state.dice) return;
        const dice = 1 + Math.floor(Math.random() * 6);
        if (dice === 6 && state.consecutiveSixes >= 2) { setState({ ...state, turn: 1 - state.turn, dice: null, consecutiveSixes: 0 }); if (!live) botTurn({ ...state, turn: 1, dice: null, consecutiveSixes: 0 }); return; }
        const rolled = { ...state, dice, consecutiveSixes: dice === 6 ? (state.consecutiveSixes || 0) + 1 : 0 };
        if (!rolled.tokens[rolled.turn].some((_, i) => moveLudoToken(rolled, i))) {
            const next = { ...rolled, dice: null, turn: 1 - rolled.turn }; setState(next); if (!live && next.turn === 1) botTurn(next);
        } else setState(rolled);
    };
    const move = token => {
        if (!canAct || !movable.includes(token)) return;
        const next = moveLudoToken(state, token); setState(next); if (!live && next.winner === null && next.turn === 1) botTurn(next);
    };
    const tokenMap = new Map();
    state.tokens.forEach((tokens, player) => tokens.forEach((position, token) => { const key = coordinate(player, position, token).join('-'); tokenMap.set(key, [...(tokenMap.get(key) || []), { player, token }]); }));
    return <div className="w-full max-w-[620px] text-white">
        <Header icon="🎲" title="Classic Ludo" mode={gameMode} code={gameCode} detail={`You play ${COLORS[me]}`} />
        <Toolbar title={state.winner === null ? `${COLORS[state.turn]}'s turn` : `🏆 ${COLORS[state.winner]} wins!`} subtitle="Two-player classic · opposite colours" onReset={() => setState(createLudoState())} />
        <div className="mx-auto grid w-full max-w-[560px] grid-cols-[repeat(15,minmax(0,1fr))] overflow-hidden rounded-lg border-4 border-white/20 bg-[#f4ead4] shadow-2xl">
            {Array.from({ length: 225 }, (_, i) => {
                const r = Math.floor(i / 15), c = i % 15, key = `${r}-${c}`; const path = PATH.findIndex(([a,b]) => a === r && b === c);
                const redHome = HOME[0].some(([a,b]) => a === r && b === c), yellowHome = HOME[1].some(([a,b]) => a === r && b === c);
                let bg = 'bg-[#eadfc8]';
                if (r < 6 && c < 6) bg = 'bg-red-500'; else if (r > 8 && c > 8) bg = 'bg-yellow-400'; else if (redHome) bg = 'bg-red-400'; else if (yellowHome) bg = 'bg-yellow-300'; else if (r >= 6 && r <= 8 && c >= 6 && c <= 8) bg = 'bg-gradient-to-br from-red-500 via-white to-yellow-400'; else if (path >= 0) bg = SAFE_CELLS.has(path) ? 'bg-emerald-200' : 'bg-white';
                return <div key={key} className={`relative flex aspect-square items-center justify-center border-[0.5px] border-black/15 ${bg}`}>
                    {path >= 0 && SAFE_CELLS.has(path) && <span className="text-[8px] text-emerald-700">★</span>}
                    {(tokenMap.get(key) || []).map(({ player, token }) => <button key={`${player}-${token}`} onClick={() => player === state.turn && move(token)} disabled={!movable.includes(token)} aria-label={`${COLORS[player]} token ${token + 1}`} className={`absolute z-10 h-[72%] w-[72%] rounded-full border-2 border-white shadow-md ${player ? 'bg-yellow-500' : 'bg-red-600'} ${movable.includes(token) ? 'animate-pulse ring-2 ring-violet-500 scale-110' : ''}`} />)}
                </div>;
            })}
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 rounded-2xl bg-white/5 p-3"><div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-3xl font-black text-gray-900">{state.dice || '–'}</div><button onClick={roll} disabled={!canAct || Boolean(state.dice)} className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-sm font-black disabled:opacity-40">Roll dice</button></div>
        <p className="mt-2 text-center text-xs text-white/50">Roll 6 to enter · safe stars · capture bonus · exact finish · three sixes forfeit</p>
    </div>;
};

const Header = ({ icon, title, mode, code, detail }) => <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-r from-violet-950/80 to-indigo-950/80 p-3 text-center shadow-lg"><div className="font-black">{icon} {title}</div><div className="mt-1 text-[11px] text-violet-200/70">{mode === 'vs-friend' ? 'Live friend match' : 'Computer match'} · {detail}{mode === 'vs-friend' && code ? ` · Room ${code}` : ''}</div></div>;
const Toolbar = ({ title, subtitle, onReset }) => <div className="my-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5"><div><p className="text-sm font-bold capitalize">{title}</p><p className="text-[10px] text-white/45">{subtitle}</p></div><button onClick={onReset} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20">New match</button></div>;

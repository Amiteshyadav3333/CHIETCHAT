import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { ChessGame, LudoGame } from './BoardGames';
import { SnakeGame } from './SnakeGame';

const WIN_PATTERNS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

export const isValidGameBoard = (board) => (
    Array.isArray(board)
    && board.length === 9
    && board.every(cell => cell === null || cell === 'X' || cell === 'O')
);

export const getGameWinner = (board) => {
    if (!isValidGameBoard(board)) return null;
    for (const pattern of WIN_PATTERNS) {
        const [a, b, c] = pattern;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { winner: board[a], line: pattern };
        }
    }
    return board.every(cell => cell !== null) ? { winner: 'Draw', line: null } : null;
};

const TicTacToeGame = ({ gameCode, gameMode: initialGameMode, targetWins, creatorId, currentUserId, socket, chatId }) => {
    const [board, setBoard] = useState(Array(9).fill(null));
    const [isXNext, setIsXNext] = useState(true);
    const [gameMode, setGameMode] = useState(initialGameMode || 'vs-computer'); // 'vs-computer', 'pass-play', or 'vs-friend'
    const [difficulty, setDifficulty] = useState('smart'); // 'easy' or 'smart'
    const [scores, setScores] = useState({ x: 0, o: 0, draws: 0 });
    const [winnerInfo, setWinnerInfo] = useState(null); // { winner: 'X'|'O'|'Draw', line: [...] }
    const [isThinking, setIsThinking] = useState(false);

    const mySymbol = gameMode === 'vs-friend' ? (creatorId === currentUserId ? 'X' : 'O') : null;
    const isMyTurn = gameMode !== 'vs-friend' || (isXNext && mySymbol === 'X') || (!isXNext && mySymbol === 'O');
    const matchWinner = gameMode === 'vs-friend' && targetWins && (scores.x >= targetWins ? 'X' : scores.o >= targetWins ? 'O' : null);

    const updateScores = (winner) => {
        setScores(prev => {
            if (winner === 'X') return { ...prev, x: prev.x + 1 };
            if (winner === 'O') return { ...prev, o: prev.o + 1 };
            if (winner === 'Draw') return { ...prev, draws: prev.draws + 1 };
            return prev;
        });
    };

    useEffect(() => {
        if (gameMode === 'vs-friend' && socket) {
            const handleMoveRecv = (data) => {
                if (
                    data && data.gameCode === gameCode
                    && isValidGameBoard(data.board) && typeof data.isXNext === 'boolean'
                ) {
                    setBoard(data.board);
                    setIsXNext(data.isXNext);
                    const result = getGameWinner(data.board);
                    if (result) {
                        setWinnerInfo(result);
                        updateScores(result.winner);
                    } else {
                        setWinnerInfo(null);
                    }
                }
            };
            socket.on('game_move_received', handleMoveRecv);
            return () => {
                socket.off('game_move_received', handleMoveRecv);
            };
        }
    }, [gameMode, socket, gameCode]);

    const makeMove = (index) => {
        if (board[index] || winnerInfo || isThinking || matchWinner) return;
        if (!isMyTurn) return;

        const newBoard = [...board];
        const currentPlayer = isXNext ? 'X' : 'O';
        newBoard[index] = currentPlayer;
        setBoard(newBoard);

        const result = getGameWinner(newBoard);
        if (result) {
            setWinnerInfo(result);
            updateScores(result.winner);
        }

        const nextPlayerIsX = !isXNext;
        setIsXNext(nextPlayerIsX);

        if (gameMode === 'vs-friend' && socket) {
            socket.emit('game_move', {
                chatId,
                gameCode,
                board: newBoard,
                isXNext: nextPlayerIsX
            });
        }

        if (gameMode === 'vs-computer' && nextPlayerIsX === false && !result) {
            setIsThinking(true);
            setTimeout(() => {
                triggerBotMove(newBoard);
            }, 600);
        }
    };

    const triggerBotMove = (currentBoard) => {
        const botPlayer = 'O';
        const humanPlayer = 'X';
        const getAvailableMoves = (b) => b.map((val, idx) => val === null ? idx : null).filter(val => val !== null);
        const availableMoves = getAvailableMoves(currentBoard);

        if (availableMoves.length === 0) return;

        let selectedMove = null;

        if (difficulty === 'easy') {
            selectedMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
        } else {
            for (let move of availableMoves) {
                const tempBoard = [...currentBoard];
                tempBoard[move] = botPlayer;
                const res = getGameWinner(tempBoard);
                if (res && res.winner === botPlayer) {
                    selectedMove = move;
                    break;
                }
            }

            if (selectedMove === null) {
                for (let move of availableMoves) {
                    const tempBoard = [...currentBoard];
                    tempBoard[move] = humanPlayer;
                    const res = getGameWinner(tempBoard);
                    if (res && res.winner === humanPlayer) {
                        selectedMove = move;
                        break;
                    }
                }
            }

            if (selectedMove === null && currentBoard[4] === null) {
                selectedMove = 4;
            }

            if (selectedMove === null) {
                const corners = [0, 2, 6, 8];
                const opposites = { 0: 8, 2: 6, 6: 2, 8: 0 };
                for (let c of corners) {
                    if (currentBoard[c] === humanPlayer && currentBoard[opposites[c]] === null) {
                        selectedMove = opposites[c];
                        break;
                    }
                }
            }

            if (selectedMove === null) {
                const corners = [0, 2, 6, 8];
                const availableCorners = corners.filter(c => currentBoard[c] === null);
                if (availableCorners.length > 0) {
                    selectedMove = availableCorners[Math.floor(Math.random() * availableCorners.length)];
                }
            }

            if (selectedMove === null) {
                const sides = [1, 3, 5, 7];
                const availableSides = sides.filter(s => currentBoard[s] === null);
                if (availableSides.length > 0) {
                    selectedMove = availableSides[Math.floor(Math.random() * availableSides.length)];
                }
            }
        }

        const newBoard = [...currentBoard];
        newBoard[selectedMove] = botPlayer;
        setBoard(newBoard);
        setIsThinking(false);

        const result = getGameWinner(newBoard);
        if (result) {
            setWinnerInfo(result);
            updateScores(result.winner);
            return;
        }

        setIsXNext(true);
    };

    const resetRound = () => {
        const emptyBoard = Array(9).fill(null);
        setBoard(emptyBoard);
        setIsXNext(true);
        setWinnerInfo(null);
        setIsThinking(false);
        if (gameMode === 'vs-friend' && socket) {
            socket.emit('game_move', {
                chatId,
                gameCode,
                board: emptyBoard,
                isXNext: true
            });
        }
    };

    const resetAll = () => {
        resetRound();
        setScores({ x: 0, o: 0, draws: 0 });
    };

    const changeMode = (mode) => {
        setGameMode(mode);
        setBoard(Array(9).fill(null));
        setIsXNext(true);
        setWinnerInfo(null);
        setIsThinking(false);
    };

    return (
        <div className="flex flex-col items-center gap-4 w-full text-white font-sans">
            {/* Game Mode Selector */}
            {gameMode === 'vs-friend' ? (
                <div className="w-full text-center py-2 px-3 bg-violet-650/20 border border-violet-500/30 rounded-xl text-xs font-bold text-violet-300">
                    👥 Multiplayer Game (Code: {gameCode}) <br />
                    <span className="text-[10px] opacity-75 font-medium">You play as: {mySymbol} · First to {targetWins} wins</span>
                </div>
            ) : (
                <div className="flex gap-2 w-full p-1 bg-white/5 rounded-xl border border-white/5">
                    <button
                        onClick={() => changeMode('vs-computer')}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                            gameMode === 'vs-computer'
                                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                                : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        🤖 VS Computer
                    </button>
                    <button
                        onClick={() => changeMode('pass-play')}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                            gameMode === 'pass-play'
                                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                                : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        👥 Pass & Play
                    </button>
                </div>
            )}

            {/* Difficulty selector for VS Computer */}
            {gameMode === 'vs-computer' && (
                <div className="flex gap-2 w-full justify-between items-center text-xs px-1">
                    <span className="text-white/50">Difficulty:</span>
                    <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/5">
                        <button
                            onClick={() => setDifficulty('easy')}
                            className={`px-2.5 py-0.5 font-medium rounded-md transition-all ${
                                difficulty === 'easy' ? 'bg-purple-600/30 text-purple-300' : 'text-white/40 hover:text-white/70'
                            }`}
                        >
                            Easy
                        </button>
                        <button
                            onClick={() => setDifficulty('smart')}
                            className={`px-2.5 py-0.5 font-medium rounded-md transition-all ${
                                difficulty === 'smart' ? 'bg-indigo-600/30 text-indigo-300' : 'text-white/40 hover:text-white/70'
                            }`}
                        >
                            Smart
                        </button>
                    </div>
                </div>
            )}

            {/* Scoreboard */}
            <div className="grid grid-cols-3 gap-2 w-full bg-white/5 rounded-2xl border border-white/10 p-3 text-center">
                <div>
                    <p className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold">Player X</p>
                    <p className="text-lg font-extrabold text-white mt-0.5">{scores.x}</p>
                </div>
                <div className="border-x border-white/10">
                    <p className="text-[10px] uppercase tracking-wider text-white/40">Ties</p>
                    <p className="text-lg font-extrabold text-white mt-0.5">{scores.draws}</p>
                </div>
                <div>
                    <p className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold">
                        {gameMode === 'vs-computer' ? 'Computer (O)' : gameMode === 'vs-friend' ? 'Friend (O)' : 'Player O'}
                    </p>
                    <p className="text-lg font-extrabold text-white mt-0.5">{scores.o}</p>
                </div>
            </div>

            {/* Turn/Winner Status */}
            <div className="h-6 flex items-center justify-center text-sm font-semibold">
                {matchWinner ? (
                    <span className="text-yellow-400 font-extrabold animate-bounce flex items-center gap-1.5">
                        🏆 Match Winner: Player {matchWinner}!
                    </span>
                ) : winnerInfo ? (
                    winnerInfo.winner === 'Draw' ? (
                        <span className="text-amber-400 animate-pulse">🤝 It's a Tie!</span>
                    ) : (
                        <span className={`${winnerInfo.winner === 'X' ? 'text-rose-400' : 'text-cyan-400'} animate-bounce`}>
                            🎉 Player {winnerInfo.winner} Wins!
                        </span>
                    )
                ) : isThinking ? (
                    <span className="text-cyan-400/80 animate-pulse flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                        Computer is thinking...
                    </span>
                ) : (
                    <span className="text-white/80">
                        {gameMode === 'vs-friend' ? (
                            isMyTurn ? (
                                <span className="text-green-400 animate-pulse">👉 Your Turn ({mySymbol})</span>
                            ) : (
                                <span className="text-white/40">Waiting for opponent... ({isXNext ? 'X' : 'O'})</span>
                            )
                        ) : (
                            <span>Turn: <span className={isXNext ? 'text-rose-400' : 'text-cyan-400'}>{isXNext ? 'X' : 'O'}</span></span>
                        )}
                    </span>
                )}
            </div>

            {/* 3x3 Grid Board */}
            <div className="grid grid-cols-3 gap-2 w-fit aspect-square mx-auto">
                {board.map((cell, idx) => {
                    const isWinningCell = winnerInfo?.line?.includes(idx);
                    return (
                        <button
                            key={idx}
                            onClick={() => makeMove(idx)}
                            disabled={cell !== null || winnerInfo !== null || isThinking || matchWinner || !isMyTurn}
                            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-xl flex items-center justify-center transition-all duration-200 select-none border text-3xl sm:text-4xl font-black ${
                                isWinningCell
                                    ? 'bg-emerald-500/20 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)] animate-pulse'
                                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 active:scale-95'
                            }`}
                        >
                            {cell === 'X' && <span className="text-rose-500 drop-shadow-[0_0_6px_rgba(244,63,94,0.6)]">X</span>}
                            {cell === 'O' && <span className="text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]">O</span>}
                        </button>
                    );
                })}
            </div>

            {/* Reset Actions */}
            <div className="flex gap-2 w-full mt-1">
                <button
                    onClick={resetRound}
                    disabled={!!matchWinner}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl border border-white/10 hover:bg-white/5 active:scale-95 transition-all text-white/80 flex items-center justify-center gap-1 ${matchWinner ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    🔄 Play Again
                </button>
                <button
                    onClick={resetAll}
                    className="py-2 px-3 text-xs font-bold rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 transition-all text-rose-400 border border-rose-500/20"
                >
                    Reset Match
                </button>
            </div>
        </div>
    );
};

export const MiniGameCard = ({ game, isOwn, socket, chatId, currentUserId, gamePlayers = [] }) => {
    const [showModal, setShowModal] = useState(false);
    const [onlinePlayers, setOnlinePlayers] = useState([]);
    let iframeUrl = 'https://game.indiasearch.site';

    let gameName = game;
    let gameMode = 'vs-computer';
    let targetWins = 3;
    let gameCode = '';
    let creatorId = '';
    let players = gamePlayers;

    try {
        if (game.startsWith('{')) {
            const data = JSON.parse(game);
            gameName = data.game || 'Tic-Tac-Toe';
            gameMode = data.mode || 'vs-computer';
            targetWins = data.target || 3;
            gameCode = data.gameCode || '';
            if (gameName === 'Indiasearch Games' && gameCode) {
                iframeUrl = `https://game.indiasearch.site?room=${gameCode}`;
            }
            creatorId = data.creatorId || '';
            players = Array.isArray(data.players) ? data.players : gamePlayers;
        }
    } catch (e) {
        // Fallback for raw text
    }

    // Prevent background scrolling when game modal is open
    useEffect(() => {
        if (showModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [showModal]);

    useEffect(() => {
        if (!showModal || gameMode !== 'vs-friend' || !socket || !gameCode) {
            setOnlinePlayers([]);
            return undefined;
        }
        const room = `game_${chatId}_${gameCode}`;
        const update = data => {
            if (data?.room === room && Array.isArray(data.players)) setOnlinePlayers(data.players);
        };
        socket.on('game_presence_update', update);
        socket.emit('game_presence_join', { chatId, gameCode });
        return () => {
            socket.emit('game_presence_leave', { chatId, gameCode });
            socket.off('game_presence_update', update);
        };
    }, [showModal, gameMode, socket, chatId, gameCode]);

    return (
        <div className="min-w-[220px] max-w-[280px] space-y-2">
            <p className="text-xs uppercase tracking-wider text-white/50 flex items-center gap-1.5 font-sans font-bold">
                🎮 {gameMode === 'vs-friend' ? 'Multiplayer Game' : 'Mini Game'}
            </p>
            <div className={`rounded-2xl p-4 border border-white/8 relative overflow-hidden bg-gradient-to-br ${isOwn ? 'from-purple-600/30 to-indigo-600/20' : 'from-blue-600/30 to-teal-600/20'}`}>
                {/* Decorative retro grid design background */}
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />

                <div className="relative z-10 space-y-3 font-sans">
                    <div>
                        <h4 className="text-sm font-bold text-white tracking-wide">{gameName}</h4>
                        {gameMode === 'vs-friend' ? (
                            <p className="text-[10px] text-violet-300 font-semibold mt-0.5">
                                Mode: vs Friend (Target: {targetWins} wins)
                            </p>
                        ) : (
                            <p className="text-[10px] text-white/60 mt-0.5">Ready to play in Chat</p>
                        )}
                    </div>

                    {gameMode === 'vs-friend' && gameCode && (
                        <div className="flex items-center justify-between gap-2 mt-2 bg-black/40 rounded-xl px-3 py-1.5 border border-white/5">
                            <span className="text-[10px] font-mono font-bold text-white/70 select-all">{gameCode}</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(gameCode);
                                    alert("Game Code copied to clipboard!");
                                }}
                                className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/70 transition-colors"
                                title="Copy game code"
                            >
                                <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => setShowModal(true)}
                        className="w-full rounded-xl bg-white/15 px-3 py-2.5 text-xs font-bold hover:bg-white/25 active:scale-[0.98] transition-all text-white flex items-center justify-center gap-1.5 shadow-lg border border-white/10"
                    >
                        🎮 Play Now
                    </button>
                </div>
            </div>

            {/* Fullscreen Game Modal using ReactDOM Portal */}
            {showModal && createPortal(
                <div className="fixed inset-0 z-[100] flex flex-col bg-[#080b11]/95 backdrop-blur-md font-sans">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-800 bg-[#0d121c]">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 rounded-xl bg-gray-850 hover:bg-gray-800 text-gray-300 transition-colors"
                            >
                                <ArrowLeftIcon className="w-5 h-5" />
                            </button>
                            <div>
                                <h3 className="text-md font-bold text-white flex items-center gap-2">
                                    🎮 {gameName}
                                </h3>
                                <p className="text-[10px] text-gray-400">
                                    {gameMode === 'vs-friend' ? 'Real-Time Multiplayer Room' : 'Mini Game Panel'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {!['Tic-Tac-Toe', 'Chess', 'Ludo', 'Snake'].includes(gameName) && (
                                <>
                                    <button
                                        onClick={() => {
                                            const iframe = document.getElementById('game-iframe');
                                            if (iframe) iframe.src = iframeUrl;
                                        }}
                                        className="p-2 rounded-xl bg-gray-800/50 hover:bg-gray-800 text-gray-300 transition-colors"
                                        title="Restart Game"
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                        </svg>
                                    </button>
                                    <a
                                        href={iframeUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        referrerPolicy="no-referrer"
                                        className="p-2 rounded-xl bg-gray-850 hover:bg-gray-850 text-gray-300 transition-colors flex items-center justify-center"
                                        title="Open in New Tab"
                                    >
                                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                    </a>
                                </>
                            )}
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-rose-400 transition-colors"
                                title="Close"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Game Content Container */}
                    {gameMode === 'vs-friend' && <div className="border-b border-white/10 bg-[#0a1118] px-4 py-2"><div className="mx-auto flex max-w-3xl items-center gap-2 overflow-x-auto">{(players || []).slice(0, gameName === 'Ludo' ? 4 : 2).map((player, index) => { const online = onlinePlayers.some(item => String(item.userId) === String(player.id)); return <div key={player.id || index} className="flex shrink-0 items-center gap-2 rounded-full bg-white/5 px-3 py-1.5"><span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse' : 'bg-gray-600'}`} /><span className="max-w-24 truncate text-xs font-bold text-white/80">{String(player.id) === String(currentUserId) ? 'You' : player.name || player.username || `Player ${index + 1}`}</span><span className={`text-[9px] font-bold ${online ? 'text-emerald-300' : 'text-gray-500'}`}>{online ? 'IN GAME' : 'OFFLINE'}</span></div>; })}<span className="ml-auto shrink-0 text-[10px] text-white/40">{onlinePlayers.length} playing now</span></div></div>}
                    <div className="flex-1 p-2 sm:p-6 flex justify-center items-center overflow-y-auto">
                        {gameName === 'Tic-Tac-Toe' ? (
                            <div className="w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl bg-[#0b0f19] p-4 sm:p-6 relative">
                                <TicTacToeGame
                                    gameCode={gameCode}
                                    gameMode={gameMode}
                                    targetWins={targetWins}
                                    creatorId={creatorId}
                                    currentUserId={currentUserId}
                                    socket={socket}
                                    chatId={chatId}
                                />
                            </div>
                        ) : gameName === 'Chess' ? (
                            <ChessGame gameCode={gameCode} gameMode={gameMode} creatorId={creatorId} currentUserId={currentUserId} socket={socket} chatId={chatId} />
                        ) : gameName === 'Ludo' ? (
                            <LudoGame gameCode={gameCode} gameMode={gameMode} creatorId={creatorId} currentUserId={currentUserId} socket={socket} chatId={chatId} players={players} />
                        ) : gameName === 'Snake' ? (
                            <SnakeGame />
                        ) : (
                            <div className="w-full h-full max-w-4xl max-h-[80vh] sm:max-h-[85vh] rounded-2xl sm:rounded-3xl overflow-hidden border border-gray-800 shadow-2xl bg-black relative">
                                <iframe
                                    id="game-iframe"
                                    src={iframeUrl}
                                    className="w-full h-full border-none"
                                    title="Mini Game"
                                    allow="autoplay; fullscreen; keyboard"
                                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                                    referrerPolicy="no-referrer"
                                />
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

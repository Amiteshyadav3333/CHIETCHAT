import React from 'react';

const EMOJI_CATEGORIES = [
    {
        id: 'smileys', icon: '😀', label: 'Smileys',
        emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','💫','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖']
    },
    {
        id: 'people', icon: '👋', label: 'People',
        emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄','💋','🩸']
    },
    {
        id: 'animals', icon: '🐶', label: 'Animals',
        emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🪳','🕷️','🦂','🐢','🦎','🐍','🦕','🦖','🦎','🐊','🐸','🐉','🐲','🌵','🎄','🌲','🌳','🌴','🪵','🌱','🌿','☘️','🍀','🎍','🪴','🎋','🍃','🍂','🍁']
    },
    {
        id: 'food', icon: '🍕', label: 'Food',
        emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧃','🥤','🧋','🍵','☕','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊']
    },
    {
        id: 'sports', icon: '⚽', label: 'Sports',
        emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥍','🏑','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳']
    },
    {
        id: 'travel', icon: '✈️', label: 'Travel',
        emojis: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🦽','🦼','🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','⛽','🚨','🚥','🚦','🛑','🚧','⚓','⛵','🛶','🚤','🛥️','🛳️','⛴️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🏖️','🏝️','🏜️','🏕️','🗾','🧭','🏔️','⛰️','🌋','🗺️','🏗️','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','♨️','🌌','🌠','🎇','🎆','🌈','🎑']
    },
    {
        id: 'symbols', icon: '❤️', label: 'Symbols',
        emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🪯','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈹','🚻','🚺','🚹','🚼','⚧️']
    },
    {
        id: 'flags', icon: '🏳️', label: 'Flags',
        emojis: ['🏳️','🏴','🏁','🚩','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇺🇳','🇦🇫','🇦🇱','🇩🇿','🇦🇩','🇦🇴','🇦🇬','🇦🇷','🇦🇲','🇦🇺','🇦🇹','🇦🇿','🇧🇸','🇧🇭','🇧🇩','🇧🇧','🇧🇾','🇧🇪','🇧🇿','🇧🇯','🇧🇹','🇧🇴','🇧🇦','🇧🇼','🇧🇷','🇧🇳','🇧🇬','🇧🇫','🇧🇮','🇨🇻','🇰🇭','🇨🇲','🇨🇦','🇧🇶','🇨🇫','🇹🇩','🇨🇱','🇨🇳','🇨🇴','🇰🇲','🇨🇬','🇨🇩','🇨🇷','🇭🇷','🇨🇺','🇨🇼','🇨🇾','🇨🇿','🇩🇰','🇩🇯','🇩🇲','🇩🇴','🇪🇨','🇪🇬','🇸🇻','🇬🇶','🇪🇷','🇪🇪','🇸🇿','🇪🇹','🇫🇯','🇫🇮','🇫🇷','🇬🇦','🇬🇲','🇬🇪','🇩🇪','🇬🇭','🇬🇷','🇬🇩','🇬🇹','🇬🇳','🇬🇼','🇬🇾','🇭🇹','🇭🇳','🇭🇺','🇮🇸','🇮🇳','🇮🇩','🇮🇷','🇮🇶','🇮🇪','🇮🇱','🇮🇹','🇯🇲','🇯🇵','🇯🇴','🇰🇿','🇰🇪','🇰🇮','🇰🇼','🇰🇬','🇱🇦','🇱🇻','🇱🇧','🇱🇸','🇱🇷','🇱🇾','🇱🇮','🇱🇹','🇱🇺','🇲🇬','🇲🇼','🇲🇾']
    },
];

export const searchEmojis = (query, activeCategory = 'smileys') => {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) {
        return EMOJI_CATEGORIES.find(category => category.id === activeCategory)?.emojis || [];
    }
    const allEmojis = [...new Set(EMOJI_CATEGORIES.flatMap(category => category.emojis))];
    const directMatches = allEmojis.filter(emoji => emoji.includes(normalized));
    if (directMatches.length) return directMatches;
    return [...new Set(EMOJI_CATEGORIES.filter(category => (
        category.id.includes(normalized) || category.label.toLowerCase().includes(normalized)
    )).flatMap(category => category.emojis))];
};

const SidebarEmojiPicker = ({ pickerRef, onPick }) => {
    const [query, setQuery] = React.useState('');
    const [activeCategory, setActiveCategory] = React.useState('smileys');
    const searchRef = React.useRef(null);

    React.useEffect(() => {
        searchRef.current?.focus();
    }, []);

    const displayEmojis = React.useMemo(
        () => searchEmojis(query, activeCategory),
        [query, activeCategory],
    );

    return (
        <div
            ref={pickerRef}
            className="absolute top-full left-0 right-0 z-[60] mt-1 shadow-2xl"
            style={{ borderRadius: '0 0 12px 12px' }}
        >
            {/* WhatsApp-style picker panel */}
            <div className="bg-[#1f2c34] rounded-xl overflow-hidden border border-white/10">

                {/* ── Search Bar ── */}
                <div className="px-3 py-2 bg-[#1f2c34] border-b border-white/[0.08]">
                    <div className="flex items-center gap-2 bg-[#2a3942] rounded-lg px-3 py-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.604 10.604Z" />
                        </svg>
                        <input
                            ref={searchRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search emoji"
                            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                        />
                        {query && (
                            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Emoji Grid ── */}
                <div className="h-[220px] overflow-y-auto px-2 py-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}>
                    {!query && (
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1 mb-2">
                            {EMOJI_CATEGORIES.find(c => c.id === activeCategory)?.label}
                        </p>
                    )}
                    <div className="grid grid-cols-8 gap-0.5" aria-live="polite">
                        {displayEmojis.map((emoji, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => onPick(emoji)}
                                className="flex items-center justify-center w-9 h-9 rounded-lg text-xl hover:bg-white/10 active:scale-90 transition-all"
                                title={emoji}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                    {displayEmojis.length === 0 && (
                        <p className="px-2 py-8 text-center text-xs text-gray-400">No emoji found</p>
                    )}
                </div>

                {/* ── Category Tabs ── */}
                {!query && (
                    <div className="flex items-center border-t border-white/[0.08] bg-[#1a2930] px-1 py-1 gap-0.5 overflow-x-auto scrollbar-none">
                        {EMOJI_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setActiveCategory(cat.id)}
                                title={cat.label}
                                className={`flex-1 min-w-[36px] flex items-center justify-center py-1.5 rounded-lg text-lg transition-all ${
                                    activeCategory === cat.id
                                        ? 'bg-[#00a884]/25 text-[#00a884]'
                                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                }`}
                                style={{ borderBottom: activeCategory === cat.id ? '2px solid #00a884' : '2px solid transparent' }}
                            >
                                {cat.icon}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SidebarEmojiPicker;

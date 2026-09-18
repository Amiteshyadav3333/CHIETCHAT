"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Mic, Search, User, Video, Play, ArrowLeft } from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { buildApiUrl } from "@/lib/api";

function SearchContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const q = searchParams.get('q') || '';

    const [searchQuery, setSearchQuery] = useState(q);
    const [loading, setLoading] = useState(true);
    const [results, setResults] = useState<{ users: any[], sessions: any[] }>({ users: [], sessions: [] });

    useEffect(() => {
        const fetchResults = async () => {
            if (!q) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const res = await axios.get(buildApiUrl(`/api/search?q=${encodeURIComponent(q)}`));
                setResults(res.data);
            } catch (err) {
                console.error("Failed to fetch search results", err);
            } finally {
                setLoading(false);
            }
        };
        fetchResults();
    }, [q]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white selection:bg-indigo-500 selection:text-white pb-20">
            {/* Navbar */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <Link href="/" className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                                <Mic className="w-4 h-4 text-white" />
                            </div>
                            <span className="font-bold border-r border-white/10 pr-6 hidden sm:block tracking-tight text-xl">PodLive</span>
                        </Link>

                        <form onSubmit={handleSearch} className="relative w-full max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search creators or podcasts..."
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </form>
                    </div>

                    <div className="flex flex-row items-center gap-4">
                        <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium">
                            <ArrowLeft className="w-4 h-4" />
                            <span className="hidden sm:inline">Back Home</span>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Results Section */}
            <main className="pt-28 px-6 max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold tracking-tight mb-8">
                    Search Results for <span className="text-indigo-400">"{q}"</span>
                </h1>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <div className="space-y-12">
                        {(!results.users?.length && !results.sessions?.length) && (
                            <div className="text-center py-20 text-zinc-500">
                                <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <h3 className="text-xl font-bold text-white mb-2">No results found</h3>
                                <p>Try searching with different keywords</p>
                            </div>
                        )}

                        {results.users && results.users.length > 0 && (
                            <section>
                                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                                    <User className="w-5 h-5 text-purple-400" />
                                    Creators
                                </h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {results.users.map(user => (
                                        <Link href={`/creator/${user.id}`} key={user.id} className="bg-zinc-900/50 border border-white/5 p-4 rounded-2xl flex items-center gap-4 hover:bg-zinc-900 transition-colors group">
                                            <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border-2 border-transparent group-hover:border-purple-500 transition-all">
                                                <img src={user.avatar_url || `https://ui-avatars.com/api/?name=${user.display_name}&background=random`} alt={user.display_name} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="overflow-hidden">
                                                <h3 className="font-bold text-white truncate group-hover:text-purple-400 transition-colors">{user.display_name}</h3>
                                                <p className="text-sm text-zinc-400 truncate">@{user.unique_handle}</p>
                                                <p className="text-xs text-zinc-500 mt-1">{user.follower_count || 0} followers</p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}

                        {results.sessions && results.sessions.length > 0 && (
                            <section>
                                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                                    <Video className="w-5 h-5 text-indigo-400" />
                                    Podcasts & Live Streams
                                </h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {results.sessions.map((session) => (
                                        <Link href={session.status === 'live' ? `/live/${session.id}` : `/watch/${session.id}`} key={session.id} className="group relative rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 hover:border-indigo-500/50 transition-all hover:-translate-y-1 block">
                                            <div className="aspect-video bg-zinc-800 relative">
                                                {session.status === 'live' && (
                                                    <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1 z-10">
                                                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                                                        LIVE
                                                    </div>
                                                )}
                                                {session.thumbnail_url ? (
                                                    <img src={session.thumbnail_url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={session.title} />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                                                            <Play className="w-5 h-5 text-black ml-1" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-4">
                                                <h3 className="font-bold text-lg mb-1 truncate text-white group-hover:text-indigo-400 transition-colors">{session.title}</h3>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 overflow-hidden shrink-0">
                                                        <img src={session.host?.avatar_url || `https://ui-avatars.com/api/?name=${session.host?.display_name || "Host"}&background=random`} alt="host" className="w-full h-full object-cover" />
                                                    </div>
                                                    <span className="text-sm font-medium text-zinc-400 truncate hover:text-white transition-colors">@{session.host?.unique_handle || session.host?.username || "Host"}</span>
                                                </div>
                                                <div className="mt-3 inline-block bg-white/5 border border-white/10 px-2 py-1 rounded text-xs text-zinc-400">
                                                    {session.category || 'Podcast'}
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}

export default function SearchPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>}>
            <SearchContent />
        </Suspense>
    );
}

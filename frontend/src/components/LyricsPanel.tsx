import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, RefreshCw, Loader2, Search, Edit2, Check,
  MoreHorizontal, Play, Pause, SkipBack, SkipForward, Trash2, ListMusic,
} from "lucide-react";
import { post, get } from "@/api/client";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { cn } from "@/lib/utils";

interface LyricsPanelProps {
  open: boolean;
  onClose: () => void;
  trackId: string;
  trackTitle: string;
  trackArtist?: string;
  coverUrl?: string | null;
}

interface LrcLine { time: number; text: string; }
interface ItunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  trackTimeMillis: number;
}

function parseLrc(lrc: string): LrcLine[] {
  return lrc.split("\n").flatMap(line => {
    const m = line.match(/^\[(\d{1,3}):(\d{2})\.(\d{1,3})\](.*)/);
    if (!m) return [];
    const time = parseInt(m[1])*60 + parseInt(m[2]) + parseInt(m[3])/(m[3].length===3?1000:100);
    const text = m[4].trim();
    return text ? [{ time, text }] : [];
  });
}

function formatTime(s: number) {
  const m = Math.floor(s/60);
  const sec = Math.floor(s%60);
  return `${m}:${sec.toString().padStart(2,"0")}`;
}

export function LyricsPanel({ open, onClose, trackId, trackTitle, trackArtist, coverUrl }: LyricsPanelProps) {
  const {
    previewProgress, duration, seekTo,
    isPlaying, pause, resume, nextTrack, previousTrack,
    queue, removeFromQueue, clearQueue,
  } = useAudioPlayer();

  const currentTime = previewProgress;

  const [mainTab, setMainTab] = useState<"lyrics"|"extra">("lyrics");

  const [lyrics, setLyrics] = useState("");
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastTrackId, setLastTrackId] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [lyricsOffset, setLyricsOffsetRaw] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem(`lyricsOffset:${trackId}`) ?? "0") || 0; } catch { return 0; }
  });
  function setLyricsOffset(v: number) {
    const rounded = Math.round(v * 100) / 100;
    setLyricsOffsetRaw(rounded);
    try { localStorage.setItem(`lyricsOffset:${trackId}`, String(rounded)); } catch {}
  }

  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<"view"|"search"|"edit">("view");

  const [searchQuery, setSearchQuery] = useState("");
  const [itunesResults, setItunesResults] = useState<ItunesResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLButtonElement>(null);

  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const sleepRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startSleep(mins: number) {
    if (sleepRef.current) clearTimeout(sleepRef.current);
    setSleepMinutes(mins);
    setSleepRemaining(mins * 60);
    if (mins === 0) return;
    sleepRef.current = setTimeout(() => { pause(); setSleepMinutes(0); setSleepRemaining(0); }, mins * 60 * 1000);
  }

  useEffect(() => {
    if (sleepRemaining <= 0) return;
    const t = setInterval(() => setSleepRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [sleepRemaining > 0]);

  const activeIdx = lrcLines.length > 0
    ? lrcLines.reduce((best, l, i) => l.time + lyricsOffset <= currentTime ? i : best, -1)
    : -1;

  useEffect(() => {
    if (!autoScroll || activeIdx < 0) return;
    const container = lyricsContainerRef.current;
    const line = activeLineRef.current;
    if (!container || !line) return;
    const cRect = container.getBoundingClientRect();
    const lRect = line.getBoundingClientRect();
    const lineTopInContent = lRect.top - cRect.top + container.scrollTop;
    const target = lineTopInContent + lRect.height / 2 - container.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeIdx, autoScroll]);

  useEffect(() => {
    if (!open || !trackId || trackId === lastTrackId) return;
    setLastTrackId(trackId);
    setMode("view"); setShowResults(false); setSearchError(false); setAutoScroll(true);
    try { setLyricsOffsetRaw(parseFloat(localStorage.getItem(`lyricsOffset:${trackId}`) ?? "0") || 0); } catch {}
    setLoading(true);
    get<{ lyrics: string; synced_lyrics: string }>(`/api/tracks/${trackId}/lyrics`)
      .then(d => { setLyrics(d.lyrics ?? ""); setLrcLines(d.synced_lyrics ? parseLrc(d.synced_lyrics) : []); })
      .catch(() => { setLyrics(""); setLrcLines([]); })
      .finally(() => setLoading(false));
  }, [open, trackId, lastTrackId]);

  useEffect(() => { setSearchQuery(trackArtist ? `${trackArtist} ${trackTitle}` : trackTitle); }, [trackId, trackTitle, trackArtist]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (mode !== "view") { setMode("view"); return; } onClose(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose, mode]);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true); setSearchError(false); setShowResults(false);
    try {
      const results = await post<ItunesResult[]>(`/api/lyrics/itunes/search`, { query: searchQuery });
      setItunesResults(results ?? []); setShowResults(true);
    } catch { setSearchError(true); } finally { setSearching(false); }
  }

  async function handleAutoFetch() {
    setFetching(true); setSearchError(false);
    try {
      const d = await post<{ lyrics: string; synced_lyrics: string }>(`/api/tracks/${trackId}/lyrics/fetch`, {});
      setLyrics(d.lyrics ?? ""); setLrcLines(d.synced_lyrics ? parseLrc(d.synced_lyrics) : []); setMode("view");
    } catch { setSearchError(true); } finally { setFetching(false); }
  }

  async function handlePickItunes(result: ItunesResult) {
    setShowResults(false); setFetching(true); setSearchError(false);
    try {
      const found = await post<{ lyrics: string; synced_lyrics: string }>(
        `/api/lyrics/lrclib/fetch`,
        { trackId: result.trackId, artist: result.artistName, title: result.trackName, album: result.collectionName, durationMs: result.trackTimeMillis }
      );
      setLyrics(found.lyrics ?? ""); setLrcLines(found.synced_lyrics ? parseLrc(found.synced_lyrics) : []);
      await post(`/api/tracks/${trackId}/lyrics`, { lyrics: found.lyrics ?? "" });
      if (found.synced_lyrics) await post(`/api/tracks/${trackId}/lyrics/synced`, { synced_lyrics: found.synced_lyrics });
      setMode("view");
    } catch { setSearchError(true); } finally { setFetching(false); }
  }

  async function handleEditSave() {
    setSaving(true);
    try { await post(`/api/tracks/${trackId}/lyrics`, { lyrics: editText }); setLyrics(editText); setLrcLines([]); setMode("view"); }
    catch {} finally { setSaving(false); }
  }

  const hasSynced = lrcLines.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed inset-0 z-[200] flex flex-col select-none"
          style={{ background: "linear-gradient(to bottom, #0d0d0d 0%, #141414 100%)" }}
        >
          {coverUrl && (
            <div className="absolute inset-0 opacity-[0.12] blur-[80px] scale-110 pointer-events-none"
              style={{ backgroundImage:`url(${coverUrl})`, backgroundSize:"cover", backgroundPosition:"center" }} />
          )}

          <div className="relative z-10 flex flex-col h-full min-h-0">

            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-3 shrink-0">
              <button onClick={onClose}
                className="size-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors shrink-0">
                <X className="size-4 text-white" />
              </button>
              <div className="flex-1 min-w-0 text-center">
                <p className="text-white font-semibold text-sm truncate">{trackTitle}</p>
                {trackArtist && <p className="text-white/50 text-xs truncate">{trackArtist}</p>}
              </div>
              {mainTab === "lyrics" && (
                <div className="relative shrink-0">
                  <button onClick={() => setMenuOpen(v => !v)}
                    className="size-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                    <MoreHorizontal className="size-4 text-white" />
                  </button>
                  <AnimatePresence>
                    {menuOpen && (
                      <motion.div
                        initial={{ opacity:0, scale:0.9, y:-4 }} animate={{ opacity:1, scale:1, y:0 }}
                        exit={{ opacity:0, scale:0.9, y:-4 }} transition={{ duration: 0.12 }}
                        className="absolute right-0 top-10 z-50 min-w-[160px] rounded-xl border border-white/10 bg-[#1e1e1e] shadow-2xl overflow-hidden"
                        onClick={() => setMenuOpen(false)}
                      >
                        <button onClick={() => { setMode("search"); setShowResults(false); }}
                          className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors">
                          <Search className="size-4 text-white/60" /> 가사 검색
                        </button>
                        <button onClick={handleAutoFetch} disabled={fetching}
                          className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-40">
                          {fetching ? <Loader2 className="size-4 animate-spin text-white/60" /> : <RefreshCw className="size-4 text-white/60" />}
                          자동 검색
                        </button>
                        <div className="border-t border-white/10" />
                        <button onClick={() => { setEditText(lyrics); setMode("edit"); }}
                          className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors">
                          <Edit2 className="size-4 text-white/60" /> 직접 수정
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {mainTab === "extra" && <div className="size-8 shrink-0" />}
            </div>

            {/* Main tab bar */}
            <div className="flex px-5 gap-1 mb-2 shrink-0">
              {(["lyrics","extra"] as const).map(t => (
                <button key={t} onClick={() => setMainTab(t)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                    mainTab === t ? "bg-white/15 text-white" : "text-white/40 hover:text-white/60"
                  )}>
                  {t === "lyrics" ? "가사" : "부가기능"}
                </button>
              ))}
            </div>

            {/* LYRICS TAB */}
            {mainTab === "lyrics" && (
              <div className="flex-1 flex flex-col min-h-0">
                {mode === "search" && (
                  <div className="flex flex-col px-5 pb-2 min-h-0 flex-1">
                    <form onSubmit={handleSearch} className="flex gap-2 mb-3 shrink-0">
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        autoFocus placeholder="아티스트 · 곡명으로 iTunes 검색"
                        className="flex-1 bg-white/10 text-white placeholder-white/30 rounded-full px-4 py-2 text-sm outline-none focus:bg-white/15 transition-colors" />
                      <button type="submit" disabled={searching}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 transition-colors text-sm text-white disabled:opacity-40 shrink-0">
                        {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} 검색
                      </button>
                    </form>
                    {searchError && <p className="text-center text-red-400/80 text-sm mb-2 shrink-0">검색 중 오류가 발생했습니다</p>}
                    <div className="flex-1 overflow-y-auto min-h-0 rounded-xl border border-white/10 bg-[#1a1a1a]"
                      style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
                      {showResults && itunesResults.length === 0 && (
                        <p className="text-center text-white/40 text-sm py-4">검색 결과가 없습니다</p>
                      )}
                      {showResults && itunesResults.map((r, i) => (
                        <button key={i} onClick={() => handlePickItunes(r)} disabled={fetching}
                          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0 disabled:opacity-40">
                          <img src={r.artworkUrl100} alt="" className="size-10 rounded-lg object-cover shrink-0" />
                          <div className="min-w-0 text-left">
                            <p className="text-white text-sm font-medium truncate">{r.trackName}</p>
                            <p className="text-white/50 text-xs truncate">{r.artistName} · {r.collectionName}</p>
                          </div>
                          {fetching && <Loader2 className="size-4 animate-spin text-white/40 ml-auto shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setMode("view")}
                      className="mt-3 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-sm text-white/70 shrink-0 self-start">
                      돌아가기
                    </button>
                  </div>
                )}

                {mode === "edit" && (
                  <div className="px-5 pb-4 flex-1 flex flex-col gap-3 min-h-0">
                    <textarea value={editText} onChange={e => setEditText(e.target.value)}
                      autoFocus
                      className="flex-1 min-h-0 bg-white/5 text-white/90 rounded-xl p-4 text-sm font-mono leading-relaxed resize-none outline-none border border-white/10 focus:border-white/20 transition-colors overflow-y-auto"
                      style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                      placeholder="가사를 직접 입력하거나 붙여넣기..." />
                    <div className="flex gap-2 justify-end shrink-0">
                      <button onClick={() => setMode("view")}
                        className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-sm text-white/70">
                        취소
                      </button>
                      <button onClick={handleEditSave} disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-sm text-white disabled:opacity-40">
                        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} 저장
                      </button>
                    </div>
                  </div>
                )}

                {mode === "view" && (
                  <div ref={lyricsContainerRef}
                    className="flex-1 overflow-y-auto px-6 min-h-0"
                    style={{ paddingBottom: "180px", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                    onPointerDown={() => setAutoScroll(false)}
                  >
                    {loading ? (
                      <div className="flex justify-center pt-20"><Loader2 className="size-7 animate-spin text-white/30" /></div>
                    ) : hasSynced ? (
                      <div className="flex flex-col py-16">
                        {lrcLines.map((line, i) => {
                          const isActive = i === activeIdx;
                          const isPast = i < activeIdx;
                          return (
                            <button key={i} ref={isActive ? activeLineRef : undefined}
                              onClick={() => { seekTo(line.time + lyricsOffset); setAutoScroll(true); }}
                              className={cn(
                                "text-left px-2 py-1.5 rounded-xl transition-all duration-300 leading-tight",
                                isActive ? "text-white font-bold text-[28px]"
                                  : isPast ? "text-white/25 text-xl hover:text-white/50"
                                  : "text-white/45 text-xl hover:text-white/65"
                              )}>
                              {line.text}
                            </button>
                          );
                        })}
                      </div>
                    ) : lyrics ? (
                      <pre className="text-white/80 text-lg leading-relaxed whitespace-pre-wrap pt-4" style={{ fontFamily:"inherit" }}>
                        {lyrics}
                      </pre>
                    ) : (
                      <div className="flex flex-col items-center pt-24 gap-3 text-white/30">
                        <p className="text-lg font-medium">가사 없음</p>
                        <p className="text-sm">우측 상단 ··· 메뉴에서 검색하거나 직접 입력하세요</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* EXTRA TAB */}
            {mainTab === "extra" && (
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-5 pb-[180px]"
                style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ListMusic className="size-4 text-white/50" />
                      <span className="text-white/70 text-sm font-medium">재생 대기열</span>
                      {queue.length > 0 && <span className="text-white/30 text-xs">{queue.length}곡</span>}
                    </div>
                    {queue.length > 0 && (
                      <button onClick={clearQueue}
                        className="text-xs text-white/30 hover:text-white/60 transition-colors px-2 py-1">
                        전체 삭제
                      </button>
                    )}
                  </div>
                  {queue.length === 0 ? (
                    <p className="text-white/25 text-sm py-4 text-center">대기열이 비어있습니다</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {queue.map((track, i) => (
                        <div key={`${track.id}-${i}`}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/8 transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-white/10 shrink-0 overflow-hidden">
                            {track.coverUrl && <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-medium truncate">{track.title}</p>
                            <p className="text-white/40 text-[11px] truncate">{track.artist || track.projectName || ""}</p>
                          </div>
                          <button onClick={() => removeFromQueue(i)}
                            className="text-white/20 hover:text-red-400/70 transition-colors shrink-0 p-1">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-white/70 text-sm font-medium">수면 타이머</span>
                    {sleepMinutes > 0 && (
                      <span className="text-white/40 text-xs">
                        {Math.floor(sleepRemaining/60)}:{String(sleepRemaining%60).padStart(2,"0")} 후 정지
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[0, 10, 15, 20, 30, 45, 60].map(m => (
                      <button key={m} onClick={() => startSleep(m)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs transition-colors",
                          sleepMinutes === m && m > 0
                            ? "bg-white/20 text-white"
                            : m === 0 && sleepMinutes === 0
                            ? "bg-white/10 text-white/50"
                            : "bg-white/8 text-white/40 hover:bg-white/15 hover:text-white/70"
                        )}>
                        {m === 0 ? "끄기" : `${m}분`}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* Bottom controls */}
            <div className="absolute bottom-0 left-0 right-0 px-5 pb-6 pt-4 shrink-0"
              style={{ background:"linear-gradient(to top, #0d0d0d 60%, transparent)" }}>
              {lrcLines.length > 0 && mainTab === "lyrics" && mode === "view" && (
                <div className="flex items-center justify-center gap-1 mb-3">
                  {[-10, -5, -1, -0.5].map(v => (
                    <button key={v} onClick={() => setLyricsOffset(lyricsOffset + v)}
                      className="px-2 py-1 rounded-lg bg-white/8 hover:bg-white/15 text-white/50 hover:text-white/80 text-xs transition-colors">
                      {v}s
                    </button>
                  ))}
                  <button onClick={() => setLyricsOffset(0)}
                    className={`px-2 py-1 rounded-lg text-xs transition-colors mx-0.5 ${lyricsOffset !== 0 ? "bg-white/15 text-white hover:bg-white/25" : "bg-white/5 text-white/25"}`}>
                    {lyricsOffset > 0 ? `+${lyricsOffset}s` : lyricsOffset !== 0 ? `${lyricsOffset}s` : "0s"}
                  </button>
                  {[0.5, 1, 5, 10].map(v => (
                    <button key={v} onClick={() => setLyricsOffset(lyricsOffset + v)}
                      className="px-2 py-1 rounded-lg bg-white/8 hover:bg-white/15 text-white/50 hover:text-white/80 text-xs transition-colors">
                      +{v}s
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-white/40 text-xs w-8 text-right">{formatTime(currentTime)}</span>
                <div className="flex-1 relative h-1 bg-white/15 rounded-full cursor-pointer"
                  onClick={e => { const rect = e.currentTarget.getBoundingClientRect(); seekTo(((e.clientX - rect.left) / rect.width) * duration); }}>
                  <div className="absolute left-0 top-0 h-full bg-white rounded-full transition-all"
                    style={{ width:`${duration > 0 ? (previewProgress/duration)*100 : 0}%` }} />
                </div>
                <span className="text-white/40 text-xs w-8">{formatTime(duration)}</span>
              </div>
              <div className="flex items-center justify-center gap-8">
                <button onClick={previousTrack} className="text-white/60 hover:text-white transition-colors">
                  <SkipBack className="size-6 fill-current" />
                </button>
                <button onClick={isPlaying ? pause : resume}
                  className="size-14 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 transition-transform active:scale-95">
                  {isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current ml-0.5" />}
                </button>
                <button onClick={nextTrack} className="text-white/60 hover:text-white transition-colors">
                  <SkipForward className="size-6 fill-current" />
                </button>
              </div>
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCwIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react'
import {
  getKBOGames, getKBOBoxscore, getKBOStandings,
  type KBOGame, type KBOBoxscore,
} from '@/api/kbo'

export const Route = createFileRoute('/_main/kbo/')({
  component: KBOPage,
})

// ── Team info ──────────────────────────────────────────────────────────────────
const TEAM_INFO: Record<string, { color: string; bg: string; code: string }> = {
  'KIA':  { color: '#fff',     bg: '#EA0029', code: 'HT' },
  '삼성': { color: '#fff',     bg: '#074CA1', code: 'SS' },
  'LG':   { color: '#fff',     bg: '#C30452', code: 'LG' },
  '두산': { color: '#fff',     bg: '#131230', code: 'OB' },
  'KT':   { color: '#fff',     bg: '#000000', code: 'KT' },
  'SSG':  { color: '#fff',     bg: '#CE0E2D', code: 'SK' },
  '롯데': { color: '#fff',     bg: '#D00F31', code: 'LT' },
  '한화': { color: '#fff',     bg: '#FF6600', code: 'HH' },
  'NC':   { color: '#a18a5f', bg: '#071D41', code: 'NC' },
  '키움': { color: '#fff',     bg: '#570514', code: 'NX' },
}

function teamKey(name: string) {
  for (const key of Object.keys(TEAM_INFO)) {
    if (name.includes(key)) return key
  }
  return null
}

function TeamBadge({ name, size = 44 }: { name: string; size?: number }) {
  const key = teamKey(name)
  const info = key ? TEAM_INFO[key] : null
  const logoUrl = info
    ? `https://www.koreabaseball.com/images/team/emblem/${info.code}_l.png`
    : null

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: size }}>
      <div style={{ width: size, height: size }} className="relative">
        {logoUrl && (
          <img
            src={logoUrl} alt={name} width={size} height={size}
            className="object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const sib = e.currentTarget.nextElementSibling as HTMLElement
              if (sib) sib.style.display = 'flex'
            }}
          />
        )}
        <div
          style={{
            width: size, height: size,
            backgroundColor: info?.bg ?? '#333',
            color: info?.color ?? '#fff',
            display: logoUrl ? 'none' : 'flex',
          }}
          className="rounded-full items-center justify-center text-xs font-bold absolute inset-0"
        >
          {key ?? name.slice(0, 2)}
        </div>
      </div>
      <span className="text-[11px] text-white/60 text-center leading-tight">{name}</span>
    </div>
  )
}

// ── Inning score table ────────────────────────────────────────────────────────
function InningTable({ game }: { game: KBOGame }) {
  const innings = Math.max(game.away_innings?.length ?? 0, game.home_innings?.length ?? 0)
  if (innings === 0) return null

  const labels = Array.from({ length: innings }, (_, i) => String(i + 1))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-center border-collapse min-w-[320px]">
        <thead>
          <tr className="text-white/30">
            <th className="text-left px-2 py-1.5 w-16 font-normal">팀</th>
            {labels.map(l => (
              <th key={l} className="px-1.5 py-1.5 font-normal w-7">{l}</th>
            ))}
            <th className="px-2 py-1.5 font-semibold text-white/50">R</th>
          </tr>
        </thead>
        <tbody>
          {[
            { team: game.away_team, innings: game.away_innings, score: game.away_score },
            { team: game.home_team, innings: game.home_innings, score: game.home_score },
          ].map(({ team, innings: inn, score }) => (
            <tr key={team} className="border-t border-white/5">
              <td className="text-left px-2 py-2 text-white/70 font-medium truncate max-w-[60px]">
                {teamKey(team) ?? team}
              </td>
              {labels.map((_, i) => (
                <td key={i} className="px-1.5 py-2 text-white/60">
                  {inn?.[i] ?? '-'}
                </td>
              ))}
              <td className="px-2 py-2 text-white font-bold">{score || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Pitcher line ──────────────────────────────────────────────────────────────
function PitcherLine({ win, lose, save }: { win: string; lose: string; save: string }) {
  if (!win && !lose) return null
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50 mt-3 px-1">
      {win  && <span><span className="text-green-400/80">승</span> {win}</span>}
      {lose && <span><span className="text-red-400/80">패</span> {lose}</span>}
      {save && <span><span className="text-blue-400/80">세</span> {save}</span>}
    </div>
  )
}

// ── Boxscore modal ────────────────────────────────────────────────────────────
function BoxscoreModal({
  game, onClose,
}: { game: KBOGame; onClose: () => void }) {
  const [tab, setTab] = useState<'batting' | 'pitching'>('batting')

  const { data: bs, isLoading } = useQuery({
    queryKey: ['kbo-boxscore', game.game_key],
    queryFn: () => getKBOBoxscore(game.date, game.game_key),
    enabled: !!game.game_key,
    staleTime: 5 * 60 * 1000,
  })

  const awayKey = teamKey(game.away_team)
  const homeKey = teamKey(game.home_team)
  const awayWon = parseInt(game.away_score) > parseInt(game.home_score)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#111] w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[88vh] flex flex-col overflow-hidden border border-white/8">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-center gap-4">
            <TeamBadge name={game.away_team} size={36} />
            <div className="text-center">
              {(game.status === '경기종료' || game.status === '경기중') && game.away_score ? (
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${awayWon ? 'text-white' : 'text-white/40'}`}>
                    {game.away_score}
                  </span>
                  <span className="text-white/20">:</span>
                  <span className={`text-2xl font-bold ${!awayWon ? 'text-white' : 'text-white/40'}`}>
                    {game.home_score}
                  </span>
                </div>
              ) : (
                <span className="text-white/30 text-lg">vs</span>
              )}
              <p className="text-[10px] text-white/30 mt-0.5">{game.stadium} {game.time}</p>
            </div>
            <TeamBadge name={game.home_team} size={36} />
          </div>
          <button onClick={onClose} className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/8">
            <XIcon className="size-4" />
          </button>
        </div>

        {/* Status badge */}
        <div className="px-5 mb-3 shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded-full ${
            game.status === '경기종료' ? 'bg-white/8 text-white/50' :
            game.status === '경기중'   ? 'bg-red-500/20 text-red-400' :
            'bg-white/5 text-white/30'
          }`}>
            {game.status === '경기중' && game.inning ? `${game.inning}회 진행중` : game.status}
          </span>
        </div>

        {/* Inning scores */}
        <div className="px-4 mb-3 shrink-0">
          <InningTable game={game} />
        </div>

        {/* Pitchers */}
        {game.status === '경기종료' && (
          <div className="px-5 mb-4 shrink-0">
            <PitcherLine
              win={game.win_pitcher}
              lose={game.lose_pitcher}
              save={game.save_pitcher}
            />
          </div>
        )}

        {/* Boxscore tabs */}
        {game.game_key && (
          <>
            <div className="flex border-t border-white/8 shrink-0">
              {(['batting', 'pitching'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-3 text-xs font-medium transition-colors ${
                    tab === t ? 'text-white border-b-2 border-white' : 'text-white/30 hover:text-white/60'
                  }`}
                >
                  {t === 'batting' ? '타자 기록' : '투수 기록'}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto flex-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-white/30 text-sm">
                  불러오는 중...
                </div>
              ) : bs ? (
                tab === 'batting' ? (
                  <BoxscoreBatting
                    awayTeam={awayKey ?? game.away_team}
                    homeTeam={homeKey ?? game.home_team}
                    awayBatting={bs.away_batting ?? []}
                    homeBatting={bs.home_batting ?? []}
                  />
                ) : (
                  <BoxscorePitching
                    awayTeam={awayKey ?? game.away_team}
                    homeTeam={homeKey ?? game.home_team}
                    awayPitching={bs.away_pitching ?? []}
                    homePitching={bs.home_pitching ?? []}
                  />
                )
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BoxscoreBatting({
  awayTeam, homeTeam, awayBatting, homeBatting,
}: { awayTeam: string; homeTeam: string; awayBatting: KBOBoxscore['away_batting']; homeBatting: KBOBoxscore['home_batting'] }) {
  const cols = ['타수', '안타', '홈런', '타점', '볼넷', '삼진', '타율']
  const render = (batters: typeof awayBatting) => (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-white/30 border-b border-white/5">
          <th className="text-left px-4 py-2 font-normal">선수</th>
          {cols.map(c => <th key={c} className="px-2 py-2 font-normal text-center">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {batters.length === 0 ? (
          <tr><td colSpan={8} className="text-center py-6 text-white/20 text-xs">데이터 없음</td></tr>
        ) : batters.map((b, i) => (
          <tr key={i} className="border-t border-white/5 hover:bg-white/3">
            <td className="px-4 py-2 text-white/80">
              <span className="text-white/30 mr-2 text-[10px]">{b.pos}</span>{b.name}
            </td>
            <td className="px-2 py-2 text-center text-white/50">{b.ab}</td>
            <td className="px-2 py-2 text-center text-white/50">{b.h}</td>
            <td className="px-2 py-2 text-center text-white/50">{b.hr}</td>
            <td className="px-2 py-2 text-center text-white/50">{b.rbi}</td>
            <td className="px-2 py-2 text-center text-white/50">{b.bb}</td>
            <td className="px-2 py-2 text-center text-white/50">{b.so}</td>
            <td className="px-2 py-2 text-center text-white/40 text-[11px]">{b.avg}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div>
      <div className="px-4 py-2 text-xs text-white/40 font-medium bg-white/3">{awayTeam} (원정)</div>
      {render(awayBatting)}
      <div className="px-4 py-2 text-xs text-white/40 font-medium bg-white/3 mt-1">{homeTeam} (홈)</div>
      {render(homeBatting)}
    </div>
  )
}

function BoxscorePitching({
  awayTeam, homeTeam, awayPitching, homePitching,
}: { awayTeam: string; homeTeam: string; awayPitching: KBOBoxscore['away_pitching']; homePitching: KBOBoxscore['home_pitching'] }) {
  const cols = ['이닝', '피안타', '실점', '자책', '볼넷', '삼진', 'ERA']
  const render = (pitchers: typeof awayPitching) => (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-white/30 border-b border-white/5">
          <th className="text-left px-4 py-2 font-normal">선수</th>
          {cols.map(c => <th key={c} className="px-2 py-2 font-normal text-center">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {pitchers.length === 0 ? (
          <tr><td colSpan={8} className="text-center py-6 text-white/20 text-xs">데이터 없음</td></tr>
        ) : pitchers.map((p, i) => (
          <tr key={i} className="border-t border-white/5 hover:bg-white/3">
            <td className="px-4 py-2 text-white/80">{p.name}</td>
            <td className="px-2 py-2 text-center text-white/50">{p.ip}</td>
            <td className="px-2 py-2 text-center text-white/50">{p.h}</td>
            <td className="px-2 py-2 text-center text-white/50">{p.r}</td>
            <td className="px-2 py-2 text-center text-white/50">{p.er}</td>
            <td className="px-2 py-2 text-center text-white/50">{p.bb}</td>
            <td className="px-2 py-2 text-center text-white/50">{p.so}</td>
            <td className="px-2 py-2 text-center text-white/40 text-[11px]">{p.era}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div>
      <div className="px-4 py-2 text-xs text-white/40 font-medium bg-white/3">{awayTeam} (원정)</div>
      {render(awayPitching)}
      <div className="px-4 py-2 text-xs text-white/40 font-medium bg-white/3 mt-1">{homeTeam} (홈)</div>
      {render(homePitching)}
    </div>
  )
}

// ── Game card ─────────────────────────────────────────────────────────────────
function GameCard({ game, onClick }: { game: KBOGame; onClick: () => void }) {
  const isFinished = game.status === '경기종료'
  const isLive     = game.status === '경기중'
  const isCanceled = game.status === '취소'
  const awayInt = parseInt(game.away_score)
  const homeInt = parseInt(game.home_score)

  return (
    <button
      onClick={onClick}
      className="w-full bg-[#161616] border border-[#1e1e1e] rounded-2xl p-4 text-left hover:border-white/10 active:bg-white/5 transition-colors"
    >
      {/* top row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {game.stadium && <span className="text-[#444] text-xs">{game.stadium}</span>}
          {game.time    && <span className="text-[#333] text-xs">{game.time}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {isLive && <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />}
          <span className={`text-xs font-medium ${
            isLive     ? 'text-red-400' :
            isFinished ? 'text-[#555]'  :
            isCanceled ? 'text-yellow-600' : 'text-[#444]'
          }`}>
            {isLive && game.inning ? `${game.inning}회` : game.status}
          </span>
        </div>
      </div>

      {/* teams & score */}
      <div className="flex items-center justify-between gap-4">
        <TeamBadge name={game.away_team} size={44} />
        <div className="flex-1 flex items-center justify-center gap-3">
          {(isFinished || isLive) && game.away_score ? (
            <>
              <span className={`text-3xl font-bold tabular-nums ${isFinished && awayInt > homeInt ? 'text-white' : 'text-[#555]'}`}>
                {game.away_score}
              </span>
              <span className="text-[#333] text-xl font-light">:</span>
              <span className={`text-3xl font-bold tabular-nums ${isFinished && homeInt > awayInt ? 'text-white' : 'text-[#555]'}`}>
                {game.home_score}
              </span>
            </>
          ) : isCanceled ? (
            <span className="text-yellow-700 text-sm">취소</span>
          ) : (
            <span className="text-[#333] text-2xl font-light">vs</span>
          )}
        </div>
        <TeamBadge name={game.home_team} size={44} />
      </div>

      {/* pitcher summary */}
      {isFinished && game.win_pitcher && (
        <div className="mt-3 flex gap-3 text-xs text-white/30 border-t border-white/5 pt-3">
          {game.win_pitcher  && <span><span className="text-green-400/60">승</span> {game.win_pitcher}</span>}
          {game.lose_pitcher && <span><span className="text-red-400/60">패</span> {game.lose_pitcher}</span>}
          {game.save_pitcher && <span><span className="text-blue-400/60">세</span> {game.save_pitcher}</span>}
        </div>
      )}
    </button>
  )
}

// ── Standings tab ─────────────────────────────────────────────────────────────
function StandingsTab() {
  const { data: standings = [], isLoading } = useQuery({
    queryKey: ['kbo-standings'],
    queryFn: getKBOStandings,
    staleTime: 10 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 px-4 pt-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-10 bg-[#161616] rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (standings.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-4">📊</p>
        <p className="text-white/40 text-sm">순위 데이터를 불러올 수 없습니다</p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-36">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-white/30 text-xs">
            <th className="text-center py-3 w-8 font-normal">순위</th>
            <th className="text-left py-3 font-normal pl-2">팀</th>
            <th className="text-center py-3 font-normal">경기</th>
            <th className="text-center py-3 font-normal">승</th>
            <th className="text-center py-3 font-normal">패</th>
            <th className="text-center py-3 font-normal">무</th>
            <th className="text-center py-3 font-normal">승률</th>
            <th className="text-center py-3 font-normal">GB</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const key = teamKey(s.team)
            const info = key ? TEAM_INFO[key] : null
            return (
              <tr key={i} className="border-t border-white/5 hover:bg-white/3">
                <td className="text-center py-3 text-white/40 text-xs">{s.rank}</td>
                <td className="py-3 pl-2">
                  <div className="flex items-center gap-2">
                    {info && (
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: info.bg }}
                      />
                    )}
                    <span className="text-white/80">{s.team}</span>
                  </div>
                </td>
                <td className="text-center py-3 text-white/50 text-xs">{s.games}</td>
                <td className="text-center py-3 text-white/50 text-xs">{s.win}</td>
                <td className="text-center py-3 text-white/50 text-xs">{s.lose}</td>
                <td className="text-center py-3 text-white/50 text-xs">{s.draw}</td>
                <td className="text-center py-3 text-white/70 text-xs font-medium">{s.win_pct}</td>
                <td className="text-center py-3 text-white/30 text-xs">{s.gb || '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function dateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${dd}`
}

function dateLabel(d: Date) {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}.${d.getDate()} (${days[d.getDay()]})`
}

function isMonday(d: Date) {
  return d.getDay() === 1
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function KBOPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [activeTab, setActiveTab] = useState<'games' | 'standings'>('games')
  const [selectedGame, setSelectedGame] = useState<KBOGame | null>(null)

  const { data: games = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['kbo-games', dateStr(selectedDate)],
    queryFn: () => getKBOGames(dateStr(selectedDate)),
    staleTime: 3 * 60 * 1000,
    enabled: activeTab === 'games',
  })

  const moveDate = (delta: number) => {
    setSelectedDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + delta)
      return d
    })
  }

  const isToday = dateStr(selectedDate) === dateStr(new Date())
  const monday = isMonday(selectedDate)

  return (
    <div className="min-h-screen bg-[#111] text-white pt-24 md:pt-32">
      {/* Header */}
      <div className="flex items-center justify-between px-5 mb-5">
        <div>
          <h1 className="text-2xl font-bold">KBO 리그</h1>
          <p className="text-[#555] text-sm mt-0.5">한국 프로야구</p>
        </div>
        {activeTab === 'games' && (
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 text-[#555] hover:text-white transition-colors rounded-lg hover:bg-white/8"
          >
            <RefreshCwIcon className={`size-4.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex px-5 gap-1 mb-5">
        {(['games', 'standings'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === t
                ? 'bg-white text-black'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {t === 'games' ? '경기 일정' : '팀 순위'}
          </button>
        ))}
      </div>

      {activeTab === 'standings' ? (
        <StandingsTab />
      ) : (
        <>
          {/* Date nav */}
          <div className="flex items-center justify-between px-5 mb-5">
            <button
              onClick={() => moveDate(-1)}
              className="p-2 text-[#555] hover:text-white transition-colors rounded-xl hover:bg-white/8"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <div className="text-center">
              <p className="text-white font-semibold">{dateLabel(selectedDate)}</p>
              {isToday && <p className="text-[#444] text-xs mt-0.5">오늘</p>}
              {monday && <p className="text-yellow-600/70 text-xs mt-0.5">월요일</p>}
            </div>
            <button
              onClick={() => moveDate(1)}
              className="p-2 text-[#555] hover:text-white transition-colors rounded-xl hover:bg-white/8"
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </div>

          {/* Game list */}
          <div className="px-4 space-y-3 pb-36">
            {monday ? (
              <div className="text-center py-20">
                <p className="text-5xl mb-4">🌙</p>
                <p className="text-white/50 font-medium">월요일은 경기가 없습니다</p>
                <p className="text-[#444] text-sm mt-1">화요일부터 경기가 시작됩니다</p>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-[#161616] border border-[#1e1e1e] rounded-2xl p-4 h-32 animate-pulse" />
                ))}
              </div>
            ) : games.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-5xl mb-4">⚾</p>
                <p className="text-[#555] text-sm">이 날은 경기가 없습니다</p>
              </div>
            ) : (
              games.map((game, i) => (
                <GameCard key={i} game={game} onClick={() => setSelectedGame(game)} />
              ))
            )}
          </div>
        </>
      )}

      {selectedGame && (
        <BoxscoreModal game={selectedGame} onClose={() => setSelectedGame(null)} />
      )}
    </div>
  )
}

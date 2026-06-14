import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useAudioPlayer } from '@/contexts/AudioPlayerContext'
import { useAuth } from '@/contexts/AuthContext'
import { listPlaylists } from '@/api/playlists'
import {
  HomeIcon, SearchIcon, LibraryIcon, ListMusicIcon,
  BookOpenIcon, ClockIcon, CircleIcon, HardDriveIcon, UserIcon,
  PlayIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  onSearchOpen: () => void
}

export function Sidebar({ onSearchOpen }: SidebarProps) {
  const routerState = useRouterState()
  const path = routerState.location.pathname
  const { currentTrack, isPlaying } = useAudioPlayer()
  const { user } = useAuth()

  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists'],
    queryFn: listPlaylists,
    staleTime: 30 * 1000,
  })

  const isActive = (to: string) =>
    to === '/' ? path === '/' : path.startsWith(to)

  const NavItem = ({
    to, icon: Icon, label, onClick,
  }: {
    to?: string; icon: React.ComponentType<any>; label: string; onClick?: () => void
  }) => {
    const active = to ? isActive(to) : false
    const cls = cn(
      'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors w-full text-left',
      active
        ? 'bg-white/10 text-white font-medium'
        : 'text-white/50 hover:text-white hover:bg-white/6'
    )
    if (onClick) {
      return (
        <button onClick={onClick} className={cls}>
          <Icon className="size-4 shrink-0" />
          <span>{label}</span>
        </button>
      )
    }
    return (
      <Link to={to!} className={cls}>
        <Icon className="size-4 shrink-0" />
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border-r border-white/6">
      {/* Logo */}
      <div className="px-5 pt-7 pb-5 shrink-0">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="size-7 rounded-lg bg-white/10 flex items-center justify-center">
            <PlayIcon className="size-3.5 text-white fill-white" />
          </div>
          <span className="text-white font-semibold text-base tracking-tight">arbiter</span>
        </Link>
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5 scrollbar-hide">
        {/* Main nav */}
        <div className="mb-4">
          <NavItem to="/" icon={HomeIcon} label="홈" />
          <NavItem icon={SearchIcon} label="검색" onClick={onSearchOpen} />
          <NavItem to="/storage" icon={LibraryIcon} label="라이브러리" />
        </div>

        {/* Playlists */}
        {playlists.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-white/25 font-semibold uppercase tracking-widest px-3 mb-2">
              플레이리스트
            </p>
            {playlists.map((pl) => (
              <Link
                key={pl.public_id}
                to="/playlists"
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors w-full',
                  path === '/playlists'
                    ? 'text-white/70'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/6'
                )}
              >
                <div className="size-2 rounded-full shrink-0 bg-white/30" />
                <span className="truncate">{pl.name}</span>
              </Link>
            ))}
            <Link
              to="/playlists"
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-white/25 hover:text-white/50 transition-colors"
            >
              <ListMusicIcon className="size-3.5" />
              <span>전체 보기</span>
            </Link>
          </div>
        )}

        {playlists.length === 0 && (
          <div className="mb-4">
            <NavItem to="/playlists" icon={ListMusicIcon} label="플레이리스트" />
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-white/6 my-3 mx-2" />

        {/* Extra */}
        <div>
          <NavItem to="/report" icon={BookOpenIcon} label="리포트" />
          <NavItem to="/history" icon={ClockIcon} label="히스토리" />
          <NavItem to="/kbo" icon={CircleIcon} label="KBO" />
          <NavItem to="/storage" icon={HardDriveIcon} label="스토리지" />
          <NavItem to="/profile" icon={UserIcon} label="프로필" />
        </div>
      </div>

      {/* Now playing mini */}
      {currentTrack && (
        <div className="px-3 pb-3 shrink-0">
          <div className="bg-white/5 rounded-2xl p-3 flex items-center gap-3">
            <div className="size-9 shrink-0 rounded-lg overflow-hidden bg-white/10">
              {currentTrack.coverUrl ? (
                <img
                  src={currentTrack.coverUrl}
                  alt={currentTrack.title}
                  className="size-9 object-cover"
                />
              ) : (
                <div className="size-9 flex items-center justify-center">
                  <PlayIcon className="size-3 text-white/30 fill-white/30" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{currentTrack.title}</p>
              <p className="text-white/40 text-[11px] truncate">{currentTrack.artist || currentTrack.projectName || '—'}</p>
            </div>
            {isPlaying && (
              <div className="flex gap-0.5 items-end h-4 shrink-0">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-white/60 rounded-full animate-pulse"
                    style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* User */}
      <div className="px-4 pb-5 pt-1 shrink-0 border-t border-white/6">
        <Link to="/profile" className="flex items-center gap-2.5 hover:opacity-70 transition-opacity">
          <div className="size-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <span className="text-white/70 text-xs font-medium">
              {user?.username?.[0]?.toUpperCase() ?? 'U'}
            </span>
          </div>
          <span className="text-white/50 text-xs truncate">{user?.username}</span>
        </Link>
      </div>
    </div>
  )
}

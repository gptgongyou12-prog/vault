import {
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import {
  SearchIcon, UserIcon, ChevronLeft,
  ClockIcon, ListMusicIcon, LayoutGridIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFolder, useAllFolders, useUpdateFolder } from "@/hooks/useFolders";
import type { Folder } from "@/types/api";
import { toast } from "@/routes/__root";
import GlobalSearchModal from "@/components/GlobalSearchModal";
import { Sidebar } from "@/components/Sidebar";
import { LyricsSidePanel } from "@/components/LyricsSidePanel";
import { SubscriptionBlock } from "@/components/SubscriptionBlock";

export const Route = createFileRoute("/_main")({
  component: MainLayout,
});

const BOTTOM_NAV = [
  { icon: LayoutGridIcon, label: "홈",        to: "/"            },
  { icon: SearchIcon,     label: "검색",       action: "search"   },
  { icon: ClockIcon,      label: "히스토리",   to: "/history"     },
  { icon: ListMusicIcon,  label: "플레이리스트", to: "/playlists" },
  { icon: UserIcon,       label: "프로필",     to: "/profile"     },
] as const;

function MobileBottomNav({
  pathname,
  onSearch,
}: {
  pathname: string;
  onSearch: () => void;
}) {
  const isActive = (to?: string) => {
    if (!to) return false;
    if (to === "/") return pathname === "/" || pathname.startsWith("/folder/");
    return pathname.startsWith(to);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] md:hidden bg-[#111]/90 backdrop-blur-xl border-t border-white/8 safe-area-inset-bottom">
      <div className="flex items-stretch h-14">
        {BOTTOM_NAV.map((item) => {
          const Icon = item.icon;
          const active = "to" in item ? isActive(item.to) : false;
          const inner = (
            <button
              type="button"
              onClick={"action" in item ? onSearch : undefined}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors active:opacity-60 ${
                active ? "text-white" : "text-white/35"
              }`}
            >
              <Icon
                strokeWidth={active ? 2.2 : 1.6}
                className="size-5 shrink-0"
              />
              <span
                className="text-[9px] font-medium tracking-wide"
                style={{ fontFamily: "inherit" }}
              >
                {item.label}
              </span>
              {active && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-amber-400 rounded-full" />
              )}
            </button>
          );

          if ("to" in item) {
            return (
              <Link
                key={item.label}
                to={item.to}
                className="flex flex-1 relative items-stretch"
              >
                {inner}
              </Link>
            );
          }
          return (
            <div key={item.label} className="flex flex-1 relative items-stretch">
              {inner}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function MainLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { currentTrack } = useAudioPlayer();

  const pathname = routerState.location.pathname;
  const isFolderRoute = pathname.startsWith("/folder/");
  const folderIdMatch = pathname.match(/^\/folder\/(\d+)/);
  const folderId = folderIdMatch ? parseInt(folderIdMatch[1], 10) : undefined;

  const { data: folder, isLoading: folderLoading } = useFolder(folderId);
  const { data: allFolders } = useAllFolders();
  const updateFolder = useUpdateFolder();

  const [folderName, setFolderName] = useState("");
  const folderNameInputRef = useRef<HTMLInputElement>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const breadcrumb = useMemo(() => {
    if (!isFolderRoute || !folder || !allFolders) return [];
    const folderMap = new Map<number, Folder>();
    allFolders.forEach((f) => folderMap.set(f.id, f));
    const path: Folder[] = [];
    let cur: Folder | undefined = folder;
    while (cur) {
      path.unshift(cur);
      cur = cur.parent_id ? folderMap.get(cur.parent_id) : undefined;
    }
    return path;
  }, [isFolderRoute, folder, allFolders]);

  const handleBreadcrumbClick = (id: number | null) => {
    if (id === null) navigate({ to: "/" });
    else navigate({ to: "/folder/$folderId", params: { folderId: String(id) } });
  };

  const handleBack = () => {
    if (!folder) return;
    if (folder.parent_id)
      navigate({ to: "/folder/$folderId", params: { folderId: String(folder.parent_id) } });
    else navigate({ to: "/" });
  };

  const isDeeplyNested = breadcrumb.length >= 2;

  const isFolderNameSet = useMemo(() => {
    if (!folder?.name?.trim()) return false;
    return Math.abs(new Date(folder.updated_at).getTime() - new Date(folder.created_at).getTime()) > 1000;
  }, [folder?.created_at, folder?.updated_at, folder?.name]);

  useEffect(() => {
    if (folder) setFolderName(isFolderNameSet ? folder.name : "");
  }, [folder?.id, folder?.name, isFolderNameSet]);

  const handleSaveFolderName = async () => {
    if (!folder || !folderId) return;
    const nameToSave = folderName.trim() || "New Folder";
    if (nameToSave === (folder.name || "").trim()) { if (!folderName.trim()) setFolderName("New Folder"); return; }
    try {
      await updateFolder.mutateAsync({ id: folderId, data: { name: nameToSave } });
      setFolderName(nameToSave);
    } catch { toast.error("Failed to update folder name"); setFolderName(folder.name || "New Folder"); }
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate({ to: "/login", replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === "KeyF") {
        e.preventDefault(); setIsSearchOpen((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);



  if (isLoading || !isAuthenticated) return <div className="min-h-screen bg-background" />;

  // Subscription block checks
  const isExpired = !!(user?.subscription_expires_at && new Date(user.subscription_expires_at) < new Date());
  const isTrialExpired = user?.subscription_type === "trial" && isExpired;
  const isWarningBlocked = !!(user?.subscription_warning_enabled && isExpired);

  const folderInput = (ref?: React.RefObject<HTMLInputElement | null>) => (
    <input
      ref={ref} type="text" tabIndex={0}
      value={folderName} onChange={(e) => setFolderName(e.target.value)}
      onBlur={handleSaveFolderName}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className="text-2xl font-medium bg-transparent border-none p-0 m-0 h-auto outline-none text-white placeholder:text-white/50 focus:outline-none focus:ring-0 truncate"
      placeholder="New Folder"
    />
  );

  return (
    <>
      {/* ─── Desktop layout ─── */}
      <div className="hidden md:flex h-screen overflow-hidden bg-[#181818]">
        {/* Left sidebar */}
        <div className="w-[240px] shrink-0 h-full">
          <Sidebar onSearchOpen={() => setIsSearchOpen(true)} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 overflow-y-auto relative">
          {isFolderRoute && (
            <div className="flex items-center gap-2 px-8 pt-8 pb-4">
              {isDeeplyNested ? (
                <>
                  <Button variant="ghost" size="sm" haptic="light"
                    className="flex items-center gap-1 text-white hover:text-white/80 -ml-2" onClick={handleBack}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  {folderLoading ? <span className="text-2xl font-medium text-white">...</span> : folderInput(folderNameInputRef)}
                </>
              ) : (
                <nav className="flex items-center gap-2 text-sm min-w-0 overflow-x-auto">
                  <Button variant="ghost" size="sm"
                    className="h-auto p-0 text-white/50 hover:text-white text-2xl font-medium shrink-0"
                    onClick={() => handleBreadcrumbClick(null)}>
                    arbiter
                  </Button>
                  {folderLoading ? (
                    <><span className="text-white/50 text-2xl shrink-0">{" / "}</span><span className="text-white/70">...</span></>
                  ) : breadcrumb.map((f) => (
                    <span key={f.id} className="flex items-center gap-2 min-w-0">
                      <span className="text-white/50 text-2xl shrink-0">{" / "}</span>
                      {f.id === folder?.id
                        ? folderInput(folderNameInputRef)
                        : <Button variant="ghost" size="sm"
                            className="h-auto p-0 text-white hover:text-white/80 text-2xl font-medium truncate"
                            onClick={() => handleBreadcrumbClick(f.id)}>{f.name}</Button>
                      }
                    </span>
                  ))}
                </nav>
              )}
            </div>
          )}
          <Outlet />
        </div>

        {/* Right lyrics panel */}
        {currentTrack && (
          <div className="w-[280px] shrink-0 h-full border-l border-white/6 bg-[#0e0e0e]">
            <LyricsSidePanel trackId={currentTrack.id} />
          </div>
        )}
      </div>

      {/* ─── Mobile layout ─── */}
      <div className="md:hidden min-h-screen bg-[#181818]">
        {/* Mobile header */}
        <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-4 gap-3 bg-[#181818]/80 backdrop-blur-md">
          {isFolderRoute ? (
            isDeeplyNested ? (
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Button variant="ghost" size="sm" haptic="light"
                  className="flex items-center gap-1 text-white hover:text-white/80 -ml-2 shrink-0" onClick={handleBack}>
                  <ChevronLeft className="size-4" />
                </Button>
                {folderLoading ? <span className="text-xl font-medium text-white">...</span> : folderInput(folderNameInputRef)}
              </div>
            ) : (
              <nav className="flex items-center gap-1.5 text-sm min-w-0 flex-1 overflow-x-auto">
                <Button variant="ghost" size="sm"
                  className="h-auto p-0 text-white/40 hover:text-white text-xl font-medium shrink-0"
                  onClick={() => handleBreadcrumbClick(null)}>
                  arbiter
                </Button>
                {breadcrumb.map((f) => (
                  <span key={f.id} className="flex items-center gap-1.5 min-w-0">
                    <span className="text-white/30 text-xl shrink-0">/</span>
                    {f.id === folder?.id
                      ? folderInput(folderNameInputRef)
                      : <Button variant="ghost" size="sm"
                          className="h-auto p-0 text-white hover:text-white/80 text-xl font-medium truncate"
                          onClick={() => handleBreadcrumbClick(f.id)}>{f.name}</Button>
                    }
                  </span>
                ))}
              </nav>
            )
          ) : (
            <div className="flex-1 min-w-0">
              <Link to="/">
                <div className="text-xl font-medium text-white leading-tight">arbiter</div>
                <div className="text-[9px] text-white/25 font-mono select-none">0.260613.01.0 (beta)</div>
              </Link>
            </div>
          )}

          {/* Search button */}
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="size-9 rounded-full bg-white/8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/14 active:bg-white/20 transition-colors shrink-0"
          >
            <SearchIcon className="size-4" strokeWidth={1.8} />
          </button>
        </header>

        {/* Scrollable content */}
        <div className={currentTrack ? "pt-16 pb-[8.5rem]" : "pt-16 pb-20"}>
          <Outlet />
        </div>

        {/* Bottom navigation */}
        <MobileBottomNav
          pathname={pathname}
          onSearch={() => setIsSearchOpen(true)}
        />
      </div>

      <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      {(isWarningBlocked || isTrialExpired) && (
        <SubscriptionBlock
          message={user?.subscription_warning_message ?? ""}
          isTrial={isTrialExpired}
        />
      )}
    </>
  );
}

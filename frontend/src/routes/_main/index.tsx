import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useProjects, useCreateProject } from "@/hooks/useProjects";
import { useFolders, useCreateFolder } from "@/hooks/useFolders";
import DraggableProjectGrid from "@/components/DraggableProjectGrid";
import MorphingAddButton from "@/components/MorphingAddButton";
import { toast } from "@/routes/__root";
import { useState, useEffect, useMemo } from "react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { useQuery } from "@tanstack/react-query";
import * as sharingApi from "@/api/sharing";
import { getHistory, type HistoryItem } from "@/api/history";
import { PlayIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_main/")({
  component: App,
});

function TrackCover({ coverUrl, title }: { coverUrl: string | null; title: string }) {
  return (
    <div className="size-10 shrink-0 rounded-lg overflow-hidden bg-white/8">
      {coverUrl ? (
        <img src={coverUrl} alt={title} className="size-10 object-cover" />
      ) : (
        <div className="size-10 flex items-center justify-center">
          <PlayIcon className="size-3 text-white/20 fill-white/20" />
        </div>
      )}
    </div>
  )
}

function RecentlyPlayedSection({ items }: { items: HistoryItem[] }) {
  const unique = useMemo(() =>
    items.filter(
      (item, idx, arr) => arr.findIndex((x) => x.public_id === item.public_id) === idx
    ).slice(0, 8),
  [items])

  if (unique.length === 0) return null

  return (
    <section className="mb-8">
      <h2 className="text-white font-semibold text-base mb-3">최근 재생</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {unique.map((item) => (
          <div
            key={item.public_id}
            className="flex items-center gap-3 bg-white/5 hover:bg-white/10 rounded-xl p-3 transition-colors cursor-default"
          >
            <TrackCover coverUrl={item.cover_url} title={item.title} />
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">{item.title}</p>
              <p className="text-white/40 text-[11px] truncate">{item.project_name}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ArtistSection({ items }: { items: HistoryItem[] }) {
  const artists = useMemo(() => {
    const map = new Map<string, { name: string; cover: string | null; count: number }>()
    items.forEach((item) => {
      const name = item.artist || item.project_name
      if (!name) return
      const existing = map.get(name)
      if (existing) {
        existing.count++
      } else {
        map.set(name, { name, cover: item.cover_url, count: 1 })
      }
    })
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [items])

  if (artists.length === 0) return null

  return (
    <section className="mb-8">
      <h2 className="text-white font-semibold text-base mb-3">자주 들은 아티스트</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {artists.map((artist) => (
          <div key={artist.name} className="shrink-0 flex flex-col items-center gap-2 w-20">
            <div className="size-16 rounded-full overflow-hidden bg-white/8">
              {artist.cover ? (
                <img src={artist.cover} alt={artist.name} className="size-16 object-cover" />
              ) : (
                <div className="size-16 flex items-center justify-center">
                  <PlayIcon className="size-5 text-white/20 fill-white/20" />
                </div>
              )}
            </div>
            <p className="text-white/60 text-xs text-center truncate w-full">{artist.name}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function App() {
  const {
    data: projects,
    isLoading: projectsLoading,
    error: projectsError,
  } = useProjects("root");
  const {
    data: folders,
    isLoading: foldersLoading,
    error: foldersError,
  } = useFolders();

  const { data: sharedTracksData, isLoading: sharedTracksLoading } = useQuery({
    queryKey: ["shared-tracks"],
    queryFn: sharingApi.listTracksSharedWithMe,
    staleTime: 5 * 60 * 1000,
  });

  const { data: historyData = [] } = useQuery({
    queryKey: ["history"],
    queryFn: getHistory,
    staleTime: 60 * 1000,
  });

  const sharedTracks = useMemo(() => sharedTracksData || [], [sharedTracksData]);
  const isLoading = projectsLoading || foldersLoading || sharedTracksLoading;
  const error = projectsError || foldersError;

  const createProject = useCreateProject();
  const createFolder = useCreateFolder();
  const navigate = useNavigate();
  const { currentTrack, queue } = useAudioPlayer();
  const [showContent, setShowContent] = useState(false);

  const allProjects = useMemo(() => {
    const list = projects || [];
    return list.map((p: any) => ({
      ...p,
      isShared: !!p.shared_by_username,
      sharedByUsername: p.shared_by_username,
    }));
  }, [projects]);

  const memoizedFolders = useMemo(() => folders || [], [folders]);

  useEffect(() => {
    if (allProjects && folders && sharedTracks && !isLoading) {
      if (!showContent) {
        const timer = setTimeout(() => setShowContent(true), 50);
        return () => clearTimeout(timer);
      }
    }
  }, [allProjects, folders, sharedTracks, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateProject = async () => {
    try {
      const newProject = await createProject.mutateAsync({
        name: "New Project",
        description: "Click to edit description",
      });
      navigate({ to: "/project/$projectId", params: { projectId: String(newProject.public_id) } });
    } catch {
      toast.error("Failed to create project");
    }
  };

  const handleCreateFolder = async () => {
    try {
      await createFolder.mutateAsync({ name: "New Folder", parent_id: null });
    } catch {
      toast.error("Failed to create folder");
    }
  };

  if (!isLoading && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-red-400">Error loading projects</p>
          <p className="text-gray-400 text-sm mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 md:pt-10 pt-30 pb-12">
        <div className={cn("transition-opacity duration-300", showContent ? "opacity-100" : "opacity-0")}>
          {historyData.length > 0 && (
            <div className="mb-6">
              <RecentlyPlayedSection items={historyData} />
              <ArtistSection items={historyData} />
            </div>
          )}

          {historyData.length > 0 && (
            <h2 className="text-white font-semibold text-base mb-3">모든 프로젝트</h2>
          )}

          <DraggableProjectGrid
            initialProjects={allProjects}
            initialFolders={memoizedFolders}
            initialSharedTracks={sharedTracks}
          />
        </div>

        <div
          className="fixed top-0 left-0 right-0 h-[130px] z-10 pointer-events-none md:hidden"
          style={{
            background:
              "linear-gradient(to bottom, #181818 5%, rgba(24,24,24,0.95) 20%, rgba(24,24,24,0.85) 30%, rgba(24,24,24,0.7) 45%, rgba(24,24,24,0.5) 60%, rgba(24,24,24,0.3) 75%, rgba(24,24,24,0.1) 90%, transparent 100%)",
          }}
        />

        <div
          className="fixed bottom-0 left-0 right-0 h-[200px] z-10 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, #181818 4%, rgba(24,24,24,0.95) 20%, rgba(24,24,24,0.85) 30%, rgba(24,24,24,0.7) 45%, rgba(24,24,24,0.5) 60%, rgba(24,24,24,0.3) 76%, rgba(24,24,24,0.1) 89%, transparent 100%)",
          }}
        />

        <MorphingAddButton
          onAddProject={handleCreateProject}
          onAddFolder={handleCreateFolder}
          isCreatingProject={createProject.isPending}
          isCreatingFolder={createFolder.isPending}
          className={cn("transition-all duration-100", showContent ? "opacity-100" : "opacity-0")}
          bottomOffset={
            currentTrack || queue.length > 0
              ? "bottom-[130px] sm:bottom-[145px]"
              : "bottom-8"
          }
        />
      </div>
    </div>
  );
}

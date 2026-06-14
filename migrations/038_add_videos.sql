ALTER TABLE file_folders ADD COLUMN folder_type TEXT NOT NULL DEFAULT 'normal';

CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id INTEGER NOT NULL REFERENCES file_folders(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    youtube_url TEXT NOT NULL,
    file_path TEXT,
    thumbnail_url TEXT,
    duration INTEGER,
    quality TEXT NOT NULL DEFAULT '720',
    has_subtitles INTEGER NOT NULL DEFAULT 0,
    subtitle_path TEXT,
    status TEXT NOT NULL DEFAULT 'downloading',
    error_msg TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_videos_folder ON videos(folder_id);
CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id);

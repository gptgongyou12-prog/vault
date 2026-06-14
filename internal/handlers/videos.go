package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"bungleware/vault/internal/apperr"
	"bungleware/vault/internal/db"
	"bungleware/vault/internal/httputil"
	"bungleware/vault/internal/ids"
)

type VideosHandler struct {
	db        *db.DB
	videosDir string
}

func NewVideosHandler(database *db.DB, videosDir string) *VideosHandler {
	return &VideosHandler{db: database, videosDir: videosDir}
}

type VideoItem struct {
	ID           int64   `json:"id"`
	PublicID     string  `json:"public_id"`
	FolderID     int64   `json:"folder_id"`
	Title        string  `json:"title"`
	YoutubeURL   string  `json:"youtube_url"`
	ThumbnailURL *string `json:"thumbnail_url"`
	Duration     *int64  `json:"duration"`
	Quality      string  `json:"quality"`
	HasSubtitles bool    `json:"has_subtitles"`
	Status       string  `json:"status"`
	ErrorMsg     *string `json:"error_msg,omitempty"`
	CreatedAt    string  `json:"created_at"`
}

type DownloadRequest struct {
	YoutubeURL   string `json:"youtube_url"`
	FolderID     string `json:"folder_id"`
	Quality      string `json:"quality"`
	HasSubtitles bool   `json:"has_subtitles"`
}

func (h *VideosHandler) DownloadVideo(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	var req DownloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return apperr.NewBadRequest("invalid request")
	}
	if req.YoutubeURL == "" || req.FolderID == "" {
		return apperr.NewBadRequest("youtube_url and folder_id required")
	}
	if req.Quality == "" {
		req.Quality = "720"
	}

	var folderInternalID int64
	var folderType string
	err = h.db.QueryRowContext(r.Context(),
		`SELECT id, folder_type FROM file_folders WHERE public_id = ? AND user_id = ?`,
		req.FolderID, int64(userID),
	).Scan(&folderInternalID, &folderType)
	if err != nil {
		return apperr.NewNotFound("folder not found")
	}
	if folderType != "video" {
		return apperr.NewBadRequest("folder is not a video folder")
	}

	publicID, err := ids.NewPublicID()
	if err != nil {
		return apperr.NewInternal("failed to generate id", err)
	}
	videoDir := filepath.Join(h.videosDir, publicID)
	if err := os.MkdirAll(videoDir, 0755); err != nil {
		return apperr.NewInternal("failed to create video dir", err)
	}

	var videoID int64
	err = h.db.QueryRowContext(r.Context(),
		`INSERT INTO videos (public_id, user_id, folder_id, title, youtube_url, quality, has_subtitles, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 'downloading') RETURNING id`,
		publicID, int64(userID), folderInternalID, "다운로드 중...", req.YoutubeURL, req.Quality, boolToInt(req.HasSubtitles),
	).Scan(&videoID)
	if err != nil {
		return apperr.NewInternal("failed to create video record", err)
	}

	go h.runDownload(publicID, videoID, req.YoutubeURL, videoDir, req.Quality, req.HasSubtitles)

	return httputil.CreatedResult(w, map[string]string{"public_id": publicID, "status": "downloading"})
}

func (h *VideosHandler) runDownload(publicID string, videoID int64, ytURL, videoDir, quality string, subs bool) {
	ctx := context.Background()

	format := "bestvideo[height<=" + quality + "][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=" + quality + "]+bestaudio/best[height<=" + quality + "]/best"
	outTemplate := filepath.Join(videoDir, "%(id)s.%(ext)s")

	args := []string{
		"-f", format,
		"--merge-output-format", "mp4",
		"--write-thumbnail",
		"--convert-thumbnails", "jpg",
		"-o", outTemplate,
		"--no-playlist",
		"--print-json",
	}

	if subs {
		args = append(args, "--write-auto-sub", "--sub-lang", "ko,en", "--convert-subs", "vtt")
	}

	args = append(args, ytURL)

	cmd := exec.CommandContext(ctx, "yt-dlp", args...)
	out, err := cmd.Output()

	if err != nil {
		errMsg := err.Error()
		h.db.ExecContext(ctx, `UPDATE videos SET status='failed', error_msg=? WHERE id=?`, errMsg, videoID)
		slog.Error("[videos] yt-dlp failed", "id", publicID, "error", err)
		return
	}

	var ytInfo struct {
		Title    string  `json:"title"`
		Duration float64 `json:"duration"`
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.HasPrefix(strings.TrimSpace(lines[i]), "{") {
			json.Unmarshal([]byte(lines[i]), &ytInfo)
			break
		}
	}

	var filePath string
	entries, _ := os.ReadDir(videoDir)
	for _, e := range entries {
		if !e.IsDir() {
			ext := strings.ToLower(filepath.Ext(e.Name()))
			if ext == ".mp4" || ext == ".mkv" || ext == ".webm" {
				filePath = filepath.Join(videoDir, e.Name())
				break
			}
		}
	}

	thumbURL := sql.NullString{}
	for _, e := range entries {
		if !e.IsDir() {
			ext := strings.ToLower(filepath.Ext(e.Name()))
			if ext == ".jpg" || ext == ".jpeg" || ext == ".webp" {
				u := "/api/videos/" + publicID + "/thumbnail"
				thumbURL = sql.NullString{String: u, Valid: true}
				break
			}
		}
	}

	subPath := sql.NullString{}
	if subs {
		for _, e := range entries {
			if !e.IsDir() {
				ext := strings.ToLower(filepath.Ext(e.Name()))
				if ext == ".vtt" || ext == ".srt" {
					subPath = sql.NullString{String: filepath.Join(videoDir, e.Name()), Valid: true}
					break
				}
			}
		}
	}

	title := ytInfo.Title
	if title == "" {
		title = "Unknown"
	}
	dur := int64(ytInfo.Duration)

	h.db.ExecContext(ctx,
		`UPDATE videos SET title=?, file_path=?, thumbnail_url=?, duration=?, subtitle_path=?, status='completed' WHERE id=?`,
		title, filePath, thumbURL, dur, subPath, videoID,
	)
	slog.Info("[videos] download complete", "id", publicID, "title", title)
}

func (h *VideosHandler) ListVideos(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	folderPublicID := r.URL.Query().Get("folder_id")
	if folderPublicID == "" {
		return apperr.NewBadRequest("folder_id required")
	}

	var folderID int64
	err = h.db.QueryRowContext(r.Context(),
		`SELECT id FROM file_folders WHERE public_id = ? AND user_id = ?`,
		folderPublicID, int64(userID),
	).Scan(&folderID)
	if err != nil {
		return apperr.NewNotFound("folder not found")
	}

	rows, err := h.db.QueryContext(r.Context(),
		`SELECT public_id, folder_id, title, youtube_url, thumbnail_url, duration, quality, has_subtitles, status, error_msg, created_at
		 FROM videos WHERE folder_id = ? AND user_id = ? ORDER BY created_at DESC`,
		folderID, int64(userID),
	)
	if err != nil {
		return apperr.NewInternal("failed to list videos", err)
	}
	defer rows.Close()

	var items []VideoItem
	for rows.Next() {
		var v VideoItem
		var thumbURL, errorMsg sql.NullString
		var duration sql.NullInt64
		var hasSubs int
		var createdAt time.Time
		if err := rows.Scan(&v.PublicID, &v.FolderID, &v.Title, &v.YoutubeURL,
			&thumbURL, &duration, &v.Quality, &hasSubs, &v.Status, &errorMsg, &createdAt); err != nil {
			continue
		}
		if thumbURL.Valid {
			v.ThumbnailURL = &thumbURL.String
		}
		if duration.Valid {
			v.Duration = &duration.Int64
		}
		if errorMsg.Valid {
			v.ErrorMsg = &errorMsg.String
		}
		v.HasSubtitles = hasSubs == 1
		v.CreatedAt = createdAt.Format(time.RFC3339)
		items = append(items, v)
	}
	if items == nil {
		items = []VideoItem{}
	}
	return httputil.OKResult(w, items)
}

func (h *VideosHandler) GetVideoStatus(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")
	var v VideoItem
	var thumbURL, errorMsg sql.NullString
	var duration sql.NullInt64
	var hasSubs int
	var ownerID int64
	var createdAt time.Time

	err = h.db.QueryRowContext(r.Context(),
		`SELECT user_id, public_id, folder_id, title, youtube_url, thumbnail_url, duration, quality, has_subtitles, status, error_msg, created_at
		 FROM videos WHERE public_id = ?`, publicID,
	).Scan(&ownerID, &v.PublicID, &v.FolderID, &v.Title, &v.YoutubeURL,
		&thumbURL, &duration, &v.Quality, &hasSubs, &v.Status, &errorMsg, &createdAt)
	if err != nil {
		return apperr.NewNotFound("video not found")
	}
	if ownerID != int64(userID) {
		return apperr.NewForbidden("access denied")
	}
	if thumbURL.Valid {
		v.ThumbnailURL = &thumbURL.String
	}
	if duration.Valid {
		v.Duration = &duration.Int64
	}
	if errorMsg.Valid {
		v.ErrorMsg = &errorMsg.String
	}
	v.HasSubtitles = hasSubs == 1
	v.CreatedAt = createdAt.Format(time.RFC3339)
	return httputil.OKResult(w, v)
}

func (h *VideosHandler) StreamVideo(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")
	var filePath string
	var ownerID int64

	err = h.db.QueryRowContext(r.Context(),
		`SELECT user_id, file_path FROM videos WHERE public_id = ? AND status = 'completed'`, publicID,
	).Scan(&ownerID, &filePath)
	if err != nil {
		return apperr.NewNotFound("video not found or not ready")
	}
	if ownerID != int64(userID) {
		return apperr.NewForbidden("access denied")
	}

	f, err := os.Open(filePath)
	if err != nil {
		return apperr.NewInternal("failed to open video", err)
	}
	defer f.Close()

	stat, _ := f.Stat()
	w.Header().Set("Content-Type", "video/mp4")
	http.ServeContent(w, r, filePath, stat.ModTime(), f)
	return nil
}

func (h *VideosHandler) ServeThumbnail(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")
	var filePath string
	var ownerID int64

	err = h.db.QueryRowContext(r.Context(),
		`SELECT user_id, file_path FROM videos WHERE public_id = ?`, publicID,
	).Scan(&ownerID, &filePath)
	if err != nil {
		return apperr.NewNotFound("video not found")
	}
	if ownerID != int64(userID) {
		return apperr.NewForbidden("access denied")
	}

	if filePath == "" {
		return apperr.NewNotFound("thumbnail not found")
	}
	videoDir := filepath.Dir(filePath)
	entries, _ := os.ReadDir(videoDir)
	for _, e := range entries {
		ext := strings.ToLower(filepath.Ext(e.Name()))
		if ext == ".jpg" || ext == ".jpeg" || ext == ".webp" {
			http.ServeFile(w, r, filepath.Join(videoDir, e.Name()))
			return nil
		}
	}
	return apperr.NewNotFound("thumbnail not found")
}

func (h *VideosHandler) DeleteVideo(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")
	var filePath string
	var ownerID int64

	err = h.db.QueryRowContext(r.Context(),
		`SELECT user_id, file_path FROM videos WHERE public_id = ?`, publicID,
	).Scan(&ownerID, &filePath)
	if err != nil {
		return apperr.NewNotFound("video not found")
	}
	if ownerID != int64(userID) {
		return apperr.NewForbidden("access denied")
	}

	h.db.ExecContext(r.Context(), `DELETE FROM videos WHERE public_id = ?`, publicID)
	if filePath != "" {
		os.RemoveAll(filepath.Dir(filePath))
	}
	return httputil.NoContentResult(w)
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

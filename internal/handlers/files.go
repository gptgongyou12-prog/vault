package handlers

import (
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"bungleware/vault/internal/apperr"
	"bungleware/vault/internal/db"
	"bungleware/vault/internal/httputil"
	"bungleware/vault/internal/ids"
)

type FilesHandler struct {
	db      *db.DB
	dataDir string
}

func NewFilesHandler(database *db.DB, dataDir string) *FilesHandler {
	return &FilesHandler{db: database, dataDir: dataDir}
}

type FileItem struct {
	ID        int64  `json:"id"`
	PublicID  string `json:"public_id"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	MimeType  string `json:"mime_type"`
	CreatedAt string `json:"created_at"`
}

func (h *FilesHandler) ListFiles(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	rows, err := h.db.QueryContext(r.Context(),
		`SELECT id, public_id, name, file_size, mime_type, created_at FROM files WHERE user_id = ? ORDER BY created_at DESC`,
		int64(userID),
	)
	if err != nil {
		return apperr.NewInternal("failed to list files", err)
	}
	defer rows.Close()

	var items []FileItem
	for rows.Next() {
		var f FileItem
		var createdAt time.Time
		if err := rows.Scan(&f.ID, &f.PublicID, &f.Name, &f.Size, &f.MimeType, &createdAt); err != nil {
			continue
		}
		f.CreatedAt = createdAt.Format(time.RFC3339)
		items = append(items, f)
	}
	if items == nil {
		items = []FileItem{}
	}
	return httputil.OKResult(w, items)
}

func (h *FilesHandler) UploadFile(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	const maxSize = 2048 << 20 // 2GB
	if err := r.ParseMultipartForm(maxSize); err != nil {
		return apperr.NewBadRequest("failed to parse form")
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		return apperr.NewBadRequest("no file provided")
	}
	defer file.Close()

	publicID, err := ids.NewPublicID()
	if err != nil {
		return apperr.NewInternal("failed to generate id", err)
	}

	// 저장 경로
	userDir := filepath.Join(h.dataDir, "files", fmt.Sprintf("%d", userID))
	if err := os.MkdirAll(userDir, 0o755); err != nil {
		return apperr.NewInternal("failed to create directory", err)
	}

	// 파일명 sanitize
	origName := header.Filename
	safeName := sanitizeUploadFilename(origName)
	destPath := filepath.Join(userDir, publicID+"_"+safeName)

	dest, err := os.Create(destPath)
	if err != nil {
		return apperr.NewInternal("failed to create file", err)
	}
	defer dest.Close()

	size, err := io.Copy(dest, file)
	if err != nil {
		os.Remove(destPath)
		return apperr.NewInternal("failed to save file", err)
	}

	// MIME 타입
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		if ext := filepath.Ext(origName); ext != "" {
			if t := mime.TypeByExtension(ext); t != "" {
				mimeType = t
			}
		}
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	// DB 저장
	var fileID int64
	err = h.db.QueryRowContext(r.Context(),
		`INSERT INTO files (public_id, user_id, name, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
		publicID, int64(userID), origName, destPath, size, mimeType,
	).Scan(&fileID)
	if err != nil {
		os.Remove(destPath)
		return apperr.NewInternal("failed to save file record", err)
	}

	return httputil.CreatedResult(w, FileItem{
		ID:        fileID,
		PublicID:  publicID,
		Name:      origName,
		Size:      size,
		MimeType:  mimeType,
		CreatedAt: time.Now().Format(time.RFC3339),
	})
}

func (h *FilesHandler) DownloadFile(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")

	var filePath, name, mimeType string
	var ownerID int64
	err = h.db.QueryRowContext(r.Context(),
		`SELECT user_id, file_path, name, mime_type FROM files WHERE public_id = ?`,
		publicID,
	).Scan(&ownerID, &filePath, &name, &mimeType)
	if err != nil {
		return apperr.NewNotFound("file not found")
	}
	if ownerID != int64(userID) {
		return apperr.NewForbidden("access denied")
	}

	f, err := os.Open(filePath)
	if err != nil {
		return apperr.NewInternal("failed to open file", err)
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return apperr.NewInternal("failed to stat file", err)
	}

	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": name}))

	http.ServeContent(w, r, filePath, stat.ModTime(), f)
	return nil
}

func (h *FilesHandler) DeleteFile(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")

	var filePath string
	var ownerID int64
	err = h.db.QueryRowContext(r.Context(),
		`SELECT user_id, file_path FROM files WHERE public_id = ?`,
		publicID,
	).Scan(&ownerID, &filePath)
	if err != nil {
		return apperr.NewNotFound("file not found")
	}
	if ownerID != int64(userID) {
		return apperr.NewForbidden("access denied")
	}

	_, err = h.db.ExecContext(r.Context(), `DELETE FROM files WHERE public_id = ?`, publicID)
	if err != nil {
		return apperr.NewInternal("failed to delete file record", err)
	}

	if err := os.Remove(filePath); err != nil {
		slog.Debug("failed to delete file from disk", "path", filePath, "error", err)
	}

	return httputil.NoContentResult(w)
}

func sanitizeUploadFilename(name string) string {
	// 경로 구분자 제거
	name = filepath.Base(name)
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	if len(name) > 200 {
		ext := filepath.Ext(name)
		name = name[:200-len(ext)] + ext
	}
	return name
}

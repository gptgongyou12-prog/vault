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
	filesDir string
}

func NewFilesHandler(database *db.DB, filesDir string) *FilesHandler {
	return &FilesHandler{db: database, filesDir: filesDir}
}

type FileItem struct {
	ID        int64   `json:"id"`
	PublicID  string  `json:"public_id"`
	Name      string  `json:"name"`
	Size      int64   `json:"size"`
	MimeType  string  `json:"mime_type"`
	FolderID  *int64  `json:"folder_id"`
	CreatedAt string  `json:"created_at"`
}

type FileFolderItem struct {
	ID         int64   `json:"id"`
	PublicID   string  `json:"public_id"`
	Name       string  `json:"name"`
	ParentID   *int64  `json:"parent_id"`
	FolderType string  `json:"folder_type"`
	CreatedAt  string  `json:"created_at"`
}

// ── 폴더 API ─────────────────────────────────────────────────────────

func (h *FilesHandler) ListFolders(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	rows, err := h.db.QueryContext(r.Context(),
		`SELECT id, public_id, name, parent_id, folder_type, created_at FROM file_folders WHERE user_id = ? ORDER BY name ASC`,
		int64(userID),
	)
	if err != nil {
		return apperr.NewInternal("failed to list folders", err)
	}
	defer rows.Close()

	var items []FileFolderItem
	for rows.Next() {
		var f FileFolderItem
		var parentID *int64
		var createdAt time.Time
		if err := rows.Scan(&f.ID, &f.PublicID, &f.Name, &parentID, &createdAt); err != nil {
			continue
		}
		f.ParentID = parentID
		f.CreatedAt = createdAt.Format(time.RFC3339)
		items = append(items, f)
	}
	if items == nil {
		items = []FileFolderItem{}
	}
	return httputil.OKResult(w, items)
}

func (h *FilesHandler) CreateFolder(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	req, err := httputil.DecodeJSON[struct {
		Name       string  `json:"name"`
		ParentID   *int64  `json:"parent_id"`
		FolderType string  `json:"folder_type"`
	}](r)
	if err != nil || req.Name == "" {
		return apperr.NewBadRequest("name is required")
	}

	publicID, _ := ids.NewPublicID()

	var id int64
	var parentID interface{}
	if req.ParentID != nil {
		parentID = *req.ParentID
	}

	err = h.db.QueryRowContext(r.Context(),
		`INSERT INTO file_folders (public_id, user_id, name, parent_id, folder_type) VALUES (?, ?, ?, ?, ?) RETURNING id`,
		publicID, int64(userID), req.Name, parentID,
	).Scan(&id)
	if err != nil {
		return apperr.NewInternal("failed to create folder", err)
	}

	return httputil.CreatedResult(w, FileFolderItem{
		ID: id, PublicID: publicID, Name: req.Name,
		ParentID: req.ParentID, CreatedAt: time.Now().Format(time.RFC3339),
	})
}

func (h *FilesHandler) RenameFolder(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")
	req, err := httputil.DecodeJSON[struct {
		Name string `json:"name"`
	}](r)
	if err != nil || req.Name == "" {
		return apperr.NewBadRequest("name is required")
	}

	res, err := h.db.ExecContext(r.Context(),
		`UPDATE file_folders SET name = ? WHERE public_id = ? AND user_id = ?`,
		req.Name, publicID, int64(userID),
	)
	if err != nil {
		return apperr.NewInternal("failed to rename folder", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return apperr.NewNotFound("folder not found")
	}
	return httputil.NoContentResult(w)
}

func (h *FilesHandler) DeleteFolder(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")
	ctx := r.Context()

	var folderID int64
	err = h.db.QueryRowContext(ctx,
		`SELECT id FROM file_folders WHERE public_id = ? AND user_id = ?`, publicID, int64(userID),
	).Scan(&folderID)
	if err != nil {
		return apperr.NewNotFound("folder not found")
	}

	// 파일을 루트로 이동
	h.db.ExecContext(ctx, `UPDATE files SET folder_id = NULL WHERE folder_id = ?`, folderID)
	h.db.ExecContext(ctx, `DELETE FROM file_folders WHERE id = ?`, folderID)

	return httputil.NoContentResult(w)
}

func (h *FilesHandler) MoveFile(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")
	req, err := httputil.DecodeJSON[struct {
		FolderID *int64 `json:"folder_id"`
	}](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request")
	}

	var folderID interface{}
	if req.FolderID != nil {
		folderID = *req.FolderID
	}

	res, err := h.db.ExecContext(r.Context(),
		`UPDATE files SET folder_id = ? WHERE public_id = ? AND user_id = ?`,
		folderID, publicID, int64(userID),
	)
	if err != nil {
		return apperr.NewInternal("failed to move file", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return apperr.NewNotFound("file not found")
	}
	return httputil.NoContentResult(w)
}

// ── 파일 API ─────────────────────────────────────────────────────────

func (h *FilesHandler) ListFiles(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	folderIDParam := r.URL.Query().Get("folder_id")

	var query string
	var args []any

	if folderIDParam == "" || folderIDParam == "root" {
		query = `SELECT id, public_id, name, file_size, mime_type, folder_id, created_at FROM files WHERE user_id = ? AND folder_id IS NULL ORDER BY created_at DESC`
		args = []any{int64(userID)}
	} else {
		query = `SELECT id, public_id, name, file_size, mime_type, folder_id, created_at FROM files WHERE user_id = ? AND folder_id = ? ORDER BY created_at DESC`
		args = []any{int64(userID), folderIDParam}
	}

	rows, err := h.db.QueryContext(r.Context(), query, args...)
	if err != nil {
		return apperr.NewInternal("failed to list files", err)
	}
	defer rows.Close()

	var items []FileItem
	for rows.Next() {
		var f FileItem
		var folderID *int64
		var createdAt time.Time
		if err := rows.Scan(&f.ID, &f.PublicID, &f.Name, &f.Size, &f.MimeType, &folderID, &createdAt); err != nil {
			continue
		}
		f.FolderID = folderID
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

	const maxSize = 2048 << 20
	if err := r.ParseMultipartForm(maxSize); err != nil {
		return apperr.NewBadRequest("failed to parse form")
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		return apperr.NewBadRequest("no file provided")
	}
	defer file.Close()

	publicID, _ := ids.NewPublicID()
	userDir := filepath.Join(h.filesDir, fmt.Sprintf("%d", userID))
	if err := os.MkdirAll(userDir, 0o755); err != nil {
		return apperr.NewInternal("failed to create directory", err)
	}

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

	// folder_id 처리
	folderIDStr := r.FormValue("folder_id")
	var folderID interface{}
	if folderIDStr != "" {
		folderID = folderIDStr
	}

	var fileID int64
	err = h.db.QueryRowContext(r.Context(),
		`INSERT INTO files (public_id, user_id, name, file_path, file_size, mime_type, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		publicID, int64(userID), origName, destPath, size, mimeType, folderID,
	).Scan(&fileID)
	if err != nil {
		os.Remove(destPath)
		return apperr.NewInternal("failed to save file record", err)
	}

	return httputil.CreatedResult(w, FileItem{
		ID: fileID, PublicID: publicID, Name: origName,
		Size: size, MimeType: mimeType, CreatedAt: time.Now().Format(time.RFC3339),
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
		`SELECT user_id, file_path, name, mime_type FROM files WHERE public_id = ?`, publicID,
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
		`SELECT user_id, file_path FROM files WHERE public_id = ?`, publicID,
	).Scan(&ownerID, &filePath)
	if err != nil {
		return apperr.NewNotFound("file not found")
	}
	if ownerID != int64(userID) {
		return apperr.NewForbidden("access denied")
	}

	h.db.ExecContext(r.Context(), `DELETE FROM files WHERE public_id = ?`, publicID)
	if err := os.Remove(filePath); err != nil {
		slog.Debug("failed to delete file from disk", "path", filePath, "error", err)
	}
	return httputil.NoContentResult(w)
}

func sanitizeUploadFilename(name string) string {
	name = filepath.Base(name)
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	if len(name) > 200 {
		ext := filepath.Ext(name)
		name = name[:200-len(ext)] + ext
	}
	return name
}

package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"bungleware/vault/internal/apperr"
	"bungleware/vault/internal/db"
	"bungleware/vault/internal/httputil"
	"bungleware/vault/internal/ids"
)

type PlaylistsHandler struct {
	db *db.DB
}

func NewPlaylistsHandler(database *db.DB) *PlaylistsHandler {
	return &PlaylistsHandler{db: database}
}

type PlaylistSummary struct {
	ID         int64  `json:"id"`
	PublicID   string `json:"public_id"`
	Name       string `json:"name"`
	TrackCount int    `json:"track_count"`
	CreatedAt  string `json:"created_at"`
}

type PlaylistTrackItem struct {
	ItemID      int64   `json:"item_id"`
	Position    int     `json:"position"`
	TrackID     int64   `json:"track_id"`
	PublicID    string  `json:"public_id"`
	Title       string  `json:"title"`
	Artist      *string `json:"artist"`
	ProjectName string  `json:"project_name"`
	CoverURL    *string `json:"cover_url"`
	Duration    *float64 `json:"duration_seconds"`
}

func (h *PlaylistsHandler) ListPlaylists(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT p.id, p.public_id, p.name, COUNT(pt.id), p.created_at
		FROM playlists p
		LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
		WHERE p.user_id = ?
		GROUP BY p.id
		ORDER BY p.created_at DESC
	`, int64(userID))
	if err != nil {
		return apperr.NewInternal("failed to list playlists", err)
	}
	defer rows.Close()

	var items []PlaylistSummary
	for rows.Next() {
		var item PlaylistSummary
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.PublicID, &item.Name, &item.TrackCount, &createdAt); err != nil {
			continue
		}
		item.CreatedAt = createdAt.Format(time.RFC3339)
		items = append(items, item)
	}
	if items == nil {
		items = []PlaylistSummary{}
	}
	return httputil.OKResult(w, items)
}

func (h *PlaylistsHandler) CreatePlaylist(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	req, err := httputil.DecodeJSON[struct {
		Name string `json:"name"`
	}](r)
	if err != nil || req.Name == "" {
		return apperr.NewBadRequest("name is required")
	}

	publicID, err := ids.NewPublicID()
	if err != nil {
		return apperr.NewInternal("failed to generate id", err)
	}

	var id int64
	err = h.db.QueryRowContext(r.Context(),
		`INSERT INTO playlists (public_id, user_id, name) VALUES (?, ?, ?) RETURNING id`,
		publicID, int64(userID), req.Name,
	).Scan(&id)
	if err != nil {
		return apperr.NewInternal("failed to create playlist", err)
	}

	return httputil.CreatedResult(w, PlaylistSummary{
		ID: id, PublicID: publicID, Name: req.Name,
		TrackCount: 0, CreatedAt: time.Now().Format(time.RFC3339),
	})
}

func (h *PlaylistsHandler) UpdatePlaylist(w http.ResponseWriter, r *http.Request) error {
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
		`UPDATE playlists SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE public_id = ? AND user_id = ?`,
		req.Name, publicID, int64(userID),
	)
	if err != nil {
		return apperr.NewInternal("failed to update playlist", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return apperr.NewNotFound("playlist not found")
	}
	return httputil.NoContentResult(w)
}

func (h *PlaylistsHandler) DeletePlaylist(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")
	_, err = h.db.ExecContext(r.Context(),
		`DELETE FROM playlists WHERE public_id = ? AND user_id = ?`,
		publicID, int64(userID),
	)
	if err != nil {
		return apperr.NewInternal("failed to delete playlist", err)
	}
	return httputil.NoContentResult(w)
}

func (h *PlaylistsHandler) GetPlaylistTracks(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")
	ctx := r.Context()

	var playlistID int64
	var ownerID int64
	err = h.db.QueryRowContext(ctx,
		`SELECT id, user_id FROM playlists WHERE public_id = ?`, publicID,
	).Scan(&playlistID, &ownerID)
	if err != nil {
		return apperr.NewNotFound("playlist not found")
	}
	if ownerID != int64(userID) {
		return apperr.NewForbidden("access denied")
	}

	rows, err := h.db.QueryContext(ctx, `
		SELECT pt.id, pt.position, t.id, t.public_id, t.title, t.artist,
		       p.name, p.public_id, tv.duration_seconds
		FROM playlist_tracks pt
		JOIN tracks t ON pt.track_id = t.id
		JOIN projects p ON t.project_id = p.id
		LEFT JOIN track_versions tv ON t.active_version_id = tv.id
		WHERE pt.playlist_id = ?
		ORDER BY pt.position ASC, pt.id ASC
	`, playlistID)
	if err != nil {
		return apperr.NewInternal("failed to get tracks", err)
	}
	defer rows.Close()

	var items []PlaylistTrackItem
	for rows.Next() {
		var item PlaylistTrackItem
		var artist sql.NullString
		var projectPublicID string
		var duration sql.NullFloat64
		if err := rows.Scan(&item.ItemID, &item.Position, &item.TrackID, &item.PublicID,
			&item.Title, &artist, &item.ProjectName, &projectPublicID, &duration); err != nil {
			continue
		}
		if artist.Valid {
			item.Artist = &artist.String
		}
		if duration.Valid {
			item.Duration = &duration.Float64
		}
		coverURL := "/api/projects/" + projectPublicID + "/cover"
		item.CoverURL = &coverURL
		items = append(items, item)
	}
	if items == nil {
		items = []PlaylistTrackItem{}
	}
	return httputil.OKResult(w, items)
}

func (h *PlaylistsHandler) AddTrack(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")
	req, err := httputil.DecodeJSON[struct {
		TrackPublicID string `json:"track_public_id"`
	}](r)
	if err != nil || req.TrackPublicID == "" {
		return apperr.NewBadRequest("track_public_id is required")
	}

	ctx := r.Context()

	var playlistID, ownerID int64
	err = h.db.QueryRowContext(ctx,
		`SELECT id, user_id FROM playlists WHERE public_id = ?`, publicID,
	).Scan(&playlistID, &ownerID)
	if err != nil {
		return apperr.NewNotFound("playlist not found")
	}
	if ownerID != int64(userID) {
		return apperr.NewForbidden("access denied")
	}

	var trackID int64
	err = h.db.QueryRowContext(ctx,
		`SELECT id FROM tracks WHERE public_id = ?`, req.TrackPublicID,
	).Scan(&trackID)
	if err != nil {
		return apperr.NewNotFound("track not found")
	}

	var maxPos sql.NullInt64
	h.db.QueryRowContext(ctx,
		`SELECT MAX(position) FROM playlist_tracks WHERE playlist_id = ?`, playlistID,
	).Scan(&maxPos)

	pos := int64(0)
	if maxPos.Valid {
		pos = maxPos.Int64 + 1
	}

	var itemID int64
	err = h.db.QueryRowContext(ctx,
		`INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?) RETURNING id`,
		playlistID, trackID, pos,
	).Scan(&itemID)
	if err != nil {
		return apperr.NewInternal("failed to add track", err)
	}

	return httputil.CreatedResult(w, map[string]any{"item_id": itemID, "position": pos})
}

func (h *PlaylistsHandler) RemoveTrack(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	publicID := r.PathValue("id")
	itemID, err := httputil.PathInt64(r, "item_id")
	if err != nil {
		return err
	}

	ctx := r.Context()

	var ownerID int64
	err = h.db.QueryRowContext(ctx,
		`SELECT user_id FROM playlists WHERE public_id = ?`, publicID,
	).Scan(&ownerID)
	if err != nil {
		return apperr.NewNotFound("playlist not found")
	}
	if ownerID != int64(userID) {
		return apperr.NewForbidden("access denied")
	}

	_, err = h.db.ExecContext(ctx,
		`DELETE FROM playlist_tracks WHERE id = ?`, itemID,
	)
	if err != nil {
		return apperr.NewInternal("failed to remove track", err)
	}
	return httputil.NoContentResult(w)
}

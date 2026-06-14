package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"bungleware/vault/internal/apperr"
	"bungleware/vault/internal/db"
	"bungleware/vault/internal/httputil"
)

type HistoryHandler struct {
	db *db.DB
}

func NewHistoryHandler(database *db.DB) *HistoryHandler {
	return &HistoryHandler{db: database}
}

type HistoryItem struct {
	TrackID     int64   `json:"track_id"`
	PublicID    string  `json:"public_id"`
	Title       string  `json:"title"`
	Artist      *string `json:"artist"`
	ProjectName string  `json:"project_name"`
	CoverURL    *string `json:"cover_url"`
	PlayedAt    string  `json:"played_at"`
}

func (h *HistoryHandler) RecordPlay(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	req, err := httputil.DecodeJSON[struct {
		TrackPublicID string `json:"track_public_id"`
	}](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request")
	}

	ctx := r.Context()

	var trackID int64
	err = h.db.QueryRowContext(ctx,
		`SELECT id FROM tracks WHERE public_id = ?`, req.TrackPublicID,
	).Scan(&trackID)
	if err != nil {
		return apperr.NewNotFound("track not found")
	}

	_, err = h.db.ExecContext(ctx,
		`INSERT INTO play_history (user_id, track_id) VALUES (?, ?)`,
		int64(userID), trackID,
	)
	if err != nil {
		return apperr.NewInternal("failed to record play", err)
	}

	return httputil.NoContentResult(w)
}

func (h *HistoryHandler) GetHistory(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	ctx := r.Context()

	rows, err := h.db.QueryContext(ctx, `
		SELECT DISTINCT t.id, t.public_id, t.title, t.artist, p.name, p.public_id, MAX(ph.played_at)
		FROM play_history ph
		JOIN tracks t ON ph.track_id = t.id
		JOIN projects p ON t.project_id = p.id
		WHERE ph.user_id = ?
		GROUP BY t.id
		ORDER BY MAX(ph.played_at) DESC
		LIMIT 50
	`, int64(userID))
	if err != nil {
		return apperr.NewInternal("failed to get history", err)
	}
	defer rows.Close()

	var items []HistoryItem
	for rows.Next() {
		var item HistoryItem
		var artist sql.NullString
		var projectPublicID string
		var playedAt time.Time
		if err := rows.Scan(&item.TrackID, &item.PublicID, &item.Title, &artist, &item.ProjectName, &projectPublicID, &playedAt); err != nil {
			continue
		}
		if artist.Valid {
			item.Artist = &artist.String
		}
		coverURL := "/api/projects/" + projectPublicID + "/cover"
		item.CoverURL = &coverURL
		item.PlayedAt = playedAt.Format(time.RFC3339)
		items = append(items, item)
	}
	if items == nil {
		items = []HistoryItem{}
	}
	return httputil.OKResult(w, items)
}

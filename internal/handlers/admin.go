package handlers

import (
	"strings"
	"log/slog"
	"database/sql"
	"fmt"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"syscall"
	"path/filepath"
	"time"

	"bungleware/vault/internal/apperr"
	"bungleware/vault/internal/auth"
	"bungleware/vault/internal/db"
	sqlc "bungleware/vault/internal/db/sqlc"
	"bungleware/vault/internal/httputil"
)

type AdminHandler struct {
	db         *db.DB
	authConfig auth.Config
	dataDir    string
	wsHub      *WSHub
}

func NewAdminHandler(database *db.DB, authConfig auth.Config, dataDir string) *AdminHandler {
	return &AdminHandler{
		db:         database,
		authConfig: authConfig,
		dataDir:    dataDir,
	}
}

func (h *AdminHandler) SetWSHub(hub *WSHub) {
	h.wsHub = hub
}

func (h *AdminHandler) ListAllUsersPublic(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	ctx := r.Context()

	_, err = h.db.Queries.GetUserByID(ctx, int64(userID))
	if err != nil {
		return apperr.NewNotFound("user not found")
	}

	users, err := h.db.Queries.ListAllUsers(ctx)
	if err != nil {
		return apperr.NewInternal("failed to list users", err)
	}

	userResponses := make([]UserResponse, 0, len(users))
	for _, u := range users {
		userResponses = append(userResponses, UserResponse{
			ID:        u.ID,
			Username:  u.Username,
			Email:     u.Email,
			IsAdmin:   u.IsAdmin,
			IsOwner:   u.IsOwner,
			CreatedAt: u.CreatedAt.Time,
		})
	}

	return httputil.OKResult(w, userResponses)
}

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	ctx := r.Context()

	user, err := h.db.Queries.GetUserByID(ctx, int64(userID))
	if err != nil {
		return apperr.NewNotFound("user not found")
	}

	if !user.IsAdmin {
		return apperr.NewForbidden("admin access required")
	}

	users, err := h.db.Queries.ListAllUsers(ctx)
	if err != nil {
		return apperr.NewInternal("failed to list users", err)
	}

	userResponses := make([]UserResponse, 0, len(users))
	for _, u := range users {
		var liteMode bool
		if prefs, pErr := h.db.GetUserPreferences(ctx, u.ID); pErr == nil {
			liteMode = prefs.LiteMode != 0
		}
		isOnline := false
		if h.wsHub != nil {
			isOnline = h.wsHub.IsOnline(u.ID)
		}
		resp := buildUserResponse(u, liteMode)
		resp.IsOnline = isOnline
		userResponses = append(userResponses, resp)
	}

	return httputil.OKResult(w, userResponses)
}

func (h *AdminHandler) CreateInvite(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	ctx := r.Context()

	user, err := h.db.Queries.GetUserByID(ctx, int64(userID))
	if err != nil {
		return apperr.NewNotFound("user not found")
	}

	if !user.IsAdmin {
		return apperr.NewForbidden("admin access required")
	}

	req, err := httputil.DecodeJSON[CreateInviteRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request body")
	}

	token, err := auth.GenerateSecureToken(32)
	if err != nil {
		return apperr.NewInternal("failed to generate token", err)
	}

	email := ""
	if req.Email != nil {
		email = *req.Email
	}

	inviteToken, err := h.db.Queries.CreateInviteToken(ctx, sqlc.CreateInviteTokenParams{
		TokenHash: auth.HashToken(token, h.authConfig.TokenPepper),
		TokenType: "invite",
		CreatedBy: user.ID,
		Email:     email,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	})

	if err != nil {
		return apperr.NewInternal("failed to create invite", err)
	}

	return httputil.OKResult(w, map[string]interface{}{
		"id":    inviteToken.ID,
		"token": token,
		"email": inviteToken.Email,
	})
}

func (h *AdminHandler) UpdateUserRole(w http.ResponseWriter, r *http.Request) error {
	adminID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	ctx := r.Context()

	admin, err := h.db.Queries.GetUserByID(ctx, int64(adminID))
	if err != nil {
		return apperr.NewNotFound("user not found")
	}

	if !admin.IsOwner {
		return apperr.NewForbidden("owner access required")
	}

	req, err := httputil.DecodeJSON[UpdateUserRoleRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request body")
	}

	targetUser, err := h.db.Queries.GetUserByID(ctx, req.UserID)
	if err != nil {
		return apperr.NewNotFound("target user not found")
	}

	if targetUser.IsOwner && !req.IsAdmin {
		return apperr.NewForbidden("owner must always be admin")
	}

	user, err := h.db.Queries.UpdateUserRole(ctx, sqlc.UpdateUserRoleParams{
		IsAdmin: req.IsAdmin,
		ID:      req.UserID,
	})

	if err != nil {
		return apperr.NewInternal("failed to update user role", err)
	}

	return httputil.OKResult(w, UserResponse{
		ID:        user.ID,
		Username:  user.Username,
		Email:     user.Email,
		IsAdmin:   user.IsAdmin,
		IsOwner:   user.IsOwner,
		CreatedAt: user.CreatedAt.Time,
	})

}

func (h *AdminHandler) RenameUser(w http.ResponseWriter, r *http.Request) error {
	adminID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	ctx := r.Context()

	admin, err := h.db.Queries.GetUserByID(ctx, int64(adminID))
	if err != nil {
		return apperr.NewNotFound("user not found")
	}

	if !admin.IsAdmin {
		return apperr.NewForbidden("admin access required")
	}

	req, err := httputil.DecodeJSON[RenameUserRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request body")
	}

	if req.Username == "" {
		return apperr.NewBadRequest("username is required")
	}

	user, err := h.db.Queries.UpdateUsername(ctx, sqlc.UpdateUsernameParams{
		Username: req.Username,
		ID:       req.UserID,
	})

	if err != nil {
		return apperr.NewConflict("username already exists or user not found")
	}

	return httputil.OKResult(w, UserResponse{
		ID:        user.ID,
		Username:  user.Username,
		Email:     user.Email,
		IsAdmin:   user.IsAdmin,
		IsOwner:   user.IsOwner,
		CreatedAt: user.CreatedAt.Time,
	})
}

func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) error {
	adminID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	ctx := r.Context()

	admin, err := h.db.Queries.GetUserByID(ctx, int64(adminID))
	if err != nil {
		return apperr.NewNotFound("user not found")
	}

	if !admin.IsAdmin {
		return apperr.NewForbidden("admin access required")
	}

	userID, err := httputil.PathInt64(r, "id")
	if err != nil {
		return err
	}

	targetUser, err := h.db.Queries.GetUserByID(ctx, userID)
	if err != nil {
		return apperr.NewNotFound("user not found")
	}

	if targetUser.IsOwner {
		return apperr.NewForbidden("cannot delete the owner user")
	}

	users, err := h.db.Queries.ListAllUsers(ctx)
	if err != nil {
		return apperr.NewInternal("failed to check user count", err)
	}

	adminCount := 0
	for _, u := range users {
		if u.IsAdmin {
			adminCount++
		}
	}

	if adminCount <= 1 && admin.ID == userID {
		return apperr.NewForbidden("cannot delete the last admin user")
	}

	err = h.db.Queries.DeleteUserByID(ctx, userID)
	if err != nil {
		return apperr.NewInternal("failed to delete user", err)
	}

	httputil.NoContent(w)
	return nil
}

func (h *AdminHandler) CreateResetLink(w http.ResponseWriter, r *http.Request) error {
	adminID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	ctx := r.Context()

	admin, err := h.db.Queries.GetUserByID(ctx, int64(adminID))
	if err != nil {
		return apperr.NewNotFound("user not found")
	}

	if !admin.IsAdmin {
		return apperr.NewForbidden("admin access required")
	}

	req, err := httputil.DecodeJSON[CreateResetLinkRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request body")
	}

	if req.UserID == 0 {
		return apperr.NewBadRequest("user_id is required")
	}

	user, err := h.db.Queries.GetUserByID(ctx, req.UserID)
	if err != nil {
		return apperr.NewNotFound("user not found")
	}

	if user.IsOwner && !admin.IsOwner && admin.ID != user.ID {
		return apperr.NewForbidden("only owner can reset the owner's password")
	}

	token, err := auth.GenerateSecureToken(32)
	if err != nil {
		return apperr.NewInternal("failed to generate token", err)
	}

	resetToken, err := h.db.Queries.CreateResetToken(ctx, sqlc.CreateResetTokenParams{
		TokenHash: auth.HashToken(token, h.authConfig.TokenPepper),
		TokenType: "reset",
		UserID: sql.NullInt64{
			Int64: user.ID,
			Valid: true,
		},
		CreatedBy: admin.ID,
		Email:     user.Email,
		ExpiresAt: time.Now().Add(1 * time.Hour),
	})

	if err != nil {
		return apperr.NewInternal("failed to create reset link", err)
	}

	return httputil.OKResult(w, map[string]interface{}{
		"id":    resetToken.ID,
		"token": token,
		"email": resetToken.Email,
	})
}

type UserResponse struct {
	ID                         int64      `json:"id"`
	Username                   string     `json:"username"`
	Email                      string     `json:"email"`
	IsAdmin                    bool       `json:"is_admin"`
	IsOwner                    bool       `json:"is_owner"`
	LiteMode                   bool       `json:"lite_mode"`
	CreatedAt                  time.Time  `json:"created_at"`
	SubscriptionType           string     `json:"subscription_type"`
	SubscriptionExpiresAt      *time.Time `json:"subscription_expires_at"`
	SubscriptionWarningEnabled bool       `json:"subscription_warning_enabled"`
	SubscriptionWarningMessage string     `json:"subscription_warning_message"`
	LastSeenAt                 *time.Time `json:"last_seen_at"`
	IsOnline                   bool       `json:"is_online"`
}

func buildUserResponse(u sqlc.User, liteMode bool) UserResponse {
	var expiresAt *time.Time
	if u.SubscriptionExpiresAt.Valid {
		t := u.SubscriptionExpiresAt.Time
		expiresAt = &t
	}
	var lastSeen *time.Time
	if u.LastSeenAt.Valid {
		t := u.LastSeenAt.Time
		lastSeen = &t
	}
	return UserResponse{
		ID:                         u.ID,
		Username:                   u.Username,
		Email:                      u.Email,
		IsAdmin:                    u.IsAdmin,
		IsOwner:                    u.IsOwner,
		LiteMode:                   liteMode,
		CreatedAt:                  u.CreatedAt.Time,
		SubscriptionType:           u.SubscriptionType,
		SubscriptionExpiresAt:      expiresAt,
		SubscriptionWarningEnabled: u.SubscriptionWarningEnabled != 0,
		SubscriptionWarningMessage: u.SubscriptionWarningMessage,
		LastSeenAt:                 lastSeen,
	}
}

type CreateInviteRequest struct {
	Email *string `json:"email,omitempty"`
}

type UpdateUserRoleRequest struct {
	UserID  int64 `json:"user_id"`
	IsAdmin bool  `json:"is_admin"`
}

type RenameUserRequest struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
}

type CreateResetLinkRequest struct {
	UserID int64 `json:"user_id"`
}


// SetUserLiteMode sets lite_mode for a specific user (admin only)
func (h *AdminHandler) SetUserLiteMode(w http.ResponseWriter, r *http.Request) error {
	adminID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}

	ctx := r.Context()

	admin, err := h.db.Queries.GetUserByID(ctx, int64(adminID))
	if err != nil || !admin.IsAdmin {
		return apperr.NewForbidden("admin only")
	}

	targetIDStr := r.PathValue("id")
	if targetIDStr == "" {
		return apperr.NewBadRequest("missing user id")
	}
	var targetID int64
	if _, scanErr := fmt.Sscanf(targetIDStr, "%d", &targetID); scanErr != nil {
		return apperr.NewBadRequest("invalid user id")
	}

	type liteModeReq struct {
		LiteMode bool `json:"lite_mode"`
	}
	req, err := httputil.DecodeJSON[liteModeReq](r)
	if err != nil {
		return apperr.NewBadRequest("invalid body")
	}

	v := int64(0)
	if req.LiteMode {
		v = 1
	}
	_, err = h.db.UpdateUserPreferences(ctx, sqlc.UpdateUserPreferencesParams{
		UserID:   targetID,
		LiteMode: sql.NullInt64{Int64: v, Valid: true},
	})
	if err != nil {
		return apperr.NewInternal("failed to update", err)
	}
	return httputil.OKResult(w, map[string]bool{"lite_mode": req.LiteMode})
}

type AdminNotification struct {
	ID      string `json:"id"`
	Message string `json:"message"`
	Time    string `json:"time"`
	Type    string `json:"type"`
}

// GetAdminNotifications returns pending system notifications for admins.
func (h *AdminHandler) GetAdminNotifications(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	ctx := r.Context()
	user, err := h.db.Queries.GetUserByID(ctx, int64(userID))
	if err != nil || !user.IsAdmin {
		return apperr.NewForbidden("admin access required")
	}
	notifPath := filepath.Join(h.dataDir, "admin_notifications.json")
	data, err := os.ReadFile(notifPath)
	if os.IsNotExist(err) {
		return httputil.OKResult(w, []AdminNotification{})
	}
	if err != nil {
		return apperr.NewInternal("failed to read notifications", err)
	}
	var items []AdminNotification
	if err := json.Unmarshal(data, &items); err != nil {
		slog.Debug("failed to parse admin notifications", "error", err)
	}
	if items == nil {
		items = []AdminNotification{}
	}
	return httputil.OKResult(w, items)
}

// ClearAdminNotifications deletes all pending notifications.
func (h *AdminHandler) ClearAdminNotifications(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	ctx := r.Context()
	user, err := h.db.Queries.GetUserByID(ctx, int64(userID))
	if err != nil || !user.IsAdmin {
		return apperr.NewForbidden("admin access required")
	}
	notifPath := filepath.Join(h.dataDir, "admin_notifications.json")
	_ = os.Remove(notifPath)
	return httputil.OKResult(w, map[string]string{"status": "ok"})
}

// GetSystemInfo returns CPU temperature and disk usage for admins.
func (h *AdminHandler) GetSystemInfo(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	ctx := r.Context()
	user, err := h.db.Queries.GetUserByID(ctx, int64(userID))
	if err != nil || !user.IsAdmin {
		return apperr.NewForbidden("admin access required")
	}

	// CPU temp
	tempMillis := int64(0)
	if data, err := os.ReadFile("/sys/class/thermal/thermal_zone0/temp"); err == nil {
		fmt.Sscanf(strings.TrimSpace(string(data)), "%d", &tempMillis)
	}
	tempC := float64(tempMillis) / 1000.0

	// disk usage
	mainDisk := getDiskUsage("/")
	usbDisk := getDiskUsage("/mnt/vault-usb")

	return httputil.OKResult(w, map[string]interface{}{
		"cpu_temp_c": tempC,
		"main_disk":  mainDisk,
		"usb_disk":   usbDisk,
	})
}

type DiskInfo struct {
	Total   uint64  `json:"total"`
	Used    uint64  `json:"used"`
	Avail   uint64  `json:"avail"`
	UsedPct float64 `json:"used_pct"`
}

func getDiskUsage(path string) *DiskInfo {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return nil
	}
	total := stat.Blocks * uint64(stat.Bsize)
	avail := stat.Bavail * uint64(stat.Bsize)
	used := total - avail
	pct := 0.0
	if total > 0 {
		pct = float64(used) / float64(total) * 100
	}
	return &DiskInfo{Total: total, Used: used, Avail: avail, UsedPct: pct}
}

// RunOptimize triggers the optimize script for admins.
func (h *AdminHandler) RunOptimize(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	ctx := r.Context()
	user, err := h.db.Queries.GetUserByID(ctx, int64(userID))
	if err != nil || !user.IsAdmin {
		return apperr.NewForbidden("admin access required")
	}
	cmd := exec.Command("/bin/bash", "/home/lee/scripts/optimize.sh")
	if err := cmd.Start(); err != nil {
		return apperr.NewInternal("failed to start optimize script", err)
	}
	go func() { _ = cmd.Wait() }()
	return httputil.OKResult(w, map[string]string{"status": "started"})
}

type UpdateSubscriptionRequest struct {
	UserID           int64  `json:"user_id"`
	SubscriptionType string `json:"subscription_type"` // "regular", "trial", "lifetime"
	DaysToAdd        *int   `json:"days_to_add,omitempty"`
}

func (h *AdminHandler) UpdateSubscription(w http.ResponseWriter, r *http.Request) error {
	adminID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	ctx := r.Context()
	admin, err := h.db.Queries.GetUserByID(ctx, int64(adminID))
	if err != nil || !admin.IsAdmin {
		return apperr.NewForbidden("admin access required")
	}

	req, err := httputil.DecodeJSON[UpdateSubscriptionRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request body")
	}

	var expiresAt sql.NullTime
	switch req.SubscriptionType {
	case "lifetime":
		expiresAt = sql.NullTime{Valid: false}
	case "trial":
		expiresAt = sql.NullTime{Time: time.Now().Add(3 * 24 * time.Hour), Valid: true}
	default:
		if req.DaysToAdd != nil && *req.DaysToAdd > 0 {
			target, _ := h.db.Queries.GetUserByID(ctx, req.UserID)
			base := time.Now()
			if target.SubscriptionExpiresAt.Valid && target.SubscriptionExpiresAt.Time.After(time.Now()) {
				base = target.SubscriptionExpiresAt.Time
			}
			expiresAt = sql.NullTime{Time: base.Add(time.Duration(*req.DaysToAdd) * 24 * time.Hour), Valid: true}
		}
	}

	err = h.db.Queries.UpdateUserSubscription(ctx, sqlc.UpdateUserSubscriptionParams{
		SubscriptionType:      req.SubscriptionType,
		SubscriptionExpiresAt: expiresAt,
		ID:                    req.UserID,
	})
	if err != nil {
		return apperr.NewInternal("failed to update subscription", err)
	}

	user, _ := h.db.Queries.GetUserByID(ctx, req.UserID)
	return httputil.OKResult(w, buildUserResponse(user, false))
}

type UpdateWarningRequest struct {
	UserID  int64  `json:"user_id"`
	Enabled bool   `json:"enabled"`
	Message string `json:"message,omitempty"`
}

func (h *AdminHandler) UpdateSubscriptionWarning(w http.ResponseWriter, r *http.Request) error {
	adminID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	ctx := r.Context()
	admin, err := h.db.Queries.GetUserByID(ctx, int64(adminID))
	if err != nil || !admin.IsAdmin {
		return apperr.NewForbidden("admin access required")
	}

	req, err := httputil.DecodeJSON[UpdateWarningRequest](r)
	if err != nil {
		return apperr.NewBadRequest("invalid request body")
	}

	msg := req.Message
	if msg == "" {
		msg = "서비스 이용 기간이 만료되었습니다. 관리자에게 문의하여 결제해 주세요."
	}

	err = h.db.Queries.UpdateUserSubscriptionWarning(ctx, sqlc.UpdateUserSubscriptionWarningParams{
		SubscriptionWarningEnabled: req.Enabled,
		SubscriptionWarningMessage: msg,
		ID:                         req.UserID,
	})
	if err != nil {
		return apperr.NewInternal("failed to update warning", err)
	}

	user, _ := h.db.Queries.GetUserByID(ctx, req.UserID)
	return httputil.OKResult(w, buildUserResponse(user, false))
}

package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"bungleware/vault/internal/apperr"
	"bungleware/vault/internal/db"
	"bungleware/vault/internal/httputil"
)

const (
	neisBaseURL = "https://open.neis.go.kr/hub"
	neisKey     = "16e1a2553839416ea453e460ae118dda"
	owmKey      = "399944872f60074f4d9932053a4a0bee"
	weatherLat  = 37.6485
	weatherLon  = 126.7153
)

var kst = time.FixedZone("KST", 9*3600)

var koreanHolidays = []struct {
	Date string
	Name string
}{
	{"20260101", "신정"},
	{"20260128", "설날 연휴"},
	{"20260129", "설날"},
	{"20260130", "설날 연휴"},
	{"20260301", "삼일절"},
	{"20260505", "어린이날"},
	{"20260515", "부처님오신날"},
	{"20260606", "현충일"},
	{"20260815", "광복절"},
	{"20260924", "추석 연휴"},
	{"20260925", "추석"},
	{"20260926", "추석 연휴"},
	{"20260927", "추석 연휴"},
	{"20261003", "개천절"},
	{"20261009", "한글날"},
	{"20261225", "성탄절"},
}

var periodTimes = map[int]string{
	1: "09:00", 2: "09:55", 3: "10:50", 4: "11:45",
	5: "13:30", 6: "14:25", 7: "15:20",
}

type ReportHandler struct {
	db        *db.DB
	vapidPub  string
	vapidPriv string
}

func NewReportHandler(database *db.DB, vapidPub, vapidPriv string) *ReportHandler {
	return &ReportHandler{db: database, vapidPub: vapidPub, vapidPriv: vapidPriv}
}

// ── Settings ─────────────────────────────────────────────────────────────────

type ReportSettings struct {
	SchoolCode          string `json:"school_code"`
	AtptCode            string `json:"atpt_code"`
	SchoolName          string `json:"school_name"`
	SchoolType          string `json:"school_type"`
	Grade               int    `json:"grade"`
	ClassNum            int    `json:"class_num"`
	NotificationEnabled bool   `json:"notification_enabled"`
}

func (h *ReportHandler) GetSettings(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	var s ReportSettings
	var notif int
	row := h.db.QueryRowContext(r.Context(),
		`SELECT school_code, atpt_code, school_name, school_type, grade, class_num, notification_enabled
         FROM report_settings WHERE user_id = ?`, int64(userID))
	if err := row.Scan(&s.SchoolCode, &s.AtptCode, &s.SchoolName, &s.SchoolType, &s.Grade, &s.ClassNum, &notif); err != nil {
		s = ReportSettings{Grade: 1, ClassNum: 1, SchoolType: "MIS"}
	} else {
		s.NotificationEnabled = notif == 1
	}
	return httputil.OKResult(w, map[string]any{"settings": s, "vapid_public": h.vapidPub})
}

func (h *ReportHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	var s ReportSettings
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		return apperr.NewBadRequest("invalid body")
	}
	notif := 0
	if s.NotificationEnabled {
		notif = 1
	}
	_, err = h.db.ExecContext(r.Context(),
		`INSERT INTO report_settings (user_id,school_code,atpt_code,school_name,school_type,grade,class_num,notification_enabled,updated_at)
         VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET
           school_code=excluded.school_code, atpt_code=excluded.atpt_code,
           school_name=excluded.school_name, school_type=excluded.school_type,
           grade=excluded.grade, class_num=excluded.class_num,
           notification_enabled=excluded.notification_enabled,
           updated_at=CURRENT_TIMESTAMP`,
		int64(userID), s.SchoolCode, s.AtptCode, s.SchoolName, s.SchoolType, s.Grade, s.ClassNum, notif)
	if err != nil {
		return apperr.NewInternal("failed to save settings", err)
	}
	return httputil.OKResult(w, map[string]string{"status": "ok"})
}

// ── Push Subscription ─────────────────────────────────────────────────────────

type PushSubReq struct {
	Endpoint string `json:"endpoint"`
	P256DH   string `json:"p256dh"`
	Auth     string `json:"auth"`
}

func (h *ReportHandler) SavePushSubscription(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	var sub PushSubReq
	if err := json.NewDecoder(r.Body).Decode(&sub); err != nil {
		return apperr.NewBadRequest("invalid body")
	}
	_, err = h.db.ExecContext(r.Context(),
		`INSERT INTO push_subscriptions (user_id,endpoint,p256dh,auth)
         VALUES (?,?,?,?)
         ON CONFLICT(user_id,endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth`,
		int64(userID), sub.Endpoint, sub.P256DH, sub.Auth)
	if err != nil {
		return apperr.NewInternal("failed to save subscription", err)
	}
	return httputil.OKResult(w, map[string]string{"status": "ok"})
}

// ── School Search ─────────────────────────────────────────────────────────────

type SchoolResult struct {
	Code     string `json:"code"`
	AtptCode string `json:"atpt_code"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Address  string `json:"address"`
}

func (h *ReportHandler) SearchSchool(w http.ResponseWriter, r *http.Request) error {
	if _, err := httputil.RequireUserID(r); err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	q := r.URL.Query().Get("q")
	if q == "" {
		return apperr.NewBadRequest("q is required")
	}
	apiURL := fmt.Sprintf("%s/schoolInfo?KEY=%s&Type=json&SCHUL_NM=%s&pSize=10",
		neisBaseURL, neisKey, url.QueryEscape(q))
	resp, err := http.Get(apiURL)
	if err != nil {
		return apperr.NewInternal("failed to search school", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return httputil.OKResult(w, []SchoolResult{})
	}
	info, _ := raw["schoolInfo"].([]any)
	if len(info) < 2 {
		return httputil.OKResult(w, []SchoolResult{})
	}
	row2, _ := info[1].(map[string]any)
	rows, _ := row2["row"].([]any)
	var results []SchoolResult
	for _, item := range rows {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		schType := "MIS"
		switch fmt.Sprint(m["SCHUL_KND_SC_NM"]) {
		case "초등학교":
			schType = "ELS"
		case "고등학교":
			schType = "HIS"
		}
		results = append(results, SchoolResult{
			Code:     fmt.Sprint(m["SD_SCHUL_CODE"]),
			AtptCode: fmt.Sprint(m["ATPT_OFCDC_SC_CODE"]),
			Name:     fmt.Sprint(m["SCHUL_NM"]),
			Type:     schType,
			Address:  fmt.Sprint(m["ORG_RDNMA"]),
		})
	}
	if results == nil {
		results = []SchoolResult{}
	}
	return httputil.OKResult(w, results)
}

// ── Daily Report ──────────────────────────────────────────────────────────────

type WeatherInfo struct {
	Temp    float64      `json:"temp"`
	TempMax float64      `json:"temp_max"`
	TempMin float64      `json:"temp_min"`
	Desc    string       `json:"desc"`
	Icon    string       `json:"icon"`
	Hourly  []HourlyItem `json:"hourly"`
}

type HourlyItem struct {
	Hour string  `json:"hour"`
	Temp float64 `json:"temp"`
	Icon string  `json:"icon"`
	Pop  float64 `json:"pop"`
}

type TimetableItem struct {
	Period  int    `json:"period"`
	Subject string `json:"subject"`
	Time    string `json:"time"`
}

type LunchInfo struct {
	Kcal string   `json:"kcal"`
	Menu []string `json:"menu"`
}

type HolidayItem struct {
	Name     string `json:"name"`
	Date     string `json:"date"`
	DaysLeft int    `json:"days_left"`
}

type DailyReportResp struct {
	Date          string          `json:"date"`
	DayLabel      string          `json:"day_label"`
	Greeting      string          `json:"greeting"`
	TimeLabel     string          `json:"time_label"`
	SchoolName    string          `json:"school_name"`
	Weather       *WeatherInfo    `json:"weather"`
	Timetable     []TimetableItem `json:"timetable"`
	LunchDate     string          `json:"lunch_date"`
	Lunch         *LunchInfo      `json:"lunch"`
	NextHoliday   *HolidayItem    `json:"next_holiday"`
	IsWeekend     bool            `json:"is_weekend"`
	NextSchoolDay string          `json:"next_school_day"`
}

func (h *ReportHandler) GetDailyReport(w http.ResponseWriter, r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	var s ReportSettings
	s.Grade = 1
	s.ClassNum = 1
	s.SchoolType = "MIS"
	row := h.db.QueryRowContext(r.Context(),
		`SELECT school_code, atpt_code, school_name, school_type, grade, class_num
         FROM report_settings WHERE user_id = ?`, int64(userID))
	row.Scan(&s.SchoolCode, &s.AtptCode, &s.SchoolName, &s.SchoolType, &s.Grade, &s.ClassNum)

	now := time.Now().In(kst)
	today := now.Format("20060102")
	weekday := now.Weekday()
	isWeekend := weekday == time.Saturday || weekday == time.Sunday
	dayKr := [...]string{"일", "월", "화", "수", "목", "금", "토"}[weekday]

	// 05시 이후면 내일(다음 등교일) 시간표/급식 표시
	targetTime := now
	if now.Hour() >= 5 {
		targetTime = now.AddDate(0, 0, 1)
	}
	for targetTime.Weekday() == time.Saturday || targetTime.Weekday() == time.Sunday {
		targetTime = targetTime.AddDate(0, 0, 1)
	}
	targetDate := targetTime.Format("20060102")
	isShowingTomorrow := targetDate != today

	nextSchool := targetTime
	nextSchoolDisplay := nextSchool.Format("01.02") + " (" + weekdayKr(nextSchool.Weekday()) + ")"

	report := DailyReportResp{
		Date:          now.Format("2006. 01") + " / " + now.Format("02"),
		DayLabel:      dayKr + "요일",
		Greeting:      getReportGreeting(now),
		TimeLabel:     getReportTimeLabel(now),
		SchoolName:    s.SchoolName,
		IsWeekend:     isWeekend || isShowingTomorrow,
		NextSchoolDay: nextSchoolDisplay,
		LunchDate:     nextSchool.Format("01.02"),
	}

	report.Weather = fetchReportWeather()
	if s.SchoolCode != "" {
		report.Timetable = fetchReportTimetable(s, targetDate)
		report.Lunch = fetchReportLunch(s, targetDate)
	}
	report.NextHoliday = getNextKoreanHoliday(today)
	return httputil.OKResult(w, report)
}

func getReportTimeLabel(t time.Time) string {
	h := t.Hour()
	switch {
	case h >= 5 && h < 12:
		return "오늘 아침"
	case h >= 12 && h < 18:
		return "오늘 오후"
	case h >= 18 && h < 22:
		return "오늘 저녁"
	default:
		return "오늘 새벽"
	}
}

func getReportGreeting(t time.Time) string {
	h := t.Hour()
	switch {
	case h >= 5 && h < 9:
		return "좋은 아침이에요"
	case h >= 9 && h < 12:
		return "상쾌한 오전이에요"
	case h >= 12 && h < 14:
		return "점심 시간이에요"
	case h >= 14 && h < 18:
		return "좋은 오후에요"
	case h >= 18 && h < 21:
		return "저녁 시간이에요"
	case h >= 21:
		return "포근한 밤이에요"
	default:
		return "늦은 밤이에요"
	}
}

func fetchReportWeather() *WeatherInfo {
	curURL := fmt.Sprintf(
		"https://api.openweathermap.org/data/2.5/weather?lat=%.4f&lon=%.4f&appid=%s&units=metric&lang=kr",
		weatherLat, weatherLon, owmKey)
	resp, err := http.Get(curURL)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var cur map[string]any
	if err := json.Unmarshal(body, &cur); err != nil {
		return nil
	}
	info := &WeatherInfo{}
	if main, ok := cur["main"].(map[string]any); ok {
		info.Temp = toReportFloat(main["temp"])
		info.TempMax = toReportFloat(main["temp_max"])
		info.TempMin = toReportFloat(main["temp_min"])
	}
	if weather, ok := cur["weather"].([]any); ok && len(weather) > 0 {
		if w0, ok := weather[0].(map[string]any); ok {
			info.Desc = fmt.Sprint(w0["description"])
			info.Icon = fmt.Sprint(w0["icon"])
		}
	}
	fURL := fmt.Sprintf(
		"https://api.openweathermap.org/data/2.5/forecast?lat=%.4f&lon=%.4f&appid=%s&units=metric&lang=kr&cnt=10",
		weatherLat, weatherLon, owmKey)
	fr, err := http.Get(fURL)
	if err != nil {
		return info
	}
	defer fr.Body.Close()
	fb, _ := io.ReadAll(fr.Body)
	var fc map[string]any
	if err := json.Unmarshal(fb, &fc); err != nil {
		return info
	}
	nowUnix := time.Now().Unix()
	cutoff := nowUnix + 24*3600
	if list, ok := fc["list"].([]any); ok {
		for _, item := range list {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			dt := int64(toReportFloat(m["dt"]))
			if dt <= nowUnix || dt > cutoff {
				continue
			}
			t := time.Unix(dt, 0).In(kst)
			icon := ""
			if wl, ok := m["weather"].([]any); ok && len(wl) > 0 {
				if w0, ok := wl[0].(map[string]any); ok {
					icon = fmt.Sprint(w0["icon"])
				}
			}
			mainF, _ := m["main"].(map[string]any)
			info.Hourly = append(info.Hourly, HourlyItem{
				Hour: fmt.Sprintf("%d시", t.Hour()),
				Temp: toReportFloat(mainF["temp"]),
				Icon: icon,
				Pop:  toReportFloat(m["pop"]) * 100,
			})
		}
	}
	return info
}

func fetchReportTimetable(s ReportSettings, date string) []TimetableItem {
	ep := "misTimetable"
	switch s.SchoolType {
	case "ELS":
		ep = "elsTimetable"
	case "HIS":
		ep = "hisTimetable"
	}
	apiURL := fmt.Sprintf("%s/%s?KEY=%s&Type=json&ATPT_OFCDC_SC_CODE=%s&SD_SCHUL_CODE=%s&ALL_TI_YMD=%s&GRADE=%d&CLASS_NM=%d",
		neisBaseURL, ep, neisKey, s.AtptCode, s.SchoolCode, date, s.Grade, s.ClassNum)
	resp, err := http.Get(apiURL)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil
	}
	data, _ := raw[ep].([]any)
	if len(data) < 2 {
		return nil
	}
	row2, _ := data[1].(map[string]any)
	rows, _ := row2["row"].([]any)
	var items []TimetableItem
	for _, item := range rows {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		period := int(toReportFloat(m["PERIO"]))
		subject := fmt.Sprint(m["ITRT_CNTNT"])
		items = append(items, TimetableItem{Period: period, Subject: subject, Time: periodTimes[period]})
	}
	return items
}

func fetchReportLunch(s ReportSettings, date string) *LunchInfo {
	apiURL := fmt.Sprintf("%s/mealServiceDietInfo?KEY=%s&Type=json&ATPT_OFCDC_SC_CODE=%s&SD_SCHUL_CODE=%s&MLSV_YMD=%s",
		neisBaseURL, neisKey, s.AtptCode, s.SchoolCode, date)
	resp, err := http.Get(apiURL)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil
	}
	data, _ := raw["mealServiceDietInfo"].([]any)
	if len(data) < 2 {
		return nil
	}
	row2, _ := data[1].(map[string]any)
	rows, _ := row2["row"].([]any)
	for _, item := range rows {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if fmt.Sprint(m["MMEAL_SC_NM"]) != "중식" {
			continue
		}
		menuRaw := fmt.Sprint(m["DDISH_NM"])
		kcal := fmt.Sprint(m["CAL_INFO"])
		var menu []string
		for _, part := range strings.Split(menuRaw, "<br/>") {
			clean := strings.TrimSpace(part)
			if idx := strings.Index(clean, "("); idx > 0 {
				clean = strings.TrimSpace(clean[:idx])
			}
			if clean != "" {
				menu = append(menu, clean)
			}
		}
		return &LunchInfo{Kcal: kcal, Menu: menu}
	}
	return nil
}

func getNextKoreanHoliday(today string) *HolidayItem {
	for _, h := range koreanHolidays {
		if h.Date >= today {
			t1, _ := time.Parse("20060102", today)
			t2, _ := time.Parse("20060102", h.Date)
			days := int(t2.Sub(t1).Hours() / 24)
			return &HolidayItem{
				Name:     h.Name,
				Date:     t2.Format("01.02") + " (" + weekdayKr(t2.Weekday()) + ")",
				DaysLeft: days,
			}
		}
	}
	return nil
}

func weekdayKr(w time.Weekday) string {
	return [...]string{"일", "월", "화", "수", "목", "금", "토"}[w]
}

func toReportFloat(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case string:
		f, _ := strconv.ParseFloat(x, 64)
		return f
	}
	return 0
}

// ── Morning Push Notifications ────────────────────────────────────────────────

func (h *ReportHandler) SendMorningNotifications(ctx context.Context) {
	if h.vapidPub == "" || h.vapidPriv == "" {
		return
	}
	rows, err := h.db.QueryContext(ctx,
		`SELECT rs.user_id, ps.endpoint, ps.p256dh, ps.auth
         FROM report_settings rs
         JOIN push_subscriptions ps ON rs.user_id = ps.user_id
         WHERE rs.notification_enabled = 1`)
	if err != nil {
		slog.Error("push query failed", "error", err)
		return
	}
	defer rows.Close()
	payload := `{"title":"오늘의 리포트","body":"오늘의 리포트가 도착했습니다! 확인해보세요.","url":"/report"}`
	for rows.Next() {
		var userID int64
		var endpoint, p256dh, auth string
		if err := rows.Scan(&userID, &endpoint, &p256dh, &auth); err != nil {
			continue
		}
		sub := &webpush.Subscription{
			Endpoint: endpoint,
			Keys:     webpush.Keys{P256dh: p256dh, Auth: auth},
		}
		r, err := webpush.SendNotification([]byte(payload), sub, &webpush.Options{
			VAPIDPublicKey:  h.vapidPub,
			VAPIDPrivateKey: h.vapidPriv,
			Subscriber:      "mailto:admin@vault.local",
			TTL:             60,
		})
		if err != nil {
			slog.Error("push failed", "user", userID, "error", err)
			continue
		}
		r.Body.Close()
		slog.Info("push sent", "user", userID, "status", r.StatusCode)
	}
}

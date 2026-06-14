package handlers

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"bungleware/vault/internal/apperr"
	"bungleware/vault/internal/httputil"
)

// ─── Types ───────────────────────────────────────────────────────────────────

type KBOGame struct {
	Date        string   `json:"date"`
	Time        string   `json:"time"`
	Stadium     string   `json:"stadium"`
	AwayTeam    string   `json:"away_team"`
	HomeTeam    string   `json:"home_team"`
	AwayScore   string   `json:"away_score"`
	HomeScore   string   `json:"home_score"`
	Status      string   `json:"status"`
	Inning      string   `json:"inning"`
	GameKey     string   `json:"game_key"`
	WinPitcher  string   `json:"win_pitcher"`
	LosePitcher string   `json:"lose_pitcher"`
	SavePitcher string   `json:"save_pitcher"`
	AwayInnings []string `json:"away_innings"`
	HomeInnings []string `json:"home_innings"`
}

type KBOBoxscore struct {
	AwayBatting  []KBOBatter  `json:"away_batting"`
	HomeBatting  []KBOBatter  `json:"home_batting"`
	AwayPitching []KBOPitcher `json:"away_pitching"`
	HomePitching []KBOPitcher `json:"home_pitching"`
}

type KBOBatter struct {
	Name string `json:"name"`
	Pos  string `json:"pos"`
	AB   string `json:"ab"`
	H    string `json:"h"`
	HR   string `json:"hr"`
	RBI  string `json:"rbi"`
	BB   string `json:"bb"`
	SO   string `json:"so"`
	AVG  string `json:"avg"`
}

type KBOPitcher struct {
	Name string `json:"name"`
	IP   string `json:"ip"`
	H    string `json:"h"`
	R    string `json:"r"`
	ER   string `json:"er"`
	BB   string `json:"bb"`
	SO   string `json:"so"`
	ERA  string `json:"era"`
}

type KBOStanding struct {
	Rank   string `json:"rank"`
	Team   string `json:"team"`
	Games  string `json:"games"`
	Win    string `json:"win"`
	Lose   string `json:"lose"`
	Draw   string `json:"draw"`
	WinPct string `json:"win_pct"`
	GB     string `json:"gb"`
	Streak string `json:"streak"`
}

// ─── Handler ─────────────────────────────────────────────────────────────────

type KBOHandler struct{}

func NewKBOHandler() *KBOHandler { return &KBOHandler{} }

func (h *KBOHandler) GetGames(w http.ResponseWriter, r *http.Request) error {
	if _, err := httputil.RequireUserID(r); err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	date := r.URL.Query().Get("date")
	if date == "" {
		date = time.Now().In(kst).Format("20060102")
	}
	games, err := scrapeKBO(date)
	if err != nil {
		log.Printf("KBO scrape error: %v", err)
		return httputil.OKResult(w, []KBOGame{})
	}
	return httputil.OKResult(w, games)
}

func (h *KBOHandler) GetBoxscore(w http.ResponseWriter, r *http.Request) error {
	if _, err := httputil.RequireUserID(r); err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	gameDate := r.URL.Query().Get("gameDate")
	gameKey := r.URL.Query().Get("gameKey")
	if gameDate == "" || gameKey == "" {
		return apperr.NewBadRequest("gameDate and gameKey required")
	}
	bs, err := scrapeBoxscore(gameDate, gameKey)
	if err != nil {
		log.Printf("KBO boxscore error: %v", err)
		return httputil.OKResult(w, &KBOBoxscore{})
	}
	return httputil.OKResult(w, bs)
}

func (h *KBOHandler) GetStandings(w http.ResponseWriter, r *http.Request) error {
	if _, err := httputil.RequireUserID(r); err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	standings, err := scrapeStandings()
	if err != nil {
		log.Printf("KBO standings error: %v", err)
		return httputil.OKResult(w, []KBOStanding{})
	}
	return httputil.OKResult(w, standings)
}

// ─── Constants & helpers ──────────────────────────────────────────────────────

const (
	kboURL           = "https://www.koreabaseball.com/Schedule/ScoreBoard.aspx"
	kboGameCenterURL = "https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx"
	kboStandingsURL  = "https://www.koreabaseball.com/Record/Team/Ranking/Basic.aspx"
	kboUA            = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124"
)

var kboStadiums = []string{"잠실", "고척", "사직", "대구", "광주", "창원NC", "창원", "대전", "수원", "인천", "문학"}

func kboClient() *http.Client { return &http.Client{Timeout: 20 * time.Second} }

func kboGet(client *http.Client, pageURL string) (string, []*http.Cookie, error) {
	req, _ := http.NewRequest("GET", pageURL, nil)
	req.Header.Set("User-Agent", kboUA)
	req.Header.Set("Accept-Language", "ko-KR,ko;q=0.9")
	resp, err := client.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return string(body), resp.Cookies(), nil
}

func kboPost(client *http.Client, fields map[string]string, cookies []*http.Cookie) (string, error) {
	form := url.Values{}
	for k, v := range fields {
		form.Set(k, v)
	}
	req, _ := http.NewRequest("POST", kboURL, strings.NewReader(form.Encode()))
	req.Header.Set("User-Agent", kboUA)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Referer", kboURL)
	req.Header.Set("Accept-Language", "ko-KR,ko;q=0.9")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return string(body), nil
}

var (
	kboHiddenRe = regexp.MustCompile(`(?i)<input[^>]+type=["']?hidden["']?[^>]*>`)
	kboNameRe   = regexp.MustCompile(`(?i)name=["']([^"']+)["']`)
	kboValRe    = regexp.MustCompile(`(?i)value=["']([^"']*)["']`)
)

func kboParseHidden(html string) map[string]string {
	fields := map[string]string{}
	for _, tag := range kboHiddenRe.FindAllString(html, -1) {
		nm := kboNameRe.FindStringSubmatch(tag)
		vl := kboValRe.FindStringSubmatch(tag)
		if len(nm) > 1 {
			v := ""
			if len(vl) > 1 {
				v = vl[1]
			}
			fields[nm[1]] = v
		}
	}
	return fields
}

func kboFetchHTML(dateStr string) (string, error) {
	client := kboClient()
	htmlStr, cookies, err := kboGet(client, kboURL)
	if err != nil {
		return "", fmt.Errorf("GET 실패: %w", err)
	}
	// btnPreDate subtracts 1 day from hfSearchDate, so add 1 day to get the correct date
	targetDate, _ := time.ParseInLocation("20060102", dateStr, kst)
	adjDate := targetDate.AddDate(0, 0, 1)
	adjStr := adjDate.Format("20060102")
	prefix := "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents"
	fields := kboParseHidden(htmlStr)
	fields["__EVENTTARGET"] = prefix + "$btnPreDate"
	fields["__EVENTARGUMENT"] = ""
	fields[prefix+"$hfSearchDate"] = adjStr
	fields[prefix+"$txtGameDate"] = adjDate.Format("2006-01-02")
	return kboPost(client, fields, cookies)
}

var kboTagRe = regexp.MustCompile(`<[^>]+>`)

func kboExtractText(s string) string {
	s = kboTagRe.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&#39;", "'")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	return strings.TrimSpace(s)
}

func kboSplitBlocks(htmlStr string) []string {
	var blocks []string
	marker := `class="smsScore"`
	start := 0
	for {
		idx := strings.Index(htmlStr[start:], marker)
		if idx < 0 {
			break
		}
		abs := start + idx
		divStart := strings.LastIndex(htmlStr[:abs], "<div")
		if divStart < 0 {
			start = abs + len(marker)
			continue
		}
		depth, end := 0, divStart
		for end < len(htmlStr) {
			if strings.HasPrefix(htmlStr[end:], "<div") {
				depth++
				end += 4
			} else if strings.HasPrefix(htmlStr[end:], "</div>") {
				depth--
				end += 6
				if depth == 0 {
					break
				}
			} else {
				end++
			}
		}
		blocks = append(blocks, htmlStr[divStart:end])
		start = abs + len(marker)
	}
	return blocks
}

// ─── Regex patterns ───────────────────────────────────────────────────────────

var (
	kboTeamRe           = regexp.MustCompile(`(?s)class=['"]teamT['"][^>]*>\s*(.*?)\s*</strong>`)
	kboScoreRe          = regexp.MustCompile(`(?s)class="score"[^>]*>\s*<span[^>]*>\s*(\d+)\s*</span>`)
	kboFlagRe           = regexp.MustCompile(`(?s)class="flag"[^>]*>\s*<span[^>]*>\s*(.*?)\s*</span>`)
	kboTimeRe           = regexp.MustCompile(`\b(\d{2}:\d{2})\b`)
	kboInningRe         = regexp.MustCompile(`(\d+)회`)
	kboGameKeyRe        = regexp.MustCompile(`gameKey=([0-9A-Za-z]+)`)
	kboWinRe            = regexp.MustCompile(`승:\s*([^\s<|&\n]+)`)
	kboLoseRe           = regexp.MustCompile(`패:\s*([^\s<|&\n]+)`)
	kboSaveRe           = regexp.MustCompile(`세:\s*([^\s<|&\n]+)`)
	kboTScoreRe         = regexp.MustCompile(`(?s)class="tScore".*?<tbody>(.*?)</tbody>`)
	kboTrRe             = regexp.MustCompile(`(?s)<tr[^>]*>(.*?)</tr>`)
	kboTdRe             = regexp.MustCompile(`(?s)<td[^>]*>(.*?)</td>`)
	kboThTdRe           = regexp.MustCompile(`(?s)<t[hd][^>]*>(.*?)</t[hd]>`)
	kboTableRe          = regexp.MustCompile(`(?s)<table[^>]*class="([^"]*)"[^>]*>(.*?)</table>`)
	kboStandingsTableRe = regexp.MustCompile(`(?s)id="tblRanking"[^>]*>(.*?)</table>`)
)

// ─── Scoreboard scraping ──────────────────────────────────────────────────────

func scrapeKBO(dateStr string) ([]KBOGame, error) {
	htmlStr, err := kboFetchHTML(dateStr)
	if err != nil {
		return nil, err
	}
	blocks := kboSplitBlocks(htmlStr)
	var games []KBOGame
	for _, block := range blocks {
		teamMatches := kboTeamRe.FindAllStringSubmatch(block, -1)
		scoreMatches := kboScoreRe.FindAllStringSubmatch(block, -1)
		flagMatch := kboFlagRe.FindStringSubmatch(block)

		awayTeam, homeTeam := "", ""
		awayScore, homeScore := "", ""
		if len(teamMatches) >= 1 {
			awayTeam = kboExtractText(teamMatches[0][1])
		}
		if len(teamMatches) >= 2 {
			homeTeam = kboExtractText(teamMatches[1][1])
		}
		if len(scoreMatches) >= 1 {
			awayScore = strings.TrimSpace(scoreMatches[0][1])
		}
		if len(scoreMatches) >= 2 {
			homeScore = strings.TrimSpace(scoreMatches[1][1])
		}

		statusRaw := ""
		if len(flagMatch) > 1 {
			statusRaw = kboExtractText(flagMatch[1])
		}
		status := ""
		switch {
		case strings.Contains(statusRaw, "경기종료"):
			status = "경기종료"
		case strings.Contains(statusRaw, "경기중"):
			status = "경기중"
		case strings.Contains(statusRaw, "경기전"):
			status = "경기전"
		case strings.Contains(statusRaw, "취소"):
			status = "취소"
		default:
			status = statusRaw
		}
		inning := ""
		if m := kboInningRe.FindStringSubmatch(statusRaw); len(m) > 1 {
			inning = m[1]
		}
		plainText := kboExtractText(block)
		gameTime := ""
		if m := kboTimeRe.FindStringSubmatch(plainText); len(m) > 1 {
			gameTime = m[1]
		}
		stadium := ""
		for _, s := range kboStadiums {
			if strings.Contains(plainText, s) {
				stadium = s
				break
			}
		}

		gameKey := ""
		if m := kboGameKeyRe.FindStringSubmatch(block); len(m) > 1 {
			gameKey = m[1]
		}

		winPitcher, losePitcher, savePitcher := "", "", ""
		if status == "경기종료" {
			if m := kboWinRe.FindStringSubmatch(block); len(m) > 1 {
				winPitcher = kboExtractText(m[1])
			}
			if m := kboLoseRe.FindStringSubmatch(block); len(m) > 1 {
				losePitcher = kboExtractText(m[1])
			}
			if m := kboSaveRe.FindStringSubmatch(block); len(m) > 1 {
				savePitcher = kboExtractText(m[1])
			}
		}

		awayInnings, homeInnings := kboParseInnings(block)

		if awayTeam == "" && homeTeam == "" {
			continue
		}
		games = append(games, KBOGame{
			Date: dateStr, Time: gameTime, Stadium: stadium,
			AwayTeam: awayTeam, HomeTeam: homeTeam,
			AwayScore: awayScore, HomeScore: homeScore,
			Status: status, Inning: inning,
			GameKey:     gameKey,
			WinPitcher:  winPitcher,
			LosePitcher: losePitcher,
			SavePitcher: savePitcher,
			AwayInnings: awayInnings,
			HomeInnings: homeInnings,
		})
	}
	if games == nil {
		games = []KBOGame{}
	}
	return games, nil
}

func kboParseInnings(block string) (away, home []string) {
	m := kboTScoreRe.FindStringSubmatch(block)
	if len(m) < 2 {
		return
	}
	rows := kboTrRe.FindAllStringSubmatch(m[1], -1)
	for i, row := range rows {
		if len(row) < 2 || i > 1 {
			break
		}
		tds := kboTdRe.FindAllStringSubmatch(row[1], -1)
		var vals []string
		for _, td := range tds {
			if len(td) > 1 {
				vals = append(vals, kboExtractText(td[1]))
			}
		}
		if len(vals) > 4 {
			vals = vals[:len(vals)-4]
		}
		if i == 0 {
			away = vals
		} else {
			home = vals
		}
	}
	return
}

// ─── Boxscore ─────────────────────────────────────────────────────────────────

func scrapeBoxscore(gameDate, gameKey string) (*KBOBoxscore, error) {
	client := kboClient()
	u := fmt.Sprintf("%s?gameDate=%s&gameKey=%s&section=BOXSCORE", kboGameCenterURL, gameDate, gameKey)
	htmlStr, _, err := kboGet(client, u)
	if err != nil {
		return nil, err
	}

	bs := &KBOBoxscore{}
	var batterTables, pitcherTables []string
	for _, m := range kboTableRe.FindAllStringSubmatch(htmlStr, -1) {
		if len(m) < 3 {
			continue
		}
		if strings.Contains(m[1], "tBtter") {
			batterTables = append(batterTables, m[2])
		} else if strings.Contains(m[1], "tPitcher") {
			pitcherTables = append(pitcherTables, m[2])
		}
	}
	if len(batterTables) >= 1 {
		bs.AwayBatting = kboParseBatters(batterTables[0])
	}
	if len(batterTables) >= 2 {
		bs.HomeBatting = kboParseBatters(batterTables[1])
	}
	if len(pitcherTables) >= 1 {
		bs.AwayPitching = kboParsePitchers(pitcherTables[0])
	}
	if len(pitcherTables) >= 2 {
		bs.HomePitching = kboParsePitchers(pitcherTables[1])
	}
	return bs, nil
}

func kboParseRows(tableContent string) [][]string {
	var rows [][]string
	for _, tr := range kboTrRe.FindAllStringSubmatch(tableContent, -1) {
		if len(tr) < 2 {
			continue
		}
		cells := kboThTdRe.FindAllStringSubmatch(tr[1], -1)
		var row []string
		for _, c := range cells {
			if len(c) > 1 {
				row = append(row, kboExtractText(c[1]))
			}
		}
		if len(row) > 0 {
			rows = append(rows, row)
		}
	}
	return rows
}

func kboParseBatters(tableContent string) []KBOBatter {
	var batters []KBOBatter
	for _, row := range kboParseRows(tableContent) {
		if len(row) < 5 || row[0] == "타순" || row[0] == "" {
			continue
		}
		b := KBOBatter{}
		if len(row) > 1 {
			b.Pos = row[1]
		}
		if len(row) > 2 {
			b.Name = row[2]
		}
		if len(row) > 3 {
			b.AB = row[3]
		}
		if len(row) > 4 {
			b.H = row[4]
		}
		if len(row) > 5 {
			b.HR = row[5]
		}
		if len(row) > 6 {
			b.RBI = row[6]
		}
		if len(row) > 7 {
			b.BB = row[7]
		}
		if len(row) > 8 {
			b.SO = row[8]
		}
		if len(row) > 9 {
			b.AVG = row[9]
		}
		if b.Name != "" {
			batters = append(batters, b)
		}
	}
	return batters
}

func kboParsePitchers(tableContent string) []KBOPitcher {
	var pitchers []KBOPitcher
	for _, row := range kboParseRows(tableContent) {
		if len(row) < 4 || row[0] == "선수명" || row[0] == "" {
			continue
		}
		p := KBOPitcher{Name: row[0]}
		if len(row) > 1 {
			p.IP = row[1]
		}
		if len(row) > 2 {
			p.H = row[2]
		}
		if len(row) > 3 {
			p.R = row[3]
		}
		if len(row) > 4 {
			p.ER = row[4]
		}
		if len(row) > 5 {
			p.BB = row[5]
		}
		if len(row) > 6 {
			p.SO = row[6]
		}
		if len(row) > 7 {
			p.ERA = row[7]
		}
		if p.Name != "" {
			pitchers = append(pitchers, p)
		}
	}
	return pitchers
}

// ─── Standings ────────────────────────────────────────────────────────────────

func scrapeStandings() ([]KBOStanding, error) {
	client := kboClient()
	htmlStr, _, err := kboGet(client, kboStandingsURL)
	if err != nil {
		return nil, err
	}
	m := kboStandingsTableRe.FindStringSubmatch(htmlStr)
	if len(m) < 2 {
		return nil, fmt.Errorf("standings table not found")
	}
	var standings []KBOStanding
	for _, row := range kboParseRows(m[1]) {
		if len(row) < 7 || row[0] == "순위" || row[0] == "" {
			continue
		}
		s := KBOStanding{
			Rank: row[0], Team: row[1], Games: row[2],
			Win: row[3], Lose: row[4], Draw: row[5], WinPct: row[6],
		}
		if len(row) > 7 {
			s.GB = row[7]
		}
		if len(row) > 9 {
			s.Streak = row[9]
		}
		standings = append(standings, s)
	}
	if standings == nil {
		standings = []KBOStanding{}
	}
	return standings, nil
}

import { get } from './client'

export interface ReportSettings {
  school_code: string
  atpt_code: string
  school_name: string
  school_type: string
  grade: number
  class_num: number
  notification_enabled: boolean
}

export interface HourlyItem { hour: string; temp: number; icon: string; pop: number }
export interface WeatherInfo {
  temp: number; temp_max: number; temp_min: number
  desc: string; icon: string; hourly: HourlyItem[]
}
export interface TimetableItem { period: number; subject: string; time: string }
export interface LunchInfo { kcal: string; menu: string[] }
export interface HolidayItem { name: string; date: string; days_left: number }
export interface SchoolItem { code: string; atpt_code: string; name: string; type: string; address: string }
export interface DailyReport {
  date: string; day_label: string; greeting: string; time_label: string; school_name: string
  weather: WeatherInfo | null; timetable: TimetableItem[] | null
  lunch_date: string; lunch: LunchInfo | null
  next_holiday: HolidayItem | null; is_weekend: boolean; next_school_day: string
}
export interface SettingsResp { settings: ReportSettings; vapid_public: string }

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const csrf = document.cookie.match(/csrf_token=([^;]*)/)?.[1] || ''
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf) },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Request failed: ' + res.status)
  return res.json()
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const csrf = document.cookie.match(/csrf_token=([^;]*)/)?.[1] || ''
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf) },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Request failed: ' + res.status)
  return res.json()
}

export const getDailyReport = () => get<DailyReport>('/api/report/daily')
export const getReportSettings = () => get<SettingsResp>('/api/report/settings')
export const updateReportSettings = (s: ReportSettings) => apiPut<{ status: string }>('/api/report/settings', s)
export const searchSchool = (q: string) => get<SchoolItem[]>(`/api/report/school-search?q=${encodeURIComponent(q)}`)
export const savePushSub = (sub: { endpoint: string; p256dh: string; auth: string }) =>
  apiPost<{ status: string }>('/api/report/push-subscribe', sub)

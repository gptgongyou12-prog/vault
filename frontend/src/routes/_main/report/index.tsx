import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings2Icon, ChevronLeftIcon, SearchIcon, BellIcon, BellOffIcon } from 'lucide-react'
import {
  getDailyReport, getReportSettings, updateReportSettings, searchSchool, savePushSub,
  type ReportSettings, type SchoolItem,
} from '@/api/report'

export const Route = createFileRoute('/_main/report/')({
  component: ReportPage,
})

const weatherEmoji = (icon: string) => {
  const m: Record<string, string> = {
    '01d': '☀️', '01n': '🌙', '02d': '🌤', '02n': '🌤',
    '03d': '☁️', '03n': '☁️', '04d': '☁️', '04n': '☁️',
    '09d': '🌧', '09n': '🌧', '10d': '🌦', '10n': '🌦',
    '11d': '⛈', '11n': '⛈', '13d': '❄️', '13n': '❄️', '50d': '🌫', '50n': '🌫',
  }
  return m[icon] || '🌡'
}

function urlBase64ToUint8Array(b64: string) {
  const pad = '='.repeat((4 - b64.length % 4) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

function nowTime() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function ReportPage() {
  const [showSettings, setShowSettings] = useState(false)
  const [time, setTime] = useState(nowTime)

  useEffect(() => {
    const id = setInterval(() => setTime(nowTime()), 1000)
    return () => clearInterval(id)
  }, [])

  const { data: report, isLoading } = useQuery({
    queryKey: ['daily-report'],
    queryFn: getDailyReport,
    staleTime: 5 * 60 * 1000,
  })

  const [datePart, dayPart] = report?.date?.split('/') ?? ['', '']

  if (showSettings) return <SettingsPanel onBack={() => setShowSettings(false)} />

  return (
    <div className="min-h-screen bg-[#111] text-white pt-20 md:pt-28">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <div>
          <p className="text-[#555] text-xs">{report?.time_label || '오늘'}</p>
          {report?.school_name && (
            <p className="text-[#444] text-xs mt-0.5">{report.school_name}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[#555] text-sm tabular-nums">{time}</span>
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 text-[#555] hover:text-white transition-colors rounded-lg hover:bg-white/10"
          >
            <Settings2Icon className="size-5" />
          </button>
        </div>
      </div>

      {/* Date + Greeting */}
      <div className="px-5 pt-4 pb-6">
        <p className="text-[#858585] text-xl mb-2">{report?.greeting || '안녕하세요'}</p>
        <div className="text-[#555] text-sm mb-0.5">{datePart?.trim()}</div>
        <div className="text-white text-[96px] font-bold leading-none tracking-tighter">
          {dayPart?.trim()}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[#858585] text-base">{report?.day_label}</span>
          {report?.is_weekend && (
            <span className="text-xs bg-[#222] text-[#666] border border-[#333] rounded-full px-2.5 py-0.5">
              주말 · 휴식
            </span>
          )}
        </div>
      </div>

      {/* 01 날씨 */}
      <section className="px-5 py-5 border-t border-[#1e1e1e]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#444] text-xs font-medium tracking-[0.2em]">01 날씨 예보</h2>
          <span className="text-[#444] text-xs">김포시 운양동</span>
        </div>
        {report?.weather ? (
          <>
            <div className="flex items-end gap-4 mb-1">
              <span className="text-5xl leading-none">{weatherEmoji(report.weather.icon)}</span>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold">{Math.round(report.weather.temp)}°</span>
                <span className="text-[#858585] text-base mb-1">{report.weather.desc}</span>
              </div>
            </div>
            <p className="text-[#555] text-sm mb-4">
              최고 {Math.round(report.weather.temp_max)}° · 최저 {Math.round(report.weather.temp_min)}°
            </p>
            <div className="flex gap-5 overflow-x-auto pb-1">
              {(report.weather.hourly || []).map((h, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <span className="text-[#555] text-xs">{h.hour}</span>
                  <span className="text-xl">{weatherEmoji(h.icon)}</span>
                  <span className="text-white text-xs font-medium">{Math.round(h.temp)}°</span>
                  {h.pop > 0 && <span className="text-blue-400 text-xs">{Math.round(h.pop)}%</span>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[#555] text-sm">{isLoading ? '불러오는 중...' : '날씨 정보 없음'}</p>
        )}
      </section>

      {/* 02 공휴일 */}
      {report?.next_holiday && (
        <section className="px-5 py-5 border-t border-[#1e1e1e]">
          <h2 className="text-[#444] text-xs font-medium tracking-[0.2em] mb-4">02 다음 공휴일까지</h2>
          <div className="flex items-center gap-5">
            <div className="flex items-baseline gap-0.5">
              <span className="text-[#858585] text-2xl font-bold">D-</span>
              <span className="text-white text-6xl font-bold leading-none">{report.next_holiday.days_left}</span>
            </div>
            <div>
              <p className="text-white text-xl font-semibold">{report.next_holiday.name}</p>
              <p className="text-[#555] text-sm mt-1">{report.next_holiday.date}</p>
            </div>
          </div>
        </section>
      )}

      {/* 03 시간표 */}
      <section className="px-5 py-5 border-t border-[#1e1e1e]">
        <h2 className="text-[#444] text-xs font-medium tracking-[0.2em] mb-1">03 시 간 표</h2>
        <p className="text-[#444] text-xs mb-4">
          {report?.is_weekend
            ? `다음 등교일 ${report.next_school_day} 시간표`
            : '오늘 시간표'}
        </p>
        {report?.timetable && report.timetable.length > 0 ? (
          <div>
            {report.timetable.map((item, i) => {
              const showLunch = item.period === 4 &&
                report.timetable!.some(t => t.period >= 5)
              return (
                <div key={i}>
                  <div className="flex items-center justify-between py-3 border-b border-[#1a1a1a]">
                    <div className="flex items-center gap-5">
                      <span className="text-[#444] text-sm w-3 text-center">{item.period}</span>
                      <span className="text-white text-sm font-medium">{item.subject}</span>
                    </div>
                    <span className="text-[#555] text-sm">{item.time}</span>
                  </div>
                  {showLunch && (
                    <div className="flex items-center justify-between py-2.5 border-b border-[#1a1a1a]">
                      <div className="flex items-center gap-5">
                        <span className="text-[#333] text-sm w-3 text-center">·</span>
                        <span className="text-[#555] text-sm">점심</span>
                      </div>
                      <span className="text-[#444] text-sm">12:30</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-[#555] text-sm">
            {!report?.school_name ? '설정에서 학교를 설정해주세요' : '시간표 정보가 없습니다'}
          </p>
        )}
      </section>

      {/* 04 급식 */}
      <section className="px-5 py-5 border-t border-[#1e1e1e]">
        <h2 className="text-[#444] text-xs font-medium tracking-[0.2em] mb-4">04 급 식</h2>
        <div className="flex items-center justify-between mb-3">
          <p className="text-white text-sm font-semibold">
            {report?.is_weekend ? `다음 중식 · ${report.lunch_date}` : '오늘 중식'}
          </p>
          {report?.lunch?.kcal && (
            <span className="text-[#555] text-xs">{report.lunch.kcal}</span>
          )}
        </div>
        {report?.lunch ? (
          <ul className="space-y-2">
            {report.lunch.menu.map((item, i) => (
              <li key={i} className="flex items-center gap-2.5 text-[#858585] text-sm">
                <span className="size-1.5 rounded-full bg-[#333] flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[#555] text-sm">
            {!report?.school_name ? '학교 설정 후 이용 가능합니다' : '급식 정보가 없습니다'}
          </p>
        )}
      </section>

      {report?.is_weekend && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#1e1e1e]">
          <span className="text-[#555] text-sm">오늘은 쉬는 날</span>
          <span className="text-xs bg-[#222] text-[#555] border border-[#333] rounded-full px-2.5 py-0.5">주말</span>
        </div>
      )}

      <div className="h-36" />
    </div>
  )
}

// ── Settings Panel ──────────────────────────────────────────────────────────

function SettingsPanel({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient()
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<SchoolItem[]>([])
  const [searching, setSearching] = useState(false)
  const [local, setLocal] = useState<ReportSettings | null>(null)
  const [saved, setSaved] = useState(false)

  const { data: settingsData } = useQuery({
    queryKey: ['report-settings'],
    queryFn: getReportSettings,
  })

  useEffect(() => {
    if (settingsData && !local) setLocal(settingsData.settings)
  }, [settingsData])

  const settings = local || settingsData?.settings
  const vapidPub = settingsData?.vapid_public || ''

  const saveMutation = useMutation({
    mutationFn: updateReportSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-settings'] })
      queryClient.invalidateQueries({ queryKey: ['daily-report'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleSearch = async () => {
    if (!searchQ.trim()) return
    setSearching(true)
    try {
      setSearchResults(await searchSchool(searchQ))
    } finally {
      setSearching(false)
    }
  }

  const selectSchool = (s: SchoolItem) => {
    setLocal(prev => ({
      ...(prev ?? { grade: 1, class_num: 1, notification_enabled: false }),
      school_code: s.code, atpt_code: s.atpt_code,
      school_name: s.name, school_type: s.type,
    }))
    setSearchResults([])
    setSearchQ('')
  }

  const toggleNotif = async (enabled: boolean) => {
    if (enabled) {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPub),
        })
        const json = sub.toJSON()
        await savePushSub({
          endpoint: json.endpoint!,
          p256dh: (json.keys as any).p256dh,
          auth: (json.keys as any).auth,
        })
      } catch (e) {
        console.error('push subscribe failed', e)
        return
      }
    }
    setLocal(prev => prev ? { ...prev, notification_enabled: enabled } : null)
  }

  const notifAvailable = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator

  return (
    <div className="min-h-screen bg-[#111] text-white pt-20 md:pt-28">
      <div className="flex items-center gap-3 px-5 pt-6 pb-4 border-b border-[#1e1e1e]">
        <button onClick={onBack} className="p-1.5 text-[#555] hover:text-white transition-colors">
          <ChevronLeftIcon className="size-5" />
        </button>
        <h1 className="text-lg font-semibold">리포트 설정</h1>
      </div>

      <div className="px-5 py-6 space-y-8">
        {/* School */}
        <div>
          <label className="text-[#444] text-xs font-medium tracking-[0.2em] block mb-3">학교 검색</label>
          {settings?.school_name && (
            <div className="mb-3 p-3 bg-[#1a1a1a] rounded-xl border border-[#2a2a2a]">
              <p className="text-white text-sm font-medium">{settings.school_name}</p>
              <p className="text-[#555] text-xs mt-0.5">
                {{ ELS: '초등학교', MIS: '중학교', HIS: '고등학교' }[settings.school_type] ?? ''}
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="학교 이름으로 검색..."
              className="flex-1 bg-[#1a1a1a] border border-[#353333] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#555] focus:outline-none focus:border-[#555]"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-4 py-2.5 bg-white text-black rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              {searching ? '...' : <SearchIcon className="size-4" />}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 border border-[#2a2a2a] rounded-xl overflow-hidden">
              {searchResults.map((s, i) => (
                <button
                  key={i}
                  onClick={() => selectSchool(s)}
                  className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-[#1e1e1e] last:border-0"
                >
                  <p className="text-white text-sm">{s.name}</p>
                  <p className="text-[#555] text-xs mt-0.5">{s.address}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Grade / Class */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[#444] text-xs font-medium tracking-[0.2em] block mb-2">학년</label>
            <select
              value={settings?.grade ?? 1}
              onChange={e => setLocal(prev => prev ? { ...prev, grade: Number(e.target.value) } : null)}
              className="w-full bg-[#1a1a1a] border border-[#353333] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none"
            >
              {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}학년</option>)}
            </select>
          </div>
          <div>
            <label className="text-[#444] text-xs font-medium tracking-[0.2em] block mb-2">반</label>
            <select
              value={settings?.class_num ?? 1}
              onChange={e => setLocal(prev => prev ? { ...prev, class_num: Number(e.target.value) } : null)}
              className="w-full bg-[#1a1a1a] border border-[#353333] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none"
            >
              {Array.from({ length: 20 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}반</option>)}
            </select>
          </div>
        </div>

        {/* Notification */}
        {notifAvailable && vapidPub && (
          <div>
            <label className="text-[#444] text-xs font-medium tracking-[0.2em] block mb-3">아침 알림</label>
            <div className="flex items-center justify-between p-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl">
              <div>
                <p className="text-white text-sm font-medium">매일 07:30 알림</p>
                <p className="text-[#555] text-xs mt-0.5">오늘의 리포트를 알림으로 받아요</p>
              </div>
              <button
                onClick={() => toggleNotif(!settings?.notification_enabled)}
                className={`p-2 rounded-lg transition-colors ${
                  settings?.notification_enabled
                    ? 'bg-white/10 text-white'
                    : 'text-[#555] hover:bg-white/5'
                }`}
              >
                {settings?.notification_enabled
                  ? <BellIcon className="size-5" />
                  : <BellOffIcon className="size-5" />}
              </button>
            </div>
          </div>
        )}

        {/* Save */}
        <button
          onClick={() => settings && saveMutation.mutate(settings)}
          disabled={saveMutation.isPending}
          className="w-full py-3 bg-white text-black rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {saved ? '저장됨 ✓' : saveMutation.isPending ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

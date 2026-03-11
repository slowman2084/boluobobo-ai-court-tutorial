import { useState, useEffect, useCallback } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import type { SystemStatus } from "../types"
import { useTheme } from "../theme"

interface Props {
  data: SystemStatus
  onNavigate?: (tab: string, filter?: string) => void
}

const AUTH_TOKEN = localStorage.getItem('boluo_auth_token') || ''

interface CityWeather {
  name: string
  tz: string
  temp: string
  desc: string
  humidity?: string
  icon: string
}

interface DashboardSummary {
  headline: {
    title: string
    subtitle: string
    lazyScore: number
    activeAgents: number
    totalAgents: number
  }
  quickWins: string[]
  actionQueue: { label: string; target: string; command: string }[]
  groupOverview: { key: string; label: string; total: number; active: number; tokens: number }[]
  spotlight: {
    agentId: string
    name: string
    category?: string
    categoryLabel?: string
    updatedAt: number
    messages: number
    tokens: number
    staleLevel: "active" | "watch" | "idle"
    lastMessagePreview?: string
  }[]
  waitingQueue: {
    agentId: string
    name: string
    categoryLabel?: string
    idleHours: number | null
    updatedAt: number
    reason: string
  }[]
  leisureBoard: {
    agentId: string
    name: string
    status: "ready" | "warming" | "idle"
    summary: string
    updatedAt: number
  }[]
  totalTokens: number
  totalSessions: number
  activeSessions: number
  dailyTrend: { date: string; tokens: number }[]
  systemLoad?: {
    cpu1m: number
    cpu5m: number
    cpu15m: number
    memUsedPct: number
    diskUsage?: string
    uptime?: string
  }
  lastUpdated?: number
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return n.toString()
}

function relTime(ts: number) {
  if (!ts) return '未知'
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}天前`
  if (h > 0) return `${h}小时前`
  if (m > 0) return `${m}分钟前`
  return '刚刚'
}

function loadColor(pct: number): string {
  if (pct >= 80) return 'text-red-400'
  if (pct >= 50) return 'text-yellow-400'
  return 'text-green-400'
}

function loadBg(pct: number): string {
  if (pct >= 80) return 'bg-red-500'
  if (pct >= 50) return 'bg-yellow-500'
  return 'bg-green-500'
}

function Clock({ tz, label, emoji }: { tz: string; label: string; emoji: string }) {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('zh-CN', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
      setDate(now.toLocaleDateString('zh-CN', { timeZone: tz, month: 'short', day: 'numeric', weekday: 'short' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tz])

  return (
    <div className="text-center py-2">
      <div className="font-mono text-xl sm:text-2xl text-[#d4a574] tabular-nums">{time}</div>
      <div className="text-[10px] sm:text-xs text-[#a3a3a3] mt-0.5">{emoji} {label}</div>
      <div className="text-[10px] text-[#a3a3a3]/60">{date}</div>
    </div>
  )
}

function TrendTooltip({ active, payload, label, dailyTrend }: any) {
  const { theme } = useTheme()
  if (!active || !payload?.length) return null

  const value = payload[0].value as number
  const idx = dailyTrend?.findIndex((d: { date: string }) => d.date.slice(5) === label)
  let change = ''
  if (idx > 0 && dailyTrend) {
    const prev = dailyTrend[idx - 1].tokens
    if (prev > 0) {
      const pct = ((value - prev) / prev) * 100
      change = `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}% vs 前日`
    }
  }

  return (
    <div className={`px-3 py-2 rounded-lg border text-xs ${theme === 'light' ? 'bg-white border-gray-300' : 'bg-[#1a1a2e] border-[#d4a574]'}`}>
      <div className="text-[#d4a574] font-medium">{label}</div>
      <div className="font-mono mt-1">{fmt(value)} tokens</div>
      {change && <div className="text-[10px] text-[#a3a3a3] mt-0.5">{change}</div>}
    </div>
  )
}

function TokenTrend({ dailyTrend }: { dailyTrend: { date: string; tokens: number }[] }) {
  const { theme } = useTheme()
  const sub = theme === 'light' ? 'text-gray-500' : 'text-[#a3a3a3]'

  if (!dailyTrend.length) return null

  const chartData = dailyTrend.map(d => ({ date: d.date.slice(5), tokens: d.tokens }))
  const todayTokens = dailyTrend[dailyTrend.length - 1]?.tokens || 0
  const yesterdayTokens = dailyTrend[dailyTrend.length - 2]?.tokens || 0
  const diff = yesterdayTokens > 0 ? ((todayTokens - yesterdayTokens) / yesterdayTokens) * 100 : 0

  return (
    <div className={`${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-[#1a1a2e]'} rounded-lg p-3 sm:p-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-[10px] sm:text-xs uppercase tracking-wider ${sub}`}>📈 近7日卷王消耗趋势</h3>
        <div className="text-xs font-mono text-[#d4a574]">{diff >= 0 ? '↑' : '↓'} {Math.abs(diff).toFixed(1)}%</div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#e5e7eb' : '#333'} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#a3a3a3' }} />
          <YAxis tick={{ fontSize: 10, fill: '#a3a3a3' }} tickFormatter={fmt} width={45} />
          <Tooltip content={<TrendTooltip dailyTrend={dailyTrend} />} />
          <Line type="monotone" dataKey="tokens" stroke="#d4a574" strokeWidth={2} dot={{ fill: '#d4a574', r: 3 }} activeDot={{ r: 5, fill: '#e5b584' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function Dashboard({ data, onNavigate }: Props) {
  const { theme } = useTheme()
  const [weather, setWeather] = useState<CityWeather[]>([])
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const bg = theme === 'light' ? 'bg-white border border-gray-200' : 'bg-[#1a1a2e]'
  const sub = theme === 'light' ? 'text-gray-500' : 'text-[#a3a3a3]'

  useEffect(() => {
    const h = { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    fetch('/api/weather/cities', h).then(r => r.json()).then(d => setWeather(d.cities || [])).catch(() => {})
    fetch('/api/dashboard/summary', h).then(r => r.json()).then(d => setSummary(d)).catch(() => {})
  }, [])

  const onlineCount = data.botAccounts.filter(b => b.status === "online").length
  const totalCount = data.botAccounts.length
  const waitingCount = summary?.waitingQueue.length ?? 0
  const lazyScore = summary?.headline.lazyScore ?? (totalCount ? Math.round((onlineCount / totalCount) * 100) : 0)
  const cpuPct = Number(summary?.systemLoad?.cpu1m ?? 0)
  const memPct = Number(summary?.systemLoad?.memUsedPct ?? 0)
  const updatedAt = summary?.lastUpdated ? new Date(summary.lastUpdated).toLocaleTimeString("zh-CN") : null

  const handleDeptClick = useCallback((deptName: string) => {
    if (onNavigate) onNavigate('sessions', deptName)
  }, [onNavigate])

  const statusBadge = (level: "active" | "watch" | "idle") => {
    if (level === "active") return "bg-green-500/15 text-green-400"
    if (level === "watch") return "bg-yellow-500/15 text-yellow-400"
    return "bg-red-500/15 text-red-400"
  }

  const leisureBadge = (status: "ready" | "warming" | "idle") => {
    if (status === "ready") return "bg-green-500/15 text-green-400"
    if (status === "warming") return "bg-yellow-500/15 text-yellow-400"
    return "bg-gray-500/15 text-gray-400"
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className={`${bg} rounded-lg p-3 sm:p-4`}>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Clock tz="Europe/Zurich" label="苏黎世" emoji="🇨🇭" />
          <Clock tz="Asia/Shanghai" label="南京" emoji="🇨🇳" />
          <Clock tz="Asia/Shanghai" label="杭州" emoji="🇨🇳" />
        </div>
        {weather.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-3 pt-3 border-t border-[#d4a574]/10">
            {weather.map(c => (
              <div key={c.name} className="text-center">
                <span className="text-lg sm:text-xl">{c.icon}</span>
                <span className="ml-1 text-base sm:text-lg font-mono text-[#d4a574]">{c.temp}°</span>
                <div className={`text-[10px] sm:text-xs ${sub}`}>{c.desc} · 湿{c.humidity}%</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${bg} rounded-lg p-4 sm:p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`text-[10px] uppercase tracking-[0.25em] mb-2 ${sub}`}>昏君驾驶舱</div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#d4a574]">{summary?.headline.title || '群臣待命中'}</h2>
            <p className={`text-sm mt-2 max-w-3xl ${sub}`}>{summary?.headline.subtitle || '正在汇总今日朝务，请稍候。'}</p>
          </div>
          <div className="text-right">
            <div className={`text-[10px] uppercase ${sub}`}>省心指数</div>
            <div className="text-3xl font-mono text-[#d4a574]">{lazyScore}</div>
          </div>
        </div>
        <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme === 'light' ? '#f1f5f9' : '#0d0d1a' }}>
          <div className="h-full bg-linear-to-r from-[#c49464] to-[#e5b584]" style={{ width: `${lazyScore}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: '在岗群臣', value: `${summary?.headline.activeAgents ?? onlineCount}/${summary?.headline.totalAgents ?? totalCount}`, icon: '🧍' },
            { label: '待催办', value: waitingCount.toString(), icon: '🪵' },
            { label: '今日消耗', value: fmt(summary?.totalTokens ?? data.todayTokens), icon: '🔥' },
            { label: '活跃会话', value: String(summary?.activeSessions ?? data.totalSessions), icon: '⚡' },
          ].map(item => (
            <div key={item.label} className={`rounded-lg p-3 ${theme === 'light' ? 'bg-amber-50' : 'bg-[#16213e]'}`}>
              <div className={`text-[10px] uppercase ${sub}`}>{item.icon} {item.label}</div>
              <div className="mt-1 text-lg sm:text-xl font-mono text-[#d4a574]">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {summary?.quickWins?.length ? (
        <div className={`${bg} rounded-lg p-3 sm:p-4`}>
          <h3 className={`text-[10px] sm:text-xs uppercase tracking-wider mb-3 ${sub}`}>📌 今日一句话简报</h3>
          <div className="space-y-2">
            {summary.quickWins.map((line, idx) => (
              <div key={idx} className={`rounded-lg px-3 py-2 text-sm ${theme === 'light' ? 'bg-amber-50 text-gray-700' : 'bg-[#16213e] text-[#e5e5e5]'}`}>
                {line}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {summary?.actionQueue?.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {summary.actionQueue.map(action => (
            <div key={action.label} className={`${bg} rounded-lg p-3 sm:p-4`}>
              <div className={`text-[10px] uppercase mb-1 ${sub}`}>可直接下令</div>
              <div className="text-sm font-medium text-[#d4a574]">{action.label}</div>
              <div className={`text-xs mt-1 ${sub}`}>对象：{action.target}</div>
              <div className={`mt-3 rounded-lg p-2.5 text-xs leading-relaxed font-mono ${theme === 'light' ? 'bg-gray-50 text-gray-700' : 'bg-[#0d0d1a] text-[#d1d5db]'}`}>
                {action.command}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {summary?.groupOverview?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {summary.groupOverview.map(group => (
            <div key={group.label} className={`${bg} rounded-lg p-3 sm:p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-[10px] uppercase ${sub}`}>组织分组</div>
                  <div className="text-base font-medium text-[#d4a574] mt-1">{group.label}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-mono text-[#d4a574]">{group.active}/{group.total}</div>
                  <div className={`text-[10px] ${sub}`}>当前在动</div>
                </div>
              </div>
              <div className="mt-3">
                <div className={`flex justify-between text-xs ${sub}`}>
                  <span>本组消耗</span>
                  <span className="font-mono text-[#d4a574]">{fmt(group.tokens)}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme === 'light' ? '#f1f5f9' : '#0d0d1a' }}>
                  <div className="h-full bg-[#d4a574]" style={{ width: `${group.total ? (group.active / group.total) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className={`${bg} rounded-lg p-3 sm:p-4`}>
          <h3 className={`text-[10px] sm:text-xs uppercase tracking-wider mb-3 ${sub}`}>🧠 谁在主动卷</h3>
          <div className="space-y-2">
            {(summary?.spotlight || []).map(item => (
              <button
                key={item.agentId}
                onClick={() => handleDeptClick(item.name)}
                className={`w-full text-left rounded-lg p-3 transition-colors cursor-pointer ${theme === 'light' ? 'hover:bg-gray-50' : 'hover:bg-[#16213e]'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.name}</span>
                      {item.categoryLabel && <span className={`text-[10px] px-1.5 py-0.5 rounded ${theme === 'light' ? 'bg-amber-50 text-amber-700' : 'bg-[#d4a574]/10 text-[#d4a574]'}`}>{item.categoryLabel}</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadge(item.staleLevel)}`}>
                        {item.staleLevel === 'active' ? '活跃' : item.staleLevel === 'watch' ? '观察' : '催办'}
                      </span>
                    </div>
                    <div className={`text-xs mt-1 line-clamp-2 ${sub}`}>{item.lastMessagePreview || '最近暂无可展示摘要。'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono text-[#d4a574]">{fmt(item.tokens)}</div>
                    <div className={`text-[10px] ${sub}`}>{relTime(item.updatedAt)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className={`${bg} rounded-lg p-3 sm:p-4`}>
            <h3 className={`text-[10px] sm:text-xs uppercase tracking-wider mb-3 ${sub}`}>🪵 谁该被催</h3>
            <div className="space-y-2">
              {summary?.waitingQueue?.length ? summary.waitingQueue.map(item => (
                <div key={item.agentId} className={`rounded-lg p-3 ${theme === 'light' ? 'bg-red-50' : 'bg-[#16213e]'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[#d4a574]">{item.name}</div>
                      <div className={`text-xs mt-1 ${sub}`}>{item.reason}</div>
                    </div>
                    <div className={`text-[10px] ${sub}`}>{item.updatedAt ? relTime(item.updatedAt) : '无记录'}</div>
                  </div>
                </div>
              )) : (
                <div className={`rounded-lg p-3 text-sm ${theme === 'light' ? 'bg-green-50 text-green-700' : 'bg-[#16213e] text-green-400'}`}>
                  暂时没人明显掉队，主上可以放心一点。
                </div>
              )}
            </div>
          </div>

          <div className={`${bg} rounded-lg p-3 sm:p-4`}>
            <h3 className={`text-[10px] sm:text-xs uppercase tracking-wider mb-3 ${sub}`}>🎭 享乐线状态</h3>
            <div className="space-y-2">
              {(summary?.leisureBoard || []).map(item => (
                <div key={item.agentId} className={`rounded-lg p-3 ${theme === 'light' ? 'bg-amber-50' : 'bg-[#16213e]'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#d4a574]">{item.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${leisureBadge(item.status)}`}>
                          {item.status === 'ready' ? '可享用' : item.status === 'warming' ? '待热身' : '未开工'}
                        </span>
                      </div>
                      <div className={`text-xs mt-1 line-clamp-2 ${sub}`}>{item.summary}</div>
                    </div>
                    <div className={`text-[10px] shrink-0 ${sub}`}>{item.updatedAt ? relTime(item.updatedAt) : '无记录'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {summary?.dailyTrend?.length ? <TokenTrend dailyTrend={summary.dailyTrend} /> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className={`${bg} rounded-lg p-3 text-center`}>
          <div className={`text-[10px] uppercase ${sub}`}>⏱ 运行时长</div>
          <div className="mt-1 font-mono text-sm text-[#d4a574]">{summary?.systemLoad?.uptime || data.uptime}</div>
          {updatedAt && <div className={`text-[10px] mt-1 ${sub}`}>更新于 {updatedAt}</div>}
        </div>
        <div className={`${bg} rounded-lg p-3 text-center`}>
          <div className={`text-[10px] uppercase ${sub}`}>📊 CPU</div>
          <div className={`font-mono text-sm mt-1 ${loadColor(cpuPct)}`}>{cpuPct.toFixed(1)}%</div>
          <div className={`h-1 rounded-full mt-1.5 ${theme === 'light' ? 'bg-gray-200' : 'bg-[#0d0d1a]'}`}>
            <div className={`h-full rounded-full ${loadBg(cpuPct)}`} style={{ width: `${Math.min(cpuPct, 100)}%` }} />
          </div>
        </div>
        <div className={`${bg} rounded-lg p-3 text-center`}>
          <div className={`text-[10px] uppercase ${sub}`}>💾 内存</div>
          <div className={`font-mono text-sm mt-1 ${loadColor(memPct)}`}>{memPct.toFixed(1)}%</div>
          <div className={`h-1 rounded-full mt-1.5 ${theme === 'light' ? 'bg-gray-200' : 'bg-[#0d0d1a]'}`}>
            <div className={`h-full rounded-full ${loadBg(memPct)}`} style={{ width: `${Math.min(memPct, 100)}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

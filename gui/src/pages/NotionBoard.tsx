import { useCallback, useEffect, useState } from "react"
import { useTheme } from "../theme"

type StudioTab = "lines" | "templates" | "integrations"

interface StudioLine {
  id: string
  name: string
  lineLabel: string
  status: "ready" | "warming" | "draft_only"
  statusLabel: string
  summary: string
  updatedAt: number
  sessions: number
  totalTokens: number
  capabilities: string[]
  command: string
  integrations: { id: string; label: string; enabled: boolean; note: string }[]
}

interface StudioTemplate {
  id: string
  title: string
  owner: string
  tags: string[]
  description: string
  command: string
}

interface StudioIntegration {
  id: string
  label: string
  enabled: boolean
  scope: string
  note: string
}

interface StudioData {
  summary: {
    headline: string
    subtitle: string
    readyLines: number
    totalLines: number
    enabledExternalIntegrations: number
  }
  lines: StudioLine[]
  templates: StudioTemplate[]
  integrations: StudioIntegration[]
}

interface CreativeTask {
  id: string
  provider: "suno" | "seeddance"
  mode: "music" | "video"
  status: string
  remoteTaskId?: string
  summary: string
  updatedAt: string
  createdAt: string
  outputs?: {
    urls?: string[]
    primaryUrl?: string
  }
}

const AUTH_TOKEN = localStorage.getItem('boluo_auth_token') || ''
const COURT_CHANNEL = '1474091579630293164'

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return n.toString()
}

function relTime(ts: number) {
  if (!ts) return '暂无记录'
  const diff = Date.now() - ts
  const h = Math.floor(diff / (1000 * 60 * 60))
  const m = Math.floor(diff / (1000 * 60))
  if (h > 0) return `${h}小时前`
  if (m > 0) return `${m}分钟前`
  return '刚刚'
}

export default function NotionBoard() {
  const [activeTab, setActiveTab] = useState<StudioTab>("lines")
  const [data, setData] = useState<StudioData | null>(null)
  const [tasks, setTasks] = useState<CreativeTask[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<"" | "music" | "video">("")
  const [execMessage, setExecMessage] = useState("")
  const [musicForm, setMusicForm] = useState({ title: "", tags: "", prompt: "", mv: "chirp-v4" })
  const [videoForm, setVideoForm] = useState({ prompt: "", aspect_ratio: "16:9", seed: "" })
  const [huagongForm, setHuagongForm] = useState({ prompt: "" })
  const [huagongSubmitting, setHuagongSubmitting] = useState(false)
  const { theme } = useTheme()

  const fetchData = async () => {
    setLoading(true)
    try {
      const [studioRes, taskRes] = await Promise.all([
        fetch('/api/content/studio', { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }),
        fetch('/api/content/jiaofangsi/tasks', { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } })
      ])
      const [studioJson, taskJson] = await Promise.all([studioRes.json(), taskRes.json()])
      setData(studioJson)
      setTasks(taskJson.tasks || [])
    } catch (e) {
      console.error('Failed to fetch studio data:', e)
    }
    setLoading(false)
  }

  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/content/jiaofangsi/tasks?refresh=1', { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } })
      const json = await res.json()
      setTasks(json.tasks || [])
    } catch (e) {
      console.error('Failed to refresh tasks:', e)
    }
  }, [])

  const submitTask = async (mode: "music" | "video") => {
    setSubmitting(mode)
    setExecMessage("")
    try {
      const payload = mode === "music" ? musicForm : videoForm
      const res = await fetch('/api/content/jiaofangsi/tasks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mode, payload })
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || '提交失败')
      }

      setExecMessage(mode === "music" ? '歌曲任务已提交给教坊司。' : '视频任务已提交给教坊司。')
      if (mode === "music") {
        setMusicForm(prev => ({ ...prev, title: "", tags: "", prompt: "" }))
      } else {
        setVideoForm(prev => ({ ...prev, prompt: "", seed: "" }))
      }
      await refreshTasks()
    } catch (e) {
      setExecMessage(e instanceof Error ? e.message : '提交失败')
    }
    setSubmitting("")
  }

  const submitHuagong = async () => {
    if (!huagongForm.prompt.trim()) return
    setHuagongSubmitting(true)
    setExecMessage("")
    try {
      const message = `@画宫司 画一张${huagongForm.prompt.trim()}`
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ channel: COURT_CHANNEL, message, botId: 'huagong' })
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || '发送失败')
      }
      setExecMessage('画宫司生图指令已发往朝堂频道，请到朝会查看画宫司回复。')
      setHuagongForm({ prompt: "" })
    } catch (e) {
      setExecMessage(e instanceof Error ? e.message : '发送失败')
    }
    setHuagongSubmitting(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const hasActiveTasks = tasks.some(t =>
    ['queued', 'running', 'submitted'].includes(t.status)
  )

  useEffect(() => {
    if (!hasActiveTasks) return
    const interval = setInterval(refreshTasks, 9000)
    return () => clearInterval(interval)
  }, [hasActiveTasks, refreshTasks])

  const tabs = [
    { key: 'lines', label: '产线状态', icon: '🎭' },
    { key: 'templates', label: '示范任务', icon: '🪄' },
    { key: 'integrations', label: '外接能力', icon: '🔌' }
  ]

  const cardBg = theme === 'light' ? 'bg-white border border-gray-200' : 'bg-[#1a1a2e] border border-[#d4a574]/20'
  const sub = theme === 'light' ? 'text-gray-500' : 'text-[#a3a3a3]'
  const sunoEnabled = !!data?.integrations.find(item => item.id === 'suno')?.enabled
  const seeddanceEnabled = !!data?.integrations.find(item => item.id === 'seeddance')?.enabled

  if (loading) return <div className="text-[#a3a3a3]">加载中...</div>
  if (!data) return <div className="text-[#a3a3a3]">暂无产线数据</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className={`text-lg font-medium ${theme === 'light' ? 'text-gray-800' : 'text-[#d4a574]'}`}>
            🎭 享乐产线
          </h2>
          <div className={`text-sm mt-1 ${sub}`}>{data.summary.headline}</div>
          <div className={`text-xs mt-1 ${sub}`}>{data.summary.subtitle}</div>
        </div>
        <button onClick={fetchData} className="px-3 py-1 text-xs border border-[#d4a574] text-[#d4a574] hover:bg-[#d4a574]/10">
          刷新
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '可直接开工', value: `${data.summary.readyLines}/${data.summary.totalLines}`, icon: '✅' },
          { label: '外接执行能力', value: String(data.summary.enabledExternalIntegrations), icon: '🔌' },
          { label: '娱乐中枢', value: data.lines.find(line => line.id === 'jiaofangsi')?.statusLabel || '待机', icon: '🎵' },
          { label: '连载工坊', value: data.lines.find(line => line.id === 'hanlinyuan')?.statusLabel || '待机', icon: '📚' },
        ].map(item => (
          <div key={item.label} className={`${cardBg} rounded-lg p-3`}>
            <div className={`text-[10px] uppercase ${sub}`}>{item.icon} {item.label}</div>
            <div className="mt-1 text-base font-mono text-[#d4a574]">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-b border-[#d4a574]/30 pb-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as StudioTab)}
            className={`px-4 py-2 text-sm rounded-t transition-all ${
              activeTab === tab.key
                ? 'bg-[#d4a574]/20 text-[#d4a574] border-b-2 border-[#d4a574]'
                : 'text-[#a3a3a3] hover:text-[#e5e5e5]'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'lines' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {data.lines.map(line => (
            <div key={line.id} className={`${cardBg} rounded-lg p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className={`font-medium ${theme === 'light' ? 'text-gray-800' : 'text-[#d4a574]'}`}>{line.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      line.status === 'ready'
                        ? 'bg-green-500/20 text-green-500'
                        : line.status === 'warming'
                          ? 'bg-yellow-500/20 text-yellow-500'
                          : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {line.statusLabel}
                    </span>
                  </div>
                  <div className={`text-xs mt-1 ${sub}`}>{line.lineLabel}</div>
                </div>
                <div className={`text-[10px] text-right ${sub}`}>
                  <div>{relTime(line.updatedAt)}</div>
                  <div className="mt-1 font-mono text-[#d4a574]">{fmt(line.totalTokens)}</div>
                </div>
              </div>

              <p className={`text-sm mt-3 leading-relaxed ${sub}`}>{line.summary}</p>

              <div className="flex flex-wrap gap-2 mt-3">
                {line.capabilities.map(cap => (
                  <span key={cap} className={`text-[10px] px-2 py-1 rounded ${theme === 'light' ? 'bg-amber-50 text-amber-700' : 'bg-[#16213e] text-[#d4a574]'}`}>
                    {cap}
                  </span>
                ))}
              </div>

              <div className="mt-4">
                <div className={`text-[10px] uppercase mb-2 ${sub}`}>推荐指令</div>
                <div className={`rounded-lg p-3 text-xs leading-relaxed font-mono ${theme === 'light' ? 'bg-gray-50 text-gray-700' : 'bg-[#0d0d1a] text-[#d1d5db]'}`}>
                  {line.command}
                </div>
              </div>

              <div className="mt-4">
                <div className={`text-[10px] uppercase mb-2 ${sub}`}>接入情况</div>
                <div className="space-y-2">
                  {line.integrations.map(item => (
                    <div key={item.id} className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs">{item.label}</div>
                        <div className={`text-[10px] mt-0.5 ${sub}`}>{item.note}</div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${item.enabled ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                        {item.enabled ? '已就绪' : '待配置'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`text-[10px] mt-4 ${sub}`}>会话 {line.sessions} 次</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.templates.map(item => (
            <div key={item.id} className={`${cardBg} rounded-lg p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className={`font-medium ${theme === 'light' ? 'text-gray-800' : 'text-[#d4a574]'}`}>{item.title}</h3>
                  <div className={`text-xs mt-1 ${sub}`}>承接机构：{item.owner}</div>
                </div>
              </div>
              <p className={`text-sm mt-3 leading-relaxed ${sub}`}>{item.description}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {item.tags.map(tag => (
                  <span key={tag} className={`text-[10px] px-2 py-1 rounded ${theme === 'light' ? 'bg-gray-100 text-gray-600' : 'bg-[#16213e] text-[#a3a3a3]'}`}>
                    #{tag}
                  </span>
                ))}
              </div>
              <div className={`mt-4 rounded-lg p-3 text-xs leading-relaxed font-mono ${theme === 'light' ? 'bg-gray-50 text-gray-700' : 'bg-[#0d0d1a] text-[#d1d5db]'}`}>
                {item.command}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className={`${cardBg} rounded-lg p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className={`font-medium ${theme === 'light' ? 'text-gray-800' : 'text-[#d4a574]'}`}>🎵 教坊司生歌</h3>
                  <div className={`text-xs mt-1 ${sub}`}>把歌曲 brief 直接提交到 Suno 代理接口</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded ${sunoEnabled ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                  {sunoEnabled ? '已接通' : '待配置'}
                </span>
              </div>
              <div className="space-y-3 mt-4">
                <input
                  value={musicForm.title}
                  onChange={e => setMusicForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="歌名，可选"
                  className={`w-full px-3 py-2 text-sm rounded border ${theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-[#0d0d1a] border-[#d4a574]/20'} focus:outline-none focus:border-[#d4a574]`}
                />
                <input
                  value={musicForm.tags}
                  onChange={e => setMusicForm(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="风格标签，例如：古风, 女声, 轻松"
                  className={`w-full px-3 py-2 text-sm rounded border ${theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-[#0d0d1a] border-[#d4a574]/20'} focus:outline-none focus:border-[#d4a574]`}
                />
                <textarea
                  value={musicForm.prompt}
                  onChange={e => setMusicForm(prev => ({ ...prev, prompt: e.target.value }))}
                  placeholder="歌词或歌曲提示词"
                  rows={5}
                  className={`w-full px-3 py-2 text-sm rounded border resize-y ${theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-[#0d0d1a] border-[#d4a574]/20'} focus:outline-none focus:border-[#d4a574]`}
                />
                <button
                  onClick={() => submitTask('music')}
                  disabled={!sunoEnabled || submitting !== "" || !musicForm.prompt.trim()}
                  className="px-4 py-2 text-sm rounded bg-[#d4a574] text-[#0d0d1a] font-medium disabled:opacity-40 cursor-pointer"
                >
                  {submitting === 'music' ? '提交中...' : '提交生歌任务'}
                </button>
              </div>
            </div>

            <div className={`${cardBg} rounded-lg p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className={`font-medium ${theme === 'light' ? 'text-gray-800' : 'text-[#d4a574]'}`}>🎬 教坊司生视频</h3>
                  <div className={`text-xs mt-1 ${sub}`}>把压缩好的视频 prompt 直接提交到 SeedDance</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded ${seeddanceEnabled ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                  {seeddanceEnabled ? '已接通' : '待配置'}
                </span>
              </div>
              <div className="space-y-3 mt-4">
                <textarea
                  value={videoForm.prompt}
                  onChange={e => setVideoForm(prev => ({ ...prev, prompt: e.target.value }))}
                  placeholder="150 字以内的视频提示词"
                  rows={5}
                  className={`w-full px-3 py-2 text-sm rounded border resize-y ${theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-[#0d0d1a] border-[#d4a574]/20'} focus:outline-none focus:border-[#d4a574]`}
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={videoForm.aspect_ratio}
                    onChange={e => setVideoForm(prev => ({ ...prev, aspect_ratio: e.target.value }))}
                    className={`px-3 py-2 text-sm rounded border ${theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-[#0d0d1a] border-[#d4a574]/20'} focus:outline-none focus:border-[#d4a574]`}
                  >
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                    <option value="1:1">1:1</option>
                  </select>
                  <input
                    value={videoForm.seed}
                    onChange={e => setVideoForm(prev => ({ ...prev, seed: e.target.value }))}
                    placeholder="随机种子，可选"
                    className={`px-3 py-2 text-sm rounded border ${theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-[#0d0d1a] border-[#d4a574]/20'} focus:outline-none focus:border-[#d4a574]`}
                  />
                </div>
                <button
                  onClick={() => submitTask('video')}
                  disabled={!seeddanceEnabled || submitting !== "" || !videoForm.prompt.trim()}
                  className="px-4 py-2 text-sm rounded bg-[#d4a574] text-[#0d0d1a] font-medium disabled:opacity-40 cursor-pointer"
                >
                  {submitting === 'video' ? '提交中...' : '提交生视频任务'}
                </button>
              </div>
            </div>

            <div className={`${cardBg} rounded-lg p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className={`font-medium ${theme === 'light' ? 'text-gray-800' : 'text-[#d4a574]'}`}>🖼️ 画宫司生图</h3>
                  <div className={`text-xs mt-1 ${sub}`}>向朝堂频道发送 @画宫司 的图片生成指令，画宫司会在朝会中回复</div>
                </div>
              </div>
              <div className="space-y-3 mt-4">
                <textarea
                  value={huagongForm.prompt}
                  onChange={e => setHuagongForm(prev => ({ ...prev, prompt: e.target.value }))}
                  placeholder="图片描述，例如：一只橘猫在御花园晒太阳"
                  rows={4}
                  className={`w-full px-3 py-2 text-sm rounded border resize-y ${theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-[#0d0d1a] border-[#d4a574]/20'} focus:outline-none focus:border-[#d4a574]`}
                />
                <button
                  onClick={submitHuagong}
                  disabled={huagongSubmitting || !huagongForm.prompt.trim()}
                  className="px-4 py-2 text-sm rounded bg-[#d4a574] text-[#0d0d1a] font-medium disabled:opacity-40 cursor-pointer"
                >
                  {huagongSubmitting ? '发送中...' : '发往朝堂'}
                </button>
              </div>
            </div>
          </div>

          {execMessage && (
            <div className={`rounded-lg px-3 py-2 text-sm ${theme === 'light' ? 'bg-amber-50 text-amber-700' : 'bg-[#16213e] text-[#d4a574]'}`}>
              {execMessage}
            </div>
          )}

          <div className={`${cardBg} rounded-lg p-4`}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className={`font-medium ${theme === 'light' ? 'text-gray-800' : 'text-[#d4a574]'}`}>最近执行任务</h3>
                <div className={`text-xs mt-1 ${sub}`}>可刷新查看教坊司当前任务状态和成品链接</div>
              </div>
              <button onClick={refreshTasks} className="px-3 py-1 text-xs border border-[#d4a574] text-[#d4a574] hover:bg-[#d4a574]/10">
                刷新任务
              </button>
            </div>
            <div className="space-y-3">
              {tasks.length === 0 ? (
                <div className={`text-sm ${sub}`}>还没有提交过执行任务。</div>
              ) : tasks.map(task => (
                <div key={task.id} className={`rounded-lg p-3 ${theme === 'light' ? 'bg-gray-50' : 'bg-[#0d0d1a]'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{task.mode === 'music' ? '🎵 生歌' : '🎬 生视频'}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          task.status === 'completed'
                            ? 'bg-green-500/20 text-green-500'
                            : task.status === 'failed'
                              ? 'bg-red-500/20 text-red-500'
                              : 'bg-yellow-500/20 text-yellow-500'
                        }`}>
                          {task.status}
                        </span>
                      </div>
                      <div className={`text-xs mt-1 line-clamp-2 ${sub}`}>{task.summary}</div>
                    </div>
                    <div className={`text-[10px] text-right shrink-0 ${sub}`}>
                      <div>{task.provider === 'suno' ? 'Suno' : 'SeedDance'}</div>
                      <div className="mt-1">{new Date(task.updatedAt).toLocaleString('zh-CN')}</div>
                    </div>
                  </div>
                  {task.remoteTaskId && <div className={`text-[10px] mt-2 ${sub}`}>任务号：{task.remoteTaskId}</div>}
                  {task.outputs?.primaryUrl && (
                    <a
                      href={task.outputs.primaryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block mt-2 text-xs text-[#d4a574] hover:underline"
                    >
                      查看成品链接
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.integrations.map(item => (
              <div key={item.id} className={`${cardBg} rounded-lg p-4`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className={`font-medium ${theme === 'light' ? 'text-gray-800' : 'text-[#d4a574]'}`}>{item.label}</h3>
                    <div className={`text-xs mt-1 ${sub}`}>作用范围：{item.scope}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${item.enabled ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                    {item.enabled ? '已启用' : '待接入'}
                  </span>
                </div>
                <p className={`text-sm mt-3 ${sub}`}>{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

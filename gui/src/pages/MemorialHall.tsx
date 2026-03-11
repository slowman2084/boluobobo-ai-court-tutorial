import { useEffect, useState } from "react"
import { useTheme } from "../theme"

interface PendingItem {
  id: string
  type: "integration" | "creative"
  title: string
  description: string
  priority: "high" | "normal" | "low"
  owner: string
  suggestedAction: string
}

interface ProcessedItem {
  id: string
  type: "integration" | "creative"
  title: string
  description: string
  priority: "high" | "normal" | "low"
  owner: string
  action: "approved" | "rejected" | "ignored"
  processedAt: string
}

const AUTH_TOKEN = localStorage.getItem('boluo_auth_token') || ''

export default function MemorialHall() {
  const [pending, setPending] = useState<PendingItem[]>([])
  const [processed, setProcessed] = useState<ProcessedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'pending' | 'processed'>('pending')
  const { theme } = useTheme()

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/approvals', { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } })
      const data = await res.json()
      setPending(data.pending || [])
      setProcessed(data.processed || [])
    } catch (e) {
      console.error('Failed to fetch approval data:', e)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAction = (item: PendingItem, action: 'approved' | 'rejected' | 'ignored') => {
    setPending(prev => prev.filter(p => p.id !== item.id))
    setProcessed(prev => [{
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      priority: item.priority,
      owner: item.owner,
      action,
      processedAt: new Date().toISOString()
    }, ...prev])
  }

  const getTypeIcon = (type: string) => {
    if (type === 'integration') return '🔌'
    return '🎭'
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-500 bg-red-500/10'
      case 'normal': return 'text-yellow-500 bg-yellow-500/10'
      case 'low': return 'text-green-500 bg-green-500/10'
      default: return 'text-gray-500 bg-gray-500/10'
    }
  }

  const getActionColor = (action: string) => {
    if (action === 'approved') return 'text-green-500'
    if (action === 'rejected') return 'text-red-500'
    return 'text-gray-500'
  }

  const formatTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(mins / 60)
    if (hours > 0) return `${hours}小时前`
    if (mins > 0) return `${mins}分钟前`
    return '刚刚'
  }

  if (loading) return <div className="text-[#a3a3a3]">加载中...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-medium ${theme === 'light' ? 'text-gray-800' : 'text-[#d4a574]'}`}>
            🏮 待批事项
          </h2>
          <div className={`text-sm mt-1 ${theme === 'light' ? 'text-gray-500' : 'text-[#a3a3a3]'}`}>
            这里集中展示娱乐与内容产线里真正需要主上拍板的事。
          </div>
        </div>
        <button onClick={fetchData} className="px-3 py-1 text-xs border border-[#d4a574] text-[#d4a574] hover:bg-[#d4a574]/10">
          刷新
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '待你拍板', value: pending.length, icon: '🪪' },
          { label: '已处理', value: processed.length, icon: '✅' },
          { label: '接口接入项', value: pending.filter(item => item.type === 'integration').length, icon: '🔌' },
          { label: '创作拍板项', value: pending.filter(item => item.type === 'creative').length, icon: '🎭' },
        ].map(item => (
          <div
            key={item.label}
            className={`rounded-lg p-3 ${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-[#1a1a2e] border border-[#d4a574]/20'}`}
          >
            <div className={`text-[10px] uppercase ${theme === 'light' ? 'text-gray-500' : 'text-[#a3a3a3]'}`}>{item.icon} {item.label}</div>
            <div className="mt-1 text-xl font-mono text-[#d4a574]">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-b border-[#d4a574]/30 pb-2">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 text-sm rounded-t transition-all ${
            activeTab === 'pending'
              ? 'bg-[#d4a574]/20 text-[#d4a574] border-b-2 border-[#d4a574]'
              : 'text-[#a3a3a3] hover:text-[#e5e5e5]'
          }`}
        >
          ⏳ 待拍板 ({pending.length})
        </button>
        <button
          onClick={() => setActiveTab('processed')}
          className={`px-4 py-2 text-sm rounded-t transition-all ${
            activeTab === 'processed'
              ? 'bg-[#d4a574]/20 text-[#d4a574] border-b-2 border-[#d4a574]'
              : 'text-[#a3a3a3] hover:text-[#e5e5e5]'
          }`}
        >
          ✅ 已处理 ({processed.length})
        </button>
      </div>

      {activeTab === 'pending' && (
        <div className="space-y-4">
          {pending.length === 0 ? (
            <div className={`text-center py-12 ${theme === 'light' ? 'text-gray-500' : 'text-[#a3a3a3]'}`}>
              <div className="text-4xl mb-4">😌</div>
              <div className="text-lg">当前没有必须你出面的事项</div>
              <div className="text-sm mt-2">群臣自己还能继续转一会儿</div>
            </div>
          ) : (
            pending.map(item => (
              <div
                key={item.id}
                className={`p-4 rounded-lg border ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-[#1a1a2e] border-[#d4a574]/20'}`}
              >
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getTypeIcon(item.type)}</span>
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${getPriorityColor(item.priority)}`}>
                          {item.priority === 'high' ? '紧急' : item.priority === 'normal' ? '普通' : '低优先级'}
                        </span>
                        <span className={`text-xs ${theme === 'light' ? 'text-gray-500' : 'text-[#a3a3a3]'}`}>承接：{item.owner}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`text-sm mb-3 ${theme === 'light' ? 'text-gray-600' : 'text-[#a3a3a3]'}`}>
                  {item.description}
                </div>

                <div className={`rounded-lg p-3 text-xs leading-relaxed font-mono mb-4 ${theme === 'light' ? 'bg-gray-50 text-gray-700' : 'bg-[#0d0d1a] text-[#d1d5db]'}`}>
                  {item.suggestedAction}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => handleAction(item, 'approved')} className="px-4 py-1.5 text-sm bg-green-500/20 text-green-500 rounded hover:bg-green-500/30">
                    ✅ 批准
                  </button>
                  <button onClick={() => handleAction(item, 'rejected')} className="px-4 py-1.5 text-sm bg-red-500/20 text-red-500 rounded hover:bg-red-500/30">
                    ❌ 拒绝
                  </button>
                  <button onClick={() => handleAction(item, 'ignored')} className="px-4 py-1.5 text-sm bg-gray-500/20 text-gray-500 rounded hover:bg-gray-500/30">
                    👄 先搁着
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'processed' && (
        <div className="space-y-3">
          {processed.length === 0 ? (
            <div className={`text-center py-12 ${theme === 'light' ? 'text-gray-500' : 'text-[#a3a3a3]'}`}>
              暂无处理记录
            </div>
          ) : (
            processed.map(item => (
              <div
                key={item.id}
                className={`p-3 rounded-lg border opacity-70 ${theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-[#0d0d1a] border-[#d4a574]/10'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span>{getTypeIcon(item.type)}</span>
                    <div className="min-w-0">
                      <div className="text-sm truncate">{item.title}</div>
                      <div className={`text-[10px] ${theme === 'light' ? 'text-gray-500' : 'text-[#a3a3a3]'}`}>{item.owner}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm ${getActionColor(item.action)}`}>
                      {item.action === 'approved' ? '✅ 已批准' : item.action === 'rejected' ? '❌ 已拒绝' : '👄 已搁置'}
                    </span>
                    <span className="text-xs text-[#a3a3a3]">{formatTime(item.processedAt)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

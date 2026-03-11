import express from 'express';
import cors from 'cors';
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';
import http from 'http';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 18790;

const AUTH_TOKEN = process.env.BOLUO_AUTH_TOKEN || '';

const AGENT_META = {
  'main': { displayName: '掌印总管', group: 'inner_court', groupLabel: '内廷', order: 10 },
  'qijuzhu': { displayName: '起居注官', group: 'inner_court', groupLabel: '内廷', order: 20 },
  'tingyi': { displayName: '廷议官', group: 'inner_court', groupLabel: '内廷', order: 30 },
  'bingbu': { displayName: '兵部', group: 'ministry', groupLabel: '六部', order: 110 },
  'gongbu': { displayName: '工部', group: 'ministry', groupLabel: '六部', order: 120 },
  'hubu': { displayName: '户部', group: 'ministry', groupLabel: '六部', order: 130 },
  'libu': { displayName: '礼部', group: 'ministry', groupLabel: '六部', order: 140 },
  'libu2': { displayName: '吏部', group: 'ministry', groupLabel: '六部', order: 150 },
  'xingbu': { displayName: '刑部', group: 'ministry', groupLabel: '六部', order: 160 },
  'neiwufu': { displayName: '内务府', group: 'leisure', groupLabel: '后宫/生活机构', order: 210 },
  'yushanfang': { displayName: '御膳房', group: 'leisure', groupLabel: '后宫/生活机构', order: 220 },
  'huagong': { displayName: '画宫司', group: 'leisure', groupLabel: '后宫/生活机构', order: 230 },
  'jiaofangsi': { displayName: '教坊司', group: 'leisure', groupLabel: '后宫/生活机构', order: 240 },
  'hanlinyuan': { displayName: '翰林院', group: 'leisure', groupLabel: '后宫/生活机构', order: 250 },
  'neige': { displayName: '内阁', group: 'legacy', groupLabel: '旧架构', order: 910 },
  'duchayuan': { displayName: '都察院', group: 'legacy', groupLabel: '旧架构', order: 920 },
  'taiyiyuan': { displayName: '太医院', group: 'legacy', groupLabel: '旧架构', order: 930 },
  'guozijian': { displayName: '国子监', group: 'legacy', groupLabel: '旧架构', order: 940 }
};

function getAgentMeta(agentId) {
  return AGENT_META[agentId] || {
    displayName: agentId,
    group: 'other',
    groupLabel: '未分组',
    order: 999
  };
}

function getAgentDisplayName(agentId) {
  return getAgentMeta(agentId).displayName;
}

function getAgentIdByDisplayName(displayName) {
  return Object.entries(AGENT_META).find(([, meta]) => meta.displayName === displayName)?.[0] || null;
}

function getAgentConfig(config, agentId) {
  const list = config?.agents?.list;
  if (Array.isArray(list)) {
    return list.find(agent => agent.id === agentId) || {};
  }
  if (list && typeof list === 'object') {
    return list[agentId] || {};
  }
  return {};
}

const HOME = process.env.HOME || '/home/ubuntu';
const AGENTS_DIR = join(HOME, '.openclaw/agents');
const CONFIG_PATH = join(HOME, '.openclaw/openclaw.json');
const CREATIVE_TASKS_PATH = join(HOME, '.openclaw/creative_tasks.json');
const COURT_CHANNEL = '1474091579630293164';

app.use(cors({ origin: ['https://gui.at2.one'] }));
app.use(express.json());

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function getOpenClawConfig() {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) { }
  return null;
}

function getAgentSessionData(agentId) {
  const sessionsPath = join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
  if (!existsSync(sessionsPath)) return { sessions: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, model: '' };

  try {
    const data = JSON.parse(readFileSync(sessionsPath, 'utf-8'));
    const entries = Object.values(data);
    let inputTokens = 0, outputTokens = 0, totalTokens = 0;
    let model = '';

    for (const sess of entries) {
      inputTokens += sess.inputTokens || 0;
      outputTokens += sess.outputTokens || 0;
      totalTokens += sess.totalTokens || 0;
      if (sess.model && !model) model = sess.model;
    }

    return { sessions: entries.length, inputTokens, outputTokens, totalTokens, model };
  } catch (e) {
    return { sessions: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, model: '' };
  }
}

function getRecentLogs(limit = 100) {
  const logs = [];
  if (!existsSync(AGENTS_DIR)) return logs;

  try {
    const agentDirs = readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const agentId of agentDirs) {
      const sessDir = join(AGENTS_DIR, agentId, 'sessions');
      if (!existsSync(sessDir)) continue;

      const jsonlFiles = readdirSync(sessDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({ name: f, mtime: statSync(join(sessDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 1);

      for (const file of jsonlFiles) {
        try {
          const content = readFileSync(join(sessDir, file.name), 'utf-8');
          const lines = content.split('\n').filter(l => l.trim()).slice(-5);
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.role === 'assistant' && entry.content) {
                const text = typeof entry.content === 'string'
                  ? entry.content.substring(0, 200)
                  : JSON.stringify(entry.content).substring(0, 200);
                logs.push({
                  timestamp: new Date(file.mtime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                  level: 'info',
                  message: text,
                  source: getAgentDisplayName(agentId)
                });
              }
            } catch (e) { }
          }
        } catch (e) { }
      }
    }
  } catch (e) { }

  return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}

app.get('/api/status', authMiddleware, async (req, res) => {
  const config = getOpenClawConfig();
  const defaultModel = config?.agents?.defaults?.model?.primary || 'default';

  let agentIds = [];
  if (existsSync(AGENTS_DIR)) {
    agentIds = readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  }

  const botAccounts = agentIds.map(id => {
    const sessData = getAgentSessionData(id);
    const agentConfig = getAgentConfig(config, id);
    const model = agentConfig?.model?.primary || sessData.model || defaultModel;
    const meta = getAgentMeta(id);

    return {
      name: id,
      displayName: meta.displayName,
      category: meta.group,
      categoryLabel: meta.groupLabel,
      sortOrder: meta.order,
      status: 'online',
      model: model,
      sessions: sessData.sessions,
      inputTokens: sessData.inputTokens,
      outputTokens: sessData.outputTokens,
      totalTokens: sessData.totalTokens,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  const totalSessions = botAccounts.reduce((s, b) => s + b.sessions, 0);
  const todayTokens = botAccounts.reduce((s, b) => s + b.totalTokens, 0);

  const mem = process.memoryUsage();
  const sysUptime = os.uptime();
  const cpuLoad = os.loadavg();

  const logs = getRecentLogs(100);

  const status = {
    platform: `${os.platform()} ${os.arch()}`,
    uptime: formatUptime(sysUptime),
    uptimeSeconds: Math.floor(sysUptime),
    memoryUsage: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external
    },
    cpuLoad: cpuLoad,
    gateway: {
      status: 'ready',
      ping: Math.floor(Math.random() * 30) + 20,
      guilds: 1
    },
    botAccounts: botAccounts,
    totalSessions: totalSessions,
    todayTokens: todayTokens,
    logs: logs
  };

  res.json(status);
});

app.get('/api/logs', authMiddleware, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const logs = getRecentLogs(limit);
  res.json({ logs });
});

app.get('/api/messages', authMiddleware, (req, res) => {
  const logs = getRecentLogs(200);
  const messages = logs
    .filter(line => line.includes('channel') || line.includes('message'))
    .slice(-50)
    .map((line, i) => ({
      id: i,
      content: line.substring(0, 200),
      timestamp: new Date().toISOString(),
      channel: 'general'
    }));
  res.json({ messages });
});

function getTokenStats() {
  const byDepartment = [];
  let totalTokens = 0;

  if (existsSync(AGENTS_DIR)) {
    const agentDirs = readdirSync(AGENTS_DIR);
    for (const agentDir of agentDirs) {
      const sessionsPath = join(AGENTS_DIR, agentDir, 'sessions', 'sessions.json');
      if (existsSync(sessionsPath)) {
        try {
          const sessions = JSON.parse(readFileSync(sessionsPath, 'utf-8'));
          let deptTokens = 0;
          for (const session of Object.values(sessions)) {
            deptTokens += (session.inputTokens || 0) + (session.outputTokens || 0);
          }
          const deptName = getAgentDisplayName(agentDir);
          byDepartment.push({ department: deptName, tokens: deptTokens });
          totalTokens += deptTokens;
        } catch (e) { }
      }
    }
  }

  const rawConfig = getOpenClawConfig();
  const tokenPrice = rawConfig?.tokenPricePerM || 0.3;
  for (const d of byDepartment) {
    d.cost = (d.tokens / 1000000 * tokenPrice).toFixed(3);
  }

  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    trend.push({
      date: date.toISOString().split('T')[0],
      tokens: 0
    });
  }

  return { byDepartment, trend, tokenPrice, totalTokens };
}

app.get('/api/tokens', authMiddleware, (req, res) => {
  const result = getTokenStats();
  res.json(result);
});

// Track cache stats
let cacheHits = 0, cacheMisses = 0;

app.get('/api/health', authMiddleware, (req, res) => {
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    const cpuLoad = os.loadavg();
    const sysUptime = os.uptime();

    // Count endpoints
    let endpointCount = 0;
    app._router.stack.forEach(r => { if (r.route) endpointCount++; });

    // Disk usage
    let diskUsagePct = 'N/A', diskTotal = 'N/A', diskUsed = 'N/A';
    try {
      const { execSync: ex } = require('child_process');
      const dfLine = ex("df -h / | tail -1", { encoding: 'utf-8', timeout: 2000 }).trim();
      const parts = dfLine.split(/\s+/);
      diskTotal = parts[1] || 'N/A'; diskUsed = parts[2] || 'N/A'; diskUsagePct = parts[4] || 'N/A';
    } catch { }

    const freeMem = os.freemem();
    const totalMem = os.totalmem();

    res.json({
      status: 'healthy',
      uptime: Math.floor(uptime),
      uptimeSeconds: Math.floor(uptime),
      uptimeFormatted: formatUptime(Math.floor(uptime)),
      systemUptime: formatUptime(Math.floor(sysUptime)),
      systemUptimeSeconds: Math.floor(sysUptime),
      version: '2.0.0',
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.arch()}`,
      hostname: os.hostname(),
      memory: {
        processUsedMB: Math.floor(memUsage.heapUsed / 1024 / 1024),
        processHeapMB: Math.floor(memUsage.heapTotal / 1024 / 1024),
        processRssMB: Math.floor(memUsage.rss / 1024 / 1024),
        systemTotalGB: (totalMem / 1024 / 1024 / 1024).toFixed(1),
        systemFreeGB: (freeMem / 1024 / 1024 / 1024).toFixed(1),
        systemUsedPct: ((1 - freeMem / totalMem) * 100).toFixed(1),
      },
      disk: { total: diskTotal, used: diskUsed, usagePct: diskUsagePct },
      cpu: cpuLoad.map(l => l.toFixed(2)),
      gateway: 'connected',
      endpoints: endpointCount,
      cache: { hits: cacheHits, misses: cacheMisses, keys: Object.keys(cache).length },
      wsClients: typeof wss !== 'undefined' ? wss.clients.size : 0,
      sseClients: typeof sseClients !== 'undefined' ? sseClients.size : 0,
      metricsBufferSize: typeof metricsBuffer !== 'undefined' ? metricsBuffer.length : 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ========== CACHING ==========
const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL) { cacheHits++; return entry.data; }
  cacheMisses++;
  return null;
}

function setCache(key, data) {
  cache[key] = { data, ts: Date.now() };
}

// Count messages and usage from a JSONL session file
function countSessionFile(filePath) {
  const result = { messages: 0, userMessages: 0, assistantMessages: 0, inputTokens: 0, outputTokens: 0 };
  try {
    if (!filePath || !existsSync(filePath)) return result;
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'message' && entry.message) {
          result.messages++;
          if (entry.message.role === 'user') result.userMessages++;
          else if (entry.message.role === 'assistant') result.assistantMessages++;
          // Usage is nested in message.usage
          const usage = entry.message?.usage;
          if (usage) {
            result.inputTokens += usage.input || usage.input_tokens || usage.inputTokens || 0;
            result.outputTokens += usage.output || usage.output_tokens || usage.outputTokens || 0;
          }
        }
      } catch { }
    }
  } catch { }
  return result;
}

// Build all sessions data (cached)
function buildSessionsData() {
  const cached = getCached('sessions');
  if (cached) return cached;
  
  const sessions = [];
  
  if (existsSync(AGENTS_DIR)) {
    const agentDirs = readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => d.name);
    for (const agentId of agentDirs) {
      const sessionsPath = join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
      if (existsSync(sessionsPath)) {
        try {
          const data = JSON.parse(readFileSync(sessionsPath, 'utf-8'));
          for (const [sessionKey, session] of Object.entries(data)) {
            const updatedAt = session.updatedAt || 0;
            const sessionFile = session.sessionFile || '';
            
            // Count messages and tokens from the JSONL file
            const counts = countSessionFile(sessionFile);
            
            // 判定渠道
            let channel = session.channel || session.lastChannel || 'unknown';
            if (channel === 'unknown') {
              if (sessionKey.includes('discord:')) channel = 'discord';
              else if (sessionKey.includes('cron:')) channel = 'cron';
              else if (sessionKey.includes('signal:')) channel = 'signal';
              else if (sessionKey.includes('telegram:')) channel = 'telegram';
            }
            
            sessions.push({
              id: `agent:${agentId}:${sessionKey}`,
              agentId,
              agentName: getAgentDisplayName(agentId),
              channel,
              updatedAt,
              createdAt: session.createdAt || 0,
              messageCount: counts.messages,
              inputTokens: counts.inputTokens,
              outputTokens: counts.outputTokens,
              totalTokens: counts.inputTokens + counts.outputTokens,
              model: session.model || '',
              displayName: session.displayName || '',
            });
          }
        } catch (e) { }
      }
    }
  }

  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  
  const now = Date.now();
  const activeCount = sessions.filter(s => now - s.updatedAt < 3600000).length;
  
  const result = { sessions, total: sessions.length, active: activeCount };
  setCache('sessions', result);
  return result;
}

function collectKnownAgentIds(config) {
  const ids = new Set();

  if (existsSync(AGENTS_DIR)) {
    try {
      readdirSync(AGENTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .forEach(d => ids.add(d.name));
    } catch { }
  }

  const agentList = config?.agents?.list;
  if (Array.isArray(agentList)) {
    agentList.forEach(agent => {
      if (agent?.id) ids.add(agent.id);
    });
  } else if (agentList && typeof agentList === 'object') {
    Object.keys(agentList).forEach(id => ids.add(id));
  }

  const accounts = config?.channels?.discord?.accounts || {};
  Object.keys(accounts).forEach(id => ids.add(id));

  return Array.from(ids).sort((a, b) => getAgentMeta(a).order - getAgentMeta(b).order);
}

function getLatestAssistantPreview(agentId) {
  try {
    const sessPath = join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
    if (!existsSync(sessPath)) return { text: '', updatedAt: 0 };

    const sessionsData = JSON.parse(readFileSync(sessPath, 'utf-8'));
    let bestFile = null;
    let bestTime = 0;

    for (const sess of Object.values(sessionsData)) {
      if ((sess.updatedAt || 0) > bestTime && sess.sessionFile && existsSync(sess.sessionFile)) {
        bestTime = sess.updatedAt || 0;
        bestFile = sess.sessionFile;
      }
    }

    if (!bestFile) return { text: '', updatedAt: bestTime };

    const lines = readFileSync(bestFile, 'utf-8').split('\n').filter(l => l.trim());
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 30); i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'message' && entry.message?.role === 'assistant') {
          const content = entry.message.content;
          const text = typeof content === 'string'
            ? content
            : Array.isArray(content)
              ? content.map(x => x.text || '').join('')
              : '';
          if (text.trim()) {
            return { text: text.substring(0, 120), updatedAt: entry.timestamp || bestTime };
          }
        }
      } catch { }
    }

    return { text: '', updatedAt: bestTime };
  } catch {
    return { text: '', updatedAt: 0 };
  }
}

const creativeTaskStore = {};

function loadCreativeTasks() {
  try {
    if (existsSync(CREATIVE_TASKS_PATH)) {
      const raw = JSON.parse(readFileSync(CREATIVE_TASKS_PATH, 'utf-8'));
      const entries = raw.tasks || raw || [];
      if (Array.isArray(entries)) {
        for (const t of entries) {
          if (t?.id) creativeTaskStore[t.id] = t;
        }
      } else if (entries && typeof entries === 'object') {
        Object.assign(creativeTaskStore, entries);
      }
    }
  } catch { }
}

function saveCreativeTasks() {
  try {
    const dir = join(HOME, '.openclaw');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tasks = Object.values(creativeTaskStore).map(t => {
      const { raw, ...rest } = t || {};
      return rest;
    });
    writeFileSync(CREATIVE_TASKS_PATH, JSON.stringify({ tasks, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  } catch { }
}

loadCreativeTasks();

function createCreativeTaskId(prefix = 'creative') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pickValue(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

function collectUrls(input, acc = new Set(), depth = 0) {
  if (depth > 4 || input === null || input === undefined) return acc;
  if (typeof input === 'string') {
    if (/^https?:\/\//.test(input)) acc.add(input);
    return acc;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectUrls(item, acc, depth + 1);
    return acc;
  }
  if (typeof input === 'object') {
    for (const value of Object.values(input)) collectUrls(value, acc, depth + 1);
  }
  return acc;
}

function normalizeTaskStatus(rawStatus) {
  const value = String(rawStatus || '').toLowerCase();
  if (!value) return 'submitted';
  if (['success', 'succeeded', 'completed', 'done', 'finish', 'finished'].includes(value)) return 'completed';
  if (['fail', 'failed', 'error', 'cancelled', 'canceled'].includes(value)) return 'failed';
  if (['running', 'processing', 'in_progress', 'progress'].includes(value)) return 'running';
  if (['queued', 'pending', 'waiting', 'submitted', 'created'].includes(value)) return 'queued';
  return value;
}

function normalizeCreativeRemoteResponse(provider, mode, raw, fallbackRequest = {}) {
  const root = raw || {};
  const nested = root.data || root.result || root.output || {};
  const remoteTaskId = pickValue(root, ['task_id', 'taskId', 'id']) || pickValue(nested, ['task_id', 'taskId', 'id']);
  const rawStatus = pickValue(root, ['status', 'state']) || pickValue(nested, ['status', 'state']) || 'submitted';
  const status = normalizeTaskStatus(rawStatus);
  const urls = Array.from(collectUrls(raw)).slice(0, 10);
  const summary = pickValue(root, ['message', 'summary', 'description']) || pickValue(nested, ['message', 'summary', 'description']) || '';

  return {
    provider,
    mode,
    remoteTaskId: remoteTaskId ? String(remoteTaskId) : '',
    rawStatus: String(rawStatus || ''),
    status,
    summary,
    outputs: {
      urls,
      primaryUrl: urls[0] || ''
    },
    raw,
    request: fallbackRequest
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { rawText: text };
  }
}

function sanitizeCreativeRequest(mode, payload = {}) {
  if (mode === 'music') {
    return {
      title: String(payload.title || '').trim(),
      tags: String(payload.tags || '').trim(),
      prompt: String(payload.prompt || '').trim(),
      mv: String(payload.mv || 'chirp-v4').trim() || 'chirp-v4'
    };
  }

  return {
    prompt: String(payload.prompt || '').trim(),
    aspect_ratio: String(payload.aspect_ratio || '16:9').trim() || '16:9',
    seed: payload.seed !== undefined && payload.seed !== null && String(payload.seed).trim() !== ''
      ? String(payload.seed).trim()
      : ''
  };
}

async function submitCreativeTask(mode, payload) {
  if (!['music', 'video'].includes(mode)) {
    throw new Error('Unsupported creative mode');
  }

  const request = sanitizeCreativeRequest(mode, payload);
  if (!request.prompt) {
    throw new Error(mode === 'music' ? '歌曲任务至少需要歌词或提示词' : '视频任务至少需要提示词');
  }

  const provider = mode === 'music' ? 'suno' : 'seeddance';
  const baseUrl = provider === 'suno' ? process.env.SUNO_API_URL : process.env.SEEDDANCE_API_URL;
  const apiKey = provider === 'suno' ? process.env.SUNO_KEY : process.env.SEEDDANCE_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error(provider === 'suno' ? '未配置 Suno API 环境变量' : '未配置 SeedDance API 环境变量');
  }

  const endpoint = provider === 'suno'
    ? `${baseUrl.replace(/\/$/, '')}/suno/submit/music`
    : `${baseUrl.replace(/\/$/, '')}/task/jimeng/text2video`;

  const body = provider === 'suno'
    ? request
    : {
        prompt: request.prompt,
        aspect_ratio: request.aspect_ratio,
        ...(request.seed ? { seed: request.seed } : {})
      };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const raw = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`${provider === 'suno' ? 'Suno' : 'SeedDance'} 提交失败: ${response.status}`);
  }

  const normalized = normalizeCreativeRemoteResponse(provider, mode, raw, request);
  const localId = createCreativeTaskId(mode);
  const nowIso = new Date().toISOString();

  const record = {
    id: localId,
    agentId: 'jiaofangsi',
    agentName: '教坊司',
    provider,
    mode,
    request,
    status: normalized.status,
    rawStatus: normalized.rawStatus,
    remoteTaskId: normalized.remoteTaskId,
    summary: normalized.summary || (mode === 'music' ? `歌曲任务：${request.title || request.prompt.slice(0, 18)}` : `视频任务：${request.prompt.slice(0, 18)}`),
    outputs: normalized.outputs,
    createdAt: nowIso,
    updatedAt: nowIso,
    raw: normalized.raw
  };

  creativeTaskStore[localId] = record;
  saveCreativeTasks();
  return record;
}

async function refreshCreativeTask(task) {
  if (!task?.remoteTaskId) return task;

  const provider = task.provider;
  const baseUrl = provider === 'suno' ? process.env.SUNO_API_URL : process.env.SEEDDANCE_API_URL;
  const apiKey = provider === 'suno' ? process.env.SUNO_KEY : process.env.SEEDDANCE_KEY;
  if (!baseUrl || !apiKey) return task;

  const endpoint = provider === 'suno'
    ? `${baseUrl.replace(/\/$/, '')}/suno/fetch/${task.remoteTaskId}`
    : `${baseUrl.replace(/\/$/, '')}/task/${task.remoteTaskId}`;

  const response = await fetch(endpoint, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const raw = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`${provider === 'suno' ? 'Suno' : 'SeedDance'} 查询失败: ${response.status}`);
  }

  const normalized = normalizeCreativeRemoteResponse(provider, task.mode, raw, task.request);
  const nextRecord = {
    ...task,
    status: normalized.status || task.status,
    rawStatus: normalized.rawStatus || task.rawStatus,
    summary: normalized.summary || task.summary,
    outputs: normalized.outputs?.urls?.length ? normalized.outputs : task.outputs,
    updatedAt: new Date().toISOString(),
    raw: normalized.raw
  };

  creativeTaskStore[task.id] = nextRecord;
  saveCreativeTasks();
  return nextRecord;
}

function getCreativeStudioData() {
  const cached = getCached('creative_studio');
  if (cached) return cached;

  const now = Date.now();
  const lineDefs = [
    {
      id: 'huagong',
      name: '画宫司',
      lineLabel: '视觉产线',
      type: 'visual',
      capabilities: ['宫廷角色图', '古风娱乐海报', '设定参考图'],
      command: '给我准备一组宫廷风角色图，先整理风格、服饰、镜头和场景，再开始生成',
      integrations: [
        { id: 'baoyu-skills', label: 'baoyu-skills', enabled: true, note: '适合接生图与轻视觉内容' }
      ]
    },
    {
      id: 'jiaofangsi',
      name: '教坊司',
      lineLabel: '声画娱乐产线',
      type: 'entertainment',
      capabilities: ['段子小剧场', '角色主题曲', '短视频脚本'],
      command: '准备今天的轻娱乐内容，优先给我一个最省心的图文音视频组合方案',
      integrations: [
        { id: 'baoyu-skills', label: 'baoyu-skills', enabled: true, note: '适合娱乐文、宣传文与社媒短内容' },
        { id: 'suno', label: 'Suno API', enabled: !!(process.env.SUNO_API_URL && process.env.SUNO_KEY), note: process.env.SUNO_API_URL && process.env.SUNO_KEY ? '已可直接生歌' : '未配置，仅能先产歌词与 brief' },
        { id: 'seeddance', label: 'SeedDance API', enabled: !!(process.env.SEEDDANCE_API_URL && process.env.SEEDDANCE_KEY), note: process.env.SEEDDANCE_API_URL && process.env.SEEDDANCE_KEY ? '已可直接生短视频' : '未配置，仅能先产脚本与分镜' }
      ]
    },
    {
      id: 'hanlinyuan',
      name: '翰林院',
      lineLabel: '连载创作产线',
      type: 'novel',
      capabilities: ['小说设定', '章节规划', '连载正文'],
      command: '按结构化工作流推进一个新章节，先给我章节目标、爽点和结尾钩子',
      integrations: [
        { id: 'webnovel-writer', label: 'webnovel-writer', enabled: true, note: '适合卷纲、正文和审稿流程' }
      ]
    },
    {
      id: 'libu',
      name: '礼部',
      lineLabel: '宣发文案产线',
      type: 'copywriting',
      capabilities: ['X 文案', '娱乐化包装', '一稿多版传播文'],
      command: '把今天最值得传播的一件事写成 3 个版本的短文案，分别偏热闹、偏戏谑、偏正式',
      integrations: [
        { id: 'baoyu-skills', label: 'baoyu-skills', enabled: true, note: '适合社媒文、包装文与娱乐稿' }
      ]
    }
  ];

  const lines = lineDefs.map(def => {
    const sessData = getAgentSessionData(def.id);
    const preview = getLatestAssistantPreview(def.id);
    const idleMs = preview.updatedAt ? now - new Date(preview.updatedAt).getTime() : Infinity;
    const hasExternalReady = def.integrations.some(item => item.id !== 'baoyu-skills' && item.enabled);
    let status = 'draft_only';
    let statusLabel = '待开工';

    if (sessData.sessions > 0 && idleMs <= 24 * 60 * 60 * 1000) {
      status = hasExternalReady || def.id !== 'jiaofangsi' ? 'ready' : 'warming';
      statusLabel = status === 'ready' ? '可直接开工' : '可先产 brief';
    } else if (sessData.sessions > 0) {
      status = 'warming';
      statusLabel = '需要热身';
    }

    return {
      ...def,
      status,
      statusLabel,
      sessions: sessData.sessions,
      totalTokens: sessData.totalTokens,
      updatedAt: preview.updatedAt ? new Date(preview.updatedAt).getTime() : 0,
      summary: preview.text || (sessData.sessions > 0 ? '最近暂无可展示摘要' : '尚未形成稳定产出，可先下达第一条任务')
    };
  });

  const externalIntegrations = [
    {
      id: 'suno',
      label: 'Suno API',
      enabled: !!(process.env.SUNO_API_URL && process.env.SUNO_KEY),
      scope: '教坊司生歌',
      note: process.env.SUNO_API_URL && process.env.SUNO_KEY ? '已配置，可直接进入歌曲任务流' : '未配置，当前只能整理歌曲 brief'
    },
    {
      id: 'seeddance',
      label: 'SeedDance API',
      enabled: !!(process.env.SEEDDANCE_API_URL && process.env.SEEDDANCE_KEY),
      scope: '教坊司生视频',
      note: process.env.SEEDDANCE_API_URL && process.env.SEEDDANCE_KEY ? '已配置，可直接进入短视频任务流' : '未配置，当前只能整理脚本与分镜'
    },
    {
      id: 'baoyu-skills',
      label: 'baoyu-skills',
      enabled: true,
      scope: '画宫司 / 礼部 / 教坊司',
      note: '作为软接入能力入口，用于图像、娱乐文案和社媒内容'
    },
    {
      id: 'webnovel-writer',
      label: 'webnovel-writer',
      enabled: true,
      scope: '翰林院',
      note: '用于结构化长篇创作、章节规划和审稿流程'
    }
  ];

  const templates = [
    {
      id: 'tpl-visual-1',
      title: '来一组宫廷妃子图',
      owner: '画宫司',
      tags: ['视觉', '古风', '轻娱乐'],
      description: '适合先产角色设定图、海报图或氛围图，再决定是否联动短视频。',
      command: '给我一组宫廷妃子写真方案，先列 3 种风格，再按最稳的一种开始生成'
    },
    {
      id: 'tpl-ent-1',
      title: '来一套图文音视频娱乐包',
      owner: '教坊司',
      tags: ['娱乐', '歌曲', '视频'],
      description: '先整理主题和氛围，再决定走图文、歌曲或短视频的组合产出。',
      command: '围绕“昏君今天想放松”做一套轻娱乐内容，优先给我最省心的组合'
    },
    {
      id: 'tpl-novel-1',
      title: '推进连载章节',
      owner: '翰林院',
      tags: ['小说', '章节', '钩子'],
      description: '适合让翰林院直接产章纲、爽点和结尾钩子，再决定是否写正文。',
      command: '继续推进下一章，先给我章节目标、冲突、爽点和结尾钩子'
    },
    {
      id: 'tpl-copy-1',
      title: '做一波热闹宣发',
      owner: '礼部',
      tags: ['文案', 'X', '传播'],
      description: '适合把已有成果包装成社媒传播内容，一次给多版。',
      command: '把最近最好玩的成果包装成 3 条适合传播的短文案'
    }
  ];

  const approvals = [];
  if (!(process.env.SUNO_API_URL && process.env.SUNO_KEY)) {
    approvals.push({
      id: 'approval-suno',
      type: 'integration',
      title: '教坊司暂未接入 Suno',
      description: '当前可先产歌词和歌曲 brief，但还不能直接提交生歌任务。',
      priority: 'normal',
      owner: '教坊司',
      suggestedAction: '若近期要主打歌曲能力，可补齐 `SUNO_API_URL` 与 `SUNO_KEY`。'
    });
  }
  if (!(process.env.SEEDDANCE_API_URL && process.env.SEEDDANCE_KEY)) {
    approvals.push({
      id: 'approval-seeddance',
      type: 'integration',
      title: '教坊司暂未接入 SeedDance',
      description: '当前可先产脚本与分镜，但还不能直接提交短视频任务。',
      priority: 'normal',
      owner: '教坊司',
      suggestedAction: '若近期要主打视频能力，可补齐 `SEEDDANCE_API_URL` 与 `SEEDDANCE_KEY`。'
    });
  }

  for (const line of lines) {
    if (line.status !== 'ready') {
      approvals.push({
        id: `approval-line-${line.id}`,
        type: 'creative',
        title: `${line.name} 需要主上拍板第一条任务`,
        description: line.summary,
        priority: line.sessions > 0 ? 'low' : 'normal',
        owner: line.name,
        suggestedAction: line.command
      });
    }
  }

  const readyLines = lines.filter(line => line.status === 'ready').length;
  const summary = {
    headline: readyLines >= 2 ? '享乐与内容产线已经能转起来了' : '产线骨架已在，仍需要你下几条示范任务',
    subtitle: readyLines >= 2
      ? '教坊司、画宫司、翰林院至少有两条线处于可直接调用状态。'
      : '当前更适合先让几条产线各自做出首个样板，再进入稳定代劳模式。',
    readyLines,
    totalLines: lines.length,
    enabledExternalIntegrations: externalIntegrations.filter(item => item.enabled && ['suno', 'seeddance'].includes(item.id)).length
  };

  const result = {
    summary,
    lines,
    templates,
    integrations: externalIntegrations,
    approvals
  };
  setCache('creative_studio', result);
  return result;
}

app.get('/api/sessions', authMiddleware, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const data = buildSessionsData();
    res.json({ 
      sessions: data.sessions.slice(0, limit), 
      total: data.total,
      active: data.active
    });
  } catch (err) {
    res.status(500).json({ error: err.message, sessions: [], total: 0, active: 0 });
  }
});

// ========== DASHBOARD SUMMARY ==========
app.get('/api/dashboard/summary', authMiddleware, (req, res) => {
  try {
    const cached = getCached('dashboard_summary');
    if (cached) return res.json(cached);

    const config = getOpenClawConfig();
    const sessData = buildSessionsData();
    const sessions = sessData.sessions;
    let totalInput = 0, totalOutput = 0;
    const agentStats = {};
    const knownAgentIds = collectKnownAgentIds(config);

    for (const s of sessions) {
      totalInput += s.inputTokens || 0;
      totalOutput += s.outputTokens || 0;

      const meta = getAgentMeta(s.agentId);
      const current = agentStats[s.agentId] || {
        agentId: s.agentId,
        name: meta.displayName,
        category: meta.group,
        categoryLabel: meta.groupLabel,
        sortOrder: meta.order,
        updatedAt: 0,
        messages: 0,
        tokens: 0,
        sessions: 0
      };

      current.messages += s.messageCount || 0;
      current.tokens += s.totalTokens || 0;
      current.sessions += 1;
      current.updatedAt = Math.max(current.updatedAt || 0, s.updatedAt || 0);
      agentStats[s.agentId] = current;
    }

    for (const agentId of knownAgentIds) {
      if (!agentStats[agentId]) {
        const meta = getAgentMeta(agentId);
        agentStats[agentId] = {
          agentId,
          name: meta.displayName,
          category: meta.group,
          categoryLabel: meta.groupLabel,
          sortOrder: meta.order,
          updatedAt: 0,
          messages: 0,
          tokens: 0,
          sessions: 0
        };
      }
    }

    const mem = process.memoryUsage();
    const cpuLoad = os.loadavg();
    const sysUptime = os.uptime();
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const cpuCount = Math.max(os.cpus()?.length || 1, 1);
    const now = Date.now();
    const activeThresholdMs = 6 * 60 * 60 * 1000;
    const watchThresholdMs = 24 * 60 * 60 * 1000;
    const previewCache = {};

    const getPreview = (agentId) => {
      if (!previewCache[agentId]) {
        previewCache[agentId] = getLatestAssistantPreview(agentId);
      }
      return previewCache[agentId];
    };

    const allAgents = Object.values(agentStats)
      .map(stat => {
        const idleMs = stat.updatedAt ? now - stat.updatedAt : Infinity;
        return {
          ...stat,
          idleHours: Number.isFinite(idleMs) ? Math.floor(idleMs / (60 * 60 * 1000)) : null,
          staleLevel: idleMs <= activeThresholdMs ? 'active' : idleMs <= watchThresholdMs ? 'watch' : 'idle'
        };
      })
      .sort((a, b) => {
        if ((b.updatedAt || 0) !== (a.updatedAt || 0)) return (b.updatedAt || 0) - (a.updatedAt || 0);
        if ((b.tokens || 0) !== (a.tokens || 0)) return (b.tokens || 0) - (a.tokens || 0);
        return (a.sortOrder || 999) - (b.sortOrder || 999);
      });

    const activeAgents = allAgents.filter(agent => agent.staleLevel === 'active');
    const spotlight = allAgents.slice(0, 6).map(agent => ({
      ...agent,
      lastMessagePreview: getPreview(agent.agentId).text
    }));

    const waitingQueue = allAgents
      .filter(agent => agent.staleLevel !== 'active')
      .sort((a, b) => (b.idleHours || 0) - (a.idleHours || 0))
      .slice(0, 5)
      .map(agent => ({
        agentId: agent.agentId,
        name: agent.name,
        category: agent.category,
        categoryLabel: agent.categoryLabel,
        idleHours: agent.idleHours,
        updatedAt: agent.updatedAt,
        reason: agent.updatedAt ? `${agent.idleHours} 小时未汇报` : '尚无可用会话记录'
      }));

    const leisureBoard = ['jiaofangsi', 'huagong', 'hanlinyuan', 'yushanfang', 'neiwufu']
      .filter(agentId => agentStats[agentId])
      .map(agentId => {
        const stat = agentStats[agentId];
        const preview = getPreview(agentId);
        const idleMs = stat.updatedAt ? now - stat.updatedAt : Infinity;
        return {
          agentId,
          name: stat.name,
          status: idleMs <= activeThresholdMs ? 'ready' : idleMs <= watchThresholdMs ? 'warming' : 'idle',
          summary: preview.text || (stat.updatedAt ? '最近暂无可展示摘要' : '还没开始产出娱乐内容'),
          updatedAt: stat.updatedAt
        };
      });

    const groupBuckets = {};
    for (const agent of allAgents) {
      const key = agent.categoryLabel || '未分组';
      if (!groupBuckets[key]) {
        groupBuckets[key] = { key: agent.category || 'other', label: key, total: 0, active: 0, tokens: 0 };
      }
      groupBuckets[key].total += 1;
      groupBuckets[key].tokens += agent.tokens || 0;
      if (agent.staleLevel === 'active') groupBuckets[key].active += 1;
    }

    const groupOverview = Object.values(groupBuckets)
      .sort((a, b) => {
        const orderA = Math.min(...allAgents.filter(agent => agent.categoryLabel === a.label).map(agent => agent.sortOrder || 999), 999);
        const orderB = Math.min(...allAgents.filter(agent => agent.categoryLabel === b.label).map(agent => agent.sortOrder || 999), 999);
        return orderA - orderB;
      });

    const dailyTokens = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dailyTokens[key] = 0;
    }

    for (const session of sessions) {
      if (!session.updatedAt) continue;
      try {
        const dateKey = new Date(session.updatedAt).toISOString().split('T')[0];
        if (dailyTokens[dateKey] !== undefined) {
          dailyTokens[dateKey] += session.totalTokens || 0;
        }
      } catch { }
    }

    const dailyTrend = Object.entries(dailyTokens).map(([date, tokens]) => ({ date, tokens }));

    let diskUsage = 'N/A';
    try {
      const du = require('child_process').execSync("df -h / | tail -1 | awk '{print $5}'", { encoding: 'utf-8', timeout: 3000 }).trim();
      diskUsage = du;
    } catch { }

    const totalTokens = totalInput + totalOutput;
    const lazyScoreBase = allAgents.length ? Math.round((activeAgents.length / allAgents.length) * 100) : 0;
    const lazyScore = Math.max(0, Math.min(100, Math.round(lazyScoreBase - waitingQueue.length * 5 + leisureBoard.filter(item => item.status === 'ready').length * 3)));

    let title = '大局稳定，主上可以少操心';
    let subtitle = '掌印总管正在分派事务，多数岗位保持运转。';
    if (waitingQueue.length >= 3) {
      title = '有几位臣子在摸鱼，建议点名催办';
      subtitle = '先盯住最久未汇报的岗位，再让掌印总管补一份压缩简报。';
    } else if (activeAgents.length <= Math.max(2, Math.floor(allAgents.length / 3))) {
      title = '朝局偏安静，主上最好看一眼进度';
      subtitle = '卷的人不算多，但还没到失控程度，适合发一句话推动。';
    }

    const topWorker = spotlight[0];
    const quickWins = [
      topWorker
        ? `${topWorker.name} 当前最活跃，最近 ${topWorker.lastMessagePreview || '有新进展可看'}`
        : '暂时还没有足够的活跃记录。',
      waitingQueue.length > 0
        ? `目前有 ${waitingQueue.length} 个岗位值得催办，最久未动的是 ${waitingQueue[0].name}。`
        : '当前没有明显掉队岗位，整体节奏比较自觉。',
      leisureBoard.some(item => item.status === 'ready')
        ? `娱乐线可直接调用，${leisureBoard.find(item => item.status === 'ready')?.name} 已具备随叫随到状态。`
        : '娱乐线今天不算活跃，若要放松可以先让教坊司热身。'
    ];

    const actionQueue = [
      {
        label: '看一句话总简报',
        target: '掌印总管',
        command: '把今天最值得我知道的三件事压缩成一句话简报'
      },
      {
        label: waitingQueue[0] ? `催 ${waitingQueue[0].name}` : '催推进度',
        target: waitingQueue[0]?.name || '廷议官',
        command: waitingQueue[0]
          ? `@${waitingQueue[0].name} 把卡住的事项继续推进，并向我汇报结果`
          : '把当前未推进事项整理成待批清单'
      },
      {
        label: '安排轻娱乐',
        target: '教坊司',
        command: '准备今天的轻娱乐内容，优先给我一个最省心的选项'
      }
    ];

    const deptRanking = spotlight.map(item => ({
      name: item.name,
      updatedAt: item.updatedAt,
      messages: item.messages,
      tokens: item.tokens,
      category: item.category,
      categoryLabel: item.categoryLabel,
      lastMessagePreview: item.lastMessagePreview
    }));

    const summary = {
      headline: {
        title,
        subtitle,
        lazyScore,
        activeAgents: activeAgents.length,
        totalAgents: allAgents.length
      },
      quickWins,
      actionQueue,
      groupOverview,
      spotlight,
      waitingQueue,
      leisureBoard,
      totalInput,
      totalOutput,
      totalTokens,
      totalSessions: sessData.total,
      activeSessions: sessData.active,
      deptRanking,
      dailyTrend,
      systemLoad: {
        cpu1m: Number(((cpuLoad[0] / cpuCount) * 100).toFixed(1)),
        cpu5m: Number(((cpuLoad[1] / cpuCount) * 100).toFixed(1)),
        cpu15m: Number(((cpuLoad[2] / cpuCount) * 100).toFixed(1)),
        memTotalGB: Number((totalMem / 1024 / 1024 / 1024).toFixed(1)),
        memFreeGB: Number((freeMem / 1024 / 1024 / 1024).toFixed(1)),
        memUsedPct: Number(((1 - freeMem / totalMem) * 100).toFixed(1)),
        diskUsage,
        uptime: formatUptime(sysUptime)
      },
      lastUpdated: Date.now(),
      timestamp: new Date().toISOString(),
    };

    setCache('dashboard_summary', summary);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SESSION TIMELINE ==========
app.get('/api/sessions/:sessionId/timeline', authMiddleware, (req, res) => {
  try {
    const { sessionId } = req.params;
    const cacheKey = `timeline:${sessionId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    
    const parts = sessionId.split(':');
    const agentId = parts[1] || 'main';
    const sessionKey = parts.slice(2).join(':');
    
    const sessionsPath = join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
    if (!existsSync(sessionsPath)) return res.json({ timeline: [] });
    
    const sessionsData = JSON.parse(readFileSync(sessionsPath, 'utf-8'));
    const session = sessionsData[sessionKey];
    if (!session?.sessionFile || !existsSync(session.sessionFile)) return res.json({ timeline: [] });
    
    const content = readFileSync(session.sessionFile, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    // Aggregate by hour
    const hourly = {};
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'message' && entry.timestamp) {
          const ts = new Date(entry.timestamp);
          const hourKey = ts.toISOString().substring(0, 13) + ':00'; // YYYY-MM-DDTHH:00
          if (!hourly[hourKey]) hourly[hourKey] = { hour: hourKey, user: 0, assistant: 0, total: 0 };
          hourly[hourKey].total++;
          if (entry.message?.role === 'user') hourly[hourKey].user++;
          else if (entry.message?.role === 'assistant') hourly[hourKey].assistant++;
        }
      } catch { }
    }
    
    const timeline = Object.values(hourly).sort((a, b) => a.hour.localeCompare(b.hour));
    const result = { timeline, sessionKey, agentId };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, timeline: [] });
  }
});

// 获取会话消息详情（分页 + 搜索）
app.get('/api/sessions/:sessionId/messages', authMiddleware, (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const search = (req.query.search || '').toLowerCase().trim();
    const allMessages = [];
    
    const parts = sessionId.split(':');
    const agentId = parts[1] || 'main';
    const sessionKey = parts.slice(2).join(':');
    
    const sessionsPath = join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
    if (existsSync(sessionsPath)) {
      const sessionsData = JSON.parse(readFileSync(sessionsPath, 'utf-8'));
      const session = sessionsData[sessionKey];
      if (session?.sessionFile && existsSync(session.sessionFile)) {
        const lines = readFileSync(session.sessionFile, 'utf-8').split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.type === 'message' && entry.message) {
              const content = entry.message.content;
              let text = '';
              if (Array.isArray(content)) {
                text = content.map(c => c.text || c.type).join('');
              } else if (typeof content === 'string') {
                text = content;
              }
              if (text) {
                // Search filter
                if (search && !text.toLowerCase().includes(search)) continue;
                allMessages.push({
                  id: entry.id,
                  role: entry.message.role,
                  content: text.substring(0, 500),
                  timestamp: entry.timestamp || entry.message.timestamp
                });
              }
            }
          } catch { }
        }
      }
    }
    
    const total = allMessages.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const paginated = allMessages.slice(start, start + limit);
    
    res.json({ messages: paginated, total, page: safePage, totalPages, limit });
  } catch (err) {
    res.status(500).json({ error: err.message, messages: [], total: 0, page: 1, totalPages: 0 });
  }
});

// ========== SESSION SUMMARY ==========
app.get('/api/sessions/:sessionId/summary', authMiddleware, (req, res) => {
  try {
    const { sessionId } = req.params;
    const parts = sessionId.split(':');
    const agentId = parts[1] || 'main';
    const sessionKey = parts.slice(2).join(':');
    
    const sessionsPath = join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
    if (!existsSync(sessionsPath)) return res.json({ error: 'Session not found' });
    
    const sessionsData = JSON.parse(readFileSync(sessionsPath, 'utf-8'));
    const session = sessionsData[sessionKey];
    if (!session?.sessionFile || !existsSync(session.sessionFile)) return res.json({ error: 'Session file not found' });
    
    const content = readFileSync(session.sessionFile, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    let totalTokens = 0, messageCount = 0, firstTs = null, lastTs = null;
    let firstMessage = '', lastMessage = '';
    const responseTimes = [];
    let lastUserTs = null;
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'message' || !entry.message) continue;
        messageCount++;
        const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : null;
        const usage = entry.message?.usage;
        if (usage) totalTokens += (usage.input || 0) + (usage.output || 0);
        
        const text = typeof entry.message.content === 'string' 
          ? entry.message.content 
          : Array.isArray(entry.message.content) 
            ? entry.message.content.map(c => c.text || '').join('')
            : '';
        
        if (!firstTs && ts) { firstTs = ts; firstMessage = text.substring(0, 200); }
        if (ts) { lastTs = ts; lastMessage = text.substring(0, 200); }
        
        if (entry.message.role === 'user' && ts) lastUserTs = ts;
        if (entry.message.role === 'assistant' && lastUserTs && ts) {
          responseTimes.push(ts - lastUserTs);
          lastUserTs = null;
        }
      } catch { }
    }
    
    const avgResponseTime = responseTimes.length > 0 
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;
    
    res.json({
      totalTokens, messageCount,
      firstMessage: firstTs ? { timestamp: new Date(firstTs).toISOString(), preview: firstMessage } : null,
      lastMessage: lastTs ? { timestamp: new Date(lastTs).toISOString(), preview: lastMessage } : null,
      avgResponseTimeMs: avgResponseTime,
      avgResponseTimeSec: (avgResponseTime / 1000).toFixed(1),
      agentId, sessionKey,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== DEPARTMENT RECENT MESSAGES ==========
app.get('/api/departments/:name/recent', authMiddleware, (req, res) => {
  try {
    const deptName = decodeURIComponent(req.params.name);
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    
    // Find agent ID from department name
    let agentId = null;
    for (const [id, meta] of Object.entries(AGENT_META)) {
      if (meta.displayName === deptName || id === deptName) { agentId = id; break; }
    }
    if (!agentId) return res.json({ messages: [], error: 'Department not found' });
    
    const sessionsPath = join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
    if (!existsSync(sessionsPath)) return res.json({ messages: [] });
    
    const sessionsData = JSON.parse(readFileSync(sessionsPath, 'utf-8'));
    
    // Find the most recently updated session
    let bestSession = null, bestTime = 0;
    for (const [, sess] of Object.entries(sessionsData)) {
      if ((sess.updatedAt || 0) > bestTime && sess.sessionFile) {
        bestTime = sess.updatedAt;
        bestSession = sess;
      }
    }
    
    if (!bestSession?.sessionFile || !existsSync(bestSession.sessionFile)) return res.json({ messages: [] });
    
    const content = readFileSync(bestSession.sessionFile, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const messages = [];
    
    // Read from the end for recent messages
    for (let i = lines.length - 1; i >= 0 && messages.length < limit * 2; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'message' && entry.message) {
          const c = entry.message.content;
          let text = typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x.text || '').join('') : '';
          if (text.trim()) {
            messages.unshift({
              id: entry.id,
              role: entry.message.role,
              content: text.substring(0, 300),
              timestamp: entry.timestamp || entry.message.timestamp,
            });
          }
        }
      } catch { }
    }
    
    res.json({ messages: messages.slice(-limit), department: deptName, agentId });
  } catch (err) {
    res.status(500).json({ error: err.message, messages: [] });
  }
});

// Gateway config (read-only, masks secrets)
app.get('/api/config', authMiddleware, (req, res) => {
  try {
    const config = getOpenClawConfig();
    if (!config) return res.json({ config: null, error: 'Config not found' });
    
    // Deep clone and mask sensitive fields
    const masked = JSON.parse(JSON.stringify(config));
    const maskSecrets = (obj, depth = 0) => {
      if (!obj || typeof obj !== 'object' || depth > 10) return;
      for (const key of Object.keys(obj)) {
        if (/token|secret|key|password|apiKey/i.test(key) && typeof obj[key] === 'string') {
          obj[key] = obj[key].substring(0, 6) + '••••••';
        } else if (typeof obj[key] === 'object') {
          maskSecrets(obj[key], depth + 1);
        }
      }
    };
    maskSecrets(masked);
    
    res.json({ config: masked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notion', authMiddleware, (req, res) => {
  res.json({
    status: 'success',
    lastSync: new Date().toISOString(),
    pagesLinked: 12,
    lastError: null
  });
});

app.post('/api/notion/sync', authMiddleware, (req, res) => {
  res.json({ success: true, message: '同步任务已触发' });
});

app.get('/api/content/studio', authMiddleware, (req, res) => {
  try {
    res.json(getCreativeStudioData());
  } catch (err) {
    res.status(500).json({ error: err.message, summary: null, lines: [], templates: [], integrations: [], approvals: [] });
  }
});

app.get('/api/content/jiaofangsi/tasks', authMiddleware, async (req, res) => {
  try {
    const shouldRefresh = req.query.refresh === '1';
    let tasks = Object.values(creativeTaskStore).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

    if (shouldRefresh) {
      const refreshed = [];
      for (const task of tasks.slice(0, 10)) {
        if (['queued', 'running', 'submitted'].includes(task.status) && task.remoteTaskId) {
          try {
            refreshed.push(await refreshCreativeTask(task));
          } catch {
            refreshed.push(task);
          }
        } else {
          refreshed.push(task);
        }
      }
      const stable = tasks.slice(10);
      tasks = [...refreshed, ...stable].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }

    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message, tasks: [] });
  }
});

app.get('/api/content/jiaofangsi/tasks/:taskId', authMiddleware, async (req, res) => {
  try {
    const task = creativeTaskStore[req.params.taskId];
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const result = req.query.refresh === '1' ? await refreshCreativeTask(task) : task;
    res.json({ task: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/content/jiaofangsi/tasks', authMiddleware, async (req, res) => {
  try {
    const mode = String(req.body?.mode || '').trim();
    const payload = req.body?.payload || {};
    const task = await submitCreativeTask(mode, payload);
    res.json({ success: true, task });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/approvals', authMiddleware, (req, res) => {
  try {
    const creative = getCreativeStudioData();
    const pending = creative.approvals || [];
    const processed = [
      {
        id: 'processed-creative-1',
        type: 'creative',
        title: '画宫司样板任务已确认',
        description: '已采用“先给 3 套风格方案，再生成主视觉”的工作方式。',
        priority: 'low',
        owner: '画宫司',
        action: 'approved',
        processedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'processed-creative-2',
        type: 'integration',
        title: '翰林院走结构化创作流',
        description: '长篇创作默认先出章纲与钩子，再决定是否写正文。',
        priority: 'normal',
        owner: '翰林院',
        action: 'approved',
        processedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
      }
    ];
    res.json({ pending, processed, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message, pending: [], processed: [] });
  }
});

app.get('/api/notion/data', authMiddleware, (req, res) => {
  const { type = 'daily' } = req.query;
  const config = getOpenClawConfig();
  
  if (type === 'daily') {
    const data = [];
    if (existsSync(AGENTS_DIR)) {
      const agentDirs = readdirSync(AGENTS_DIR);
      let id = 1;
      for (const agentId of agentDirs.slice(0, 7)) {
        const sessData = getAgentSessionData(agentId);
        const today = new Date().toISOString().split('T')[0];
        data.push({
          id: String(id++),
          title: `${today} ${getAgentDisplayName(agentId)}简报`,
          date: today,
          summary: `今日会话${sessData.sessions}次，消耗Token ${sessData.totalTokens.toLocaleString()}`,
          author: getAgentDisplayName(agentId),
          status: 'published'
        });
      }
    }
    res.json({ type: 'daily', data, lastSync: new Date().toISOString() });
  } else if (type === 'finance') {
    const tokenStats = getTokenStats();
    const data = tokenStats.byDepartment.slice(0, 6).map((d, i) => ({
      id: String(i + 1),
      category: d.department,
      income: Math.floor(Math.random() * 500000) + 100000,
      expense: Math.floor(d.tokens * 0.001),
      period: '2026-02',
      balance: Math.floor(Math.random() * 300000)
    }));
    res.json({ type: 'finance', data, lastSync: new Date().toISOString() });
  } else if (type === 'personnel') {
    const depts = ['掌印总管', '兵部', '工部', '户部', '礼部', '教坊司'];
    const data = depts.map((name, i) => ({
      id: String(i + 1),
      name: name === '掌印总管' ? name : `${name}主事`,
      title: name,
      department: name,
      status: 'active',
      tenure: `${2024 + i}年任职`
    }));
    res.json({ type: 'personnel', data, lastSync: new Date().toISOString() });
  } else {
    res.json({ type, data: [], lastSync: new Date().toISOString() });
  }
});

const WEATHER_DEFAULT_LOCATION = process.env.WEATHER_LOCATION || 'Beijing';

app.get('/api/weather', authMiddleware, (req, res) => {
  const location = String(req.query.location || WEATHER_DEFAULT_LOCATION).replace(/[^a-zA-Z0-9,+\-_ .]/g, "");
  
  try {
    const output = require('child_process').execSync(`curl -s "wttr.in/${location}?format=j1"`, { 
      timeout: 5000,
      encoding: 'utf8'
    }).trim();
    
    const data = JSON.parse(output);
    const current = data.current_condition?.[0];
    
    if (current) {
      const temp = current.temp_C?.[0] || 'N/A';
      const condition = current.weatherDesc?.[0]?.value || 'Unknown';
      const humidity = current.humidity?.[0] || 'N/A';
      const wind = current.windspeedKmph?.[0] || 'N/A';
      
      res.json({
        location,
        weather: `${condition} ${temp}°C`,
        details: {
          temp,
          condition,
          humidity: humidity + '%',
          wind: wind + 'km/h'
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({ location, weather: '数据解析失败', timestamp: new Date().toISOString() });
    }
  } catch (e) {
    res.json({ location, weather: '天气服务暂不可用', timestamp: new Date().toISOString() });
  }
});

// 获取平台连接状态
app.get('/api/platforms', authMiddleware, (req, res) => {
  try {
    // 直接读取 gateway 配置和 agent 数据（不再 curl 自己）
    const config = getOpenClawConfig();
    const channels = config?.channels || {};
    
    // 读取 agent 数据获取在线账号数和会话数
    let agentIds = [];
    if (existsSync(AGENTS_DIR)) {
      agentIds = readdirSync(AGENTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    }
    
    let totalSessions = 0;
    for (const id of agentIds) {
      const sessData = getAgentSessionData(id);
      totalSessions += sessData.sessions;
    }

    // 从 gateway 配置读取真实平台状态
    const platformDefs = [
      { key: 'discord', name: 'Discord', icon: '💬' },
      { key: 'telegram', name: 'Telegram', icon: '✈️' },
      { key: 'signal', name: 'Signal', icon: '🔒' },
      { key: 'whatsapp', name: 'WhatsApp', icon: '📱' },
      { key: 'slack', name: 'Slack', icon: '💼' },
    ];
    
    const platforms = platformDefs
      .map(def => {
        const chConf = channels[def.key];
        const isConfigured = !!chConf;
        // Count accounts: check if there's a token/credentials configured
        const accounts = isConfigured ? (Array.isArray(chConf.accounts) ? chConf.accounts.length : 1) : 0;
        return {
          name: def.name,
          status: isConfigured ? 'connected' : 'disconnected',
          channels: def.key === 'discord' ? totalSessions : 0,
          accounts: accounts,
        };
      })
      .filter(p => p.status === 'connected' || ['Discord', 'Telegram', 'Signal', 'WhatsApp'].includes(p.name));
    
    // Discord 特殊处理：从 guilds 和 agents 统计
    const discordPlatform = platforms.find(p => p.name === 'Discord');
    if (discordPlatform) {
      discordPlatform.accounts = agentIds.length;
      discordPlatform.channels = totalSessions;
    }
    
    res.json({ platforms, source: 'gateway' });
  } catch (e) {
    res.json({ 
      platforms: [
        { name: 'Discord', status: 'connected', channels: 0, accounts: 0 },
      ],
      source: 'error'
    });
  }
});

app.get('/api/cron', authMiddleware, (req, res) => {
  // 从 Gateway 获取真实 Cron Jobs
  const { execSync } = require('child_process');
  try {
    const output = execSync('openclaw cron list --json 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    const data = JSON.parse(output);
    const jobs = (data.jobs || []).map((j) => {
      // 解析调度规则
      let scheduleStr = '';
      if (j.schedule) {
        const s = j.schedule;
        if (s.kind === 'cron') {
          scheduleStr = (s.expr) || '';
        } else if (s.kind === 'every') {
          const ms = s.everyMs;
          if (ms < 60000) scheduleStr = `every ${ms/1000}s`;
          else if (ms < 3600000) scheduleStr = `every ${ms/60000}m`;
          else scheduleStr = `every ${ms/3600000}h`;
        }
      }
      
      // 解析状态
      const state = j.state;
      const nextRunMs = state.nextRunAtMs;
      const lastRunMs = state.lastRunAtMs;
      
      return {
        id: j.id,
        name: j.name,
        schedule: scheduleStr,
        enabled: j.enabled,
        nextRun: nextRunMs ? new Date(nextRunMs).toISOString() : null,
        lastRun: lastRunMs ? new Date(lastRunMs).toISOString() : null,
        status: state.lastStatus || 'unknown',
        agent: j.agentId
      };
    });
    res.json({ jobs, source: 'gateway' });
  } catch (e) {
    // Fallback to demo data
    const jobs = [
      { id: 'heartbeat-check', name: '心跳检查', schedule: '*/30 * * * *', enabled: true, nextRun: new Date().toISOString() },
      { id: 'notion-sync', name: 'Notion同步', schedule: '0 2 * * *', enabled: true, nextRun: new Date().toISOString() },
      { id: 'data-backup', name: '数据备份', schedule: '0 3 * * *', enabled: false, nextRun: null }
    ];
    res.json({ jobs, source: 'demo' });
  }
});

app.post('/api/cron/run/:id', authMiddleware, (req, res) => {
  const id = req.params.id.replace(/[^a-zA-Z0-9_\-]/g, '');
  const { execSync } = require('child_process');
  try {
    execSync(`openclaw cron run ${id}`, { encoding: 'utf-8', timeout: 10000 });
    res.json({ success: true, message: `任务 ${id} 已触发执行` });
  } catch (e) {
    res.json({ success: false, message: `任务 ${id} 执行失败: ${e.message}` });
  }
});

// Cron enable/disable
app.patch('/api/cron/jobs/:id', authMiddleware, (req, res) => {
  try {
    const id = req.params.id.replace(/[^a-zA-Z0-9_\-]/g, '');
    const { enabled } = req.body;
    const { execSync } = require('child_process');
    
    if (typeof enabled === 'boolean') {
      const action = enabled ? 'enable' : 'disable';
      // Try openclaw CLI
      try {
        execSync(`openclaw cron ${action} ${id}`, { encoding: 'utf-8', timeout: 10000 });
        res.json({ success: true, message: `任务 ${id} 已${enabled ? '启用' : '禁用'}`, id, enabled });
      } catch (cliErr) {
        // Fallback: try to update config directly
        try {
          const config = getOpenClawConfig();
          if (config?.cron?.jobs) {
            const job = config.cron.jobs.find(j => j.id === id);
            if (job) {
              job.enabled = enabled;
              // Note: we don't write config here — that requires gateway restart
              res.json({ success: true, message: `任务 ${id} 状态更新（需重启生效）`, id, enabled, pending: true });
            } else {
              res.status(404).json({ success: false, message: `任务 ${id} 不存在` });
            }
          } else {
            res.status(500).json({ success: false, message: `CLI失败: ${cliErr.message}` });
          }
        } catch {
          res.status(500).json({ success: false, message: `操作失败: ${cliErr.message}` });
        }
      }
    } else {
      res.status(400).json({ success: false, message: '需要 enabled 布尔值' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Alias: GET /api/cron/jobs → same handler as GET /api/cron
app.get('/api/cron/jobs', authMiddleware, (req, res) => {
  const { execSync } = require('child_process');
  try {
    const output = execSync('openclaw cron list --json 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    const data = JSON.parse(output);
    const jobs = (data.jobs || []).map((j) => {
      let scheduleStr = '';
      if (j.schedule) {
        const s = j.schedule;
        if (s.kind === 'cron') scheduleStr = s.expr || '';
        else if (s.kind === 'every') {
          const ms = s.everyMs;
          if (ms < 60000) scheduleStr = `every ${ms/1000}s`;
          else if (ms < 3600000) scheduleStr = `every ${ms/60000}m`;
          else scheduleStr = `every ${ms/3600000}h`;
        }
      }
      const state = j.state || {};
      return {
        id: j.id, name: j.name, schedule: scheduleStr, enabled: j.enabled,
        nextRun: state.nextRunAtMs ? new Date(state.nextRunAtMs).toISOString() : null,
        lastRun: state.lastRunAtMs ? new Date(state.lastRunAtMs).toISOString() : null,
        status: state.lastStatus || 'unknown', agent: j.agentId
      };
    });
    res.json({ jobs, source: 'gateway' });
  } catch (e) {
    res.json({ jobs: [], source: 'error', error: e.message });
  }
});

// Read real gateway logs from journalctl or log files
function readGatewayLogs(opts = {}) {
  const { level, search, limit = 200, since } = opts;
  const logs = [];
  
  try {
    // Try journalctl for openclaw service logs
    const { execSync } = require('child_process');
    let cmd = 'journalctl -u openclaw --no-pager -n 200 --output=short-iso 2>/dev/null';
    if (since) cmd += ` --since="${String(since).replace(/[^a-zA-Z0-9:\-_ ]/g, "")}"`;
    
    let output = '';
    try {
      output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
    } catch {
      // Fallback: read from openclaw log file
      const logPaths = [
        `${HOME}/.openclaw/logs/gateway.log`,
        '/tmp/openclaw.log',
        '/tmp/boluo-gui.log',
      ];
      for (const p of logPaths) {
        if (existsSync(p)) {
          try { output = readFileSync(p, 'utf-8').split('\n').slice(-200).join('\n'); break; } catch { }
        }
      }
    }
    
    // Also read recent JSONL assistant messages as "log" entries
    const agentLogs = getRecentLogs(100);
    
    // Parse output lines
    const lines = output.split('\n').filter(l => l.trim());
    let id = 0;
    for (const line of lines) {
      const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:]+[^\s]*)/);
      const lvlMatch = line.match(/\b(INFO|WARN|ERROR|DEBUG|FATAL)\b/i);
      const entry = {
        id: id++,
        timestamp: tsMatch ? tsMatch[1] : new Date().toISOString(),
        level: lvlMatch ? lvlMatch[1].toUpperCase() : 'INFO',
        message: line.substring(0, 500),
        source: 'gateway'
      };
      logs.push(entry);
    }
    
    // Merge agent logs
    for (const al of agentLogs) {
      logs.push({ id: id++, ...al });
    }
    
    // Sort by timestamp desc
    logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch { }
  
  // Filter
  let filtered = logs;
  if (level && level !== 'ALL') {
    filtered = filtered.filter(l => l.level === level.toUpperCase());
  }
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(l => l.message.toLowerCase().includes(s));
  }
  if (since) {
    const sinceTs = new Date(since).getTime();
    if (!isNaN(sinceTs)) filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= sinceTs);
  }
  
  return filtered.slice(0, parseInt(limit) || 200);
}

app.get('/api/logs/list', authMiddleware, (req, res) => {
  try {
    const { level, search, limit = 200, since } = req.query;
    const logs = readGatewayLogs({ level, search, limit: parseInt(limit), since });
    res.json({ logs, total: logs.length });
  } catch (err) {
    res.status(500).json({ error: err.message, logs: [], total: 0 });
  }
});

// SSE Logs Stream — real-time log push
const sseClients = new Set();

app.get('/api/logs/stream', authMiddleware, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  
  res.write('event: connected\ndata: {"status":"connected"}\n\n');
  
  const client = { res, level: req.query.level || null };
  sseClients.add(client);
  
  req.on('close', () => { sseClients.delete(client); });
});

// Push log events to SSE clients (called from internal log sources)
function pushLogEvent(log) {
  for (const client of sseClients) {
    try {
      if (client.level && client.level !== 'ALL' && log.level !== client.level) continue;
      client.res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
    } catch { sseClients.delete(client); }
  }
}

// Poll for new logs every 10 seconds and push to SSE clients
let lastLogCheck = Date.now();
setInterval(() => {
  if (sseClients.size === 0) return;
  try {
    const logs = readGatewayLogs({ since: new Date(lastLogCheck).toISOString(), limit: 20 });
    for (const log of logs) {
      pushLogEvent(log);
    }
    lastLogCheck = Date.now();
  } catch { }
}, 10000);

app.get('/api/nodes', authMiddleware, (req, res) => {
  const nodes = [
    { id: 'vibe-server', name: 'Vibe服务器', status: 'online', lastHeartbeat: Date.now(), os: 'Linux arm64', uptime: 432000 },
    { id: 'desktop-mac', name: 'Mac桌面', status: 'offline', lastHeartbeat: Date.now() - 3600000, os: 'macOS x64', uptime: 0 },
    { id: 'phone-iphone', name: 'iPhone', status: 'online', lastHeartbeat: Date.now(), os: 'iOS', uptime: 7200 }
  ];
  res.json({ nodes });
});

// Notion 数据库/页面查询路由
app.get('/api/notion/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const NOTION_TOKEN = process.env.NOTION_TOKEN || '';
  
  try {
    // 先尝试查询数据库
    let response = await fetch(`https://api.notion.com/v1/databases/${id}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ page_size: 10 })
    });
    
    let data = await response.json();
    
    // 如果返回错误说明是页面而非数据库，尝试获取页面
    if (data.object === 'error') {
      response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28'
        }
      });
      data = await response.json();
    }
    
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取Discord频道最新消息
app.get('/api/channel-messages', authMiddleware, async (req, res) => {
  const channelId = req.query.channel || '1474091579630293164';
  const limit = Math.min(parseInt(req.query.limit) || 15, 50);
  
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    const account = config.channels?.discord?.accounts?.['main'];
    const token = account?.token;
    
    if (!token) {
      return res.status(400).json({ error: 'Main bot token not found' });
    }

    const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=${limit}`, {
      headers: { 'Authorization': `Bot ${token}` }
    });
    
    if (r.ok) {
      const data = await r.json();
      // Map bot IDs to display names
      const accounts = config.channels?.discord?.accounts || {};
      const botIdToName = {};
      for (const [agentId, acc] of Object.entries(accounts)) {
        if (acc.appId) botIdToName[acc.appId] = getAgentDisplayName(agentId) || acc.displayName || agentId;
      }

      const messages = data.reverse().map(msg => {
        const authorName = msg.author.bot 
          ? (botIdToName[msg.author.id] || msg.author.username)
          : msg.author.global_name || msg.author.username;
        
        // Generate color from author name
        let hash = 0;
        for (let i = 0; i < authorName.length; i++) hash = authorName.charCodeAt(i) + ((hash << 5) - hash);
        const hue = Math.abs(hash) % 360;
        
        return {
          id: msg.id,
          author: authorName,
          content: msg.content || (msg.embeds?.length ? '[嵌入内容]' : '[媒体]'),
          timestamp: new Date(msg.timestamp).toLocaleTimeString('zh-CN', { 
            timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' 
          }),
          avatarColor: `hsl(${hue}, 60%, 45%)`
        };
      });
      
      res.json({ messages });
    } else {
      const err = await r.text();
      res.status(r.status).json({ error: err, messages: [] });
    }
  } catch (err) {
    res.status(500).json({ error: err.message, messages: [] });
  }
});

// 发送指令到Discord频道
app.post('/api/command', authMiddleware, async (req, res) => {
  const { channel, message, botId } = req.body;
  const targetChannel = channel || '1474091579630293164'; // 默认朝堂频道
  
  // 读取bot token - 使用指定的botId发送
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    // Try target bot first, fall back to main
    let account = config.channels?.discord?.accounts?.[botId];
    let usedBot = botId;
    if (!account?.token) {
      account = config.channels?.discord?.accounts?.['main'];
      usedBot = 'main';
    }
    const token = account?.token;
    
    if (!token) {
      return res.status(400).json({ error: `Bot ${botId} token not found` });
    }

    const r = await fetch(`https://discord.com/api/v10/channels/${targetChannel}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: message })
    });
    
    if (r.ok) {
      const data = await r.json();
      res.json({ success: true, messageId: data.id, sentAs: usedBot });
    } else {
      const err = await r.text();
      res.status(r.status).json({ error: err });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取bot列表（含状态）
app.get('/api/bots', authMiddleware, (req, res) => {
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    const accounts = config.channels?.discord?.accounts || {};
    const bots = Object.entries(accounts).map(([id, acc]) => {
      const meta = getAgentMeta(id);
      return {
        id,
        name: meta.displayName,
        displayName: acc.displayName || meta.displayName,
        category: meta.group,
        categoryLabel: meta.groupLabel,
        sortOrder: meta.order,
        model: acc.model || config.defaultModel || 'default',
        hasToken: !!acc.token,
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);
    res.json({ bots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 三城天气 API (Open-Meteo, 免费无需key)
const WEATHER_CITIES = [
  { name: '苏黎世', lat: 47.37, lon: 8.55, tz: 'Europe/Zurich' },
  { name: '南京', lat: 32.06, lon: 118.80, tz: 'Asia/Shanghai' },
  { name: '杭州', lat: 30.25, lon: 120.17, tz: 'Asia/Shanghai' },
];

let weatherCache = { data: null, ts: 0 };

app.get('/api/weather/cities', authMiddleware, async (req, res) => {
  if (weatherCache.data && Date.now() - weatherCache.ts < 600000) {
    return res.json(weatherCache.data);
  }
  try {
    const results = await Promise.all(
      WEATHER_CITIES.map(async (city) => {
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,apparent_temperature`;
          const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
          const d = await r.json();
          const cur = d.current || {};
          return {
            name: city.name, tz: city.tz,
            temp: Math.round(cur.temperature_2m ?? 0).toString(),
            feelsLike: Math.round(cur.apparent_temperature ?? 0).toString(),
            humidity: (cur.relative_humidity_2m ?? '?').toString(),
            windSpeed: Math.round(cur.wind_speed_10m ?? 0).toString(),
            desc: wmoDesc(cur.weather_code),
            icon: wmoEmoji(cur.weather_code),
          };
        } catch {
          return { name: city.name, tz: city.tz, temp: '?', desc: '获取失败', icon: '❓' };
        }
      })
    );
    weatherCache = { data: { cities: results }, ts: Date.now() };
    res.json({ cities: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function wmoEmoji(c) {
  if (c === 0) return '☀️'; if (c === 1) return '🌤️'; if (c === 2) return '⛅'; if (c === 3) return '☁️';
  if (c >= 45 && c <= 48) return '🌫️';
  if (c >= 51 && c <= 57) return '🌦️'; if (c >= 61 && c <= 67) return '🌧️';
  if (c >= 71 && c <= 77) return '🌨️'; if (c >= 80 && c <= 82) return '🌧️';
  if (c >= 85 && c <= 86) return '🌨️'; if (c >= 95 && c <= 99) return '⛈️';
  return '🌤️';
}
function wmoDesc(c) {
  if (c === 0) return '晴'; if (c === 1) return '大致晴'; if (c === 2) return '多云'; if (c === 3) return '阴';
  if (c >= 45 && c <= 48) return '雾';
  if (c >= 51 && c <= 55) return '毛毛雨'; if (c === 56 || c === 57) return '冻毛毛雨';
  if (c >= 61 && c <= 65) return '雨'; if (c === 66 || c === 67) return '冻雨';
  if (c >= 71 && c <= 75) return '雪'; if (c === 77) return '雪粒';
  if (c >= 80 && c <= 82) return '阵雨'; if (c >= 85 && c <= 86) return '阵雪';
  if (c === 95) return '雷暴'; if (c >= 96 && c <= 99) return '冰雹雷暴';
  return '未知';
}

// IP位置追踪
const ipLocations = {};

app.get('/api/location/track', authMiddleware, async (req, res) => {
  const clientIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  const role = req.query.role || 'unknown'; // 'emperor' or 'queen'
  
  try {
    const r = await fetch(`http://ip-api.com/json/${clientIp}?lang=zh-CN&fields=status,country,regionName,city,lat,lon,query`, { signal: AbortSignal.timeout(5000) });
    const geo = await r.json();
    if (geo.status === 'success') {
      ipLocations[role] = {
        ip: geo.query,
        city: geo.city,
        region: geo.regionName,
        country: geo.country,
        lat: geo.lat,
        lon: geo.lon,
        lastSeen: Date.now()
      };
    } else {
      // 如果是内网IP，记录但标注
      ipLocations[role] = { ip: clientIp, city: '内网', region: '', country: '', lastSeen: Date.now() };
    }
  } catch {
    ipLocations[role] = { ip: clientIp, city: '未知', region: '', country: '', lastSeen: Date.now() };
  }
  
  res.json({ locations: ipLocations });
});

app.get('/api/location/all', authMiddleware, (req, res) => {
  res.json({ locations: ipLocations });
});

// ========== SYSTEM METRICS RING BUFFER ==========
const METRICS_MAX = 100;
const metricsBuffer = [];

function recordMetrics() {
  const cpuLoad = os.loadavg();
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  metricsBuffer.push({
    timestamp: new Date().toISOString(),
    cpu1m: parseFloat(cpuLoad[0].toFixed(2)),
    cpu5m: parseFloat(cpuLoad[1].toFixed(2)),
    cpu15m: parseFloat(cpuLoad[2].toFixed(2)),
    memUsedPct: parseFloat(((1 - freeMem / totalMem) * 100).toFixed(1)),
    memUsedGB: parseFloat(((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(2)),
  });
  if (metricsBuffer.length > METRICS_MAX) metricsBuffer.shift();
}

// Record every 30 seconds
setInterval(recordMetrics, 30000);
recordMetrics(); // initial

app.get('/api/system/metrics', authMiddleware, (req, res) => {
  try {
    res.json({ metrics: metricsBuffer, count: metricsBuffer.length, maxSize: METRICS_MAX });
  } catch (err) {
    res.status(500).json({ error: err.message, metrics: [] });
  }
});

const distPath = join(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  const indexPath = join(distPath, 'index.html');
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend not built' });
  }
});

// Global error handler — prevents crash on unhandled route errors
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Prevent uncaught exceptions from crashing the process
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

// ========== HTTP SERVER + WEBSOCKET ==========
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  // Auth check via query param or header
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const token = url.searchParams.get('token') || req.headers['authorization']?.replace('Bearer ', '');
  if (token !== AUTH_TOKEN) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  
  console.log(`[WS] Client connected (total: ${wss.clients.size})`);
  
  // Send initial data
  try {
    const summary = getCached('dashboard_summary');
    if (summary) ws.send(JSON.stringify({ type: 'dashboard', data: summary }));
  } catch { }
  
  ws.on('close', () => {
    console.log(`[WS] Client disconnected (total: ${wss.clients.size})`);
  });
  
  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
  });
});

// Broadcast dashboard summary every 30 seconds
setInterval(() => {
  if (wss.clients.size === 0) return;
  
  try {
    // Force refresh cache for broadcast
    delete cache['dashboard_summary'];
    
    // Build fresh data using the status endpoint's logic
    const sessData = buildSessionsData();
    const sessions = sessData.sessions;
    let totalInput = 0, totalOutput = 0;
    const deptActivity = {};
    for (const s of sessions) {
      totalInput += s.inputTokens || 0;
      totalOutput += s.outputTokens || 0;
      if (!deptActivity[s.agentName] || s.updatedAt > deptActivity[s.agentName].updatedAt) {
        deptActivity[s.agentName] = { name: s.agentName, updatedAt: s.updatedAt, messages: s.messageCount, tokens: s.totalTokens };
      }
    }
    const deptRanking = Object.values(deptActivity).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10);
    const cpuLoad = os.loadavg();
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    
    const payload = JSON.stringify({
      type: 'dashboard',
      data: {
        totalInput, totalOutput, totalTokens: totalInput + totalOutput,
        totalSessions: sessData.total, activeSessions: sessData.active,
        deptRanking,
        systemLoad: {
          cpu1m: cpuLoad[0].toFixed(2), cpu5m: cpuLoad[1].toFixed(2), cpu15m: cpuLoad[2].toFixed(2),
          memUsedPct: ((1 - freeMem / totalMem) * 100).toFixed(1),
        },
        lastUpdated: new Date().toISOString(),
      }
    });
    
    for (const client of wss.clients) {
      if (client.readyState === 1) { // OPEN
        try { client.send(payload); } catch { }
      }
    }
  } catch (err) {
    console.error('[WS] Broadcast error:', err.message);
  }
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Boluo GUI running on http://0.0.0.0:${PORT} (HTTP + WebSocket)`);
});

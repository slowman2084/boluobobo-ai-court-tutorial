#!/bin/bash
# ============================================
# AI 昏君精简配置脚本（适用于已装好 OpenClaw 或 Clawdbot 的用户）
# 跳过系统依赖，只初始化工作区 + 生成配置模板
# ============================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${BLUE}🛋️ AI 昏君 — 精简配置${NC}"
echo "================================"
echo -e "适用于已安装 OpenClaw/Clawdbot 的用户"
echo ""

if command -v openclaw &>/dev/null; then
    CLI_CMD="openclaw"
    echo -e "  ${GREEN}✓ 检测到 OpenClaw $(openclaw --version 2>/dev/null)${NC}"
elif command -v clawdbot &>/dev/null; then
    CLI_CMD="clawdbot"
    echo -e "  ${GREEN}✓ 检测到 Clawdbot $(clawdbot --version 2>/dev/null)${NC}"
else
    echo -e "  ${RED}✗ 未检测到 OpenClaw 或 Clawdbot${NC}"
    echo ""
    echo "请先安装："
    echo "  npm install -g openclaw@latest"
    echo ""
    echo "或使用完整安装脚本："
    echo "  bash <(curl -fsSL https://raw.githubusercontent.com/wanikua/boluobobo-ai-court-tutorial/main/install.sh)"
    exit 1
fi

echo ""
echo -e "${CYAN}选择部署模式：${NC}"
echo "  1) Discord 多Bot模式（内廷 + 六部 + 后宫生活机构）"
echo "  2) 纯 WebUI 模式（不需要 Discord，浏览器直接用）"
echo ""
read -p "请选择 [1/2]（默认1）: " MODE_CHOICE
MODE_CHOICE=${MODE_CHOICE:-1}

echo ""
echo -e "${YELLOW}[1/3] 初始化昏君工作区...${NC}"
WORKSPACE="$HOME/clawd"
if [ "$CLI_CMD" = "openclaw" ]; then
    CONFIG_DIR="$HOME/.openclaw"
    CONFIG_FILE="openclaw.json"
else
    CONFIG_DIR="$HOME/.clawdbot"
    CONFIG_FILE="clawdbot.json"
fi
mkdir -p "$WORKSPACE"
mkdir -p "$CONFIG_DIR"
cd "$WORKSPACE"

if [ ! -f SOUL.md ]; then
cat > SOUL.md << 'SOUL_EOF'
# SOUL.md - 昏君工作流铁律

## 总原则
1. 少打扰主上，能先做就先做
2. 汇报只讲结论、风险、待批项
3. 能自己卷起来，就不要把主上拖进细节

## 沟通风格
- 中文为主
- 结论优先
- 少废话，少官腔
- 工作、生活、娱乐都可以一起处理
SOUL_EOF
echo -e "  ${GREEN}✓ SOUL.md 已创建${NC}"
else
echo -e "  ${GREEN}✓ SOUL.md 已存在，跳过${NC}"
fi

if [ ! -f IDENTITY.md ]; then
cat > IDENTITY.md << 'ID_EOF'
# IDENTITY.md - 昏君组织架构

## 内廷
- 掌印总管：唯一默认入口，分诊、派活、压缩汇报
- 起居注官：日报、周报、纪要、摘要归档
- 廷议官：待拍板事项整理，给推荐方案

## 六部
- 兵部：软件工程、系统架构、调试修复
- 工部：运维部署、自动化、巡检
- 户部：成本、支出、收益、账目
- 礼部：宣发、社媒、X 文、娱乐包装
- 吏部：项目推进、排期、催办
- 刑部：风险、合规、边界控制

## 后宫 / 生活机构
- 内务府：日程、提醒、出行、杂事
- 御膳房：吃喝建议、外卖、轻健康
- 画宫司：生图、角色图、宫廷风视觉娱乐内容
- 教坊司：娱乐文、歌曲、视频、轻内容生产
- 翰林院：小说设定、大纲、长篇创作
ID_EOF
echo -e "  ${GREEN}✓ IDENTITY.md 已创建${NC}"
else
echo -e "  ${GREEN}✓ IDENTITY.md 已存在，跳过${NC}"
fi

if [ ! -f USER.md ]; then
cat > USER.md << 'USER_EOF'
# USER.md - 主上档案

- **称呼:** （填你的称呼）
- **语言:** 中文
- **工作风格:** 少打扰，先给结论
- **生活偏好:** 可以交给内务府和御膳房处理
- **娱乐偏好:** 可交给画宫司、教坊司、翰林院
USER_EOF
echo -e "  ${GREEN}✓ USER.md 已创建${NC}"
else
echo -e "  ${GREEN}✓ USER.md 已存在，跳过${NC}"
fi

mkdir -p memory

echo -e "${YELLOW}[2/3] 生成配置文件...${NC}"

if [ -f "$CONFIG_DIR/$CONFIG_FILE" ]; then
    echo -e "  ${YELLOW}⚠ 配置文件已存在，备份为 ${CONFIG_FILE}.bak${NC}"
    cp "$CONFIG_DIR/$CONFIG_FILE" "$CONFIG_DIR/${CONFIG_FILE}.bak"
fi

if [ "$MODE_CHOICE" = "2" ]; then
cat > "$CONFIG_DIR/$CONFIG_FILE" << CONFIG_EOF
{
  "models": {
    "providers": {
      "your-provider": {
        "baseUrl": "https://your-llm-provider-api-url",
        "apiKey": "YOUR_LLM_API_KEY",
        "api": "your-api-format",
        "models": [
          {
            "id": "fast-model",
            "name": "快速模型",
            "input": ["text", "image"],
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "$HOME/clawd",
      "model": { "primary": "your-provider/fast-model" }
    },
    "list": [
      {
        "id": "main",
        "name": "掌印总管",
        "model": { "primary": "your-provider/fast-model" },
        "identity": { "theme": "你是主上的掌印总管，是唯一默认入口。优先理解需求、减少打扰、压缩汇报。WebUI 模式下你负责承接工作、生活、娱乐和创作需求，并优先给出结论。" }
      }
    ]
  }
}
CONFIG_EOF
echo -e "  ${GREEN}✓ WebUI 模式配置已生成${NC}"
else
cat > "$CONFIG_DIR/$CONFIG_FILE" << CONFIG_EOF
{
  "models": {
    "providers": {
      "your-provider": {
        "baseUrl": "https://your-llm-provider-api-url",
        "apiKey": "YOUR_LLM_API_KEY",
        "api": "your-api-format",
        "models": [
          {
            "id": "fast-model",
            "name": "快速模型",
            "input": ["text", "image"],
            "contextWindow": 200000,
            "maxTokens": 8192
          },
          {
            "id": "strong-model",
            "name": "强力模型",
            "input": ["text", "image"],
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "$HOME/clawd",
      "model": { "primary": "your-provider/fast-model" },
      "sandbox": { "mode": "non-main" }
    },
    "list": [
      {
        "id": "main",
        "name": "掌印总管",
        "model": { "primary": "your-provider/fast-model" },
        "identity": { "theme": "你是主上的掌印总管，是唯一默认入口。你的职责是减少主上的注意力消耗。优先理解需求、补足背景、自动分诊。能自己答就自己答，能派活就直接派。汇报时只给三类信息：已办妥、待拍板、有风险。不要让主上扮演项目经理。" },
        "sandbox": { "mode": "off" },
        "subagents": {
          "allowAgents": ["qijuzhu", "tingyi", "bingbu", "gongbu", "hubu", "libu", "libu2", "xingbu", "neiwufu", "yushanfang", "huagong", "jiaofangsi", "hanlinyuan"],
          "maxConcurrent": 6
        },
        "runTimeoutSeconds": 600
      },
      { "id": "qijuzhu", "name": "起居注官", "model": { "primary": "your-provider/fast-model" }, "identity": { "theme": "你负责把复杂执行过程压缩成简报、纪要、日报和周报。输出必须短、清楚、可读，只保留里程碑、风险和待办。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 },
      { "id": "tingyi", "name": "廷议官", "model": { "primary": "your-provider/fast-model" }, "identity": { "theme": "你负责把复杂问题整理成可拍板版本。默认给推荐方案，并写清收益、代价和风险。主上只需要一眼就能决定。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 },
      { "id": "bingbu", "name": "兵部", "model": { "primary": "your-provider/strong-model" }, "identity": { "theme": "你负责软件工程、系统架构、代码实现和调试。先做后报，少问。汇报先讲结果，再讲影响和剩余风险。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 },
      { "id": "gongbu", "name": "工部", "model": { "primary": "your-provider/fast-model" }, "identity": { "theme": "你负责部署、运维、自动化和巡检。小异常自己处理，大异常再上报。输出包含状态、影响和恢复建议。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 },
      { "id": "hubu", "name": "户部", "model": { "primary": "your-provider/strong-model" }, "identity": { "theme": "你负责成本、支出、收益和账目。默认给结论，不只报流水。主上需要知道花了多少、值不值、怎么省。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 },
      { "id": "libu", "name": "礼部", "model": { "primary": "your-provider/fast-model" }, "identity": { "theme": "你负责宣发、社媒、X 文、娱乐包装文案。默认一稿多版，强传播性。适合与图像和内容生成技能联动。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 },
      { "id": "libu2", "name": "吏部", "model": { "primary": "your-provider/fast-model" }, "identity": { "theme": "你负责项目推进、排期、催办和编排。你的职责是替主上盯事，不让主上自己追进度。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 },
      { "id": "xingbu", "name": "刑部", "model": { "primary": "your-provider/fast-model" }, "identity": { "theme": "你负责风险、合规和边界控制。结论必须明确：可做、慎做或不建议。遇到可能越界的娱乐、图片、发布任务时主动提醒。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 },
      { "id": "neiwufu", "name": "内务府", "model": { "primary": "your-provider/fast-model" }, "identity": { "theme": "你负责日程、天气、提醒、出行和生活杂事。输出必须可执行，不给空泛建议。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 },
      { "id": "yushanfang", "name": "御膳房", "model": { "primary": "your-provider/fast-model" }, "identity": { "theme": "你负责吃喝建议、外卖选择和轻健康建议。默认给 2 到 3 个直接可选方案，兼顾预算和便利性。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 },
      { "id": "huagong", "name": "画宫司", "model": { "primary": "your-provider/fast-model" }, "identity": { "theme": "你负责生图、角色图和宫廷风视觉娱乐内容。生成前整理主题、风格、镜头、服饰、场景和氛围，尽量输出可直接用于图像生成的 brief。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 },
      { "id": "jiaofangsi", "name": "教坊司", "model": { "primary": "your-provider/fast-model" }, "identity": { "theme": "你负责娱乐文、段子、小剧场、歌曲和短视频。收到歌曲需求时，优先整理歌词、歌名、风格标签，并在具备 SUNO_API_URL 与 SUNO_KEY 时调用 Suno 接口。收到视频需求时，优先整理 150 字以内的视频提示词、画幅比例，并在具备 SEEDDANCE_API_URL 与 SEEDDANCE_KEY 时调用 SeedDance 接口。输出要轻松、有情绪价值，并说明成品链接或任务状态。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 },
      { "id": "hanlinyuan", "name": "翰林院", "model": { "primary": "your-provider/strong-model" }, "identity": { "theme": "你负责小说设定、大纲、章节规划和长篇创作。优先走结构化创作流程，适合与长篇创作系统联动。" }, "sandbox": { "mode": "all", "scope": "agent" }, "runTimeoutSeconds": 300 }
    ]
  },
  "channels": {
    "discord": {
      "enabled": true,
      "groupPolicy": "open",
      "allowBots": true,
      "accounts": {
        "main": { "name": "掌印总管", "token": "YOUR_MAIN_BOT_TOKEN", "groupPolicy": "open" },
        "qijuzhu": { "name": "起居注官", "token": "YOUR_QIJUZHU_BOT_TOKEN", "groupPolicy": "open" },
        "tingyi": { "name": "廷议官", "token": "YOUR_TINGYI_BOT_TOKEN", "groupPolicy": "open" },
        "bingbu": { "name": "兵部", "token": "YOUR_BINGBU_BOT_TOKEN", "groupPolicy": "open" },
        "gongbu": { "name": "工部", "token": "YOUR_GONGBU_BOT_TOKEN", "groupPolicy": "open" },
        "hubu": { "name": "户部", "token": "YOUR_HUBU_BOT_TOKEN", "groupPolicy": "open" },
        "libu": { "name": "礼部", "token": "YOUR_LIBU_BOT_TOKEN", "groupPolicy": "open" },
        "libu2": { "name": "吏部", "token": "YOUR_LIBU2_BOT_TOKEN", "groupPolicy": "open" },
        "xingbu": { "name": "刑部", "token": "YOUR_XINGBU_BOT_TOKEN", "groupPolicy": "open" },
        "neiwufu": { "name": "内务府", "token": "YOUR_NEIWUFU_BOT_TOKEN", "groupPolicy": "open" },
        "yushanfang": { "name": "御膳房", "token": "YOUR_YUSHANFANG_BOT_TOKEN", "groupPolicy": "open" },
        "huagong": { "name": "画宫司", "token": "YOUR_HUAGONG_BOT_TOKEN", "groupPolicy": "open" },
        "jiaofangsi": { "name": "教坊司", "token": "YOUR_JIAOFANGSI_BOT_TOKEN", "groupPolicy": "open" },
        "hanlinyuan": { "name": "翰林院", "token": "YOUR_HANLINYUAN_BOT_TOKEN", "groupPolicy": "open" }
      }
    }
  },
  "bindings": [
    { "agentId": "main", "match": { "channel": "discord", "accountId": "main" } },
    { "agentId": "qijuzhu", "match": { "channel": "discord", "accountId": "qijuzhu" } },
    { "agentId": "tingyi", "match": { "channel": "discord", "accountId": "tingyi" } },
    { "agentId": "bingbu", "match": { "channel": "discord", "accountId": "bingbu" } },
    { "agentId": "gongbu", "match": { "channel": "discord", "accountId": "gongbu" } },
    { "agentId": "hubu", "match": { "channel": "discord", "accountId": "hubu" } },
    { "agentId": "libu", "match": { "channel": "discord", "accountId": "libu" } },
    { "agentId": "libu2", "match": { "channel": "discord", "accountId": "libu2" } },
    { "agentId": "xingbu", "match": { "channel": "discord", "accountId": "xingbu" } },
    { "agentId": "neiwufu", "match": { "channel": "discord", "accountId": "neiwufu" } },
    { "agentId": "yushanfang", "match": { "channel": "discord", "accountId": "yushanfang" } },
    { "agentId": "huagong", "match": { "channel": "discord", "accountId": "huagong" } },
    { "agentId": "jiaofangsi", "match": { "channel": "discord", "accountId": "jiaofangsi" } },
    { "agentId": "hanlinyuan", "match": { "channel": "discord", "accountId": "hanlinyuan" } }
  ]
}
CONFIG_EOF
echo -e "  ${GREEN}✓ Discord 多Bot模式配置已生成${NC}"
fi

echo -e "${YELLOW}[3/3] 配置完成！${NC}"
echo ""
echo "================================"
echo -e "${GREEN}🎉 工作区初始化完成！${NC}"
echo "================================"
echo ""
echo -e "  工作区：${CYAN}$WORKSPACE${NC}"
echo -e "  配置文件：${CYAN}$CONFIG_DIR/$CONFIG_FILE${NC}"
echo ""

if [ "$MODE_CHOICE" = "2" ]; then
echo -e "  ${YELLOW}接下来只需要 3 步：${NC}"
echo ""
echo "  1. 编辑配置文件，填入 LLM API Key："
echo "     nano $CONFIG_DIR/$CONFIG_FILE"
echo ""
echo "  2. 启动 Gateway："
echo "     $CLI_CMD gateway --verbose"
echo ""
echo "  3. 浏览器打开 WebUI："
echo "     http://localhost:18789"
echo ""
else
echo -e "  ${YELLOW}接下来需要 4 步：${NC}"
echo ""
echo "  1. 编辑配置文件，填入 LLM API Key："
echo "     nano $CONFIG_DIR/$CONFIG_FILE"
echo ""
echo "  2. 创建 Discord Bot（每个角色一个）："
echo "     a) 访问 https://discord.com/developers/applications"
echo "     b) 按需创建掌印总管、六部、内务府、教坊司等 Bot"
echo "     c) 把每个 Token 填到 $CONFIG_FILE 的 accounts 对应位置"
echo "     d) 每个 Bot 都要开启 Message Content Intent"
echo "     e) 邀请所有 Bot 到你的 Discord 服务器"
echo ""
echo "  3. 可选：配置教坊司的歌曲 / 视频能力："
echo "     export SUNO_API_URL='https://your-suno-proxy'"
echo "     export SUNO_KEY='your-suno-key'"
echo "     export SEEDDANCE_API_URL='https://your-seeddance-proxy'"
echo "     export SEEDDANCE_KEY='your-seeddance-key'"
echo ""
echo "  4. 启动 Gateway："
echo "     $CLI_CMD gateway --verbose"
echo ""
fi
echo -e "完整教程：${BLUE}https://github.com/wanikua/boluobobo-ai-court-tutorial${NC}"
echo ""

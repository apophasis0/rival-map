# 🐎 Rival Map — JRA 赛马宿敌网络可视化

> 一个交互式力导向图可视化工具，展示日本中央竞马会（JRA）赛马之间的竞争关系。

**在线访问**：[apophasis.top/rival-map](https://apophasis.top/rival-map/)

## ✨ 功能亮点

- **交互式图谱**：节点 = 赛马，边 = 共同参加 G1/JG1 比赛
- **多维过滤**：按共同参赛次数、奖金、名次阈值筛选
- **社区发现**：基于 Louvain 算法自动识别关系最紧密的马匹"派系"
- **严格/宽松模式**：灵活控制连线的名次判定逻辑
- **时间轴布局**：可选按年份从左到右排列赛马
- **Hover 高亮**：鼠标悬停时高亮 1-hop/2-hop 邻居节点和边
- **毛玻璃控制面板**：可折叠的控制面板，支持状态持久化
- **高性能查询**：使用物化视图和复合索引优化数据库查询
- **零后端部署**：预计算静态 JSON，VPS 只需 nginx 即可运行

## 🖥️ 技术栈

| 层级 | 技术 |
|------|------|
| 后端（本地开发） | Python 3.14+, FastAPI, psycopg3 (连接池), uvicorn |
| 前端 | TypeScript, Vite, Sigma.js v3, graphology |
| 数据库 | PostgreSQL（物化视图 + 复合索引优化） |
| 社区发现 | `graphology-communities-louvain`（Louvain 算法） |
| 部署 | GitHub Actions + nginx（纯静态，零运行时依赖） |
| 依赖管理 | `uv`（后端）, `npm`（前端） |

## 🚀 快速开始（本地开发）

### 环境要求

- Python 3.14+
- Node.js 18+
- PostgreSQL 14+
- [uv](https://docs.astral.sh/uv/) 包管理器

### 安装步骤

#### 1. 克隆项目

```bash
git clone <repository-url>
cd rival-map
```

#### 2. 配置数据库

在 PostgreSQL 中创建数据库并导入数据后，创建后端 `.env` 文件：

```bash
cd backend
```

创建 `.env` 文件：

```env
DB_NAME=your_database
DB_USER=your_user
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
```

#### 3. 创建索引和物化视图

```bash
# 创建复合索引（5-20倍加速）
psql -U <user> -d <database> -f backend/create_indexes.sql

# 创建物化视图（宽松模式 8-26s → 0.1-0.5s）
psql -U <user> -d <database> -f backend/create_materialized_views.sql
```

> ⏱️ 首次创建物化视图可能需要 30-60 秒（取决于数据量），之后刷新只需几秒。

#### 4. 启动后端

```bash
cd backend
uv run uvicorn app.main:app --reload
```

后端将在 `http://localhost:8000` 启动，并**自动刷新物化视图**。

> 后端使用 `psycopg_pool.ConnectionPool`（min=5, max=20），在 FastAPI lifespan 中初始化。

#### 5. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端将在 `http://localhost:5173` 启动，浏览器自动打开。

## 🎮 使用指南

### 控制面板参数

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| 最小同场交手次数 | 1-10 | 2 | 两马至少共同参赛几次才算连线 |
| 最低生涯奖金 | 0-100,000 万日元 | 0 | 只保留奖金达到阈值的赛马 |
| G1最低名次 | 1-18 | 18（不限） | 只考虑名次达到阈值的参赛记录 |
| 严格模式 | 开/关 | 开 | 名次判定逻辑（见下方说明） |
| 按年份布局 | 开/关 | 关 | 开启后赛马按年份从左到右排列 |
| 始终显示所有马名 | 开/关 | 开 | 关闭后只在 hover 时显示马名 |
| **社区发现染色** | 开/关 | 关 | 使用 Louvain 算法按关系紧密程度为派系着色 |

### 社区发现（Louvain 算法）

勾选 **"社区发现染色（Louvain 算法）"** 后，系统会：
1. 对当前图谱运行 Louvain 社区发现算法
2. 自动识别关系最紧密的"派系"（如 98 黄金世代、周日宁静系子嗣群）
3. 为不同派系分配不同颜色（20 色调色板）
4. 在控制面板底部显示图例，标注各派系名称、马匹数量和占比

### 严格模式 vs 宽松模式

**严格模式**（勾选）：
> 两匹马必须在**同一场比赛**中都达到名次阈值，才计算连线。

**宽松模式**（取消勾选）：
> 只要两匹马**生涯中至少一次**达到名次阈值，它们**任何共同参赛**都计算连线。

#### 示例

假设名次阈值 = 3：

| 比赛 | 马 A 名次 | 马 B 名次 | 严格模式 | 宽松模式 |
|------|---------|---------|---------|---------|
| 东京 G1 | 2 ✅ | 1 ✅ | ✅ 计入 | ✅ 计入 |
| 京都 G1 | 5 ❌ | 3 ✅ | ❌ 不计 | ✅ 计入 |
| 阪神 G1 | 1 ✅ | 8 ❌ | ❌ 不计 | ✅ 计入 |

- 严格模式：weight = 1
- 宽松模式：weight = 3

## 📁 项目结构

```
rival-map/
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Actions 自动部署到 VPS
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI 应用，连接池 + lifespan 事件
│   │   ├── graph_service.py        # 核心查询逻辑（CTE / 物化视图自适应）
│   │   └── database.py             # PostgreSQL 连接池（psycopg_pool）
│   ├── scripts/
│   │   └── generate_static_data.py # 预计算静态 JSON 数据（VPS 部署用）
│   ├── static_data/
│   │   └── network/                # 生成的静态 JSON 数据（不纳入版本控制）
│   ├── create_indexes.sql          # 创建复合索引脚本
│   ├── create_materialized_views.sql  # 创建物化视图脚本
│   └── refresh_materialized_views.sql # 手动刷新物化视图脚本
├── frontend/
│   ├── src/
│   │   ├── main.ts                 # 入口文件（事件绑定、渲染流程）
│   │   ├── types.ts                # TypeScript 类型定义
│   │   ├── config/
│   │   │   └── sigmaConfig.ts      # Sigma.js 配置常量
│   │   ├── services/
│   │   │   ├── graphBuilder.ts     # 图数据构建（支持社区模式）
│   │   │   ├── rendererService.ts  # Sigma 渲染器管理
│   │   │   ├── interactionService.ts # Hover 高亮/Tooltip
│   │   │   └── panelService.ts     # 控制面板状态
│   │   ├── state/
│   │   │   └── appState.ts         # 全局状态管理
│   │   ├── utils/
│   │   │   ├── color.ts            # 颜色计算工具（奖金映射）
│   │   │   ├── formatters.ts       # 文本格式化
│   │   │   ├── community.ts        # Louvain 社区发现 + 调色板
│   │   │   └── communityUI.ts      # 社区图例渲染
│   │   └── algorithms/
│   │       └── graph.ts            # 图算法（两跳邻居等）
│   └── style.css                   # 样式（毛玻璃面板、图例、FAB 按钮）
└── README.md
```

## ⚡ 性能优化

### 数据库索引

| 索引名称 | 作用 | 预期加速 |
|---------|------|---------|
| `idx_race_details_g1` | 加速 G1/JG1 比赛过滤 | 5-10x |
| `idx_race_umas_g1_lookup` | 加速连线查询的 JOIN 和名次过滤 | 10-20x |
| `idx_race_umas_ketto` | 加速按马匹 ID 查询 | 5-10x |

### 物化视图

| 物化视图 | 内容 | 查询方式 |
|---------|------|---------|
| `mv_g1_horse_records` | 预计算所有 G1 参赛记录（避免重复 JOIN） | CTE 查询 |
| `mv_g1_horse_pairs` | 预计算所有马匹组合的共同参赛次数（避免 self-join） | 直接过滤 |

**性能对比：**

| 场景 | 无物化视图 | 有物化视图 |
|------|-----------|-----------|
| 严格模式 | 0.3s | 0.2-0.3s |
| 宽松模式 | 8-26s | **0.1-0.5s** |

### 连接池

后端使用 `psycopg_pool.ConnectionPool`（min_size=5, max_size=20），在 FastAPI 启动时初始化，关闭时清理。相比每次请求创建新连接，高并发下显著降低延迟和数据库压力。

### 物化视图刷新

**自动刷新**：后端每次启动时自动刷新物化视图。

**手动刷新**（数据更新后）：
```bash
psql -U <user> -d <database> -f backend/refresh_materialized_views.sql
```

**定时刷新**：建议在数据导入脚本末尾添加 `REFRESH MATERIALIZED VIEW` 命令，或设置 cron job 定期执行。

## 🔧 开发指南

### 后端开发

```bash
cd backend
uv run uvicorn app.main:app --reload  # 开发模式（端口 8000）
```

### 前端开发

```bash
cd frontend
npm run dev        # 开发模式（端口 5173）
npm run build      # 生产构建
npm run preview    # 预览生产构建
```

### 代码规范

- **后端**：使用 `psycopg3` 的 `dict_row` 返回字典格式结果；使用 `psycopg_pool.ConnectionPool` 管理连接
- **前端**：模块化设计，每个 service 负责单一职责；配置常量集中在 `sigmaConfig.ts`

## ⚠️ 注意事项

1. **数据库要求**：需要 `race_umas` 和 `race_details` 两张表，字段参见 `backend/create_indexes.sql` 中的查询
2. **CORS 配置**：后端默认允许 `localhost:5173` 和 `127.0.0.1:5173`，如需修改请编辑 `backend/app/main.py`
3. **首次启动慢**：首次创建物化视图可能需要 30-60 秒，之后刷新只需几秒

## 🌐 部署到 VPS

> VPS 上**不需要** Python、数据库或 Node.js，只需 nginx 即可。
> 项目以子路径方式部署在 `apophasis.top/rival-map/`，与 Astro 博客共存。

### 架构概览

```
apophasis.top/          → Astro 博客（/var/www/astro-blog/）
apophasis.top/rival-map → 赛马图谱（/var/www/rival-map/）
```

### 步骤 1：生成静态数据

在**有数据库的本地机器**上运行：

```bash
cd backend
uv run python scripts/generate_static_data.py
```

这会根据参数组合生成约 180 个 JSON 文件，存放在 `backend/static_data/network/` 目录下。

### 步骤 2：构建前端

```bash
cd frontend
npm run build
```

### 步骤 3：自动部署前端（GitHub Actions）

推送到 `master` 分支后，GitHub Actions 会自动：
1. 构建前端
2. 通过 rsync 部署到 `/var/www/rival-map/`

### 步骤 4：手动同步 JSON 数据

JSON 数据文件无法在 CI 中生成（需要访问 PostgreSQL），需要手动上传：

```bash
# 首次部署
rsync -rlvz --delete backend/static_data/network/ \
  $SERVER_USER@$SERVER_IP:/var/www/rival-map/data/network/

# 数据更新时
rsync -rlvz --delete backend/static_data/network/ \
  $SERVER_USER@$SERVER_IP:/var/www/rival-map/data/network/
```

> 建议在 `~/.ssh/config` 中配置 VPS 别名，或使用 SSH agent 转发简化操作。

### 步骤 5：nginx 配置

在现有博客的 nginx `server` 块中追加一个 location：

```nginx
server {
    server_name apophasis.top www.apophasis.top;

    # 博客（根路径，不变）
    root /var/www/astro-blog;
    index index.html;

    # ... 博客的现有配置不变 ...

    # rival-map 子路径
    location /rival-map/ {
        alias /var/www/rival-map/;
        index index.html;
        try_files $uri $uri/ /rival-map/index.html;

        # JSON 文件缓存 1 天
        location ~* \.json$ {
            expires 1d;
            add_header Cache-Control "public, max-age=86400";
        }
    }
}
```

重载 nginx：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### VPS 目录结构

```
/var/www/
├── astro-blog/          ← Astro 博客（不变）
│   └── ...
└── rival-map/           ← 赛马图谱
    ├── index.html
    ├── assets/
    │   ├── index-xxx.css
    │   └── index-xxx.js
    └── data/
        └── network/
            ├── 1_0_18_true.json
            ├── 1_0_18_false.json
            └── ...
```

## 📄 许可证

[MIT License](LICENSE)

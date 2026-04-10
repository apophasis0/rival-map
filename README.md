# 🐎 Rival Map — JRA 赛马宿敌网络可视化

> 一个交互式力导向图可视化工具，展示日本中央竞马会（JRA）赛马之间的竞争关系。

## ✨ 功能亮点

- **交互式图谱**：节点 = 赛马，边 = 共同参加 G1/JG1 比赛
- **多维过滤**：按共同参赛次数、奖金、名次阈值筛选
- **严格/宽松模式**：灵活控制连线的名次判定逻辑
- **时间轴布局**：可选按年份从左到右排列赛马
- **Hover 高亮**：鼠标悬停时高亮 1-hop/2-hop 邻居节点和边
- **毛玻璃控制面板**：可折叠的控制面板，支持状态持久化
- **高性能查询**：使用物化视图和复合索引优化数据库查询

## 🖥️ 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.14+, FastAPI, psycopg3, uvicorn |
| 前端 | TypeScript, Vite, Sigma.js v3, graphology |
| 数据库 | PostgreSQL（物化视图 + 复合索引优化） |
| 依赖管理 | `uv`（后端）, `npm`（前端） |

## 🚀 快速开始

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
cp .env.example .env  # 如果没有 .env.example，手动创建
```

编辑 `.env` 填入数据库连接信息：

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

## 📡 API 文档

### `GET /api/network`

获取赛马网络图谱数据。

#### 请求参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `minWeight` | int | 2 | 最小共同参赛次数 |
| `minPrize` | float | 0.0 | 最低奖金（万日元） |
| `maxRank` | int | 18 | 最低名次阈值（`kakutei_jyuni <= maxRank`） |
| `strictMode` | bool | true | 是否启用严格名次模式 |

#### 响应格式

```json
{
  "nodes": [
    {
      "id": "2023100001",
      "name": "キタサンブラック",
      "sex": "male",
      "prize_score": 18750.0,
      "active_year": 2016
    }
  ],
  "links": [
    {
      "source": "2023100001",
      "target": "2023100002",
      "weight": 3
    }
  ]
}
```

## 📁 项目结构

```
rival-map/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI 应用，lifespan 事件自动刷新物化视图
│   │   ├── graph_service.py      # 核心查询逻辑（CTE / 物化视图自适应）
│   │   └── database.py           # PostgreSQL 连接（psycopg3, dict_row）
│   ├── create_indexes.sql        # 创建复合索引脚本
│   ├── create_materialized_views.sql  # 创建物化视图脚本
│   └── refresh_materialized_views.sql # 手动刷新物化视图脚本
├── frontend/
│   ├── src/
│   │   ├── main.ts               # 入口文件（事件绑定、渲染流程）
│   │   ├── types.ts              # TypeScript 类型定义
│   │   ├── config/
│   │   │   └── sigmaConfig.ts    # Sigma.js 配置常量
│   │   ├── services/
│   │   │   ├── graphBuilder.ts       # 图数据构建
│   │   │   ├── rendererService.ts    # Sigma 渲染器管理
│   │   │   ├── interactionService.ts # Hover 高亮/Tooltip
│   │   │   └── panelService.ts       # 控制面板状态
│   │   ├── state/
│   │   │   └── appState.ts       # 全局状态管理
│   │   ├── utils/
│   │   │   ├── color.ts          # 颜色计算工具
│   │   │   └── formatters.ts     # 文本格式化
│   │   └── algorithms/
│   │       └── graph.ts          # 图算法（两跳邻居等）
│   └── style.css                 # 样式（毛玻璃面板、FAB 按钮）
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

- **后端**：使用 `psycopg3` 的 `dict_row` 返回字典格式结果；不使用连接池，每次请求创建新连接
- **前端**：模块化设计，每个 service 负责单一职责；配置常量集中在 `sigmaConfig.ts`

## ⚠️ 注意事项

1. **数据库要求**：需要 `race_umas` 和 `race_details` 两张表，字段参见 `backend/create_indexes.sql` 中的查询
2. **CORS 配置**：后端默认允许 `localhost:5173` 和 `127.0.0.1:5173`，如需修改请编辑 `backend/app/main.py`
3. **首次启动慢**：首次创建物化视图可能需要 30-60 秒，之后刷新只需几秒

## 📄 许可证

[MIT License](LICENSE)

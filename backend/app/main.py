import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from .database import get_db_connection, init_db_pool, close_db_pool
from .graph_service import fetch_horse_network

logger = logging.getLogger("rival_map")
logging.basicConfig(level=logging.INFO)


def refresh_materialized_views():
    """
    刷新物化视图，确保查询使用最新数据。
    如果物化视图不存在，则跳过（首次部署时还未创建）。
    """
    try:
        with get_db_connection() as conn:
            # 检查物化视图是否存在
            result = conn.execute("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_g1_horse_records'
                )
            """).fetchone()

            if not result or not result.get('exists'):
                logger.info("[MV] 物化视图不存在，跳过刷新")
                return

            # 刷新两个物化视图
            logger.info("[MV] 开始刷新物化视图...")
            conn.execute("REFRESH MATERIALIZED VIEW mv_g1_horse_records")
            conn.commit()
            logger.info("[MV] mv_g1_horse_records 刷新完成")

            conn.execute("REFRESH MATERIALIZED VIEW mv_g1_horse_pairs")
            conn.commit()
            logger.info("[MV] mv_g1_horse_pairs 刷新完成")

            logger.info("[MV] 所有物化视图刷新完成！")
    except Exception as e:
        logger.warning(f"[MV] 物化视图刷新失败（可能是首次部署，还未创建物化视图）: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动时初始化连接池，关闭时清理"""
    init_db_pool()
    refresh_materialized_views()
    yield
    close_db_pool()


app = FastAPI(title="JRA Network API", lifespan=lifespan)

# 配置 CORS，允许前端 Vite (通常在 5173 端口) 跨域请求后端 API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/network")
async def get_network(
    min_weight: int = Query(2, alias="minWeight"),
    min_prize: float = Query(0.0, alias="minPrize"),
    max_rank: int = Query(18, alias="maxRank"),
    strict_mode: bool = Query(True, alias="strictMode")
):
    """
    接收前端传来的参数，动态调整图谱密度和质量
    min_weight: 至少共同参赛几次才算连线
    min_prize: 最低奖金阈值（万円）
    max_rank: 最低名次阈值（kakutei_jyuni <= max_rank）
    strict_mode: 名次过滤模式（True=严格模式，False=宽松模式）
    """
    data = fetch_horse_network(
        min_intersections=min_weight,
        min_prize=min_prize,
        max_rank=max_rank,
        strict_rank_mode=strict_mode
    )
    return data

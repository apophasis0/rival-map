import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from .database import get_db_connection, init_db_pool, close_db_pool
from .graph_service import fetch_horse_network, fetch_pedigree_links

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

# 配置 CORS，允许前端跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://apophasis.top",
        "https://www.apophasis.top",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/network")
async def get_network(
    min_weight: int = Query(2, alias="minWeight"),
    min_prize: float = Query(0.0, alias="minPrize"),
    max_rank: int = Query(18, alias="maxRank"),
    strict_mode: bool = Query(True, alias="strictMode"),
    include_sire: bool = Query(False, alias="includeSire"),
    include_dam: bool = Query(False, alias="includeDam")
):
    """
    获取赛马网络图谱数据（仅宿敌边 + 可选的血统边）
    """
    data = fetch_horse_network(
        min_intersections=min_weight,
        min_prize=min_prize,
        max_rank=max_rank,
        strict_rank_mode=strict_mode
    )

    # 如果需要血统边，查询并添加到 links 中
    parent_types = []
    if include_sire:
        parent_types.append("sire")
    if include_dam:
        parent_types.append("dam")

    if parent_types and data["nodes"]:
        node_ids = [n["id"] for n in data["nodes"]]
        pedigree_links = fetch_pedigree_links(node_ids, parent_types=parent_types)

        # 为宿敌边添加 linkType
        for link in data["links"]:
            link["linkType"] = "rival"

        # 合并两种边
        data["links"].extend(pedigree_links)

    return data


@app.get("/api/pedigree")
async def get_pedigree(
    min_weight: int = Query(2, alias="minWeight"),
    min_prize: float = Query(0.0, alias="minPrize"),
    max_rank: int = Query(18, alias="maxRank"),
    strict_mode: bool = Query(True, alias="strictMode"),
    include_sire: bool = Query(False, alias="includeSire"),
    include_dam: bool = Query(False, alias="includeDam")
):
    """
    仅返回血统边（轻量端点，用于在已有图上叠加血统边）
    """
    # 先获取节点列表
    rival_data = fetch_horse_network(
        min_intersections=min_weight,
        min_prize=min_prize,
        max_rank=max_rank,
        strict_rank_mode=strict_mode
    )

    if not rival_data["nodes"]:
        return {"links": []}

    parent_types = []
    if include_sire:
        parent_types.append("sire")
    if include_dam:
        parent_types.append("dam")

    node_ids = [n["id"] for n in rival_data["nodes"]]
    valid_ids = set(node_ids)
    pedigree_links = fetch_pedigree_links(node_ids, parent_types=parent_types if parent_types else None)

    # 只返回两端节点都在图谱中的血统边
    links = [
        {**link, "linkType": link["linkType"]}
        for link in pedigree_links
        if link["source"] in valid_ids and link["target"] in valid_ids
    ]

    return {"links": links}

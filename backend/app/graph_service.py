import time
from .database import get_db_connection


MV_GRADE_CODES = {
    "g1_only": ("'g1'", "'jg1'"),
    "g1_g2": ("'g1'", "'jg1'", "'g2'", "'jg2'"),
}


def _has_materialized_views(conn):
    """检查新物化视图是否存在且已填充"""
    try:
        result = conn.execute("""
            SELECT ispopulated FROM pg_matviews
            WHERE matviewname = 'mv_g1g2_horse_pairs'
        """).fetchone()
        return result is not None and result['ispopulated']
    except Exception:
        return False


def fetch_pedigree_links(
    node_ids: list[str],
    parent_types: list[str] | None = None
) -> list[dict]:
    """
    查询给定节点 ID 列表中马匹的血统关系（父子/母子）
    仅返回 source 和 target 都在 node_ids 中的边

    parent_types: 要查询的血统类型，如 ['sire'] / ['dam'] / ['sire', 'dam']
                  为 None 时查询全部

    返回: [{ source: parent_ketto_num, target: child_ketto_num, linkType: 'sire'|'dam' }]
    """
    if not node_ids:
        return []

    type_filter = ""
    if parent_types:
        placeholders = ", ".join([f"'{t}'" for t in parent_types])
        type_filter = f" AND parent_type.parent_type IN ({placeholders})"

    with get_db_connection() as conn:
        # umas 表中包含 ketto_info_hansyoku_nums 数组字段
        # PostgreSQL 数组 1-indexed: [1]=父, [2]=母
        query = f"""
                 SELECT DISTINCT ON (u.ketto_num, parent_type.ketto_num)
                        u.ketto_num                                            AS child,
                        parent_type.ketto_num                                  AS parent,
                        parent_type.parent_type
                 FROM umas u
                          LEFT JOIN LATERAL (
                     SELECT h.ketto_num, 'sire' AS parent_type
                     FROM hansyokus h
                     WHERE h.hansyoku_num = (u.ketto_info_hansyoku_nums)[1]
                       AND h.ketto_num IS NOT NULL
                     UNION ALL
                     SELECT h.ketto_num, 'dam' AS parent_type
                     FROM hansyokus h
                     WHERE h.hansyoku_num = (u.ketto_info_hansyoku_nums)[2]
                       AND h.ketto_num IS NOT NULL
                 ) parent_type ON true
                 WHERE u.ketto_num = ANY(%(horse_ids)s)
                   AND parent_type.ketto_num = ANY(%(horse_ids)s)
                   {type_filter}
                 """
        rows = conn.execute(query, {"horse_ids": node_ids}).fetchall()

        links = []
        for row in rows:
            links.append({
                "source": row["parent"],
                "target": row["child"],
                "linkType": row["parent_type"],
            })

        return links


def fetch_horse_network(
    min_intersections: int = 2,
    min_prize: float = 0.0,
    max_rank: int = 18,
    strict_rank_mode: bool = True,
    include_g2: bool = False
):
    """
    查询马匹竞争网络，使用 CTE 或物化视图优化查询性能

    min_intersections: 至少共同参加过几次比赛才算"宿敌"
    min_prize: 最低奖金阈值
    max_rank: 最低名次阈值（kakutei_jyuni <= max_rank 才算有效成绩）
    strict_rank_mode: 名次过滤模式
        - True (严格模式): 两匹马必须在**同一场比赛**中都达到名次阈值，才计算连线
        - False (宽松模式): 只要两匹马**生涯中至少一次**达到名次阈值，任何共同参赛都计算连线
    include_g2: 是否将 G2/JG2 比赛也计入统计
    """
    t_start = time.time()

    with get_db_connection() as conn:
        # 检查是否可以使用物化视图
        use_mv = _has_materialized_views(conn)

        if use_mv:
            link_query, query_params = _build_query_with_mv(
                min_intersections, max_rank, strict_rank_mode, include_g2=include_g2
            )
        else:
            link_query, query_params = _build_query_cte(
                min_intersections, max_rank, strict_rank_mode, include_g2=include_g2
            )

        t_query1 = time.time()
        raw_links = conn.execute(link_query, query_params).fetchall()
        t_query1_end = time.time()

        # 收集所有出现在连线中的独特马匹 ID
        candidate_horse_ids = set()
        for link in raw_links:
            candidate_horse_ids.add(link['source'])
            candidate_horse_ids.add(link['target'])

        if not candidate_horse_ids:
            print(f"[Perf] No links found. Total time: {time.time() - t_start:.3f}s")
            return {"nodes": [], "links": []}

        # 节点查询
        node_query = """
                     SELECT ketto_num                                          as id,
                            MAX(bamei)                                         as name,
                            MAX(sex_cd)                                        as sex,
                            SUM(honsyokin + fukasyokin)::numeric / 100.0     as prize_score,
                            MIN(SUBSTRING(race_date::text, 1, 4))::integer     as active_year
                     FROM race_umas
                     WHERE ketto_num = ANY (%(horse_ids)s)
                     GROUP BY ketto_num
                     HAVING SUM(honsyokin + fukasyokin)::numeric / 100.0 >= %(min_prize)s
                     """
        nodes = conn.execute(node_query, {
            "horse_ids": list(candidate_horse_ids),
            "min_prize": min_prize,
        }).fetchall()
        t_query2_end = time.time()

        # 清理连线：移除因奖金过滤而被孤立的边
        valid_node_ids = {node['id'] for node in nodes}
        links = [
            link for link in raw_links
            if link['source'] in valid_node_ids and link['target'] in valid_node_ids
        ]

        t_total = time.time() - t_start
        mode_str = "严格" if strict_rank_mode else "宽松"
        g2_str = "+G2" if include_g2 else ""
        engine_str = f"MV{g2_str}" if use_mv else f"CTE{g2_str}"
        print(f"[Perf] [{mode_str}模式/{engine_str}] Links: {len(links)}/{len(raw_links)}, Nodes: {len(nodes)}/{len(candidate_horse_ids)}")
        print(f"[Perf] Query1 (links): {t_query1_end - t_query1:.3f}s, Query2 (nodes): {t_query2_end - t_query1_end:.3f}s, Total: {t_total:.3f}s")

        return {"nodes": nodes, "links": links}


def _build_query_with_mv(min_intersections: int, max_rank: int, strict_rank_mode: bool, include_g2: bool = False):
    """使用物化视图构建查询

    物化视图 mv_g1g2_* 包含 G1/JG1/G2/JG2 数据，通过 grade_cd 字段动态过滤
    """
    grades = MV_GRADE_CODES["g1_g2"] if include_g2 else MV_GRADE_CODES["g1_only"]
    grade_filter = f"grade_cd IN ({', '.join(grades)})"

    if strict_rank_mode:
        # 严格模式：需要重新计算，只考虑双方都达标的比赛
        # 使用 mv_g1g2_horse_records 而不是 mv_g1g2_horse_pairs
        query = f"""
                 WITH qualified_records AS (
                     SELECT ketto_num, race_date, jyo_cd, kaiji, nichiji, race_num, umaban
                     FROM mv_g1g2_horse_records
                     WHERE {grade_filter}
                       AND kakutei_jyuni <= %(max_rank)s
                 ),
                 horse_pairs AS (
                     SELECT r1.ketto_num AS source,
                            r2.ketto_num AS target,
                            COUNT(*)      AS weight
                     FROM qualified_records r1
                              JOIN qualified_records r2 ON r1.race_date = r2.race_date
                         AND r1.jyo_cd = r2.jyo_cd
                         AND r1.kaiji = r2.kaiji
                         AND r1.nichiji = r2.nichiji
                         AND r1.race_num = r2.race_num
                         AND r1.umaban < r2.umaban
                     GROUP BY r1.ketto_num, r2.ketto_num
                     HAVING COUNT(*) >= %(min_intersections)s
                 )
                 SELECT source, target, weight FROM horse_pairs
                 """
    else:
        # 宽松模式：从预计算的 pairs 中直接过滤
        # 需要先过滤 records 得到合格马匹，再从 pairs 中筛选
        query = f"""
                 WITH qualified_horses AS (
                     SELECT DISTINCT ketto_num
                     FROM mv_g1g2_horse_records
                     WHERE {grade_filter}
                       AND kakutei_jyuni <= %(max_rank)s
                 )
                 SELECT p.source, p.target, p.weight
                 FROM mv_g1g2_horse_pairs p
                 WHERE p.source IN (SELECT ketto_num FROM qualified_horses)
                   AND p.target IN (SELECT ketto_num FROM qualified_horses)
                 """
    return query, {"max_rank": max_rank, "min_intersections": min_intersections}


def fetch_track_prizes(
    min_prize: float = 0.0,
    max_rank: int = 18,
    strict_rank_mode: bool = True,
    include_g2: bool = False
) -> list[dict]:
    """
    查询每匹马在不同场地类型的累计奖金

    返回: [{ "id": ketto_num, "turfPrize": float, "dirtPrize": float }]
    """
    with get_db_connection() as conn:
        # 根据 include_g2 动态生成 grade_cd 过滤条件
        if include_g2:
            grade_filter = "rd.grade_cd IN ('g1', 'jg1', 'g2', 'jg2')"
        else:
            grade_filter = "rd.grade_cd IN ('g1', 'jg1')"

        # race_umas.honsyokin 和 fukasyokin 已经是该马在该场获得的奖金（百日元）
        # track_cd::text 前4位判断: turf=草地, dirt=泥地, hurd=跳栏
        query = f"""
                 WITH qualified_records AS (
                     SELECT ru.ketto_num,
                            rd.track_cd::text AS track_type,
                            ru.honsyokin + ru.fukasyokin AS prize
                     FROM race_umas ru
                              JOIN race_details rd ON ru.race_date = rd.race_date
                         AND ru.jyo_cd = rd.jyo_cd
                         AND ru.kaiji = rd.kaiji
                         AND ru.nichiji = rd.nichiji
                         AND ru.race_num = rd.race_num
                     WHERE {grade_filter}
                       AND ru.ketto_num <> '0000000000'
                       AND rd.data_kubun IN ('7', 'A', 'B')
                       AND ru.kakutei_jyuni > 0
                       AND ru.kakutei_jyuni <= %(max_rank)s
                 ),
                 track_prizes AS (
                     SELECT ketto_num,
                            track_type,
                            SUM(prize)::numeric / 100.0 AS total_prize
                     FROM qualified_records
                     GROUP BY ketto_num, track_type
                     HAVING SUM(prize)::numeric / 100.0 >= %(min_prize)s
                 )
                 SELECT ketto_num AS id,
                        COALESCE(SUM(CASE WHEN track_type LIKE 'turf%%'
                                          THEN total_prize ELSE 0 END), 0) AS turf_prize,
                        COALESCE(SUM(CASE WHEN track_type LIKE 'dirt%%'
                                          THEN total_prize ELSE 0 END), 0) AS dirt_prize,
                        COALESCE(SUM(CASE WHEN track_type LIKE 'hurd%%'
                                          THEN total_prize ELSE 0 END), 0) AS hurd_prize
                 FROM track_prizes
                 GROUP BY ketto_num
                 """
        rows = conn.execute(query, {
            "max_rank": max_rank,
            "min_prize": min_prize,
        }).fetchall()

        result = []
        for row in rows:
            result.append({
                "id": row["id"],
                "turfPrize": float(row["turf_prize"]),
                "dirtPrize": float(row["dirt_prize"]),
                "hurdPrize": float(row["hurd_prize"]),
            })

        return result


def _build_query_cte(min_intersections: int, max_rank: int, strict_rank_mode: bool, include_g2: bool = False):
    """不使用物化视图，使用 CTE 构建查询（回退方案）"""
    # 根据 include_g2 动态生成 grade_cd 过滤条件
    if include_g2:
        grade_filter = "rd.grade_cd IN ('g1', 'jg1', 'g2', 'jg2')"
    else:
        grade_filter = "rd.grade_cd IN ('g1', 'jg1')"

    if strict_rank_mode:
        # 严格模式
        query = f"""
                 WITH g1_records AS (
                     SELECT ru.ketto_num, ru.umaban,
                            ru.race_date, ru.jyo_cd, ru.kaiji, ru.nichiji, ru.race_num
                     FROM race_umas ru
                              JOIN race_details rd ON ru.race_date = rd.race_date
                         AND ru.jyo_cd = rd.jyo_cd
                         AND ru.kaiji = rd.kaiji
                         AND ru.nichiji = rd.nichiji
                         AND ru.race_num = rd.race_num
                     WHERE {grade_filter}
                       AND ru.ketto_num <> '0000000000'
                       AND rd.data_kubun IN ('7', 'A', 'B')
                       AND ru.kakutei_jyuni > 0
                       AND ru.kakutei_jyuni <= %(max_rank)s
                 ),
                 horse_pairs AS (
                     SELECT r1.ketto_num AS source,
                            r2.ketto_num AS target,
                            COUNT(*)      AS weight
                     FROM g1_records r1
                              JOIN g1_records r2 ON r1.race_date = r2.race_date
                         AND r1.jyo_cd = r2.jyo_cd
                         AND r1.kaiji = r2.kaiji
                         AND r1.nichiji = r2.nichiji
                         AND r1.race_num = r2.race_num
                         AND r1.umaban < r2.umaban
                     GROUP BY r1.ketto_num, r2.ketto_num
                     HAVING COUNT(*) >= %(min_intersections)s
                 )
                 SELECT source, target, weight FROM horse_pairs
                 """
    else:
        # 宽松模式（优化版：使用 INNER JOIN 替代 IN SELECT）
        query = f"""
                 WITH qualified_horses AS (
                     SELECT DISTINCT ru.ketto_num
                     FROM race_umas ru
                              JOIN race_details rd ON ru.race_date = rd.race_date
                         AND ru.jyo_cd = rd.jyo_cd
                         AND ru.kaiji = rd.kaiji
                         AND ru.nichiji = rd.nichiji
                         AND ru.race_num = rd.race_num
                     WHERE {grade_filter}
                       AND ru.ketto_num <> '0000000000'
                       AND rd.data_kubun IN ('7', 'A', 'B')
                       AND ru.kakutei_jyuni > 0
                       AND ru.kakutei_jyuni <= %(max_rank)s
                 ),
                 qualified_g1_records AS (
                     SELECT ru.ketto_num, ru.umaban,
                            ru.race_date, ru.jyo_cd, ru.kaiji, ru.nichiji, ru.race_num
                     FROM race_umas ru
                              INNER JOIN qualified_horses qh ON ru.ketto_num = qh.ketto_num
                              JOIN race_details rd ON ru.race_date = rd.race_date
                         AND ru.jyo_cd = rd.jyo_cd
                         AND ru.kaiji = rd.kaiji
                         AND ru.nichiji = rd.nichiji
                         AND ru.race_num = rd.race_num
                     WHERE {grade_filter}
                       AND ru.ketto_num <> '0000000000'
                       AND rd.data_kubun IN ('7', 'A', 'B')
                       AND ru.kakutei_jyuni > 0
                 ),
                 horse_pairs AS (
                     SELECT r1.ketto_num AS source,
                            r2.ketto_num AS target,
                            COUNT(*)      AS weight
                     FROM qualified_g1_records r1
                              JOIN qualified_g1_records r2 ON r1.race_date = r2.race_date
                         AND r1.jyo_cd = r2.jyo_cd
                         AND r1.kaiji = r2.kaiji
                         AND r1.nichiji = r2.nichiji
                         AND r1.race_num = r2.race_num
                         AND r1.umaban < r2.umaban
                     GROUP BY r1.ketto_num, r2.ketto_num
                     HAVING COUNT(*) >= %(min_intersections)s
                 )
                 SELECT source, target, weight FROM horse_pairs
                 """
    return query, {"max_rank": max_rank, "min_intersections": min_intersections}

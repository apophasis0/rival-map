import pandas as pd
from .database import get_db_connection


def fetch_horse_network(min_intersections: int = 2, min_prize: float = 0.0):
    """
    min_intersections: 至少共同参加过几次比赛才算“宿敌”
    min_prize: 最低奖金阈值
    """
    with get_db_connection() as conn:
        # 1. 提取连线：查找同场竞技的马对
        link_query = """
                     SELECT se1.ketto_num AS source, \
                            se2.ketto_num AS target, \
                            COUNT(*)      as weight
                     FROM race_umas se1
                              JOIN race_details ra ON se1.race_date = ra.race_date
                         AND se1.jyo_cd = ra.jyo_cd
                         AND se1.kaiji = ra.kaiji
                         AND se1.nichiji = ra.nichiji
                         AND se1.race_num = ra.race_num
                              JOIN race_umas se2 ON se1.race_date = se2.race_date
                         AND se1.jyo_cd = se2.jyo_cd
                         AND se1.kaiji = se2.kaiji
                         AND se1.nichiji = se2.nichiji
                         AND se1.race_num = se2.race_num
                         AND se1.umaban < se2.umaban
                     WHERE true
                       AND grade_cd IN ('g1', 'jg1')
                       AND ra.data_kubun = '7'
                     GROUP BY se1.ketto_num, se2.ketto_num
                     HAVING COUNT(*) >= %s \
                     """
        raw_links = conn.execute(link_query, [min_intersections]).fetchall()

        # 收集所有出现在连线中的独特马匹 ID
        candidate_horse_ids = set()
        for link in raw_links:
            candidate_horse_ids.add(link['source'])
            candidate_horse_ids.add(link['target'])

        if not candidate_horse_ids:
            return {"nodes": [], "links": []}

        # 2. 提取节点：计算奖金，并直接在 SQL 层面过滤掉奖金不达标的马
        node_query = """
                     SELECT ketto_num                                      as id, \
                            MAX(bamei)                                     as name, \
                            MAX(sex_cd)                                    as sex, \
                            SUM(honsyokin + fukasyokin)::numeric / 100.0 as prize_score, \
                            MIN(SUBSTRING(race_date::text, 1, 4))::integer as active_year
                     FROM race_umas
                     WHERE ketto_num = ANY (%s)
                     GROUP BY ketto_num
                     -- 【新增】：只保留总奖金大于等于设定阈值的马匹
                     HAVING SUM(honsyokin + fukasyokin)::numeric / 100.0 >= %s \
                     """
        # 传入 candidate_horse_ids 列表和 min_prize 阈值
        nodes = conn.execute(node_query, [list(candidate_horse_ids), min_prize]).fetchall()

        # 3. 极其关键的一步：清理连线
        # 如果 A 和 B 比赛过，但 A 因为奖金太低被过滤掉了，我们需要把 A-B 的连线也删掉
        valid_node_ids = {node['id'] for node in nodes}
        links = [
            link for link in raw_links
            if link['source'] in valid_node_ids and link['target'] in valid_node_ids
        ]

        return {"nodes": nodes, "links": links}

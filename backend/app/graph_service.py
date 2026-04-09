import pandas as pd
from .database import get_db_connection

def fetch_horse_network(min_intersections: int = 2):
    """
    min_intersections: 至少共同参加过几次比赛才算“宿敌”
    """
    with get_db_connection() as conn:
        # 1. 提取连线：查找同场竞技的马对
        # 假设表名是 race_results，字段包含 race_id, horse_id, horse_name
        link_query = """
            SELECT 
                se1.ketto_num AS source, 
                se2.ketto_num AS target, 
                COUNT(*) as weight
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
            HAVING COUNT(*) >= %s
        """
        links = conn.execute(link_query, [min_intersections]).fetchall()

        # 2. 提取节点：从连线中反推涉及到的马，并补充基础信息（如总奖金）
        # 这里为了演示简单，我们直接从连线中提取去重马名
        horse_ids = set()
        for link in links:
            horse_ids.add(link['source'])
            horse_ids.add(link['target'])

        # 查询这些马的统计信息作为节点属性
        node_query = """
            SELECT 
                ketto_num as id, 
                SUM(honsyokin + fukasyokin)::numeric / 10000.0 as prize_score
            FROM race_umas
            WHERE ketto_num = ANY(%s)
            GROUP BY ketto_num
        """
        nodes = conn.execute(node_query, [list(horse_ids)]).fetchall()

        return {"nodes": nodes, "links": links}

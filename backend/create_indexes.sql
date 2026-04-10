-- =====================================================
-- JRA 赛马数据库性能优化索引
-- 执行方式: psql -U <user> -d <database> -f create_indexes.sql
-- =====================================================

-- 1. 加速 race_details 表的 G1/JG1 过滤和 JOIN
-- 用途: 快速定位所有 G1/JG1 比赛记录
CREATE INDEX IF NOT EXISTS idx_race_details_g1
ON race_details(grade_cd, data_kubun, race_date, jyo_cd, kaiji, nichiji, race_num)
WHERE grade_cd IN ('g1', 'jg1') AND data_kubun = '7';

-- 2. 加速 race_umas 表的 JOIN 和名次过滤（部分索引）
-- 用途: 连线查询时快速找到正式完赛且名次达标的马匹
-- 注意: 使用 WHERE 条件创建部分索引，只包含有效成绩，节省空间
CREATE INDEX IF NOT EXISTS idx_race_umas_g1_lookup
ON race_umas(race_date, jyo_cd, kaiji, nichiji, race_num, umaban, ketto_num, kakutei_jyuni, honsyokin, fukasyokin, sex_cd)
WHERE kakutei_jyuni > 0;

-- 3. 加速按马匹 ID 查询（节点查询使用）
-- 用途: 根据 ketto_num 快速定位马匹的所有参赛记录
CREATE INDEX IF NOT EXISTS idx_race_umas_ketto
ON race_umas(ketto_num, race_date, jyo_cd, kaiji, nichiji, race_num, honsyokin, fukasyokin, kakutei_jyuni);

-- 4. 可选：如果经常单独查询某匹马的奖金，添加此索引
CREATE INDEX IF NOT EXISTS idx_race_umas_ketto_prize
ON race_umas(ketto_num)
INCLUDE (honsyokin, fukasyokin, bamei, sex_cd, race_date);

-- =====================================================
-- 验证索引创建是否成功
-- =====================================================
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('race_umas', 'race_details')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- =====================================================
-- 查看索引大小（可选）
-- =====================================================
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexname::text)) AS index_size
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
ORDER BY pg_relation_size(indexname::text) DESC;

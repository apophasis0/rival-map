-- =====================================================
-- JRA 赛马数据库物化视图 - 加速 G1/G2 网络查询
-- 执行方式: psql -U <user> -d <database> -f create_materialized_views.sql
-- =====================================================

-- =====================================================
-- 1. 物化视图：预计算所有 G1/G2 参赛记录
-- =====================================================
DROP MATERIALIZED VIEW IF EXISTS mv_g1g2_horse_pairs CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_g1_horse_pairs CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_g1g2_horse_records CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_g1_horse_records CASCADE;

CREATE MATERIALIZED VIEW mv_g1g2_horse_records AS
SELECT
    ru.ketto_num,
    ru.umaban,
    ru.race_date,
    ru.jyo_cd,
    ru.kaiji,
    ru.nichiji,
    ru.race_num,
    ru.kakutei_jyuni,
    ru.honsyokin,
    ru.fukasyokin,
    ru.sex_cd,
    rd.grade_cd
FROM race_umas ru
JOIN race_details rd ON ru.race_date = rd.race_date
    AND ru.jyo_cd = rd.jyo_cd
    AND ru.kaiji = rd.kaiji
    AND ru.nichiji = rd.nichiji
    AND ru.race_num = rd.race_num
WHERE rd.grade_cd IN ('g1', 'jg1', 'g2', 'jg2')
  AND rd.data_kubun IN ('7', 'A', 'B')
  AND ru.ketto_num <> '0000000000'
  AND ru.kakutei_jyuni > 0;

-- 创建索引
CREATE INDEX idx_mv_g1g2_ketto ON mv_g1g2_horse_records(ketto_num);
CREATE INDEX idx_mv_g1g2_race ON mv_g1g2_horse_records(race_date, jyo_cd, kaiji, nichiji, race_num, umaban);
CREATE INDEX idx_mv_g1g2_rank ON mv_g1g2_horse_records(kakutei_jyuni);
CREATE INDEX idx_mv_g1g2_grade ON mv_g1g2_horse_records(grade_cd);

-- =====================================================
-- 2. 物化视图：预计算所有马匹组合的共同参赛次数
--    这是最耗时的 self-join，预先计算后查询只需毫秒级
-- =====================================================
CREATE MATERIALIZED VIEW mv_g1g2_horse_pairs AS
SELECT
    r1.ketto_num AS source,
    r2.ketto_num AS target,
    COUNT(*) AS weight
FROM mv_g1g2_horse_records r1
JOIN mv_g1g2_horse_records r2 ON r1.race_date = r2.race_date
    AND r1.jyo_cd = r2.jyo_cd
    AND r1.kaiji = r2.kaiji
    AND r1.nichiji = r2.nichiji
    AND r1.race_num = r2.race_num
    AND r1.umaban < r2.umaban
GROUP BY r1.ketto_num, r2.ketto_num;

-- 创建索引
CREATE INDEX idx_mv_g1g2_pairs_source ON mv_g1g2_horse_pairs(source);
CREATE INDEX idx_mv_g1g2_pairs_target ON mv_g1g2_horse_pairs(target);
CREATE INDEX idx_mv_g1g2_pairs_weight ON mv_g1g2_horse_pairs(weight);

-- =====================================================
-- 验证创建是否成功
-- =====================================================
SELECT matviewname, hasindexes, ispopulated
FROM pg_matviews
WHERE matviewname LIKE 'mv_g1g2_%'
ORDER BY matviewname;

-- 查看物化视图统计信息
SELECT
    matviewname,
    pg_size_pretty(pg_relation_size(matviewname::text)) AS size
FROM pg_matviews
WHERE matviewname LIKE 'mv_g1g2_%'
ORDER BY pg_relation_size(matviewname::text) DESC;

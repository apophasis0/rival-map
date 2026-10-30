-- =====================================================
-- rival-map：在统一数据库 jvlink 中创建 G1/G2 物化视图
--
-- 生产环境已不再使用独立的 rival_map 库，后端直接读取 jvlink。
-- 该脚本只创建 rival-map 需要的两个物化视图及其索引，
-- 不会修改 jvlink 的基础表，也不会重建基础表索引。
--
-- 首次初始化或在 jvlink 中重建视图时执行：
--   psql -h 127.0.0.1 -U jvadmin -d jvlink -v ON_ERROR_STOP=1 \
--     -f backend/setup_jvlink_matviews.sql
--
-- 注意：执行期间会短暂删除旧视图；应用启动后会自动刷新视图，
--       也可手动执行 REFRESH MATERIALIZED VIEW CONCURRENTLY。
-- =====================================================

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS public.mv_g1g2_horse_pairs CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_g1g2_horse_records CASCADE;

-- 预计算所有 G1/JG1/G2/JG2 参赛记录
CREATE MATERIALIZED VIEW public.mv_g1g2_horse_records AS
SELECT ru.ketto_num,
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
FROM public.race_umas ru
JOIN public.race_details rd
  ON ru.race_date = rd.race_date
 AND ru.jyo_cd = rd.jyo_cd
 AND ru.kaiji = rd.kaiji
 AND ru.nichiji = rd.nichiji
 AND ru.race_num = rd.race_num
WHERE rd.grade_cd IN ('g1', 'jg1', 'g2', 'jg2')
  AND rd.data_kubun IN ('7', 'A', 'B')
  AND ru.ketto_num <> '0000000000'
  AND ru.kakutei_jyuni > 0
WITH DATA;

-- CONCURRENTLY 刷新所需唯一索引
CREATE UNIQUE INDEX uk_mv_g1g2_horse_records
    ON public.mv_g1g2_horse_records (ketto_num, race_date, jyo_cd, kaiji, nichiji, race_num, umaban);

CREATE INDEX idx_mv_g1g2_ketto ON public.mv_g1g2_horse_records (ketto_num);
CREATE INDEX idx_mv_g1g2_race ON public.mv_g1g2_horse_records (race_date, jyo_cd, kaiji, nichiji, race_num, umaban);
CREATE INDEX idx_mv_g1g2_rank ON public.mv_g1g2_horse_records (kakutei_jyuni);
CREATE INDEX idx_mv_g1g2_grade ON public.mv_g1g2_horse_records (grade_cd);
CREATE INDEX idx_mv_g1g2_grade_rank ON public.mv_g1g2_horse_records (grade_cd, kakutei_jyuni);
CREATE INDEX idx_mv_g1g2_ketto_grade ON public.mv_g1g2_horse_records (ketto_num, grade_cd, kakutei_jyuni);

-- 预计算所有马匹组合的共同参赛次数
CREATE MATERIALIZED VIEW public.mv_g1g2_horse_pairs AS
SELECT r1.ketto_num AS source,
       r2.ketto_num AS target,
       COUNT(*) AS weight
FROM public.mv_g1g2_horse_records r1
JOIN public.mv_g1g2_horse_records r2
  ON r1.race_date = r2.race_date
 AND r1.jyo_cd = r2.jyo_cd
 AND r1.kaiji = r2.kaiji
 AND r1.nichiji = r2.nichiji
 AND r1.race_num = r2.race_num
 AND r1.umaban < r2.umaban
GROUP BY r1.ketto_num, r2.ketto_num
WITH DATA;

CREATE UNIQUE INDEX uk_mv_g1g2_horse_pairs ON public.mv_g1g2_horse_pairs (source, target);
CREATE INDEX idx_mv_g1g2_pairs_source ON public.mv_g1g2_horse_pairs (source);
CREATE INDEX idx_mv_g1g2_pairs_target ON public.mv_g1g2_horse_pairs (target);
CREATE INDEX idx_mv_g1g2_pairs_weight ON public.mv_g1g2_horse_pairs (weight);

COMMIT;

ANALYZE public.mv_g1g2_horse_records;
ANALYZE public.mv_g1g2_horse_pairs;

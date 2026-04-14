-- =====================================================
-- JRA 赛马数据库 - 完整设置脚本
-- 一次性完成：索引创建、物化视图创建、权限管理
-- 
-- 执行方式（使用 postgres 超级用户）:
--   psql -U postgres -d <database> -v app_user="'your_app_user'" -f setup_database.sql
-- 
-- 示例:
--   psql -U postgres -d jra_db -v app_user="'rival_map_user'" -f setup_database.sql
-- =====================================================

BEGIN;

-- =====================================================
-- 第 1 步：在基础表上创建索引（加速查询）
-- =====================================================
\echo '======================================'
\echo '第 1 步：创建基础表索引...'
\echo '======================================'

-- 1.0 删除可能存在的旧索引（支持平滑升级）
DROP INDEX IF EXISTS idx_race_details_g1;
DROP INDEX IF EXISTS idx_race_umas_g1_lookup;
DROP INDEX IF EXISTS idx_race_umas_ketto;
DROP INDEX IF EXISTS idx_race_umas_ketto_prize;
DROP INDEX IF EXISTS idx_umas_ketto_num;
DROP INDEX IF EXISTS idx_hansyokus_hansyoku_num;
DROP INDEX IF EXISTS idx_hansyokus_ketto_num;
DROP INDEX IF EXISTS idx_race_details_track;
DROP INDEX IF EXISTS idx_race_umas_track_join;

-- 1.1 加速 race_details 表的 G1/JG1/G2 过滤和 JOIN
CREATE INDEX idx_race_details_g1
ON race_details(grade_cd, data_kubun, race_date, jyo_cd, kaiji, nichiji, race_num)
WHERE grade_cd IN ('g1', 'jg1', 'g2', 'jg2') AND data_kubun IN ('7', 'A', 'B');

-- 1.2 加速 race_umas 表的 JOIN 和名次过滤（部分索引）
CREATE INDEX idx_race_umas_g1_lookup
ON race_umas(race_date, jyo_cd, kaiji, nichiji, race_num, umaban, ketto_num, kakutei_jyuni, honsyokin, fukasyokin, sex_cd)
WHERE kakutei_jyuni > 0;

-- 1.3 加速按马匹 ID 查询（节点查询使用）
CREATE INDEX idx_race_umas_ketto
ON race_umas(ketto_num, race_date, jyo_cd, kaiji, nichiji, race_num, honsyokin, fukasyokin, kakutei_jyuni);

-- 1.4 奖金查询优化索引
CREATE INDEX idx_race_umas_ketto_prize
ON race_umas(ketto_num)
INCLUDE (honsyokin, fukasyokin, bamei, sex_cd, race_date);

-- 1.5 加速 fetch_track_prizes 中 race_details 的 track_cd 关联查询
CREATE INDEX idx_race_details_track
ON race_details(race_date, jyo_cd, kaiji, nichiji, race_num)
INCLUDE (track_cd, grade_cd, data_kubun)
WHERE grade_cd IN ('g1', 'jg1', 'g2', 'jg2') AND data_kubun IN ('7', 'A', 'B');

-- 1.6 加速 fetch_track_prizes 中 race_umas 的 JOIN + 名次过滤
CREATE INDEX idx_race_umas_track_join
ON race_umas(race_date, jyo_cd, kaiji, nichiji, race_num)
INCLUDE (ketto_num, honsyokin, fukasyokin, kakutei_jyuni)
WHERE kakutei_jyuni > 0 AND ketto_num <> '0000000000';

\echo '✓ 基础表索引创建完成'

-- =====================================================
-- 第 1.5 步：在血统相关表上创建索引
-- =====================================================
\echo '======================================'
\echo '第 1.5 步：创建血统表索引...'
\echo '======================================'

-- 1.7 加速 fetch_pedigree_links 中 umas 表的马匹查询
CREATE INDEX idx_umas_ketto_num
ON umas(ketto_num)
WHERE ketto_num <> '0000000000';

-- 1.8 加速 fetch_pedigree_links 中 hansyokus 表的繁殖番号查找（部分索引）
CREATE INDEX idx_hansyokus_hansyoku_num
ON hansyokus(hansyoku_num)
WHERE ketto_num IS NOT NULL;

-- 1.9 加速 fetch_pedigree_links 中外层马匹 ID 过滤
CREATE INDEX idx_hansyokus_ketto_num
ON hansyokus(ketto_num);

\echo '✓ 血统表索引创建完成'

-- =====================================================
-- 第 2 步：授予基础表的 SELECT 权限
-- =====================================================
\echo '======================================'
\echo '第 2 步：授予基础表权限...'
\echo '======================================'

GRANT SELECT ON race_umas TO :app_user;
GRANT SELECT ON race_details TO :app_user;
GRANT SELECT ON umas TO :app_user;
GRANT SELECT ON hansyokus TO :app_user;

\echo '✓ 基础表权限已授予'

-- =====================================================
-- 第 3 步：创建物化视图
-- =====================================================
\echo '======================================'
\echo '第 3 步：创建物化视图...'
\echo '======================================'

-- 3.1 删除旧的物化视图（如果存在）
DROP MATERIALIZED VIEW IF EXISTS mv_g1g2_horse_pairs CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_g1_horse_pairs CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_g1g2_horse_records CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_g1_horse_records CASCADE;

-- 3.2 创建物化视图：预计算所有 G1/G2 参赛记录
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

-- 3.3 创建物化视图：预计算所有马匹组合的共同参赛次数
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

\echo '✓ 物化视图创建完成'

-- =====================================================
-- 第 4 步：在物化视图上创建索引
-- =====================================================
\echo '======================================'
\echo '第 4 步：创建物化视图索引...'
\echo '======================================'

-- 4.0 删除可能存在的旧索引（支持平滑升级）
DROP INDEX IF EXISTS idx_mv_g1g2_ketto;
DROP INDEX IF EXISTS idx_mv_g1g2_race;
DROP INDEX IF EXISTS idx_mv_g1g2_rank;
DROP INDEX IF EXISTS idx_mv_g1g2_grade;
DROP INDEX IF EXISTS idx_mv_g1g2_grade_rank;
DROP INDEX IF EXISTS idx_mv_g1g2_ketto_grade;
DROP INDEX IF EXISTS idx_mv_g1g2_pairs_source;
DROP INDEX IF EXISTS idx_mv_g1g2_pairs_target;
DROP INDEX IF EXISTS idx_mv_g1g2_pairs_weight;
DROP INDEX IF EXISTS uk_mv_g1g2_horse_records;

-- 4.1 唯一索引（支持 CONCURRENTLY 刷新所必需）
-- 注意: REFRESH MATERIALIZED VIEW CONCURRENTLY 要求至少一个唯一索引且没有 WHERE 条件
CREATE UNIQUE INDEX uk_mv_g1g2_horse_records ON mv_g1g2_horse_records(ketto_num, race_date, jyo_cd, kaiji, nichiji, race_num, umaban);

-- 4.2 mv_g1g2_horse_records 查询索引
CREATE INDEX idx_mv_g1g2_ketto ON mv_g1g2_horse_records(ketto_num);
CREATE INDEX idx_mv_g1g2_race ON mv_g1g2_horse_records(race_date, jyo_cd, kaiji, nichiji, race_num, umaban);
CREATE INDEX idx_mv_g1g2_rank ON mv_g1g2_horse_records(kakutei_jyuni);
CREATE INDEX idx_mv_g1g2_grade ON mv_g1g2_horse_records(grade_cd);

-- 4.3 复合索引：加速严格模式下的 grade_cd + kakutei_jyuni 联合过滤
CREATE INDEX idx_mv_g1g2_grade_rank ON mv_g1g2_horse_records(grade_cd, kakutei_jyuni);

-- 4.4 复合索引：加速按马匹 ID + 等级过滤的查询（节点查询使用）
CREATE INDEX idx_mv_g1g2_ketto_grade ON mv_g1g2_horse_records(ketto_num, grade_cd, kakutei_jyuni);

-- 4.5 唯一索引（支持 CONCURRENTLY 刷新 mv_g1g2_horse_pairs 所必需）
CREATE UNIQUE INDEX uk_mv_g1g2_horse_pairs ON mv_g1g2_horse_pairs(source, target);

-- 4.6 mv_g1g2_horse_pairs 查询索引
CREATE INDEX idx_mv_g1g2_pairs_source ON mv_g1g2_horse_pairs(source);
CREATE INDEX idx_mv_g1g2_pairs_target ON mv_g1g2_horse_pairs(target);
CREATE INDEX idx_mv_g1g2_pairs_weight ON mv_g1g2_horse_pairs(weight);

\echo '✓ 物化视图索引创建完成'

-- =====================================================
-- 第 5 步：转移物化视图所有权给应用用户
-- =====================================================
\echo '======================================'
\echo '第 5 步：转移物化视图所有权...'
\echo '======================================'

ALTER MATERIALIZED VIEW mv_g1g2_horse_records OWNER TO :app_user;
ALTER MATERIALIZED VIEW mv_g1g2_horse_pairs OWNER TO :app_user;

\echo '✓ 物化视图所有权已转移'

-- =====================================================
-- 第 6 步：验证所有对象
-- =====================================================
\echo '======================================'
\echo '第 6 步：验证设置结果...'
\echo '======================================'

-- 查看基础表索引
\echo '--- 基础表索引（race_umas, race_details） ---'
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
  AND tablename IN ('race_umas', 'race_details')
ORDER BY tablename, indexname;

\echo '--- 血统表索引（umas, hansyokus） ---'
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
  AND tablename IN ('umas', 'hansyokus')
ORDER BY tablename, indexname;

-- 查看物化视图状态
\echo '--- 物化视图状态 ---'
SELECT 
    matviewname AS "物化视图名称",
    matviewowner AS "所有者",
    hasindexes AS "有索引",
    ispopulated AS "已填充",
    pg_size_pretty(pg_relation_size(matviewname::text)) AS "大小"
FROM pg_matviews
WHERE matviewname LIKE 'mv_g1g2_%'
ORDER BY matviewname;

-- 查看物化视图索引
\echo '--- 物化视图索引 ---'
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename LIKE 'mv_g1g2_%'
ORDER BY tablename, indexname;

COMMIT;

\echo '======================================'
\echo '✓✓✓ 数据库设置全部完成！'
\echo '======================================'
\echo '应用用户: ' :app_user
\echo '物化视图已创建并转移所有权'
\echo '应用现在可以正常查询和刷新物化视图'

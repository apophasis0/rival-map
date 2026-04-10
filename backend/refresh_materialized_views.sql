-- =====================================================
-- 刷新 JRA 物化视图
-- 在数据更新后执行，或设置为定时任务
-- 执行方式: psql -U <user> -d <database> -f refresh_materialized_views.sql
-- =====================================================

-- 记录刷新开始时间
SELECT NOW() AS refresh_start_time;

-- 刷新参赛记录物化视图
\echo 'Refreshing mv_g1_horse_records...'
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_g1_horse_records;

-- 刷新马匹对连线物化视图
\echo 'Refreshing mv_g1_horse_pairs...'
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_g1_horse_pairs;

-- 记录刷新完成时间
SELECT NOW() AS refresh_end_time;

-- 验证刷新结果
SELECT matviewname, hasindexes, ispopulated
FROM pg_matviews
WHERE matviewname LIKE 'mv_g1_%'
ORDER BY matviewname;

-- 显示物化视图大小
SELECT
    matviewname,
    pg_size_pretty(pg_relation_size(matviewname::text)) AS size
FROM pg_matviews
WHERE matviewname LIKE 'mv_g1_%'
ORDER BY pg_relation_size(matviewname::text) DESC;

\echo 'Materialized views refreshed successfully!'

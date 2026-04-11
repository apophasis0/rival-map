@echo off
echo === Rival Map Backend 健康检查 ===
curl -s -o nul -w "HTTP %%{http_code}" http://localhost:8000/docs
echo.

echo.
echo === 测试 1: 基础图谱查询 ===
curl -s "http://localhost:8000/api/network?minWeight=2&minPrize=0" ^| python -m json.tool
echo.

echo.
echo === 测试 2: 带血统边查询 ===
curl -s "http://localhost:8000/api/network?minWeight=2&includeSire=true&includeDam=true" ^| python -m json.tool
echo.

echo.
echo === 测试 3: 纯血统边查询 ===
curl -s "http://localhost:8000/api/pedigree?minWeight=2&includeSire=true&includeDam=true" ^| python -m json.tool
echo.

echo.
echo === 测试 4: 缓存命中验证（重复请求，观察日志中的命中提示）===
curl -s "http://localhost:8000/api/network?minWeight=2&minPrize=0" ^| python -m json.tool
echo.

echo.
echo === 测试完成 ===
pause

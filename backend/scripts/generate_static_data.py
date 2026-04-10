"""
预计算所有参数组合的图谱数据，生成静态 JSON 文件。
供 VPS 纯静态部署使用，无需后端和数据库。

用法:
    cd backend
    uv run python scripts/generate_static_data.py

输出:
    static_data/network/{weight}_{prize}_{maxRank}_{strict}.json
"""

import json
import os
import sys
import time
from pathlib import Path

# 确保能导入 app 模块
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.graph_service import fetch_horse_network

# ============ 参数范围配置 ============

WEIGHT_RANGE = range(1, 11)  # minWeight: 1~10
PRIZE_VALUES = [0, 1000, 5000, 10000, 20000, 30000, 50000, 70000, 100000]  # minPrize (万円)
MAX_RANK_VALUES = [18]  # 当前只有"不限"有意义
STRICT_MODES = [True, False]  # 严格/宽松

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "static_data" / "network"


def generate_all():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    total = len(WEIGHT_RANGE) * len(PRIZE_VALUES) * len(MAX_RANK_VALUES) * len(STRICT_MODES)
    print(f"📊 开始预计算 {total} 组参数组合...\n")

    count = 0
    empty_count = 0
    t_start = time.time()

    for weight in WEIGHT_RANGE:
        for prize in PRIZE_VALUES:
            for max_rank in MAX_RANK_VALUES:
                for strict in STRICT_MODES:
                    count += 1
                    filename = f"{weight}_{prize}_{max_rank}_{strict}.json"
                    filepath = OUTPUT_DIR / filename

                    # 跳过已有文件（断点续传）
                    if filepath.exists():
                        existing = json.loads(filepath.read_text())
                        node_count = len(existing.get("nodes", []))
                        print(f"  [{count}/{total}] ⏭️  跳过 (已有): w={weight}, p={prize}, r={max_rank}, s={strict} → {node_count} nodes")
                        continue

                    data = fetch_horse_network(
                        min_intersections=weight,
                        min_prize=float(prize),
                        max_rank=max_rank,
                        strict_rank_mode=strict,
                    )

                    node_count = len(data["nodes"])
                    link_count = len(data["links"])

                    if node_count == 0:
                        empty_count += 1

                    # 写入 JSON
                    filepath.write_text(json.dumps(data, ensure_ascii=False, indent=2))
                    size_kb = filepath.stat().st_size / 1024
                    mode_str = "严格" if strict else "宽松"
                    emoji = "🟢" if node_count > 0 else "⚪"
                    print(f"  [{count}/{total}] {emoji} w={weight:2d}, p={prize:6d}, r={max_rank:2d}, s={mode_str} → {node_count:4d} nodes, {link_count:5d} links ({size_kb:.0f}KB)")

    elapsed = time.time() - t_start
    total_size_mb = sum(f.stat().st_size for f in OUTPUT_DIR.glob("*.json")) / 1024 / 1024

    print(f"\n✅ 预计算完成!")
    print(f"   总耗时: {elapsed:.1f}s")
    print(f"   生成文件: {count} 个")
    print(f"   空数据: {empty_count} 个")
    print(f"   总大小: {total_size_mb:.1f}MB")
    print(f"   输出目录: {OUTPUT_DIR}")


if __name__ == "__main__":
    generate_all()

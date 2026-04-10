"""
预计算所有参数组合的图谱数据，生成静态 JSON 文件。
可选上传到 Cloudflare R2，供生产环境使用。

用法:
    # 仅生成本地文件
    cd backend
    uv run python scripts/generate_static_data.py

    # 生成并上传到 R2
    uv run python scripts/generate_static_data.py --upload-r2

环境变量 (上传到 R2 时需要):
    R2_ACCOUNT_ID       — Cloudflare 账户 ID
    R2_ACCESS_KEY_ID    — R2 Access Key ID
    R2_SECRET_ACCESS_KEY— R2 Secret Access Key
    R2_BUCKET_NAME      — R2 存储桶名称（默认: rival-map-data）

输出:
    static_data/network/{weight}_{prize}_{maxRank}_{strict}.json
    → 上传到 R2: https://<bucket>.<account>.r2.cloudflarestorage.com/network/
"""

import argparse
import json
import os
import sys
import time
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv

# 确保能导入 app 模块
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import init_db_pool, close_db_pool
from app.graph_service import fetch_horse_network


class DecimalEncoder(json.JSONEncoder):
    """处理 Decimal 类型的 JSON 编码器"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

# ============ 参数范围配置 ============

WEIGHT_RANGE = range(1, 11)  # minWeight: 1~10
PRIZE_VALUES = [0, 1000, 5000, 10000, 20000, 30000, 50000, 70000, 100000]  # minPrize (万円)
MAX_RANK_VALUES = list(range(1, 19))  # maxRank: 1~18
STRICT_MODES = [True, False]  # 严格/宽松

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "static_data" / "network"


def upload_to_r2(local_dir: Path):
    """将本地 JSON 文件上传到 Cloudflare R2"""
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        print("\n❌ 缺少 boto3 依赖。请运行: uv pip install boto3")
        sys.exit(1)

    account_id = os.getenv("R2_ACCOUNT_ID")
    access_key = os.getenv("R2_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
    bucket_name = os.getenv("R2_BUCKET_NAME", "rival-map-data")

    if not all([account_id, access_key, secret_key]):
        print("\n❌ 缺少 R2 环境变量。请设置:")
        print("   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")
        sys.exit(1)

    endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4"),
    )

    # 确保 bucket 存在
    try:
        s3.head_bucket(Bucket=bucket_name)
    except Exception:
        print(f"\n📦 创建 R2 存储桶: {bucket_name}")
        s3.create_bucket(Bucket=bucket_name)

    json_files = list(local_dir.glob("*.json"))
    pedigree_file = local_dir.parent / "pedigree.json"
    all_files = json_files + ([pedigree_file] if pedigree_file.exists() else [])
    if not all_files:
        print(f"\n⚠️  {local_dir} 中没有找到 JSON 文件，跳过上传")
        return

    print(f"\n🚀 开始上传 {len(all_files)} 个文件到 R2 ({bucket_name})...\n")

    uploaded = 0
    skipped = 0
    total_bytes = 0

    for filepath in sorted(all_files):
        # pedigree.json 放在根目录，其他放在 network/ 下
        if filepath.name == "pedigree.json":
            key = "pedigree.json"
        else:
            key = f"network/{filepath.name}"

        # 检查是否已存在（ETag 比较）
        try:
            head = s3.head_object(Bucket=bucket_name, Key=key)
            local_size = filepath.stat().st_size
            if head.get("ContentLength") == local_size:
                skipped += 1
                continue
        except Exception:
            pass  # 文件不存在，需要上传

        with open(filepath, "rb") as f:
            s3.put_object(
                Bucket=bucket_name,
                Key=key,
                Body=f.read(),
                ContentType="application/json",
                CacheControl="public, max-age=86400",  # 缓存 1 天
            )

        uploaded += 1
        total_bytes += filepath.stat().st_size

    print(f"✅ 上传完成!")
    print(f"   新上传: {uploaded} 个")
    print(f"   已跳过: {skipped} 个（无变化）")
    print(f"   上传大小: {total_bytes / 1024 / 1024:.1f}MB")
    print(f"   访问地址: https://{bucket_name}.{account_id}.r2.cloudflarestorage.com/network/")


def generate_all(upload_r2: bool = False):
    # 初始化连接池（脚本直接运行，不经过 FastAPI lifespan）
    init_db_pool()

    try:
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
                        filename = f"{weight}_{prize}_{max_rank}_{str(strict).lower()}.json"
                        filepath = OUTPUT_DIR / filename

                        # 跳过已有文件（断点续传）
                        if filepath.exists():
                            existing = json.loads(filepath.read_text(encoding='utf-8'))
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
                        filepath.write_text(json.dumps(data, cls=DecimalEncoder, ensure_ascii=False, indent=2))
                        size_kb = filepath.stat().st_size / 1024
                        mode_str = "严格" if strict else "宽松"
                        emoji = "🟢" if node_count > 0 else "⚪"
                        print(f"  [{count}/{total}] {emoji} w={weight:2d}, p={prize:6d}, r={max_rank:2d}, s={mode_str} → {node_count:4d} nodes, {link_count:5d} links ({size_kb:.0f}KB)")

        # 生成血统边索引文件（用于生产模式按需加载）
        print(f"\n🧬 生成血统边索引...")
        from app.graph_service import fetch_pedigree_links
        all_node_ids = set()
        for f in OUTPUT_DIR.glob("*.json"):
            d = json.loads(f.read_text(encoding='utf-8'))
            for n in d.get("nodes", []):
                all_node_ids.add(n["id"])

        all_node_ids = list(all_node_ids)
        pedigree_links = fetch_pedigree_links(all_node_ids)
        pedigree_file = OUTPUT_DIR.parent / "pedigree.json"
        pedigree_file.write_text(json.dumps({"links": pedigree_links}, cls=DecimalEncoder, ensure_ascii=False, indent=2))
        print(f"   血统边: {len(pedigree_links)} 条 → {pedigree_file.name}")

        elapsed = time.time() - t_start
        total_size_mb = sum(f.stat().st_size for f in OUTPUT_DIR.glob("*.json")) / 1024 / 1024
        if pedigree_file.exists():
            total_size_mb += pedigree_file.stat().st_size / 1024 / 1024

        print(f"\n✅ 预计算完成!")
        print(f"   总耗时: {elapsed:.1f}s")
        print(f"   生成文件: {count} 个")
        print(f"   空数据: {empty_count} 个")
        print(f"   总大小: {total_size_mb:.1f}MB")
        print(f"   输出目录: {OUTPUT_DIR}")

        # 上传到 R2
        if upload_r2:
            upload_to_r2(OUTPUT_DIR)
    finally:
        close_db_pool()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="生成图谱静态数据并可选上传到 R2")
    parser.add_argument(
        "--upload-r2",
        action="store_true",
        help="生成完成后自动上传到 Cloudflare R2",
    )
    args = parser.parse_args()
    load_dotenv()
    generate_all(upload_r2=args.upload_r2)

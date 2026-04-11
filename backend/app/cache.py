import os
import json
import logging
from typing import Any

import redis

logger = logging.getLogger("rival_map")

# 全局 Redis 客户端
redis_client: redis.Redis | None = None

# 缓存 key 前缀，便于管理和隔离
CACHE_PREFIX = "rival_map:"
# 默认缓存过期时间（秒）
DEFAULT_TTL = 3600


def init_redis():
    """在 FastAPI 启动时初始化 Redis 连接"""
    global redis_client

    host = os.getenv("REDIS_HOST", "127.0.0.1")
    port = int(os.getenv("REDIS_PORT", "6379"))
    password = os.getenv("REDIS_PASSWORD", "") or None
    db = int(os.getenv("REDIS_DB", "0"))

    try:
        redis_client = redis.Redis(
            host=host,
            port=port,
            password=password,
            db=db,
            decode_responses=True,
            socket_connect_timeout=5,
            retry_on_timeout=True,
        )
        redis_client.ping()
        logger.info(f"[Redis] 连接成功: {host}:{port}, DB={db}")
    except redis.ConnectionError as e:
        logger.warning(f"[Redis] 连接失败（缓存功能将被禁用）: {e}")
        redis_client = None
    except Exception as e:
        logger.warning(f"[Redis] 初始化异常（缓存功能将被禁用）: {e}")
        redis_client = None


def close_redis():
    """在 FastAPI 关闭时关闭 Redis 连接"""
    global redis_client
    if redis_client:
        redis_client.close()
        logger.info("[Redis] 连接已关闭")
        redis_client = None


def get_cache(key: str) -> Any | None:
    """
    从缓存中获取数据，自动反序列化 JSON
    如果 Redis 不可用，返回 None
    """
    if redis_client is None:
        return None

    try:
        full_key = f"{CACHE_PREFIX}{key}"
        data = redis_client.get(full_key)
        if data is None:
            return None
        return json.loads(data)
    except redis.RedisError as e:
        logger.warning(f"[Redis] GET 失败: {e}")
        return None
    except json.JSONDecodeError as e:
        logger.warning(f"[Redis] 数据反序列化失败: {e}")
        return None


def set_cache(key: str, value: Any, ttl: int | None = None) -> bool:
    """
    将数据存入缓存，自动序列化 JSON
    ttl: 过期时间（秒），默认使用 DEFAULT_TTL
    """
    if redis_client is None:
        return False

    try:
        full_key = f"{CACHE_PREFIX}{key}"
        serialized = json.dumps(value, ensure_ascii=False)
        redis_client.setex(full_key, ttl or DEFAULT_TTL, serialized)
        return True
    except redis.RedisError as e:
        logger.warning(f"[Redis] SET 失败: {e}")
        return False


def delete_cache(key: str) -> bool:
    """删除缓存"""
    if redis_client is None:
        return False

    try:
        full_key = f"{CACHE_PREFIX}{key}"
        redis_client.delete(full_key)
        return True
    except redis.RedisError as e:
        logger.warning(f"[Redis] DELETE 失败: {e}")
        return False


def generate_cache_key(endpoint: str, params: dict) -> str:
    """
    根据端点名称和参数生成缓存 key
    示例: network:minWeight=2:minPrize=0.0:maxRank=18:strictMode=true:includeSire=false:includeDam=false
    """
    sorted_params = sorted(params.items())
    param_str = ":".join(f"{k}={v}" for k, v in sorted_params)
    return f"{endpoint}:{param_str}"

"""
Redis 缓存模块单元测试
"""
import json
from unittest.mock import MagicMock, patch

import pytest
import redis

from app.cache import (
    CACHE_PREFIX,
    DEFAULT_TTL,
    get_cache,
    set_cache,
    delete_cache,
    generate_cache_key,
)


class TestGenerateCacheKey:
    """测试缓存 key 生成逻辑"""

    def test_basic_key_generation(self):
        """基础 key 生成"""
        key = generate_cache_key("network", {"minWeight": 2, "minPrize": 0.0})
        assert key.startswith("network:")
        assert "minWeight=2" in key
        assert "minPrize=0.0" in key

    def test_key_order_independent(self):
        """参数顺序不影响 key 生成"""
        key1 = generate_cache_key("network", {"a": 1, "b": 2})
        key2 = generate_cache_key("network", {"b": 2, "a": 1})
        assert key1 == key2

    def test_different_values_different_keys(self):
        """不同参数值生成不同 key"""
        key1 = generate_cache_key("network", {"minWeight": 2})
        key2 = generate_cache_key("network", {"minWeight": 3})
        assert key1 != key2


class TestCacheOperations:
    """测试缓存操作"""

    @pytest.fixture
    def mock_redis_client(self):
        """Mock Redis 客户端"""
        with patch("app.cache.redis_client") as mock:
            yield mock

    def test_get_cache_hit(self, mock_redis_client):
        """缓存命中"""
        test_data = {"nodes": [{"id": "001"}], "links": []}
        mock_redis_client.get.return_value = json.dumps(test_data)

        result = get_cache("network:test")

        mock_redis_client.get.assert_called_once_with(f"{CACHE_PREFIX}network:test")
        assert result == test_data

    def test_get_cache_miss(self, mock_redis_client):
        """缓存未命中"""
        mock_redis_client.get.return_value = None

        result = get_cache("network:nonexistent")

        assert result is None

    def test_get_cache_redis_error(self, mock_redis_client):
        """Redis 异常时返回 None"""
        mock_redis_client.get.side_effect = redis.RedisError("Connection lost")

        result = get_cache("network:test")

        assert result is None

    def test_get_cache_invalid_json(self, mock_redis_client):
        """无效 JSON 时返回 None"""
        mock_redis_client.get.return_value = "{invalid json"

        result = get_cache("network:test")

        assert result is None

    def test_set_cache_success(self, mock_redis_client):
        """写入缓存成功"""
        test_data = {"nodes": [{"id": "002"}], "links": []}
        mock_redis_client.setex.return_value = True

        result = set_cache("network:test", test_data, ttl=120)

        mock_redis_client.setex.assert_called_once()
        call_args = mock_redis_client.setex.call_args
        assert call_args[0][0] == f"{CACHE_PREFIX}network:test"
        assert call_args[0][1] == 120
        assert json.loads(call_args[0][2]) == test_data
        assert result is True

    def test_set_cache_default_ttl(self, mock_redis_client):
        """使用默认 TTL"""
        set_cache("network:test", {"data": "value"})

        call_args = mock_redis_client.setex.call_args
        assert call_args[0][1] == DEFAULT_TTL

    def test_set_cache_redis_error(self, mock_redis_client):
        """Redis 异常时返回 False"""
        mock_redis_client.setex.side_effect = redis.RedisError("OOM")

        result = set_cache("network:test", {"data": "value"})

        assert result is False

    def test_delete_cache_success(self, mock_redis_client):
        """删除缓存成功"""
        mock_redis_client.delete.return_value = 1

        result = delete_cache("network:test")

        mock_redis_client.delete.assert_called_once_with(f"{CACHE_PREFIX}network:test")
        assert result is True

    def test_delete_cache_redis_error(self, mock_redis_client):
        """Redis 异常时返回 False"""
        mock_redis_client.delete.side_effect = redis.RedisError("Connection lost")

        result = delete_cache("network:test")

        assert result is False


class TestCacheDegradation:
    """测试 Redis 不可用时的降级行为"""

    def test_get_cache_when_redis_is_none(self):
        """Redis 未初始化时 get 返回 None"""
        with patch("app.cache.redis_client", None):
            result = get_cache("network:test")
            assert result is None

    def test_set_cache_when_redis_is_none(self):
        """Redis 未初始化时 set 返回 False"""
        with patch("app.cache.redis_client", None):
            result = set_cache("network:test", {"data": "value"})
            assert result is False

    def test_delete_cache_when_redis_is_none(self):
        """Redis 未初始化时 delete 返回 False"""
        with patch("app.cache.redis_client", None):
            result = delete_cache("network:test")
            assert result is False

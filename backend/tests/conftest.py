"""
测试共享 fixtures 和配置
"""
import os
import pytest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient


@pytest.fixture(scope="session", autouse=True)
def setup_test_env():
    """设置测试环境变量"""
    os.environ.setdefault("DB_NAME", "test_db")
    os.environ.setdefault("DB_USER", "test_user")
    os.environ.setdefault("DB_PASSWORD", "test_pass")
    os.environ.setdefault("DB_HOST", "127.0.0.1")
    os.environ.setdefault("DB_PORT", "5432")
    os.environ.setdefault("REDIS_HOST", "127.0.0.1")
    os.environ.setdefault("REDIS_PORT", "6379")
    os.environ.setdefault("REDIS_DB", "15")  # 测试用独立 DB
    os.environ.setdefault("CACHE_TTL", "60")
    yield


@pytest.fixture
def mock_db_connection():
    """Mock 数据库连接"""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()

    # 物化视图检查
    mock_conn.execute.return_value.fetchone.return_value = {"exists": True, "ispopulated": True}

    with patch("app.database.get_db_connection") as mock_get_conn:
        mock_cm = MagicMock()
        mock_cm.__enter__ = MagicMock(return_value=mock_conn)
        mock_cm.__exit__ = MagicMock(return_value=False)
        mock_get_conn.return_value = mock_cm
        yield mock_conn


@pytest.fixture
def mock_redis():
    """Mock Redis 客户端"""
    with patch("app.cache.redis_client", None) as mock:
        yield mock


@pytest.fixture
def client_no_db():
    """
    创建不依赖数据库的 TestClient
    用于测试缓存未命中时的降级逻辑
    """
    from app.main import app
    with TestClient(app) as test_client:
        yield test_client

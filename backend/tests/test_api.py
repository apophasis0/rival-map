"""
API 端点集成测试
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


@pytest.fixture
def sample_network_data():
    """模拟网络图谱数据"""
    return {
        "nodes": [
            {"id": "12345", "name": "テスト馬1", "sex": "牡", "prize_score": 15000.0, "active_year": 2023},
            {"id": "67890", "name": "テスト馬2", "sex": "牝", "prize_score": 8000.0, "active_year": 2022},
        ],
        "links": [
            {"source": "12345", "target": "67890", "weight": 3},
        ],
    }


@pytest.fixture
def sample_pedigree_data():
    """模拟血统边数据"""
    return {
        "links": [
            {"source": "12345", "target": "67890", "linkType": "sire"},
        ],
    }


@pytest.fixture
def mock_fetch_network(sample_network_data):
    """Mock fetch_horse_network"""
    with patch("app.main.fetch_horse_network", return_value=sample_network_data) as mock:
        yield mock


@pytest.fixture
def mock_fetch_pedigree(sample_pedigree_data):
    """Mock fetch_pedigree_links"""
    with patch("app.main.fetch_pedigree_links", return_value=sample_pedigree_data["links"]) as mock:
        yield mock


@pytest.fixture
def mock_db_connection():
    """Mock 数据库连接（用于 pedigree 端点内部调用）"""
    mock_conn = MagicMock()
    mock_cm = MagicMock()
    mock_cm.__enter__ = MagicMock(return_value=mock_conn)
    mock_cm.__exit__ = MagicMock(return_value=False)

    with patch("app.graph_service.get_db_connection", return_value=mock_cm) as mock:
        yield mock_conn


@pytest.fixture
def mock_cache_miss():
    """模拟缓存未命中"""
    with patch("app.main.get_cache", return_value=None) as mock:
        yield mock


@pytest.fixture
def mock_cache_hit(sample_network_data):
    """模拟缓存命中"""
    with patch("app.main.get_cache", return_value=sample_network_data) as mock:
        yield mock


@pytest.fixture
def mock_set_cache():
    """Mock set_cache"""
    with patch("app.main.set_cache", return_value=True) as mock:
        yield mock


@pytest.fixture
def test_client():
    """创建测试客户端"""
    from app.main import app
    return TestClient(app)


class TestNetworkEndpoint:
    """测试 /api/network 端点"""

    def test_network_default_params(self, test_client, mock_cache_miss, mock_fetch_network, mock_set_cache):
        """默认参数请求"""
        response = test_client.get("/api/network")

        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        assert "links" in data

        # 验证调用了 fetch_horse_network 且使用默认参数
        mock_fetch_network.assert_called_once()
        call_kwargs = mock_fetch_network.call_args[1]
        assert call_kwargs["min_intersections"] == 2
        assert call_kwargs["min_prize"] == 0.0
        assert call_kwargs["max_rank"] == 18
        assert call_kwargs["strict_rank_mode"] is True

    def test_network_custom_params(self, test_client, mock_cache_miss, mock_fetch_network, mock_set_cache):
        """自定义参数请求"""
        response = test_client.get(
            "/api/network?minWeight=3&minPrize=5000&maxRank=10&strictMode=false"
        )

        assert response.status_code == 200

        call_kwargs = mock_fetch_network.call_args[1]
        assert call_kwargs["min_intersections"] == 3
        assert call_kwargs["min_prize"] == 5000
        assert call_kwargs["max_rank"] == 10
        assert call_kwargs["strict_rank_mode"] is False

    def test_network_with_sire_links(
        self, test_client, mock_cache_miss, mock_fetch_network, mock_fetch_pedigree, mock_set_cache
    ):
        """包含父系血统边"""
        response = test_client.get("/api/network?includeSire=true")

        assert response.status_code == 200
        data = response.json()

        # 验证调用了 fetch_pedigree_links
        mock_fetch_pedigree.assert_called_once()
        call_kwargs = mock_fetch_pedigree.call_args[1]
        assert "sire" in call_kwargs["parent_types"]

        # 验证 linkType 被添加
        for link in data["links"]:
            assert "linkType" in link

    def test_network_with_dam_links(
        self, test_client, mock_cache_miss, mock_fetch_network, mock_fetch_pedigree, mock_set_cache
    ):
        """包含母系血统边"""
        response = test_client.get("/api/network?includeDam=true")

        assert response.status_code == 200

        call_kwargs = mock_fetch_pedigree.call_args[1]
        assert "dam" in call_kwargs["parent_types"]

    def test_network_both_sire_and_dam(
        self, test_client, mock_cache_miss, mock_fetch_network, mock_fetch_pedigree, mock_set_cache
    ):
        """同时包含父系和母系血统边"""
        response = test_client.get("/api/network?includeSire=true&includeDam=true")

        assert response.status_code == 200

        call_kwargs = mock_fetch_pedigree.call_args[1]
        assert "sire" in call_kwargs["parent_types"]
        assert "dam" in call_kwargs["parent_types"]

    def test_network_cache_hit(self, test_client, mock_cache_hit):
        """缓存命中时直接返回缓存数据"""
        response = test_client.get("/api/network")

        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        assert "links" in data

    def test_network_empty_result(self, test_client, mock_cache_miss, mock_set_cache):
        """空结果集"""
        with patch("app.main.fetch_horse_network", return_value={"nodes": [], "links": []}):
            response = test_client.get("/api/network")

        assert response.status_code == 200
        data = response.json()
        assert data["nodes"] == []
        assert data["links"] == []

    def test_network_invalid_params(self, test_client, mock_cache_miss):
        """无效参数时返回 422"""
        response = test_client.get("/api/network?minWeight=abc")

        assert response.status_code == 422


class TestPedigreeEndpoint:
    """测试 /api/pedigree 端点"""

    def test_pedigree_default_params(self, test_client, mock_cache_miss, mock_fetch_network, mock_db_connection, mock_set_cache):
        """默认参数请求血统边"""
        mock_db_connection.execute.return_value.fetchall.return_value = []

        response = test_client.get("/api/pedigree")

        assert response.status_code == 200
        data = response.json()
        assert "links" in data

    def test_pedigree_with_sire(self, test_client, mock_cache_miss, mock_fetch_network, mock_db_connection, mock_fetch_pedigree, mock_set_cache):
        """仅父系血统边"""
        mock_db_connection.execute.return_value.fetchall.return_value = []

        response = test_client.get("/api/pedigree?includeSire=true")

        assert response.status_code == 200

        call_kwargs = mock_fetch_pedigree.call_args[1]
        assert "sire" in call_kwargs["parent_types"]

    def test_pedigree_empty_nodes(self, test_client, mock_cache_miss, mock_set_cache):
        """无节点时返回空 links"""
        with patch("app.main.fetch_horse_network", return_value={"nodes": [], "links": []}):
            response = test_client.get("/api/pedigree")

        assert response.status_code == 200
        data = response.json()
        assert data == {"links": []}

    def test_pedigree_cache_hit(self, test_client, mock_cache_hit):
        """缓存命中"""
        response = test_client.get("/api/pedigree")

        assert response.status_code == 200


class TestCacheIntegration:
    """测试缓存集成逻辑"""

    def test_cache_key_generation_in_network(
        self, test_client, mock_cache_miss, mock_fetch_network, mock_set_cache
    ):
        """验证网络端点生成正确的缓存 key"""
        test_client.get("/api/network?minWeight=3&minPrize=1000")

        # 验证 set_cache 被调用
        mock_set_cache.assert_called_once()
        cache_key = mock_set_cache.call_args[0][0]
        assert "network" in cache_key
        assert "minWeight=3" in cache_key
        assert "minPrize=1000" in cache_key

    def test_cache_key_generation_in_pedigree(
        self, test_client, mock_cache_miss, mock_fetch_network, mock_db_connection, mock_set_cache
    ):
        """验证血统端点生成正确的缓存 key"""
        mock_db_connection.execute.return_value.fetchall.return_value = []

        test_client.get("/api/pedigree?includeSire=true")

        mock_set_cache.assert_called_once()
        cache_key = mock_set_cache.call_args[0][0]
        assert "pedigree" in cache_key
        assert "includeSire=True" in cache_key  # Python bool 序列化为 True


class TestHealthCheck:
    """测试健康检查端点"""

    def test_docs_endpoint(self, test_client):
        """OpenAPI 文档可访问"""
        response = test_client.get("/docs")
        assert response.status_code == 200

    def test_openapi_json(self, test_client):
        """OpenAPI 规范 JSON"""
        response = test_client.get("/openapi.json")
        assert response.status_code == 200
        assert "info" in response.json()

"""
图查询服务层测试
"""
import pytest
from unittest.mock import MagicMock, patch, call

from app.graph_service import (
    fetch_horse_network,
    fetch_pedigree_links,
    _has_materialized_views,
)


@pytest.fixture
def mock_db():
    """Mock 数据库连接"""
    mock_conn = MagicMock()
    mock_cm = MagicMock()
    mock_cm.__enter__ = MagicMock(return_value=mock_conn)
    mock_cm.__exit__ = MagicMock(return_value=False)

    with patch("app.graph_service.get_db_connection", return_value=mock_cm) as mock:
        yield mock_conn


def _setup_mock_execute(mock_conn, result_sets):
    """
    设置 mock execute 的行为：
    - 每次调用 execute 返回一个新的 MagicMock，其 fetchall/fetchone 返回对应结果
    """
    call_counter = {"count": 0}

    def execute_side_effect(*args, **kwargs):
        idx = call_counter["count"]
        call_counter["count"] += 1
        if idx < len(result_sets):
            result = result_sets[idx]
            mock_result = MagicMock()
            if "fetchone" in result:
                mock_result.fetchone.return_value = result["fetchone"]
            if "fetchall" in result:
                mock_result.fetchall.return_value = result["fetchall"]
            return mock_result
        return MagicMock()

    mock_conn.execute.side_effect = execute_side_effect


class TestHasMaterializedViews:
    """测试物化视图检测"""

    def test_views_exist(self, mock_db):
        """物化视图存在"""
        mock_db.execute.return_value.fetchone.return_value = {"ispopulated": True}

        result = _has_materialized_views(mock_db)

        assert result is True

    def test_views_not_populated(self, mock_db):
        """物化视图存在但未填充"""
        mock_db.execute.return_value.fetchone.return_value = {"ispopulated": False}

        result = _has_materialized_views(mock_db)

        assert result is False

    def test_views_not_exist(self, mock_db):
        """物化视图不存在"""
        mock_db.execute.return_value.fetchone.return_value = None

        result = _has_materialized_views(mock_db)

        assert result is False


class TestFetchHorseNetwork:
    """测试网络查询"""

    def test_basic_network(self, mock_db):
        """基础网络查询"""
        mock_links = [
            {"source": "123", "target": "456", "weight": 3},
        ]
        mock_nodes = [
            {"id": "123", "name": "馬A", "sex": "牡", "prize_score": 10000.0, "active_year": 2023},
            {"id": "456", "name": "馬B", "sex": "牝", "prize_score": 8000.0, "active_year": 2022},
        ]

        _setup_mock_execute(mock_db, [
            {"fetchone": {"ispopulated": True}},
            {"fetchall": mock_links},
            {"fetchall": mock_nodes},
        ])

        result = fetch_horse_network(min_intersections=2, min_prize=0.0)

        assert "nodes" in result
        assert "links" in result
        assert len(result["links"]) == 1
        assert len(result["nodes"]) == 2

    def test_empty_links(self, mock_db):
        """无连线时返回空"""
        _setup_mock_execute(mock_db, [
            {"fetchone": {"ispopulated": True}},
            {"fetchall": []},
        ])

        result = fetch_horse_network()

        assert result == {"nodes": [], "links": []}

    def test_prize_filtering(self, mock_db):
        """奖金过滤正常工作"""
        mock_links = [
            {"source": "123", "target": "456", "weight": 2},
            {"source": "123", "target": "789", "weight": 2},
        ]
        mock_nodes = [
            {"id": "123", "name": "馬A", "sex": "牡", "prize_score": 15000.0, "active_year": 2023},
            {"id": "456", "name": "馬B", "sex": "牡", "prize_score": 12000.0, "active_year": 2022},
        ]

        _setup_mock_execute(mock_db, [
            {"fetchone": {"ispopulated": True}},
            {"fetchall": mock_links},
            {"fetchall": mock_nodes},
        ])

        result = fetch_horse_network(min_prize=5000.0)

        assert len(result["links"]) == 1
        assert result["links"][0]["source"] == "123"
        assert result["links"][0]["target"] == "456"

    def test_node_prize_aggregation(self, mock_db):
        """节点奖金聚合"""
        mock_links = [{"source": "001", "target": "002", "weight": 2}]
        mock_nodes = [
            {"id": "001", "name": "テスト", "sex": "牡", "prize_score": 20000.0, "active_year": 2021},
        ]

        _setup_mock_execute(mock_db, [
            {"fetchone": {"ispopulated": True}},
            {"fetchall": mock_links},
            {"fetchall": mock_nodes},
        ])

        result = fetch_horse_network()

        assert len(result["links"]) == 0


class TestFetchPedigreeLinks:
    """测试血统边查询"""

    def test_basic_pedigree(self, mock_db):
        """基础血统查询"""
        mock_rows = [
            {"child": "123", "parent": "456", "parent_type": "sire"},
        ]
        mock_db.execute.return_value.fetchall.return_value = mock_rows

        result = fetch_pedigree_links(["123", "456"])

        assert len(result) == 1
        assert result[0]["source"] == "456"
        assert result[0]["target"] == "123"
        assert result[0]["linkType"] == "sire"

    def test_empty_node_list(self, mock_db):
        """空节点列表"""
        result = fetch_pedigree_links([])

        assert result == []
        mock_db.execute.assert_not_called()

    def test_sire_only_filter(self, mock_db):
        """仅查询父系"""
        mock_db.execute.return_value.fetchall.return_value = []

        fetch_pedigree_links(["123"], parent_types=["sire"])

        # 验证 SQL 中包含 sire 过滤
        call_args = mock_db.execute.call_args
        query = call_args[0][0]
        assert "'sire'" in query

    def test_dam_only_filter(self, mock_db):
        """仅查询母系"""
        mock_db.execute.return_value.fetchall.return_value = []

        fetch_pedigree_links(["123"], parent_types=["dam"])

        call_args = mock_db.execute.call_args
        query = call_args[0][0]
        assert "'dam'" in query

    def test_both_sire_and_dam(self, mock_db):
        """同时查询父系和母系"""
        mock_db.execute.return_value.fetchall.return_value = []

        fetch_pedigree_links(["123"], parent_types=["sire", "dam"])

        call_args = mock_db.execute.call_args
        query = call_args[0][0]
        assert "'sire'" in query
        assert "'dam'" in query

    def test_no_parent_types(self, mock_db):
        """不指定 parent_types 时查询全部"""
        mock_db.execute.return_value.fetchall.return_value = []

        fetch_pedigree_links(["123"], parent_types=None)

        call_args = mock_db.execute.call_args
        query = call_args[0][0]
        # 不应包含类型过滤
        assert "parent_type.parent_type IN" not in query


class TestQueryModes:
    """测试不同查询模式"""

    def test_strict_mode_with_mv(self, mock_db):
        """严格模式 + 物化视图"""
        mock_db.execute.return_value.fetchone.return_value = {"ispopulated": True}
        mock_db.execute.return_value.fetchall.return_value = []

        fetch_horse_network(strict_rank_mode=True, max_rank=10)

        # 验证查询中使用了 kakutei_jyuni 过滤
        call_args = mock_db.execute.call_args
        query = call_args[0][0]
        assert "qualified_records" in query or "qualified_horses" in query

    def test_loose_mode_with_mv(self, mock_db):
        """宽松模式 + 物化视图"""
        mock_db.execute.return_value.fetchone.return_value = {"ispopulated": True}
        mock_db.execute.return_value.fetchall.return_value = []

        fetch_horse_network(strict_rank_mode=False, max_rank=10)

        call_args = mock_db.execute.call_args
        query = call_args[0][0]
        assert "qualified_horses" in query

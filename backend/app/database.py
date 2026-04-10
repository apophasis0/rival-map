import os
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from dotenv import load_dotenv

load_dotenv()

# 全局连接池对象，在 lifespan 中初始化
pool: ConnectionPool | None = None


def init_db_pool():
    """在 FastAPI 启动时调用，初始化连接池"""
    global pool
    pool = ConnectionPool(
        conninfo=f"dbname={os.getenv('DB_NAME')} "
                 f"user={os.getenv('DB_USER')} "
                 f"password={os.getenv('DB_PASSWORD')} "
                 f"host={os.getenv('DB_HOST')} "
                 f"port={os.getenv('DB_PORT')}",
        min_size=5,
        max_size=20,
        row_factory=dict_row,
        open=True,  # 立即打开连接池
    )
    print(f"[DB] 连接池已初始化: min_size=5, max_size=20")


def close_db_pool():
    """在 FastAPI 关闭时调用，关闭连接池"""
    global pool
    if pool:
        pool.close()
        print("[DB] 连接池已关闭")


def get_db_connection():
    """
    返回连接池中的连接上下文管理器。
    使用方式: with get_db_connection() as conn: ...
    离开 with 块时连接会自动归还到池中。
    """
    if pool is None:
        raise RuntimeError("数据库连接池尚未初始化，请先调用 init_db_pool()")
    return pool.connection()
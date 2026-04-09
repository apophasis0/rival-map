import os
import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    # 使用 dict_row 让查询结果直接返回字典格式，方便前端 JSON 化
    conn = psycopg.connect(
        conninfo=f"dbname={os.getenv('DB_NAME')} "
                 f"user={os.getenv('DB_USER')} "
                 f"password={os.getenv('DB_PASSWORD')} "
                 f"host={os.getenv('DB_HOST')} "
                 f"port={os.getenv('DB_PORT')}",
        row_factory=dict_row
    )
    return conn
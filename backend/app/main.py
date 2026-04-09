from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="JRA Network API")

# 配置 CORS，允许前端 Vite (通常在 5173 端口) 跨域请求后端 API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from fastapi import FastAPI, Query
from .graph_service import fetch_horse_network
# ... 保持之前的 CORSMiddleware 配置不变 ...

@app.get("/api/network")
async def get_network(min_weight: int = Query(2, alias="minWeight")):
    """
    接收前端传来的参数，动态调整图谱密度
    """
    data = fetch_horse_network(min_intersections=min_weight)
    return data

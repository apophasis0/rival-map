import './style.css';
import * as d3 from 'd3';

// 接口保持不变
interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    prize_score: number | null;
    name: string;
    sex: string;
    active_year: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: string | GraphNode;
    target: string | GraphNode;
    weight: number;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

const API_BASE_URL = 'http://localhost:8000/api/network';

// 在文件末尾或全局作用域获取 DOM
const showLabelsToggle = document.getElementById("showLabelsToggle") as HTMLInputElement;

// 监听勾选框变化，无需重新请求数据，直接通过 D3 操控透明度
showLabelsToggle.addEventListener("change", (e) => {
    const isChecked = (e.target as HTMLInputElement).checked;
    // 如果勾选，显示所有标签；如果不勾选，暂时全部隐藏（等待 hover 触发）
    d3.selectAll(".node-label").style("opacity", isChecked ? 1 : 0);
});

async function renderNetwork(minWeight: number) {
    try {
        const response = await fetch(`${API_BASE_URL}?minWeight=${minWeight}`);
        const graph: GraphData = await response.json();

        const width = window.innerWidth;
        const height = window.innerHeight;
        const tooltip = d3.select("#tooltip");

        // 清空旧图层
        d3.select("#app").selectAll("svg").remove();

        const svg = d3.select("#app")
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [0, 0, width, height]);

        // ==========================================
        // 【新增缩放核心逻辑】
        // 1. 创建一个包裹所有节点和连线的全局主容器
        const container = svg.append("g")
            .attr("class", "zoom-container");

        // 2. 定义 D3 缩放行为
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 8]) // 限制缩放范围：最小 0.1 倍，最大 8 倍
            .on("zoom", (event) => {
                // 当监听到滚轮缩放或画布拖拽时，改变主容器的 transform 属性
                container.attr("transform", event.transform);
            });

        // 3. 将缩放行为绑定到最外层 SVG 画布上，并禁用双击放大（保留双击用于其他交互）
        svg.call(zoom)
           .on("dblclick.zoom", null);
        // ==========================================

        // 计算当前数据集中奖金的最大值，用于颜色映射
        const maxPrize = d3.max(graph.nodes, d => d.prize_score) || 1000;

        // 创建一个颜色比例尺 (从青色过渡到紫色再到金色)
        const colorScale = d3.scaleLinear<string>()
            .domain([0, maxPrize * 0.3, maxPrize]) // 三段式映射
            .range(["#00f3ff", "#b026ff", "#ffd700"]); // 青 -> 紫 -> 金

        // 计算年份的最小值和最大值 (例如 1986 到 2024)
        const minYear = d3.min(graph.nodes, d => d.active_year) || 1986;
        const maxYear = d3.max(graph.nodes, d => d.active_year) || 2024;

        // 创建一个 X 轴坐标比例尺，把年份映射到屏幕宽度的 5% 到 95% 的区间
        const timeScaleX = d3.scaleLinear()
            .domain([minYear, maxYear])
            .range([width * 0.05, width * 0.95]);

        // 辅助函数：计算节点半径 (被你不小心删掉了，现在补回)
        function getRadius(prize: number | null): number {
            if (!prize) return 4;
            return Math.max(4, Math.sqrt(prize) * 0.1);
        }

        // 配置物理引擎 (严格保留你修改过的参数)
        const simulation = d3.forceSimulation<GraphNode>(graph.nodes)
            .force("link", d3.forceLink<GraphNode, GraphLink>(graph.links)
                .id(d => d.id)
                .distance(d => Math.max(20, 200 / d.weight))
            )
            .force("charge", d3.forceManyBody().strength(-1500))
            .force("collide", d3.forceCollide().radius(d => getRadius(d.prize_score) + 4))
            .force("y", d3.forceY(height / 2).strength(0.75))
            .force("x", d3.forceX<GraphNode>(d => timeScaleX(d.active_year)).strength(0.65));

        // --- 绘制背景时间基准线 ---
        const decades = [1990, 2000, 2010, 2020];
        const timeGrid = container.append("g").attr("class", "time-grid");

        decades.forEach(year => {
            timeGrid.append("line")
                .attr("x1", timeScaleX(year))
                .attr("x2", timeScaleX(year))
                .attr("y1", -height * 2)
                .attr("y2", height * 2)
                .attr("stroke", "rgba(255, 255, 255, 0.1)")
                .attr("stroke-dasharray", "4,4");

            timeGrid.append("text")
                .attr("x", timeScaleX(year) + 10)
                .attr("y", 100)
                .attr("fill", "rgba(255, 255, 255, 0.3)")
                .attr("font-size", "24px")
                .attr("font-weight", "bold")
                .text(`${year}s`);
        });

        // 构建标准的邻接表 (Adjacency List)
        const adjMap = new Map<string, Set<string>>();

        graph.links.forEach(d => {
            const s = typeof d.source === "object" ? d.source.id : d.source;
            const t = typeof d.target === "object" ? d.target.id : d.target;

            if (!adjMap.has(s)) adjMap.set(s, new Set());
            if (!adjMap.has(t)) adjMap.set(t, new Set());

            adjMap.get(s)!.add(t);
            adjMap.get(t)!.add(s);
        });

        // 辅助函数：判断目标节点是否在中心节点的“两跳”范围内
        function isTwoHopNeighbor(centerId: string, targetId: string) {
            // 0跳：自身
            if (centerId === targetId) return true;

            const neighbors = adjMap.get(centerId);
            if (!neighbors) return false;

            // 1跳：直接邻居
            if (neighbors.has(targetId)) return true;

            // 2跳：遍历所有直接邻居，看它们的邻居中是否包含目标节点
            for (const neighborId of neighbors) {
                const neighborsOfNeighbor = adjMap.get(neighborId);
                if (neighborsOfNeighbor && neighborsOfNeighbor.has(targetId)) {
                    return true;
                }
            }

            return false;
        }

        // 绘制连线
        const link = container.append("g")
            .selectAll("line")
            .data(graph.links)
            .join("line")
            .attr("class", "link")
            .attr("stroke-width", d => Math.sqrt(d.weight))
            .style("stroke-opacity", d => Math.min(0.8, 0.2 + d.weight * 0.05));

        // 绘制节点组 (补回了丢失的 data().join() 逻辑)
        const node = container.append("g")
            .selectAll("g")
            .data(graph.nodes)
            .join("g")
            .call(d3.drag<SVGGElement, GraphNode>()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        // 添加圆圈并修改 mouseover/mouseout 事件
        // 添加圆圈并绑定鼠标事件
        node.append("circle")
            .attr("class", "node")
            .attr("r", d => getRadius(d.prize_score))
            .attr("fill", d => colorScale(d.prize_score || 0))
            .on("mouseover", (event, d) => {
                // 1. 渐进式两跳发光连线
                link.style("stroke", l => {
                        const sId = typeof l.source === "object" ? (l.source as GraphNode).id : l.source as string;
                        const tId = typeof l.target === "object" ? (l.target as GraphNode).id : l.target as string;
                        if (sId === d.id || tId === d.id) return "#00f3ff";
                        if (isTwoHopNeighbor(d.id, sId) && isTwoHopNeighbor(d.id, tId)) return "#0033ff";
                        return "#4299e1";
                    })
                    .style("stroke-opacity", l => {
                        const sId = typeof l.source === "object" ? (l.source as GraphNode).id : l.source as string;
                        const tId = typeof l.target === "object" ? (l.target as GraphNode).id : l.target as string;
                        if (sId === d.id || tId === d.id) return 1;
                        if (isTwoHopNeighbor(d.id, sId) && isTwoHopNeighbor(d.id, tId)) return 0.5;
                        return 0.05;
                    });

                // 2. 动态点亮周围两跳的标签
                if (!showLabelsToggle.checked) {
                    d3.selectAll(".node-label")
                      .style("opacity", (n: any) => isTwoHopNeighbor(d.id, n.id) ? 1 : 0);
                }

                // 3. 渲染 Tooltip 提示框
                const prizeText = d.prize_score ? `约 ${Math.round(d.prize_score)} 万日元` : '无数据';
                let sexText = d.sex === 'male' ? '牡马 (公)' : d.sex === 'female' ? '牝马 (母)' : d.sex === 'gelding' ? '骟马 (阉)' : d.sex;

                tooltip.style("opacity", 1)
                       .html(`
                           <strong>${d.name}</strong> 
                           <span style="font-size: 12px; color: #a0aec0; font-weight: normal;">(ID: ${d.id})</span><br>
                           <span style="color: #cbd5e1;">性别:</span> ${sexText}<br>
                           <span style="color: #cbd5e1;">总奖金:</span> <span style="color: #ffd700;">${prizeText}</span>
                       `)
                       .style("left", (event.pageX + 20) + "px")
                       .style("top", (event.pageY - 20) + "px");
            })
            .on("mouseout", () => {
                // 1. 恢复连线的原本颜色和透明度
                link.style("stroke", "#4299e1")
                    .style("stroke-opacity", (d: any) => Math.min(0.8, 0.2 + d.weight * 0.05));

                // 2. 隐藏 Tooltip
                tooltip.style("opacity", 0);

                // 3. 恢复标签隐藏状态 (核心修复点)
                if (!showLabelsToggle.checked) {
                    // 如果全局开关是关的，鼠标移走后必须再次隐藏所有标签
                    d3.selectAll(".node-label").style("opacity", 0);
                } else {
                    // 如果全局开关是开的，则保持全亮
                    d3.selectAll(".node-label").style("opacity", 1);
                }
            });

        // 添加文字标签
        node.append("text")
            .attr("class", "node-label")
            .attr("dx", d => getRadius(d.prize_score) + 4)
            .attr("dy", 4)
            .text(d => d.name)
            .style("opacity", showLabelsToggle.checked ? 1 : 0);

        simulation.on("tick", () => {
            link
                .attr("x1", d => (d.source as GraphNode).x!)
                .attr("y1", d => (d.source as GraphNode).y!)
                .attr("x2", d => (d.target as GraphNode).x!)
                .attr("y2", d => (d.target as GraphNode).y!);

            node.attr("transform", d => `translate(${d.x},${d.y})`);
        });

        function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }

    } catch (error) {
        console.error("加载真实图谱数据失败:", error);
    }
}

// 绑定滑动条事件
const slider = document.getElementById("weightSlider") as HTMLInputElement;
const weightValueDisplay = document.getElementById("weightValue") as HTMLSpanElement;

slider.addEventListener("input", (e) => {
    weightValueDisplay.innerText = (e.target as HTMLInputElement).value;
});

slider.addEventListener("change", (e) => {
    const minWeight = parseInt((e.target as HTMLInputElement).value, 10);
    renderNetwork(minWeight);
});

renderNetwork(parseInt(slider.value, 10));
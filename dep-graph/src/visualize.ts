import { readFile, writeFile } from "fs/promises";

const graph = JSON.parse(await readFile("dependency_graph.json", "utf-8"));

// Group tools by service domain for better visualization
interface Node {
  id: string;
  name: string;
  toolkit: string;
  domain: string;
  inDegree: number;
  outDegree: number;
}

interface Edge {
  from: string;
  to: string;
  param: string;
  reason: string;
  confidence: string;
}

// Extract domain from slug
function getDomain(slug: string): string {
  const prefix = slug.startsWith("GOOGLESUPER_") ? "GOOGLESUPER_" : "GITHUB_";
  const rest = slug.replace(prefix, "");
  // Group by first meaningful word(s)
  const parts = rest.split("_");
  // Match by multi-word prefixes first, then single-word
  const multiWordServices: [string, string][] = [
    ["REPLY_TO", "Gmail"], ["SEND_EMAIL", "Gmail"], ["SEND_DRAFT", "Gmail"],
    ["FETCH_EMAIL", "Gmail"], ["FETCH_MESSAGE", "Gmail"], ["CREATE_EMAIL", "Gmail"],
    ["FORWARD_MESSAGE", "Gmail"], ["IMPORT_MESSAGE", "Gmail"], ["INSERT_MESSAGE", "Gmail"],
    ["DELETE_MESSAGE", "Gmail"], ["UNTRASH_MESSAGE", "Gmail"], ["UNTRASH_THREAD", "Gmail"],
    ["MODIFY_THREAD", "Gmail"], ["MOVE_THREAD", "Gmail"], ["INSERT_INLINE", "Gmail"],
    ["ADD_LABEL", "Gmail"], ["GET_DRAFT", "Gmail"], ["LIST_DRAFTS", "Gmail"],
    ["LIST_MESSAGES", "Gmail"], ["LIST_HISTORY", "Gmail"], ["GET_ATTACHMENT", "Gmail"],
    ["FIND_WORKSHEET", "Sheets"], ["GET_SHEET", "Sheets"], ["SEARCH_DEVELOPER", "Sheets"],
    ["LOOKUP_SPREADSHEET", "Sheets"], ["AGGREGATE_COLUMN", "Sheets"],
    ["EXECUTE_SQL", "Sheets"], ["QUERY_TABLE", "Sheets"], ["LIST_TABLES", "Sheets"],
    ["GET_TABLE", "Sheets"], ["SEARCH_SPREADSHEETS", "Sheets"],
    ["UPSERT_ROWS", "Sheets"], ["SHEET_FROM", "Sheets"],
    ["CREATE_DOCUMENT", "Docs"], ["COPY_DOCUMENT", "Docs"], ["GET_DOCUMENT", "Docs"],
    ["UPDATE_DOCUMENT", "Docs"], ["EXPORT_DOCUMENT", "Docs"], ["EXPORT_GOOGLE", "Docs"],
    ["CREATE_FOOTNOTE", "Docs"], ["CREATE_HEADER", "Docs"], ["CREATE_FOOTER", "Docs"],
    ["CREATE_PARAGRAPH", "Docs"], ["DELETE_CONTENT", "Docs"], ["DELETE_FOOTER", "Docs"],
    ["DELETE_HEADER", "Docs"], ["DELETE_NAMED", "Docs"], ["DELETE_PARAGRAPH", "Docs"],
    ["DELETE_TABLE", "Docs"], ["INSERT_PAGE", "Docs"], ["INSERT_TABLE", "Docs"],
    ["INSERT_TEXT", "Docs"], ["REPLACE_ALL", "Docs"], ["REPLACE_IMAGE", "Docs"],
    ["UNMERGE_TABLE", "Docs"], ["UPDATE_TABLE", "Docs"], ["CREATE_NAMED", "Docs"],
    ["UPDATE_EXISTING", "Docs"],
    ["CREATE_PRESENTATION", "Slides"], ["GET_PAGE", "Slides"], ["CREATE_SLIDES", "Slides"],
    ["TEXT_SEARCH", "Places"], ["GET_PLACE", "Places"], ["NEARBY_SEARCH", "Places"],
    ["GET_TRANSCRIPT", "Meet"], ["LIST_TRANSCRIPT", "Meet"], ["GET_TRANSCRIPTS", "Meet"],
    ["LIST_CONFERENCE", "Meet"], ["LIST_PARTICIPANTS", "Meet"], ["LIST_PARTICIPANT", "Meet"],
    ["GET_PARTICIPANT", "Meet"],
    ["CHECK_COMPATIBILITY", "Analytics"], ["RUN_REPORT", "Analytics"],
    ["QUICK_ADD", "Calendar"], ["SYNC_EVENTS", "Calendar"], ["REMOVE_ATTENDEE", "Calendar"],
    ["GOOGLE_DRIVE", "Drive"], ["PARSE_FILE", "Drive"], ["WATCH_FILE", "Drive"],
    ["UPLOAD_UPLOAD", "Drive"],
  ];

  for (const [prefix, svc] of multiWordServices) {
    if (rest.startsWith(prefix)) return `Google/${svc}`;
  }

  const services: Record<string, string> = {
    GMAIL: "Gmail", CALENDAR: "Calendar", EVENTS: "Calendar",
    SPREADSHEETS: "Sheets", SHEETS: "Sheets", SPREADSHEET: "Sheets",
    DOCS: "Docs", SLIDES: "Slides", DRIVE: "Drive",
    CONTACTS: "Contacts", PEOPLE: "Contacts",
    ACL: "Calendar", COLORS: "Calendar", SETTINGS: "Calendar",
    FILE: "Drive", FOLDER: "Drive", ABOUT: "Drive", CHANGES: "Drive",
    CHANNELS: "Channels", PERMISSIONS: "Drive",
    PRESENTATIONS: "Slides", PRESENTATION: "Slides",
    TABLE: "Sheets", LOOKUP: "Sheets", AGGREGATE: "Sheets",
    QUERY: "Sheets", EXECUTE: "Sheets",
    COMMENT: "Drive", REPLY: "Drive", REVISION: "Drive",
    PARENT: "Drive", PROPERTY: "Drive",
    COPY: "Drive", DOWNLOAD: "Drive", MOVE: "Drive", UNTRASH: "Drive",
    TRASH: "Drive", MODIFY: "Drive", EDIT: "Drive", FIND: "Drive",
    CREATE: "Drive", DELETE: "Drive", UPDATE: "Drive", LIST: "Drive",
    EXPORT: "Drive", ADD: "Drive", GET: "Drive", VALUES: "Sheets",
    FORMAT: "Sheets", CLEAR: "Sheets", APPEND: "Sheets", BATCH: "Sheets",
    INSERT: "Sheets", SET: "Sheets", MUTATE: "Sheets", CONDITIONAL: "Sheets",
    CHART: "Sheets", DIMENSION: "Sheets", DATA: "Sheets",
  };

  if (prefix === "GITHUB_") {
    // GitHub domains
    const ghServices: Record<string, string> = {
      ISSUE: "Issues", ISSUES: "Issues",
      PULL: "Pull Requests", PR: "Pull Requests",
      REPO: "Repositories", REPOSITORY: "Repositories",
      COMMIT: "Commits", COMMITS: "Commits",
      BRANCH: "Branches", BRANCHES: "Branches",
      RELEASE: "Releases", RELEASES: "Releases",
      WORKFLOW: "Actions", ACTIONS: "Actions", RUN: "Actions",
      GIST: "Gists", GISTS: "Gists",
      ORG: "Organizations", ORGANIZATION: "Organizations",
      TEAM: "Teams", TEAMS: "Teams",
      CHECK: "Checks", CHECKS: "Checks",
      DEPLOYMENT: "Deployments", DEPLOY: "Deployments",
      HOOK: "Webhooks", WEBHOOK: "Webhooks",
      LABEL: "Labels", LABELS: "Labels",
      MILESTONE: "Milestones",
      COMMENT: "Comments", COMMENTS: "Comments",
      REVIEW: "Reviews", REVIEWS: "Reviews",
      TAG: "Tags", TAGS: "Tags",
      PROJECT: "Projects",
      NOTIFICATION: "Notifications",
      PACKAGE: "Packages",
      CODESPACE: "Codespaces",
      SECRET: "Secrets",
      VARIABLE: "Variables",
      ARTIFACT: "Actions",
      STARGAZER: "Stars", STAR: "Stars",
      FORK: "Forks",
    };
    for (const p of parts) {
      if (ghServices[p]) return `GitHub/${ghServices[p]}`;
    }
    return "GitHub/Other";
  }

  for (const p of parts) {
    if (services[p]) return `Google/${services[p]}`;
  }
  return `Google/Other`;
}

// Process nodes
const inDeg = new Map<string, number>();
const outDeg = new Map<string, number>();
for (const e of graph.edges) {
  inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
  outDeg.set(e.from, (outDeg.get(e.from) || 0) + 1);
}

const nodes: Node[] = graph.nodes.map((n: any) => ({
  ...n,
  domain: getDomain(n.id),
  inDegree: inDeg.get(n.id) || 0,
  outDegree: outDeg.get(n.id) || 0,
}));

// Domain colors
const domains = [...new Set(nodes.map(n => n.domain))].sort();
console.log(`Domains: ${domains.length}`);
domains.forEach(d => {
  const count = nodes.filter(n => n.domain === d).length;
  console.log(`  ${d}: ${count} tools`);
});

// Build the HTML visualization
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Composio Tool Dependency Graph</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; overflow: hidden; }
  #controls {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    background: rgba(13,17,23,0.95); border-bottom: 1px solid #30363d;
    padding: 12px 20px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
  }
  #controls h1 { font-size: 16px; color: #58a6ff; margin-right: 12px; }
  #controls select, #controls input {
    background: #161b22; border: 1px solid #30363d; color: #c9d1d9;
    padding: 6px 10px; border-radius: 6px; font-size: 13px;
  }
  #controls label { font-size: 13px; color: #8b949e; }
  #controls .stat { font-size: 12px; color: #8b949e; margin-left: auto; }
  #tooltip {
    position: fixed; display: none; background: #161b22; border: 1px solid #30363d;
    border-radius: 8px; padding: 12px; font-size: 12px; max-width: 400px;
    z-index: 200; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  #tooltip h3 { color: #58a6ff; margin-bottom: 6px; font-size: 14px; }
  #tooltip .domain-badge {
    display: inline-block; padding: 2px 8px; border-radius: 12px;
    font-size: 11px; margin-bottom: 6px;
  }
  #tooltip .deps { margin-top: 8px; }
  #tooltip .deps dt { color: #8b949e; font-size: 11px; }
  #tooltip .deps dd { color: #c9d1d9; margin-bottom: 4px; }
  #legend {
    position: fixed; bottom: 12px; left: 12px; background: rgba(22,27,34,0.95);
    border: 1px solid #30363d; border-radius: 8px; padding: 12px;
    font-size: 11px; z-index: 100; max-height: 300px; overflow-y: auto;
  }
  #legend h3 { color: #58a6ff; margin-bottom: 8px; font-size: 13px; }
  .legend-item { display: flex; align-items: center; gap: 6px; margin: 3px 0; cursor: pointer; }
  .legend-item:hover { color: #f0f6fc; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  canvas { display: block; }
  #info-panel {
    position: fixed; top: 60px; right: 12px; width: 320px;
    background: rgba(22,27,34,0.95); border: 1px solid #30363d;
    border-radius: 8px; padding: 16px; z-index: 100; display: none;
    max-height: calc(100vh - 80px); overflow-y: auto;
  }
  #info-panel h3 { color: #58a6ff; margin-bottom: 8px; }
  #info-panel .close { position: absolute; top: 8px; right: 12px; cursor: pointer; color: #8b949e; }
  #info-panel ul { list-style: none; padding: 0; }
  #info-panel li { padding: 3px 0; font-size: 12px; border-bottom: 1px solid #21262d; }
  #info-panel li .arrow { color: #3fb950; margin: 0 4px; }
  #info-panel li .param { color: #d2a8ff; font-size: 11px; }
  .conf-high { color: #3fb950; }
  .conf-medium { color: #d29922; }
  .conf-low { color: #8b949e; }
</style>
</head>
<body>
<div id="controls">
  <h1>Composio Tool Dependency Graph</h1>
  <label>Filter:
    <select id="domainFilter">
      <option value="all">All Domains</option>
      <option value="google">Google Only</option>
      <option value="github">GitHub Only</option>
      ${domains.map(d => `<option value="${d}">${d}</option>`).join("\n      ")}
    </select>
  </label>
  <label>Confidence:
    <select id="confFilter">
      <option value="all">All</option>
      <option value="high">High only</option>
      <option value="high+medium">High + Medium</option>
    </select>
  </label>
  <label>Search:
    <input type="text" id="search" placeholder="Search tools..." />
  </label>
  <span class="stat" id="stats"></span>
</div>
<div id="tooltip"></div>
<div id="legend">
  <h3>Domains</h3>
  <div id="legend-items"></div>
</div>
<div id="info-panel">
  <span class="close" onclick="document.getElementById('info-panel').style.display='none'">&times;</span>
  <h3 id="panel-title"></h3>
  <p id="panel-desc" style="font-size:12px;color:#8b949e;margin-bottom:8px"></p>
  <div id="panel-deps-in"><h4 style="color:#3fb950;font-size:12px">Dependencies (needs data from):</h4><ul id="deps-in-list"></ul></div>
  <div id="panel-deps-out" style="margin-top:12px"><h4 style="color:#d29922;font-size:12px">Dependents (provides data to):</h4><ul id="deps-out-list"></ul></div>
</div>
<canvas id="canvas"></canvas>

<script>
const graphData = ${JSON.stringify({ nodes, edges: graph.edges })};
const domainColors = {};
const palette = [
  '#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#79c0ff',
  '#56d364','#e3b341','#ff7b72','#d2a8ff','#a5d6ff','#7ee787',
  '#f0883e','#ff9bce','#39d353','#db6d28','#388bfd','#bf4b8a',
  '#8957e5','#ec6547','#2ea043','#0550ae',
];
const domains = [...new Set(graphData.nodes.map(n => n.domain))].sort();
domains.forEach((d, i) => { domainColors[d] = palette[i % palette.length]; });

// Legend
const legendEl = document.getElementById('legend-items');
domains.forEach(d => {
  const count = graphData.nodes.filter(n => n.domain === d).length;
  const item = document.createElement('div');
  item.className = 'legend-item';
  item.innerHTML = '<span class="legend-dot" style="background:' + domainColors[d] + '"></span>' + d + ' (' + count + ')';
  item.onclick = () => { document.getElementById('domainFilter').value = d; filterGraph(); };
  legendEl.appendChild(item);
});

// Canvas setup
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W, H;
function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
resize();
window.addEventListener('resize', () => { resize(); draw(); });

// Layout: force-directed simulation
let simNodes = [];
let simEdges = [];
let filteredNodes = new Set();
let filteredEdges = [];

function initSim() {
  const nodeById = {};
  simNodes = graphData.nodes.map((n, i) => {
    const angle = (i / graphData.nodes.length) * Math.PI * 2;
    const r = 200 + Math.random() * 200;
    const node = {
      ...n, x: W/2 + Math.cos(angle) * r, y: H/2 + Math.sin(angle) * r,
      vx: 0, vy: 0, fx: null, fy: null,
    };
    nodeById[n.id] = node;
    return node;
  });
  simEdges = graphData.edges.map(e => ({
    ...e, source: nodeById[e.from], target: nodeById[e.to],
  })).filter(e => e.source && e.target);

  filterGraph();
}

function filterGraph() {
  const domainVal = document.getElementById('domainFilter').value;
  const confVal = document.getElementById('confFilter').value;
  const searchVal = document.getElementById('search').value.toLowerCase();

  filteredNodes = new Set();
  filteredEdges = [];

  // Filter edges
  for (const e of simEdges) {
    if (confVal === 'high' && e.confidence !== 'high') continue;
    if (confVal === 'high+medium' && e.confidence === 'low') continue;

    const srcMatch = matchDomain(e.source, domainVal) && matchSearch(e.source, searchVal);
    const tgtMatch = matchDomain(e.target, domainVal) && matchSearch(e.target, searchVal);

    if (domainVal === 'all' && !searchVal) {
      // Show all matching edges
      filteredEdges.push(e);
      filteredNodes.add(e.source.id);
      filteredNodes.add(e.target.id);
    } else if (searchVal) {
      // Show edges connected to search matches
      if (srcMatch || tgtMatch) {
        filteredEdges.push(e);
        filteredNodes.add(e.source.id);
        filteredNodes.add(e.target.id);
      }
    } else {
      // Domain filter
      if (srcMatch || tgtMatch) {
        filteredEdges.push(e);
        filteredNodes.add(e.source.id);
        filteredNodes.add(e.target.id);
      }
    }
  }

  document.getElementById('stats').textContent =
    filteredNodes.size + ' nodes, ' + filteredEdges.length + ' edges';
  draw();
}

function matchDomain(node, filter) {
  if (filter === 'all') return true;
  if (filter === 'google') return node.domain.startsWith('Google/');
  if (filter === 'github') return node.domain.startsWith('GitHub/');
  return node.domain === filter;
}

function matchSearch(node, search) {
  if (!search) return true;
  return node.id.toLowerCase().includes(search) || node.name.toLowerCase().includes(search);
}

// Physics simulation
let simRunning = true;
let alpha = 1;

function simulate() {
  if (!simRunning) return;
  if (alpha < 0.001) { simRunning = false; return; }
  alpha *= 0.995;

  const nodes = simNodes;
  const edges = simEdges;

  // Center gravity
  for (const n of nodes) {
    n.vx += (W/2 - n.x) * 0.0001;
    n.vy += (H/2 - n.y) * 0.0001;
  }

  // Repulsion (only between visible nodes, sampled for performance)
  const visible = nodes.filter(n => filteredNodes.has(n.id));
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i], b = visible[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d2 = dx*dx + dy*dy;
      if (d2 < 1) d2 = 1;
      if (d2 > 90000) continue; // skip far nodes
      const f = -300 / d2 * alpha;
      const fx = dx * f, fy = dy * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
  }

  // Spring (edges)
  for (const e of filteredEdges) {
    const s = e.source, t = e.target;
    let dx = t.x - s.x, dy = t.y - s.y;
    let d = Math.sqrt(dx*dx + dy*dy) || 1;
    const f = (d - 80) * 0.001 * alpha;
    const fx = (dx/d) * f, fy = (dy/d) * f;
    s.vx += fx; s.vy += fy;
    t.vx -= fx; t.vy -= fy;
  }

  // Update positions
  for (const n of nodes) {
    if (n.fx !== null) { n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0; continue; }
    n.vx *= 0.9; n.vy *= 0.9;
    n.x += n.vx; n.y += n.vy;
    // Bounds
    n.x = Math.max(20, Math.min(W-20, n.x));
    n.y = Math.max(60, Math.min(H-20, n.y));
  }

  draw();
  requestAnimationFrame(simulate);
}

// Pan & Zoom
let transform = { x: 0, y: 0, k: 1 };

function screenToWorld(sx, sy) {
  return { x: (sx - transform.x) / transform.k, y: (sy - transform.y) / transform.k };
}
function worldToScreen(wx, wy) {
  return { x: wx * transform.k + transform.x, y: wy * transform.k + transform.y };
}

// Drawing
let hoveredNode = null;
let selectedNode = null;

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  // Draw edges
  for (const e of filteredEdges) {
    const isHighlighted = hoveredNode && (e.source.id === hoveredNode.id || e.target.id === hoveredNode.id);
    const isSelected = selectedNode && (e.source.id === selectedNode.id || e.target.id === selectedNode.id);

    if (hoveredNode && !isHighlighted && !isSelected) {
      ctx.strokeStyle = 'rgba(48,54,61,0.15)';
      ctx.lineWidth = 0.3;
    } else if (isHighlighted || isSelected) {
      ctx.strokeStyle = e.confidence === 'high' ? 'rgba(63,185,80,0.8)' :
                        e.confidence === 'medium' ? 'rgba(210,153,34,0.6)' : 'rgba(139,148,158,0.4)';
      ctx.lineWidth = isHighlighted ? 2 : 1.5;
    } else {
      ctx.strokeStyle = e.confidence === 'high' ? 'rgba(63,185,80,0.35)' :
                        e.confidence === 'medium' ? 'rgba(210,153,34,0.15)' : 'rgba(139,148,158,0.1)';
      ctx.lineWidth = e.confidence === 'high' ? 1 : 0.5;
    }

    ctx.beginPath();
    ctx.moveTo(e.source.x, e.source.y);

    // Draw arrow
    const dx = e.target.x - e.source.x;
    const dy = e.target.y - e.source.y;
    const d = Math.sqrt(dx*dx + dy*dy) || 1;
    const r = 5 + Math.min((e.target.outDegree + e.target.inDegree) * 0.3, 8);
    const ex = e.target.x - (dx/d) * r;
    const ey = e.target.y - (dy/d) * r;

    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Arrowhead
    if ((isHighlighted || isSelected || e.confidence === 'high') && d > 30) {
      const angle = Math.atan2(dy, dx);
      const aLen = isHighlighted ? 8 : 5;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - aLen * Math.cos(angle - 0.3), ey - aLen * Math.sin(angle - 0.3));
      ctx.lineTo(ex - aLen * Math.cos(angle + 0.3), ey - aLen * Math.sin(angle + 0.3));
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
  }

  // Draw nodes
  for (const n of simNodes) {
    if (!filteredNodes.has(n.id)) continue;

    const degree = n.inDegree + n.outDegree;
    const r = 4 + Math.min(degree * 0.3, 10);
    const isHovered = hoveredNode && hoveredNode.id === n.id;
    const isSelected = selectedNode && selectedNode.id === n.id;
    const isConnected = hoveredNode && filteredEdges.some(e =>
      (e.source.id === hoveredNode.id && e.target.id === n.id) ||
      (e.target.id === hoveredNode.id && e.source.id === n.id)
    );

    // Dim non-connected nodes when hovering
    let alpha_val = 1;
    if (hoveredNode && !isHovered && !isConnected) alpha_val = 0.15;

    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = domainColors[n.domain] || '#8b949e';
    ctx.globalAlpha = alpha_val;
    ctx.fill();

    if (isHovered || isSelected) {
      ctx.strokeStyle = '#f0f6fc';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Label for important or hovered nodes
    if ((isHovered || isConnected || isSelected || degree > 20) && transform.k > 0.4) {
      ctx.font = (isHovered ? 'bold 11px' : '9px') + ' -apple-system, sans-serif';
      ctx.fillStyle = isHovered ? '#f0f6fc' : 'rgba(201,209,217,0.8)';
      ctx.globalAlpha = alpha_val;
      const label = n.name || n.id.replace(/^(GOOGLESUPER_|GITHUB_)/, '');
      ctx.fillText(label, n.x + r + 3, n.y + 3);
    }

    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// Interaction
let dragNode = null;
let isPanning = false;
let lastMouse = { x: 0, y: 0 };

function findNode(sx, sy) {
  const { x, y } = screenToWorld(sx, sy);
  let best = null, bestD = Infinity;
  for (const n of simNodes) {
    if (!filteredNodes.has(n.id)) continue;
    const d = Math.sqrt((n.x - x)**2 + (n.y - y)**2);
    const r = 4 + Math.min((n.inDegree + n.outDegree) * 0.3, 10);
    if (d < r + 5 && d < bestD) { best = n; bestD = d; }
  }
  return best;
}

canvas.addEventListener('mousedown', e => {
  const node = findNode(e.clientX, e.clientY);
  if (node) {
    dragNode = node;
    node.fx = node.x; node.fy = node.y;
  } else {
    isPanning = true;
  }
  lastMouse = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mousemove', e => {
  if (dragNode) {
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    dragNode.fx = x; dragNode.fy = y;
    dragNode.x = x; dragNode.y = y;
    draw();
  } else if (isPanning) {
    transform.x += e.clientX - lastMouse.x;
    transform.y += e.clientY - lastMouse.y;
    lastMouse = { x: e.clientX, y: e.clientY };
    draw();
  } else {
    const node = findNode(e.clientX, e.clientY);
    if (node !== hoveredNode) {
      hoveredNode = node;
      draw();
      if (node) {
        const tooltip = document.getElementById('tooltip');
        const deps = filteredEdges.filter(e => e.target.id === node.id).length;
        const provides = filteredEdges.filter(e => e.source.id === node.id).length;
        tooltip.innerHTML = '<h3>' + (node.name || node.id) + '</h3>' +
          '<span class="domain-badge" style="background:' + domainColors[node.domain] + '33;color:' + domainColors[node.domain] + '">' + node.domain + '</span>' +
          '<p style="font-size:11px;color:#8b949e;margin-top:4px">' + node.id + '</p>' +
          '<dl class="deps"><dt>Depends on</dt><dd>' + deps + ' tools</dd>' +
          '<dt>Provides to</dt><dd>' + provides + ' tools</dd></dl>' +
          '<p style="font-size:10px;color:#484f58;margin-top:6px">Click for details</p>';
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 15) + 'px';
        tooltip.style.top = (e.clientY + 15) + 'px';
      } else {
        document.getElementById('tooltip').style.display = 'none';
      }
    } else if (node) {
      const tooltip = document.getElementById('tooltip');
      tooltip.style.left = (e.clientX + 15) + 'px';
      tooltip.style.top = (e.clientY + 15) + 'px';
    }
  }
});

canvas.addEventListener('mouseup', e => {
  if (dragNode) {
    dragNode.fx = null; dragNode.fy = null;
    dragNode = null;
    alpha = 0.3; simRunning = true; simulate();
  }
  if (!isPanning) {
    // Click
    const node = findNode(e.clientX, e.clientY);
    if (node) {
      selectedNode = node;
      showInfoPanel(node);
      draw();
    } else {
      selectedNode = null;
      document.getElementById('info-panel').style.display = 'none';
      draw();
    }
  }
  isPanning = false;
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const scale = e.deltaY > 0 ? 0.9 : 1.1;
  const mx = e.clientX, my = e.clientY;
  transform.x = mx - (mx - transform.x) * scale;
  transform.y = my - (my - transform.y) * scale;
  transform.k *= scale;
  draw();
}, { passive: false });

function showInfoPanel(node) {
  const panel = document.getElementById('info-panel');
  document.getElementById('panel-title').textContent = node.name || node.id;
  document.getElementById('panel-desc').textContent = node.id + ' (' + node.domain + ')';

  const depsIn = filteredEdges.filter(e => e.target.id === node.id);
  const depsOut = filteredEdges.filter(e => e.source.id === node.id);

  const inList = document.getElementById('deps-in-list');
  inList.innerHTML = depsIn.length === 0 ? '<li style="color:#484f58">None</li>' :
    depsIn.map(e => '<li><span class="conf-' + e.confidence + '">[' + e.confidence + ']</span> ' +
      e.source.name + ' <span class="arrow">→</span> <span class="param">' + e.param + '</span></li>').join('');

  const outList = document.getElementById('deps-out-list');
  outList.innerHTML = depsOut.length === 0 ? '<li style="color:#484f58">None</li>' :
    depsOut.map(e => '<li><span class="conf-' + e.confidence + '">[' + e.confidence + ']</span> ' +
      '<span class="arrow">→</span> ' + e.target.name + ' <span class="param">' + e.param + '</span></li>').join('');

  panel.style.display = 'block';
}

// Filter listeners
document.getElementById('domainFilter').addEventListener('change', filterGraph);
document.getElementById('confFilter').addEventListener('change', filterGraph);
document.getElementById('search').addEventListener('input', filterGraph);

// Start
initSim();
simulate();
</script>
</body>
</html>`;

await writeFile("graph.html", html, "utf-8");
console.log("Visualization written to graph.html");

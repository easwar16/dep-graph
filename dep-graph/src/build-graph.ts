import { readFile, writeFile } from "fs/promises";

const googleTools = JSON.parse(await readFile("googlesuper_tools.json", "utf-8"));
const githubTools = JSON.parse(await readFile("github_tools.json", "utf-8"));
const allTools = [...googleTools, ...githubTools];

console.log(`Total tools: ${allTools.length}`);

// ── Tool info ──
interface ToolInfo {
  slug: string;
  name: string;
  description: string;
  requiredInputs: { name: string; description: string }[];
  allInputs: { name: string; description: string; required: boolean }[];
  outputFieldNames: Set<string>; // flattened, normalized
  toolkit: string;
}

function collectFieldNames(obj: any, results: Set<string>) {
  if (!obj || typeof obj !== "object") return;
  for (const [key, val] of Object.entries(obj) as [string, any][]) {
    results.add(norm(key));
    if (val?.properties) collectFieldNames(val.properties, results);
    if (val?.items?.properties) collectFieldNames(val.items.properties, results);
  }
}

const norm = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();

const toolMap = new Map<string, ToolInfo>();
for (const tool of allTools) {
  const inputProps = tool.inputParameters?.properties || {};
  const requiredNames = new Set(tool.inputParameters?.required || []);
  const allInputs = Object.entries(inputProps).map(([name, schema]: [string, any]) => ({
    name, description: schema.description || "", required: requiredNames.has(name),
  }));
  const outputFieldNames = new Set<string>();
  collectFieldNames(tool.outputParameters?.properties?.data?.properties || {}, outputFieldNames);

  toolMap.set(tool.slug, {
    slug: tool.slug,
    name: tool.name,
    description: tool.description,
    requiredInputs: allInputs.filter(i => i.required),
    allInputs,
    outputFieldNames,
    toolkit: tool.toolkit?.slug || "",
  });
}

// ── Edge tracking ──
interface Edge { from: string; to: string; param: string; reason: string; confidence: "high" | "medium" | "low"; }
const edgeSet = new Set<string>();
const edges: Edge[] = [];

function addEdge(from: string, to: string, param: string, reason: string, confidence: Edge["confidence"]) {
  if (from === to) return;
  const key = `${from}->${to}:${param}`;
  if (edgeSet.has(key)) return;
  edgeSet.add(key);
  edges.push({ from, to, param, reason, confidence });
}

// ── Strategy 1: Description references (HIGH confidence) ──
const shortNameToSlug = new Map<string, string>();
for (const tool of allTools) {
  shortNameToSlug.set(tool.slug, tool.slug);
  const prefix = tool.slug.startsWith("GOOGLESUPER_") ? "GOOGLESUPER_" : tool.slug.startsWith("GITHUB_") ? "GITHUB_" : "";
  if (prefix) shortNameToSlug.set(tool.slug.replace(prefix, ""), tool.slug);

  // Descriptions reference tools with service-specific prefixes like GMAIL_, CALENDAR_, DRIVE_, etc.
  // Map those to the actual GOOGLESUPER_ slugs
  if (tool.slug.startsWith("GOOGLESUPER_")) {
    const rest = tool.slug.replace("GOOGLESUPER_", "");
    // Common description prefixes: GMAIL_*, CALENDAR_*, DRIVE_*, SHEETS_*, DOCS_*, SLIDES_*
    const servicePrefixes = ["GMAIL_", "CALENDAR_", "DRIVE_", "SHEETS_", "DOCS_", "SLIDES_", "CONTACTS_", "MEET_"];
    for (const sp of servicePrefixes) {
      shortNameToSlug.set(sp + rest, tool.slug);
    }
  }
}

for (const tool of allTools) {
  const info = toolMap.get(tool.slug)!;
  for (const input of info.allInputs) {
    for (const mention of input.description.match(/[A-Z][A-Z_]{4,}/g) || []) {
      const resolved = shortNameToSlug.get(mention);
      if (resolved && resolved !== tool.slug) {
        addEdge(resolved, tool.slug, input.name, `param "${input.name}" references ${mention}`, "high");
      }
    }
  }
  for (const mention of info.description.match(/[A-Z][A-Z_]{4,}/g) || []) {
    const resolved = shortNameToSlug.get(mention);
    if (resolved && resolved !== tool.slug) {
      addEdge(resolved, tool.slug, "_desc", `description references ${mention}`, "high");
    }
  }
}

console.log(`High-confidence edges (description refs): ${edges.length}`);

// ── Strategy 2: Resource ID matching within same toolkit ──
// These are the meaningful resource-specific parameters (NOT owner/repo/user_id which are context)
const CONTEXT_PARAMS = new Set([
  "owner", "repo", "org", "username", "user_id", "type", "format",
  "page", "per_page", "limit", "offset", "q", "query", "sort", "order",
  "direction", "state", "base", "head", "accept", "media_type", "since",
  "before", "after", "until", "sha", "ref", "path", "per", "name",
]);

// Resource IDs that create meaningful dependencies
const RESOURCE_IDS = [
  "thread_id", "message_id", "calendar_id", "event_id", "label_id",
  "draft_id", "spreadsheet_id", "presentation_id", "file_id", "folder_id",
  "document_id", "rule_id", "setting_id", "filter_id", "forwarding_email",
  "issue_number", "pull_number", "comment_id", "gist_id", "milestone_number",
  "invitation_id", "hook_id", "release_id", "run_id", "workflow_id",
  "check_run_id", "check_suite_id", "deployment_id", "alert_number",
  "tag_protection_id", "autolink_id", "artifact_id", "job_id",
  "discussion_number", "team_slug",
];

// Build per-toolkit index: normalized resource param → tools that output it
const toolkitResIndex = new Map<string, Map<string, string[]>>();

for (const [slug, info] of toolMap) {
  if (!toolkitResIndex.has(info.toolkit)) toolkitResIndex.set(info.toolkit, new Map());
  const idx = toolkitResIndex.get(info.toolkit)!;
  for (const resId of RESOURCE_IDS) {
    if (info.outputFieldNames.has(resId)) {
      if (!idx.has(resId)) idx.set(resId, []);
      idx.get(resId)!.push(slug);
    }
  }
}

for (const [slug, info] of toolMap) {
  const idx = toolkitResIndex.get(info.toolkit);
  if (!idx) continue;

  for (const input of info.requiredInputs) {
    const n = norm(input.name);
    if (CONTEXT_PARAMS.has(n)) continue;
    if (!RESOURCE_IDS.includes(n)) continue;

    const providers = idx.get(n) || [];
    for (const pSlug of providers) {
      addEdge(pSlug, slug, input.name, `provides "${n}"`, "medium");
    }
  }
}

// Strategy 2b: List tools with generic "id" output → specific *_id inputs
// e.g., LIST_THREADS outputs threads[].id → REPLY_TO_THREAD needs thread_id
// Map slug patterns to the resource ID they produce
const SLUG_TO_RESOURCE_ID: Record<string, string> = {
  // Google
  "THREAD": "thread_id", "THREADS": "thread_id",
  "MESSAGE": "message_id", "MESSAGES": "message_id",
  "DRAFT": "draft_id", "DRAFTS": "draft_id",
  "LABEL": "label_id", "LABELS": "label_id",
  "CALENDAR": "calendar_id", "CALENDARS": "calendar_id",
  "EVENT": "event_id", "EVENTS": "event_id",
  "FILE": "file_id", "FILES": "file_id",
  "SPREADSHEET": "spreadsheet_id", "SPREADSHEETS": "spreadsheet_id",
  "PRESENTATION": "presentation_id", "PRESENTATIONS": "presentation_id",
  "DOCUMENT": "document_id", "REVISION": "revision_id",
  "PERMISSION": "permission_id", "FILTER": "filter_id",
  "COMMENT": "comment_id",
  // GitHub
  "ISSUE": "issue_number", "ISSUES": "issue_number",
  "PULL_REQUEST": "pull_number", "PULL": "pull_number",
  "RELEASE": "release_id", "RELEASES": "release_id",
  "GIST": "gist_id", "GISTS": "gist_id",
  "HOOK": "hook_id", "HOOKS": "hook_id",
  "MILESTONE": "milestone_number", "MILESTONES": "milestone_number",
  "WORKFLOW": "workflow_id", "ARTIFACT": "artifact_id",
  "DEPLOYMENT": "deployment_id",
};

// For list/search/get tools that output generic "id", map to resource-specific IDs
for (const [slug, info] of toolMap) {
  if (!info.outputFieldNames.has("id")) continue;
  // Only for list/search/get tools
  if (!slug.match(/_(LIST|SEARCH|FETCH|FIND|GET|CREATE)_/) && !slug.match(/_(LIST|SEARCH|FETCH|FIND|GET|CREATE)$/)) continue;

  const prefix = slug.startsWith("GOOGLESUPER_") ? "GOOGLESUPER_" : "GITHUB_";
  const rest = slug.replace(prefix, "");

  // Find which resource this tool is about
  for (const [keyword, resId] of Object.entries(SLUG_TO_RESOURCE_ID)) {
    if (rest.includes(keyword)) {
      // This list tool outputs "id" which is really a resId
      const idx = toolkitResIndex.get(info.toolkit);
      if (!idx) continue;
      if (!idx.has(resId)) idx.set(resId, []);
      if (!idx.get(resId)!.includes(slug)) {
        idx.get(resId)!.push(slug);
      }
      break;
    }
  }
}

// Re-run matching with the enriched index
for (const [slug, info] of toolMap) {
  const idx = toolkitResIndex.get(info.toolkit);
  if (!idx) continue;
  for (const input of info.requiredInputs) {
    const n = norm(input.name);
    if (CONTEXT_PARAMS.has(n)) continue;
    if (!RESOURCE_IDS.includes(n)) continue;
    const providers = idx.get(n) || [];
    for (const pSlug of providers) {
      addEdge(pSlug, slug, input.name, `provides "${n}"`, "medium");
    }
  }
}

console.log(`Total edges after enriched resource ID matching: ${edges.length}`);

// ── Strategy 3: CRUD domain grouping (only for same-resource CRUD pairs) ──
const domainGroups = new Map<string, { lists: string[]; ops: string[] }>();
const LIST_VERBS = ["LIST", "SEARCH", "FETCH", "FIND"];
const OP_VERBS = ["GET", "UPDATE", "DELETE", "PATCH", "MODIFY", "REMOVE"];

for (const tool of allTools) {
  const slug = tool.slug as string;
  const prefix = slug.startsWith("GOOGLESUPER_") ? "GOOGLESUPER_" : "GITHUB_";
  const rest = slug.replace(prefix, "");
  const parts = rest.split("_");

  for (const verb of [...LIST_VERBS, ...OP_VERBS]) {
    const i = parts.indexOf(verb);
    if (i >= 0) {
      const resource = [...parts.slice(0, i), ...parts.slice(i + 1)].join("_");
      if (resource.length >= 3) {
        const domain = `${prefix}${resource}`;
        if (!domainGroups.has(domain)) domainGroups.set(domain, { lists: [], ops: [] });
        const g = domainGroups.get(domain)!;
        if (LIST_VERBS.includes(verb)) g.lists.push(slug);
        else g.ops.push(slug);
      }
      break;
    }
  }
}

for (const [, g] of domainGroups) {
  if (g.lists.length === 0 || g.ops.length === 0) continue;
  // Only add CRUD edges if the group is small (specific resource)
  if (g.lists.length > 3 || g.ops.length > 10) continue;
  for (const l of g.lists) {
    for (const o of g.ops) {
      addEdge(l, o, "_crud", `CRUD: list→operation`, "low");
    }
  }
}

console.log(`Total edges after CRUD: ${edges.length}`);

// ── Deduplicate by pair, keep best confidence ──
const confRank = (c: string) => c === "high" ? 3 : c === "medium" ? 2 : 1;
const pairBest = new Map<string, Edge>();
const pairCount = new Map<string, number>();

for (const e of edges) {
  const key = `${e.from}->${e.to}`;
  pairCount.set(key, (pairCount.get(key) || 0) + 1);
  const existing = pairBest.get(key);
  if (!existing || confRank(e.confidence) > confRank(existing.confidence)) {
    pairBest.set(key, e);
  }
}

// Keep: high always, medium always, low only if corroborated
const finalEdges = [...pairBest.values()].filter(e => {
  if (e.confidence !== "low") return true;
  const key = `${e.from}->${e.to}`;
  return (pairCount.get(key) || 0) >= 2;
});

console.log(`Final edges: ${finalEdges.length}`);

// ── Build graph ──
const nodesInEdges = new Set<string>();
for (const e of finalEdges) { nodesInEdges.add(e.from); nodesInEdges.add(e.to); }

const nodes = [...nodesInEdges].map(slug => {
  const info = toolMap.get(slug);
  return { id: slug, name: info?.name || slug, toolkit: info?.toolkit || "unknown" };
});

const graph = {
  nodes,
  edges: finalEdges.map(e => ({ from: e.from, to: e.to, param: e.param, reason: e.reason, confidence: e.confidence })),
};

await writeFile("dependency_graph.json", JSON.stringify(graph, null, 2), "utf-8");
console.log(`\nGraph: ${nodes.length} nodes, ${finalEdges.length} edges`);

// Stats
const outDeg = new Map<string, number>();
const inDeg = new Map<string, number>();
for (const e of finalEdges) {
  outDeg.set(e.from, (outDeg.get(e.from) || 0) + 1);
  inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
}

console.log("\nTop providers:");
for (const [s, c] of [...outDeg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10))
  console.log(`  ${s}: ${c}`);

console.log("\nTop consumers:");
for (const [s, c] of [...inDeg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10))
  console.log(`  ${s}: ${c}`);

const cc = { high: 0, medium: 0, low: 0 };
for (const e of finalEdges) cc[e.confidence]++;
console.log(`\nConfidence: high=${cc.high}, medium=${cc.medium}, low=${cc.low}`);

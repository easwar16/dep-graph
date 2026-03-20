import { readFile, writeFile } from "fs/promises";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");

const googleTools = JSON.parse(await readFile("googlesuper_tools.json", "utf-8"));
const githubTools = JSON.parse(await readFile("github_tools.json", "utf-8"));
const allTools = [...googleTools, ...githubTools];
const graph = JSON.parse(await readFile("dependency_graph.json", "utf-8"));

// Build tool summaries for LLM
const toolSummaries = allTools.map((t: any) => {
  const required = t.inputParameters?.required || [];
  const inputProps = t.inputParameters?.properties || {};
  const reqParams = required.map((r: string) => {
    const p = inputProps[r];
    return `${r}: ${p?.description?.slice(0, 80) || "no desc"}`;
  });
  return {
    slug: t.slug,
    name: t.name,
    desc: t.description?.slice(0, 150),
    requiredParams: reqParams,
  };
});

// Group by domain for focused LLM calls
const googleSummaries = toolSummaries.filter((t: any) => t.slug.startsWith("GOOGLESUPER_"));
const githubSummaries = toolSummaries.filter((t: any) => t.slug.startsWith("GITHUB_"));

async function callLLM(prompt: string): Promise<string> {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
      temperature: 0,
    }),
  });
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content || "";
}

// Batch tools into groups for LLM analysis
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const allSlugs = new Set(allTools.map((t: any) => t.slug));

async function analyzeDependencies(tools: any[], label: string) {
  console.log(`Analyzing ${label} (${tools.length} tools)...`);

  const toolList = tools.map((t: any) =>
    `- ${t.slug}: "${t.name}" - ${t.desc}${t.requiredParams.length > 0 ? `\n  Required: ${t.requiredParams.join("; ")}` : ""}`
  ).join("\n");

  const prompt = `You are analyzing API tool dependencies for the ${label} toolkit.

Given these tools, identify DEPENDENCY relationships where one tool must be called BEFORE another to obtain required parameters (like IDs, names, etc).

Only output dependencies where:
1. Tool A's output provides a required input for Tool B
2. The dependency is meaningful (not just shared context like owner/repo)

Tools:
${toolList}

Output ONLY a JSON array of objects with format:
[{"from": "TOOL_SLUG_PROVIDER", "to": "TOOL_SLUG_CONSUMER", "param": "parameter_name", "reason": "brief reason"}]

Focus on the most important and clear dependencies. Be selective - only include relationships where one tool genuinely needs to run before another. Output ONLY valid JSON, no markdown.`;

  const result = await callLLM(prompt);

  // Parse JSON from response
  try {
    // Extract JSON array from response
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(`  No JSON found in response for ${label}`);
      return [];
    }
    const deps = JSON.parse(jsonMatch[0]);
    // Validate slugs exist
    const valid = deps.filter((d: any) => allSlugs.has(d.from) && allSlugs.has(d.to) && d.from !== d.to);
    console.log(`  Found ${valid.length} valid dependencies (${deps.length} total)`);
    return valid;
  } catch (e) {
    console.log(`  Failed to parse LLM response for ${label}: ${e}`);
    return [];
  }
}

// Run LLM analysis in batches
const googleChunks = chunkArray(googleSummaries, 80);
const githubChunks = chunkArray(githubSummaries, 80);

const llmDeps: any[] = [];

// Process chunks with concurrency limit
async function processChunks(chunks: any[][], prefix: string) {
  for (let i = 0; i < chunks.length; i++) {
    const deps = await analyzeDependencies(chunks[i], `${prefix} batch ${i + 1}/${chunks.length}`);
    llmDeps.push(...deps);
  }
}

await Promise.all([
  processChunks(googleChunks, "Google"),
  processChunks(githubChunks, "GitHub"),
]);

console.log(`\nTotal LLM-identified dependencies: ${llmDeps.length}`);

// Merge with existing graph
const existingEdgeKeys = new Set(graph.edges.map((e: any) => `${e.from}->${e.to}`));
let newCount = 0;

for (const dep of llmDeps) {
  const key = `${dep.from}->${dep.to}`;
  if (!existingEdgeKeys.has(key)) {
    graph.edges.push({
      from: dep.from,
      to: dep.to,
      param: dep.param,
      reason: `LLM: ${dep.reason}`,
      confidence: "high",
    });
    // Add nodes if not present
    if (!graph.nodes.find((n: any) => n.id === dep.from)) {
      const info = allTools.find((t: any) => t.slug === dep.from);
      graph.nodes.push({ id: dep.from, name: info?.name || dep.from, toolkit: info?.toolkit?.slug || "unknown" });
    }
    if (!graph.nodes.find((n: any) => n.id === dep.to)) {
      const info = allTools.find((t: any) => t.slug === dep.to);
      graph.nodes.push({ id: dep.to, name: info?.name || dep.to, toolkit: info?.toolkit?.slug || "unknown" });
    }
    existingEdgeKeys.add(key);
    newCount++;
  }
}

console.log(`Added ${newCount} new edges from LLM analysis`);
console.log(`Final graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

await writeFile("dependency_graph.json", JSON.stringify(graph, null, 2), "utf-8");
console.log("Updated dependency_graph.json");

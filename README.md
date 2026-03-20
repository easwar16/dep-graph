# Composio Tool Dependency Graph

A dependency graph for [Google Super](https://docs.composio.dev/toolkits/googlesuper) and [GitHub](https://docs.composio.dev/toolkits/github) toolkits, showing which tools need precursor actions before execution.

## Demo

[https://github.com/user-attachments/assets/dep-graph.mp4](https://github.com/user-attachments/assets/b673b35d-bb0f-473e-8e50-5b76910faa13)

<video src="dep-graph/assets/dep-graph.mp4" controls width="100%"></video>

## How It Works

The graph identifies dependencies through three strategies:

1. **Description parsing** (high confidence) — Tools explicitly reference other tools in their parameter descriptions (e.g., `REPLY_TO_THREAD`'s `thread_id` says "Use GMAIL_LIST_THREADS")
2. **Parameter matching** (medium confidence) — Required input parameters (`thread_id`, `event_id`, `spreadsheet_id`, etc.) matched to tools that output those fields
3. **LLM semantic analysis** (high confidence) — Gemini Flash analyzes tool descriptions to find non-obvious dependencies

## Examples

- `GMAIL_REPLY_TO_THREAD` needs `thread_id` → provided by `LIST_THREADS`, `FETCH_EMAILS`, `LIST_MESSAGES`, and 20 other tools
- `SEND_EMAIL` needs `recipient_email` → provided by `GET_CONTACTS`, `SEARCH_PEOPLE`, `GET_PEOPLE`
- `DELETE_EVENT` needs `event_id` → provided by `EVENTS_LIST`, `EVENTS_INSTANCES`, `FIND_EVENT`

## Graph Stats

- **616 nodes** across 35 domains (Gmail, Calendar, Sheets, Drive, Docs, Slides, GitHub Issues, PRs, Actions, etc.)
- **6094 edges** (243 high confidence, 5851 medium confidence)

## Running

```bash
# Install dependencies
bun install

# Fetch tool data
bun run src/fetch-tools.ts

# Build dependency graph
bun run src/build-graph.ts

# Enhance with LLM
bun run src/llm-enhance.ts

# Generate visualization
bun run src/visualize.ts

# Open visualization
open dep-graph/graph.html
```

## Visualization

Open `dep-graph/graph.html` in a browser. Features:

- Filter by domain (Google/GitHub/specific services) or confidence level
- Search for specific tools
- Hover for tooltips, click for full dependency details
- Zoom/pan, drag nodes
- Color-coded by service domain

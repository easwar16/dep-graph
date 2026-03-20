import { Composio } from "@composio/core";
import { writeFile } from "fs/promises";

const composio = new Composio();

console.log("Fetching Google Super tools...");
const googleTools = await composio.tools.getRawComposioTools({
  toolkits: ["googlesuper"],
  limit: 1000,
});
await writeFile("googlesuper_tools.json", JSON.stringify(googleTools, null, 2), "utf-8");
console.log(`Fetched ${googleTools.length} Google Super tools`);

console.log("Fetching GitHub tools...");
const githubTools = await composio.tools.getRawComposioTools({
  toolkits: ["github"],
  limit: 1000,
});
await writeFile("github_tools.json", JSON.stringify(githubTools, null, 2), "utf-8");
console.log(`Fetched ${githubTools.length} GitHub tools`);

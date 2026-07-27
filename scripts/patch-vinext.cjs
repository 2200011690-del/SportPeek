/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const staticFileCachePath = path.join(
  __dirname,
  "../node_modules/vinext/dist/server/static-file-cache.js"
);

if (fs.existsSync(staticFileCachePath)) {
  let content = fs.readFileSync(staticFileCachePath, "utf8");
  if (!content.includes("normRel")) {
    const target = "for await (const { relativePath, fullPath, stat } of walkFilesWithStats(clientDir)) allFiles.set(relativePath, {";
    const replacement = `for await (const { relativePath, fullPath, stat } of walkFilesWithStats(clientDir)) {
			const normRel = relativePath.replaceAll("\\\\", "/");
			allFiles.set(normRel, {`;
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      fs.writeFileSync(staticFileCachePath, content, "utf8");
      console.log("[Patch Vinext] Patched static-file-cache.js for Windows path slashes.");
    }
  }
}

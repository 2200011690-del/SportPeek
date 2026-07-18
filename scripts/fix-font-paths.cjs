const fs = require("fs");
const path = require("path");

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

const fontsDir = path.join(__dirname, "../.vinext/fonts");
if (fs.existsSync(fontsDir)) {
  const files = walk(fontsDir);
  files.forEach((file) => {
    if (path.basename(file) === "style.css") {
      let content = fs.readFileSync(file, "utf8");
      // Match url(C:/Users/.../filename.woff2) and replace with url(./filename.woff2)
      const replaced = content.replace(/url\([^)]*?\/([^/)]+\.woff2)\)/g, "url(./$1)");
      if (replaced !== content) {
        fs.writeFileSync(file, replaced, "utf8");
        console.log(`[Fonts Fix] Corrected font paths in: ${path.relative(path.join(__dirname, ".."), file)}`);
      }
    }
  });
} else {
  console.log("[Fonts Fix] .vinext/fonts directory not found. Skipping.");
}

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const indexPath = path.join(root, "index.html");
const cssPath = path.join(root, "styles.css");
const appPath = path.join(root, "app.js");
const dataPath = path.join(root, "data", "se_duolingo_quiz_data.json");
const outputPath = path.join(root, "exam-sprint-offline.html");

const indexHtml = fs.readFileSync(indexPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const app = fs.readFileSync(appPath, "utf8");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const safeJson = JSON.stringify(data)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");

const safeApp = app.replace(/<\/script/gi, "<\\/script");
const safeCss = css.replace(/<\/style/gi, "<\\/style");

const offlineHtml = indexHtml
  .replace(/\s*<link rel="manifest" href="\.\/manifest\.webmanifest">\n/, "\n")
  .replace(/\s*<link rel="icon" href="\.\/icon\.svg" type="image\/svg\+xml">\n/, "\n")
  .replace(/\s*<link rel="apple-touch-icon" href="\.\/icon\.svg">\n/, "\n")
  .replace(
    '<link rel="stylesheet" href="./styles.css">',
    `<style>\n${safeCss}\n</style>`
  )
  .replace(
    '<script src="./app.js" defer></script>',
    `<script>window.EXAM_SPRINT_DATA=${safeJson};</script>\n    <script>\n${safeApp}\n</script>`
  );

fs.writeFileSync(outputPath, offlineHtml);
console.log(`Wrote ${path.relative(root, outputPath)}`);

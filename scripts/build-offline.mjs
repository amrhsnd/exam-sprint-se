import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const indexPath = path.join(root, "index.html");
const cssPath = path.join(root, "styles.css");
const appPath = path.join(root, "app.js");
const examsPath = path.join(root, "data", "exams.json");
const outputPath = path.join(root, "exam-sprint-offline.html");

const indexHtml = fs.readFileSync(indexPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const app = fs.readFileSync(appPath, "utf8");
const exams = JSON.parse(fs.readFileSync(examsPath, "utf8"));
const dataByUrl = Object.fromEntries(
  (exams.exams || [])
    .filter((exam) => exam.status === "ready" && exam.dataUrl)
    .map((exam) => {
      const dataPath = path.join(root, exam.dataUrl.replace(/^\.\//, ""));
      return [exam.dataUrl, JSON.parse(fs.readFileSync(dataPath, "utf8"))];
    })
);

const safeExamsJson = JSON.stringify(exams.exams || [])
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");

const safeDataByUrlJson = JSON.stringify(dataByUrl)
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
  .replace(/<link rel="stylesheet" href="\.\/styles\.css(?:\?[^"]*)?">/, () => `<style>\n${safeCss}\n</style>`)
  .replace(
    /<script src="\.\/app\.js(?:\?[^"]*)?" defer><\/script>/,
    () =>
      `<script>window.EXAM_SPRINT_EXAMS=${safeExamsJson};window.EXAM_SPRINT_DATA_BY_URL=${safeDataByUrlJson};</script>\n    <script>\n${safeApp}\n</script>`
  );

fs.writeFileSync(outputPath, offlineHtml);
console.log(`Wrote ${path.relative(root, outputPath)}`);

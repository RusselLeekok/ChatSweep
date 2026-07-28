import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const watch = process.argv.includes("--watch");

async function copyStaticFiles() {
  await mkdir(dist, { recursive: true });
  await Promise.all([
    cp(resolve(root, "manifest.json"), resolve(dist, "manifest.json")),
    cp(resolve(root, "src/popup/popup.html"), resolve(dist, "popup.html")),
    cp(resolve(root, "src/content/content.css"), resolve(dist, "content.css"))
  ]);
}

const options = {
  entryPoints: {
    content: resolve(root, "src/content/index.ts"),
    popup: resolve(root, "src/popup/popup.ts")
  },
  bundle: true,
  outdir: dist,
  format: "iife",
  platform: "browser",
  target: ["chrome120", "edge120"],
  sourcemap: watch,
  minify: !watch,
  legalComments: "none"
};

if (watch) {
  await copyStaticFiles();
  const ctx = await context(options);
  await ctx.watch();
  console.log("ChatTidy 正在监听文件变化。");
} else {
  await rm(dist, { recursive: true, force: true });
  await copyStaticFiles();
  await build(options);
  console.log("ChatTidy 已构建到 dist。");
}

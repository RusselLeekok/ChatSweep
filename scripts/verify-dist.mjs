import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const sizes = [16, 32, 48, 128];

function readPngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error("Invalid PNG signature");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

const manifest = JSON.parse(
  await readFile(resolve(dist, "manifest.json"), "utf8")
);

for (const size of sizes) {
  const relativePath = `icons/chattidy-${size}.png`;
  const iconPath = resolve(dist, relativePath);
  await access(iconPath);
  const dimensions = readPngSize(await readFile(iconPath));
  if (dimensions.width !== size || dimensions.height !== size) {
    throw new Error(
      `${relativePath} is ${dimensions.width}x${dimensions.height}; expected ${size}x${size}`
    );
  }
  if (
    manifest.icons?.[String(size)] !== relativePath
    || manifest.action?.default_icon?.[String(size)] !== relativePath
  ) {
    throw new Error(`${relativePath} is not wired into both manifest icon maps`);
  }
}

console.log("ChatTidy dist icons verified at 16, 32, 48, and 128 px.");

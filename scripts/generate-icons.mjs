import sharp from "sharp";
import { mkdir } from "fs/promises";

const SOURCE = "src/assets/logo-faratec.png";
const OUTPUT_DIR = "public";

async function generateIcon(size, filename) {
  const padding = Math.round(size * 0.1);
  const logoSize = size - padding * 2;

  const resizedLogo = await sharp(SOURCE)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resizedLogo, top: padding, left: padding }])
    .png()
    .toFile(`${OUTPUT_DIR}/${filename}`);

  console.log(`OK : ${filename} (${size}x${size})`);
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log("Generation des icones PWA...");
  await generateIcon(192, "pwa-192x192.png");
  await generateIcon(512, "pwa-512x512.png");
  await generateIcon(180, "apple-touch-icon.png");
  await generateIcon(32, "favicon-32x32.png");
  await generateIcon(16, "favicon-16x16.png");
  console.log("");
  console.log("Termine !");
}

main().catch(console.error);
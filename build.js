import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, 'dist');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

async function build() {
  console.log('🚀 Building EchoX Extension...');

  // 1. Build Content Script (IIFE format for Chrome content script isolation)
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, 'src/content/index.ts')],
    bundle: true,
    outfile: path.resolve(distDir, 'content.js'),
    format: 'iife',
    platform: 'browser',
    target: ['chrome100'],
    sourcemap: false
  });
  console.log('✔ Bundled content.js');

  // 2. Build Background Service Worker (ES module)
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, 'src/background/serviceWorker.ts')],
    bundle: true,
    outfile: path.resolve(distDir, 'background.js'),
    format: 'esm',
    platform: 'browser',
    target: ['chrome100'],
    sourcemap: false
  });
  console.log('✔ Bundled background.js');

  // 3. Build Popup Script (ES module)
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, 'src/popup/popup.ts')],
    bundle: true,
    outfile: path.resolve(distDir, 'popup.js'),
    format: 'esm',
    platform: 'browser',
    target: ['chrome100'],
    sourcemap: false
  });
  console.log('✔ Bundled popup.js');

  // 4. Copy static assets
  fs.copyFileSync(
    path.resolve(__dirname, 'manifest.json'),
    path.resolve(distDir, 'manifest.json')
  );

  fs.copyFileSync(
    path.resolve(__dirname, 'src/content/styles.css'),
    path.resolve(distDir, 'content.css')
  );

  fs.copyFileSync(
    path.resolve(__dirname, 'src/popup/index.html'),
    path.resolve(distDir, 'popup.html')
  );

  fs.copyFileSync(
    path.resolve(__dirname, 'src/popup/popup.css'),
    path.resolve(distDir, 'popup.css')
  );

  // Copy icons
  const srcIconsDir = path.resolve(__dirname, 'public/icons');
  const distIconsDir = path.resolve(distDir, 'icons');
  if (fs.existsSync(srcIconsDir)) {
    fs.mkdirSync(distIconsDir, { recursive: true });
    for (const file of fs.readdirSync(srcIconsDir)) {
      fs.copyFileSync(path.join(srcIconsDir, file), path.join(distIconsDir, file));
    }
  }

  // Fix script path in dist/popup.html: popup.ts -> popup.js
  let popupHtml = fs.readFileSync(path.resolve(distDir, 'popup.html'), 'utf-8');
  popupHtml = popupHtml.replace('src="popup.ts"', 'src="popup.js"');
  fs.writeFileSync(path.resolve(distDir, 'popup.html'), popupHtml, 'utf-8');

  console.log('✔ Assets copied and manifest configured in dist/');
  console.log('🎉 Extension build complete! Load unpacked directory: ' + distDir);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

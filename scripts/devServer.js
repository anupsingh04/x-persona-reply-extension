import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = 3999;

// ANSI Colors
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  bgBlue: '\x1b[44m\x1b[37m',
  bgMagenta: '\x1b[45m\x1b[37m',
  bgGreen: '\x1b[42m\x1b[30m'
};

function formatTag(tag) {
  const upper = (tag || 'INFO').toUpperCase();
  if (upper.includes('LLM') || upper.includes('GEMINI')) {
    return `${colors.magenta}[🤖 ${upper}]${colors.reset}`;
  }
  if (upper.includes('CONTENT') || upper.includes('UI')) {
    return `${colors.cyan}[🌐 ${upper}]${colors.reset}`;
  }
  if (upper.includes('GROK')) {
    return `${colors.yellow}[⚡ ${upper}]${colors.reset}`;
  }
  if (upper.includes('INJECT') || upper.includes('COMPOSER')) {
    return `${colors.green}[✍️ ${upper}]${colors.reset}`;
  }
  if (upper.includes('MEMORY')) {
    return `${colors.blue}[🧠 ${upper}]${colors.reset}`;
  }
  if (upper.includes('POPUP')) {
    return `${colors.blue}[📱 ${upper}]${colors.reset}`;
  }
  if (upper.includes('ERROR')) {
    return `${colors.red}[❌ ${upper}]${colors.reset}`;
  }
  return `${colors.bold}[${upper}]${colors.reset}`;
}

// 1. Create HTTP logging server
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const time = colors.dim + (payload.timestamp || new Date().toLocaleTimeString()) + colors.reset;
        const tag = formatTag(payload.tag);
        
        console.log(`${time} ${tag} ${payload.message}`);

        if (payload.data !== undefined) {
          if (typeof payload.data === 'object') {
            console.log(colors.dim + JSON.stringify(payload.data, null, 2) + colors.reset);
          } else {
            console.log(colors.dim + '   ' + String(payload.data) + colors.reset);
          }
        }
      } catch (err) {
        console.error('Failed to parse log:', err);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n${colors.bgBlue} 🚀 EchoX Developer Terminal Active ${colors.reset}`);
  console.log(`${colors.cyan}📡 Live Log Stream:${colors.reset} http://127.0.0.1:${PORT}/log`);
  console.log(`${colors.green}👀 Watching files:${colors.reset} ${rootDir}/src/**`);
  console.log(`${colors.dim}Click buttons or run actions on X to see live events stream here.\n${colors.reset}`);
});

// 2. File Watcher & Auto-Rebuild
let buildTimeout = null;
function triggerBuild() {
  if (buildTimeout) clearTimeout(buildTimeout);
  buildTimeout = setTimeout(() => {
    const start = Date.now();
    const buildProc = spawn('node', [path.join(rootDir, 'build.js')], {
      cwd: rootDir,
      stdio: 'inherit'
    });
    buildProc.on('close', (code) => {
      if (code === 0) {
        const duration = Date.now() - start;
        console.log(`${colors.dim}[${new Date().toLocaleTimeString()}]${colors.reset} ${colors.green}✔ Rebuilt in ${duration}ms${colors.reset} ${colors.dim}(Reload extension in chrome://extensions to apply)${colors.reset}\n`);
      }
    });
  }, 100);
}

// Watch src/ and manifest.json
const srcDir = path.join(rootDir, 'src');
fs.watch(srcDir, { recursive: true }, (event, filename) => {
  if (filename) {
    triggerBuild();
  }
});

const manifestPath = path.join(rootDir, 'manifest.json');
fs.watch(manifestPath, () => {
  triggerBuild();
});

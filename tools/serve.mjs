import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PATCHLINE_LAB_PORT || 8789);
const publicFiles = new Set(['index.html','favicon.svg','buyer-value-engine.js','buyer-value-ui.js','proof/deployment-verification.json','proof/release-verification.json','proof/browser-qa.json','proof/research-browser-qa.json','proof/buyer-browser-qa.json','proof/research-status-qa.json','proof/research-verification.json','proof/research-browser-performance.json','submission/VERIFICATION.md','submission/DEVPOST-DRAFT.md','research-engine.js','economics-engine.js','workbench.js','samples/uci-temperature.js','samples/uci-temperature-5000.csv','samples/uci-manifest.json','submission/PILOT-OFFER.md','submission/CUSTOMER-VALIDATION-KIT.md','submission/technical-walkthrough.html', 'engine.js', 'lab-engine.js', 'lab-app.js', 'lab.css', 'styles.css', 'README.md', 'LIMITATIONS.md', 'MODEL_CARD.md', 'DESIGN.md', 'submission/next-founders-pitch.md', 'submission/business-validation.md', 'submission/market-evidence.md']);
const types = { '.svg':'image/svg+xml', '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.md':'text/plain; charset=utf-8', '.json':'application/json; charset=utf-8', '.csv':'text/csv; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!publicFiles.has(name)) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const body = await readFile(path.join(root, name));
    response.writeHead(200, {
      'Content-Type': types[path.extname(name)] || 'application/octet-stream',
      'Content-Length':body.length, 'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Patchline Lab preview: http://127.0.0.1:${port}`));
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use; choose PATCHLINE_LAB_PORT.` : `Preview server could not start (${error.code || 'unknown'}).`); process.exitCode = 1; });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));

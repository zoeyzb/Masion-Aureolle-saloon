import http from 'node:http';
import bookingHandler from './api/booking.js';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const server = http.createServer(async (req, res) => {
  if ((req.url || '').split('?')[0] === '/api/booking') return bookingHandler(req, res);
  const requested = decodeURIComponent((req.url || '/').split('?')[0]);
  const safePath = normalize(requested === '/' ? '/index.html' : requested).replace(/^\.\.(?:\/|\\|$)/, '');
  const filePath = join(root, safePath);
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Maison Aurelle listening on ${port}`));

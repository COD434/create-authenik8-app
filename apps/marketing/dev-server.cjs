const http = require("http");
const fs = require("fs");
const path = require("path");

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
  const routes = { "/": "index.html", "/docs": "docs.html", "/docs/": "docs.html", "/download": "download.html", "/download/": "download.html", "/pricing": "pricing.html", "/pricing/": "pricing.html" };
  const relativePath = routes[pathname] || pathname.replace(/^\/+/, "");
  const filePath = path.resolve(__dirname, relativePath);
  if (!filePath.startsWith(`${path.resolve(__dirname)}${path.sep}`)) { res.writeHead(404); res.end("Not found"); return; }
  const ext = path.extname(filePath);
  const types = { ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml", ".js": "text/javascript", ".png": "image/png" };
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
});

const port = Number(process.env.PORT || 4000);
server.listen(port, "127.0.0.1", () => console.log(`Marketing site on http://127.0.0.1:${port}`));

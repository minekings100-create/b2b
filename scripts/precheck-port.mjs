#!/usr/bin/env node
/**
 * Fail-fast guard for the e2e suite: verifies port 3000 is free *before*
 * Playwright tries to start its own dev server.
 *
 * Silent 180s `webServer` timeouts caused by a zombie dev server on port
 * 3000 burned 30+ minutes in one session — this precheck turns that into
 * an immediate, readable error.
 *
 * Exit 0 = port free (let the suite run).
 * Exit 1 = port in use (print how to free it).
 */

import net from "node:net";

const PORT = Number.parseInt(process.argv[2] ?? "3000", 10);

function probe(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", (err) => {
      resolve({ free: false, code: err.code ?? "UNKNOWN" });
    });
    srv.once("listening", () => {
      srv.close(() => resolve({ free: true }));
    });
    srv.listen(port, "127.0.0.1");
  });
}

const result = await probe(PORT);
if (result.free) {
  console.log(`[precheck] port ${PORT} is free`);
  process.exit(0);
}

console.error(
  [
    "",
    `[precheck] Port ${PORT} is IN USE (${result.code}).`,
    "",
    "Playwright's webServer will silently time out after 180s trying to",
    "claim this port. Kill the holder BEFORE running the suite.",
    "",
    "Windows (PowerShell):",
    `  Get-NetTCPConnection -State Listen -LocalPort ${PORT} | Select-Object OwningProcess`,
    `  taskkill /F /PID <pid>`,
    "",
    "macOS / Linux:",
    `  lsof -i :${PORT}`,
    `  kill -9 <pid>`,
    "",
  ].join("\n"),
);
process.exit(1);

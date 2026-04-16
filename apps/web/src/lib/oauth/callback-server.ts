/**
 * Tiny local HTTP server on port 1455 to catch OpenAI OAuth callbacks.
 * Starts when OAuth flow begins, stops after receiving the callback.
 * Returns the authorization code via a simple HTML page.
 */

import http from "http";

let server: http.Server | null = null;

export function startCallbackServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (server) {
      // Intentionally swallow — server may already be closed.
      try { server.close(); } catch { /* already closed */ }
    }

    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:1455`);

      if (url.pathname === "/auth/callback") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        res.writeHead(200, { "Content-Type": "text/html" });

        if (error) {
          res.end(`<html><body style="background:#111;color:#f44;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center"><h2>OAuth Error</h2><p>${error}</p></div>
          </body></html>`);
          stopCallbackServer();
          reject(new Error(error));
          return;
        }

        if (code) {
          res.end(`<html><body style="background:#111;color:#4ade80;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center;max-width:500px">
              <h2 style="color:#fff">Authorization Successful</h2>
              <p style="color:#888">Code received. You can close this window.</p>
              <script>
                try { window.opener.postMessage({ type: 'oauth_callback', code: '${code}' }, '*'); } catch(e) {}
                setTimeout(() => window.close(), 1500);
              </script>
            </div>
          </body></html>`);
          stopCallbackServer();
          resolve(code);
          return;
        }

        res.end("<html><body>No code received</body></html>");
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(1455, () => {
      console.log("[oauth] Callback server listening on port 1455");
    });

    server.on("error", (err) => {
      console.error("[oauth] Callback server error:", err);
      reject(err);
    });

    // Auto-timeout after 5 minutes
    setTimeout(() => {
      stopCallbackServer();
      reject(new Error("OAuth callback timeout"));
    }, 5 * 60 * 1000);
  });
}

export function stopCallbackServer() {
  if (server) {
    try { server.close(); } catch {}
    server = null;
  }
}

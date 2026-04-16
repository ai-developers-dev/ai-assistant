import { NextResponse } from "next/server";

// OAuth callback handler — catches the authorization code from the provider
// and displays it in a simple page so the user can copy it or auto-close.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new NextResponse(
      `<html><body style="background:#111;color:#f44;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h2>OAuth Error</h2>
          <p>${error}</p>
          <p style="color:#888">You can close this window.</p>
        </div>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code) {
    return new NextResponse(
      `<html><body style="background:#111;color:#f44;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h2>No authorization code received</h2>
          <p style="color:#888">You can close this window and try again.</p>
        </div>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  // Display the code and try to send it back to the parent window
  return new NextResponse(
    `<html>
    <body style="background:#111;color:#4ade80;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="text-align:center;max-width:500px">
        <h2 style="color:#fff">Authorization Successful</h2>
        <p style="color:#888;margin-bottom:20px">Copy this code and paste it in the app:</p>
        <input id="code" value="${code}" readonly
          style="width:100%;padding:12px;background:#222;border:1px solid #333;color:#4ade80;border-radius:8px;font-family:monospace;font-size:14px;text-align:center"
          onclick="this.select()" />
        <button onclick="navigator.clipboard.writeText('${code}');this.textContent='Copied!'"
          style="margin-top:12px;padding:8px 24px;background:#4ade80;color:#000;border:none;border-radius:6px;cursor:pointer;font-weight:bold">
          Copy Code
        </button>
        <p style="color:#555;margin-top:16px;font-size:12px">This window will try to auto-close...</p>
      </div>
      <script>
        // Try to send code to parent window and auto-close
        try {
          if (window.opener) {
            window.opener.postMessage({ type: 'oauth_callback', code: '${code}', state: '${state || ""}' }, '*');
            setTimeout(() => window.close(), 2000);
          }
        } catch(e) {}
      </script>
    </body>
    </html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

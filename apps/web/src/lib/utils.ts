import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCredits(credits: number): string {
  if (credits >= 1_000_000) return `${(credits / 1_000_000).toFixed(1)}M`;
  if (credits >= 1_000) return `${(credits / 1_000).toFixed(1)}K`;
  return credits.toString();
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Injects a script into HTML content that fixes anchor link navigation
 * inside srcDoc iframes. Without this, clicking `<a href="#section">`
 * navigates the parent page instead of scrolling within the iframe.
 */
export function prepareHtmlForIframe(html: string): string {
  const fixScript = `<script>
document.addEventListener('click', function(e) {
  var a = e.target.closest('a');
  if (!a) return;
  var href = a.getAttribute('href');
  if (href && href.startsWith('#')) {
    e.preventDefault();
    var id = href.substring(1);
    var el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }
});
</script>`;

  if (html.includes('</head>')) {
    return html.replace('</head>', fixScript + '</head>');
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', fixScript + '</body>');
  }
  return html + fixScript;
}

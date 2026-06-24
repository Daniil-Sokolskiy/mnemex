/**
 * Anna's Archive client.
 *
 * Anna's Archive does not publish an official API. As of 2026 their search
 * page also moved to client-side rendering, so `curl`/`fetch` only returns a
 * JS shell. We use a headless Playwright Chromium to render the page, wait for
 * results to appear in the DOM, and then run the same HTML parser as before.
 *
 * Two download paths:
 *   - Manual: take `download_page_url` (annas-archive.gl/md5/...) and click
 *     through in a browser. Always available, even without an account.
 *   - Fast (members only): call /dyn/api/fast_download.json with an MD5 and
 *     the member secret key (ANNAS_ARCHIVE_KEY env var). Returns a direct
 *     short-lived download URL. Day quota applies per the membership tier.
 *
 * Workflow:
 *   1. Use `searchAnnas(query)` to find candidates.
 *   2. If you have a key → `downloadAnnasBook(md5, targetDir)`.
 *      If not → open `download_page_url` in a browser.
 *   3. Run `ingest-book.sh` on the resulting file.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";

// ---------- shared headless browser ----------
//
// Launching Chromium costs ~1-2 seconds and ~150MB RAM. We keep a single
// browser across all searches in the MCP process and reuse it. Pages are
// created/closed per request so each search is isolated.

let sharedBrowser: Browser | null = null;
let sharedBrowserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;
  if (sharedBrowserPromise) return sharedBrowserPromise;
  sharedBrowserPromise = chromium
    .launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    })
    .then((b) => {
      sharedBrowser = b;
      b.on("disconnected", () => {
        sharedBrowser = null;
        sharedBrowserPromise = null;
      });
      return b;
    });
  return sharedBrowserPromise;
}

// Best-effort cleanup so we don't leave zombie Chromium processes if the MCP
// exits cleanly. (SIGKILL still leaks; OS handles that.)
const cleanupBrowser = async () => {
  const b = sharedBrowser;
  sharedBrowser = null;
  sharedBrowserPromise = null;
  if (b) {
    try {
      await b.close();
    } catch {
      // ignore
    }
  }
};
process.on("beforeExit", cleanupBrowser);
process.on("SIGINT", () => {
  cleanupBrowser().finally(() => process.exit(130));
});
process.on("SIGTERM", () => {
  cleanupBrowser().finally(() => process.exit(143));
});

// Anna's Archive periodically rotates domains. Official mirrors (as of 2026):
//   annas-archive.gl, annas-archive.pk, annas-archive.gd
// Override via ANNAS_BASE_URL env var if the default mirror gets blocked.
const ANNAS_BASE = (process.env.ANNAS_BASE_URL || "https://annas-archive.gl").replace(/\/+$/, "");
const ANNAS_FAST_DOWNLOAD_ENDPOINT = `${ANNAS_BASE}/dyn/api/fast_download.json`;

export interface AnnasResult {
  md5: string;
  title: string;
  authors: string;
  language: string;
  extension: string;
  filesize: string;
  publisher?: string;
  year?: string;
  download_page_url: string;
}

export async function searchAnnas(
  query: string,
  options: { language?: string; extension?: string; limit?: number } = {},
): Promise<AnnasResult[]> {
  const params = new URLSearchParams({ q: query });
  if (options.language) params.set("lang", options.language); // e.g. "en", "ru"
  if (options.extension) params.set("ext", options.extension); // e.g. "epub", "pdf"

  const url = `${ANNAS_BASE}/search?${params.toString()}`;

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    viewport: { width: 1280, height: 1800 },
    javaScriptEnabled: true,
  });

  let html: string;
  try {
    const page = await context.newPage();

    // Speed: don't bother with images/fonts/media — we only need DOM text.
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "font" || type === "media") {
        return route.abort();
      }
      return route.continue();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Anna's renders results client-side. Wait for at least one /md5/<hash>
    // anchor to appear, or for "no results" copy. Give up after 15s.
    try {
      await page.waitForFunction(
        () => {
          const anchors = document.querySelectorAll('a[href^="/md5/"]');
          // The page has a few /md5/ links unrelated to search results
          // (header recent-downloads, etc). Require at least 2 to consider it
          // a real results render. If a "no results found" element appears
          // instead, also exit.
          if (anchors.length >= 2) return true;
          const body = document.body.innerText || "";
          if (/no\s+results?\s+found|nothing\s+found/i.test(body)) return true;
          return false;
        },
        { timeout: 15_000 },
      );
    } catch {
      // Soft timeout: parser will handle empty results.
    }

    // Give the JS one more tick to settle (results sometimes paginate in batches).
    await page.waitForTimeout(500);

    // ---- primary path: extract from DOM directly. ----
    //
    // The .gl rendered markup (2026, JS-injected) wraps each result in:
    //   <div class="flex pt-3 pb-3 border-b last:border-b-0 border-gray-100">
    //     <a href="/md5/<hash>"> ... cover ... fallback-cover with data-content ... </a>
    //     <div class="max-w-full ...">
    //       <a href="/md5/<hash>" class="...js-vim-focus...font-semibold text-lg">TITLE</a>
    //       <a href="/search?q=AUTHORS" class="..."> AUTHORS </a>
    //       <a href="/search?q=" class="..."> PUBLISHER, YEAR </a>
    //       <div class="...text-gray-600...">DESCRIPTION</div>
    //       <div class="text-gray-800 ... font-semibold text-sm leading-[1.2] mt-2">
    //         English [en] · EPUB · 0.6MB · 2021 · ...
    //       </div>
    //     </div>
    //   </div>
    //
    // We anchor on the outer cover anchor and `closest()` up to the flex card
    // wrapper so we never confuse one card with another.
    const domResults: Array<{
      md5: string;
      title: string;
      authors: string;
      meta: string;
    }> = await page.evaluate(() => {
      const out: Array<{ md5: string; title: string; authors: string; meta: string }> = [];
      const seen = new Set<string>();

      // Find every cover anchor (only outer cover anchors carry the
      // "block mr-2" classes, but the inner title anchor uses the same href).
      // Dedup by md5 so we only pick the first card per book.
      const anchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href^="/md5/"]'),
      );

      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        const m = href.match(/^\/md5\/([a-f0-9]{32})/);
        if (!m) continue;
        const md5 = m[1];
        if (seen.has(md5)) continue;

        // Card wrapper: the flex pt-3 pb-3 row that contains cover + metadata.
        // This is the surgical selector — it's exactly one card.
        const card = a.closest<HTMLElement>("div.flex.pt-3.pb-3");
        if (!card) continue;

        // ---- title ----
        let title = "";
        // The main title is the js-vim-focus anchor inside the card.
        const titleA = card.querySelector<HTMLAnchorElement>(
          'a.js-vim-focus[href^="/md5/"]',
        );
        if (titleA) title = (titleA.textContent || "").trim();

        // Fallback: data-content on the violet fallback-cover div.
        if (!title) {
          const titleEl = card.querySelector<HTMLElement>(
            '[class*="text-violet-900"][data-content]',
          );
          if (titleEl) title = titleEl.getAttribute("data-content") || "";
        }

        // ---- authors ----
        // The author anchor has icon-[mdi--user-edit] inside it.
        let authors = "";
        const authorIconSpan = card.querySelector<HTMLElement>(
          "span.icon-\\[mdi--user-edit\\]",
        );
        if (authorIconSpan && authorIconSpan.parentElement) {
          authors = (authorIconSpan.parentElement.textContent || "").trim();
        }
        // Fallback: data-content on the amber fallback-cover.
        if (!authors) {
          const authorsEl = card.querySelector<HTMLElement>(
            '[class*="text-amber-900"][data-content]',
          );
          if (authorsEl) authors = authorsEl.getAttribute("data-content") || "";
        }

        // ---- meta line ----
        // Last "font-semibold text-sm leading-[1.2] mt-2" sibling is the
        // "English [en] · EPUB · 0.6MB · 2021 · ..." row.
        let meta = "";
        const metaCandidates = Array.from(
          card.querySelectorAll<HTMLElement>(
            'div.font-semibold.text-sm, div[class*="font-semibold"][class*="text-sm"]',
          ),
        );
        for (const el of metaCandidates) {
          const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
          // Pattern: must contain a bracketed lang code AND a file extension.
          if (
            /\[[a-z]{2,3}\]/i.test(txt) &&
            /\b(epub|pdf|mobi|azw3?|fb2|djvu|cbz|cbr|txt|rtf|docx?)\b/i.test(txt)
          ) {
            meta = txt;
            break;
          }
        }
        // Fallback: any descendant whose text has "·"-separated tokens with a known extension.
        if (!meta) {
          const all = Array.from(card.querySelectorAll<HTMLElement>("div"));
          for (const el of all) {
            const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
            if (
              txt.length > 8 &&
              txt.length < 400 &&
              /\[[a-z]{2,3}\]/i.test(txt) &&
              /\b(epub|pdf|mobi|azw3?|fb2|djvu|cbz|cbr|txt|rtf|docx?)\b/i.test(txt)
            ) {
              meta = txt;
              break;
            }
          }
        }

        if (!title && !authors && !meta) continue;
        seen.add(md5);
        out.push({ md5, title, authors, meta });
      }

      return out;
    });

    if (domResults.length > 0) {
      const results: AnnasResult[] = [];
      for (const r of domResults) {
        if (results.length >= (options.limit ?? 10)) break;
        const langMatch = r.meta.match(/\[([a-z]{2,3}(?:,[a-z]{2,3})*)\]/i);
        const sizeMatch = r.meta.match(/(\d+(?:\.\d+)?\s*(?:MB|KB|GB))/i);
        const extMatch = r.meta.match(
          /\b(epub|pdf|mobi|azw3|azw|fb2|djvu|cbz|cbr|txt|rtf|docx?)\b/i,
        );
        const yearMatch = r.meta.match(/\b((?:18|19|20)\d{2})\b/);
        results.push({
          md5: r.md5,
          title: (r.title || "Unknown").trim().slice(0, 300),
          authors: r.authors.trim().slice(0, 200),
          language: langMatch ? langMatch[1] : "",
          extension: extMatch ? extMatch[1].toLowerCase() : "",
          filesize: sizeMatch ? sizeMatch[1].replace(/\s+/g, "") : "",
          year: yearMatch ? yearMatch[1] : undefined,
          download_page_url: `${ANNAS_BASE}/md5/${r.md5}`,
        });
      }
      await context.close().catch(() => undefined);
      return results;
    }

    // ---- fallback path: regex parser on the rendered HTML. ----
    html = await page.content();
  } finally {
    await context.close().catch(() => undefined);
  }

  return parseSearchResults(html, options.limit ?? 10);
}

/**
 * Decode a small set of HTML entities that appear in Annas markup.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/**
 * Parse Annas search-results HTML.
 *
 * The .gl markup (2026) wraps each result in a flex container whose first
 * child is an outer cover anchor:
 *   <a href="/md5/<hash>" class="custom-a block mr-2 sm:mr-4 hover:opacity-80">
 *
 * Inside that block we look for:
 *   - title:   data-content attr on the violet-900 fallback-cover div,
 *              fallback to the inner text of the `js-vim-focus` anchor.
 *   - authors: data-content attr on the amber-900 fallback-cover div,
 *              fallback to the text after the user-edit icon span.
 *   - tags:    a "font-semibold text-sm leading-[1.2] mt-2" div whose first
 *              text run is " ✅ English [en] · EPUB · 12.0MB · 2021 · 📗 ..."
 */
function parseSearchResults(html: string, limit: number): AnnasResult[] {
  const results: AnnasResult[] = [];
  const seen = new Set<string>();

  // Outer cover anchors that mark the start of each result block.
  const blockStartRe =
    /<a\s+href="\/md5\/([a-f0-9]{32})"\s+class="custom-a block mr-2/g;

  const starts: { md5: string; pos: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockStartRe.exec(html)) !== null) {
    starts.push({ md5: m[1], pos: m.index });
  }

  for (let i = 0; i < starts.length && results.length < limit; i++) {
    const { md5, pos } = starts[i];
    if (seen.has(md5)) continue;
    seen.add(md5);

    const end =
      i + 1 < starts.length ? starts[i + 1].pos : Math.min(pos + 12000, html.length);
    const block = html.slice(pos, end);

    // ---- title ----
    let title = "";
    const titleData = block.match(
      /class="font-bold text-violet-900[^"]*"\s+data-content="([^"]*)"/,
    );
    if (titleData) {
      title = decodeHtmlEntities(titleData[1]);
    } else {
      const titleA = block.match(
        /<a\s+href="\/md5\/[a-f0-9]{32}"\s+class="[^"]*js-vim-focus[^"]*"[^>]*>([^<]+)<\/a>/,
      );
      if (titleA) title = decodeHtmlEntities(titleA[1]).trim();
    }

    // ---- authors ----
    let authors = "";
    const authorsData = block.match(
      /class="font-bold text-amber-900[^"]*"\s+data-content="([^"]*)"/,
    );
    if (authorsData) {
      authors = decodeHtmlEntities(authorsData[1]);
    } else {
      const authorsA = block.match(
        /icon-\[mdi--user-edit\][^<]*<\/span>\s*([^<]+)</,
      );
      if (authorsA) authors = decodeHtmlEntities(authorsA[1]).trim();
    }

    // ---- tags div ("✅ English [en] · EPUB · 12.0MB · 2021 · ...") ----
    let metaText = "";
    const tagsDiv = block.match(
      /<div class="text-gray-800[^"]*font-semibold text-sm[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    );
    if (tagsDiv) {
      // Strip nested tags/scripts; we only need the leading "·"-separated text run.
      metaText = tagsDiv[1]
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const langMatch = metaText.match(/\[([a-z]{2,3}(?:,[a-z]{2,3})*)\]/i);
    const sizeMatch = metaText.match(/(\d+(?:\.\d+)?\s*(?:MB|KB|GB))/i);
    const extMatch = metaText.match(
      /\b(epub|pdf|mobi|azw3|azw|fb2|djvu|cbz|cbr|txt|rtf|docx?)\b/i,
    );
    const yearMatch = metaText.match(/\b((?:18|19|20)\d{2})\b/);

    results.push({
      md5,
      title: (title || "Unknown").trim().slice(0, 300),
      authors: authors.trim().slice(0, 200),
      language: langMatch ? langMatch[1] : "",
      extension: extMatch ? extMatch[1].toLowerCase() : "",
      filesize: sizeMatch ? sizeMatch[1].replace(/\s+/g, "") : "",
      year: yearMatch ? yearMatch[1] : undefined,
      download_page_url: `${ANNAS_BASE}/md5/${md5}`,
    });
  }

  return results;
}

export function formatAnnasResultSummary(r: AnnasResult): string {
  const tags = [
    r.language && `[${r.language}]`,
    r.extension && r.extension,
    r.filesize,
    r.year,
  ]
    .filter(Boolean)
    .join(" ");
  return `md5:${r.md5.slice(0, 8)}  ${tags}  "${r.title}"${
    r.authors ? `  — ${r.authors}` : ""
  }`;
}

// ---------- fast download (members) ----------

export interface FastDownloadResponse {
  download_url?: string;
  // The API also returns quota info on success and an `error` field on failure.
  account_fast_download_info?: {
    downloads_left?: number;
    downloads_per_day?: number;
    recently_downloaded_md5s?: string[];
  };
  error?: string;
}

/**
 * Resolve a member-only fast download URL for a given md5.
 * Requires ANNAS_ARCHIVE_KEY env var (the "secret key" from the account page).
 *
 * Returns the parsed JSON. On success `download_url` is set; on failure
 * `error` is set (e.g. "Daily download limit exceeded" or "Invalid key").
 */
export async function fastDownloadAnnas(md5: string): Promise<FastDownloadResponse> {
  const key = process.env.ANNAS_ARCHIVE_KEY;
  if (!key) {
    throw new Error(
      "ANNAS_ARCHIVE_KEY env var not set. Get your secret key from " +
        "https://annas-archive.org/account and export it before launching the MCP.",
    );
  }
  if (!/^[a-f0-9]{32}$/i.test(md5)) {
    throw new Error(`Invalid md5: ${md5}`);
  }

  const url = `${ANNAS_FAST_DOWNLOAD_ENDPOINT}?md5=${encodeURIComponent(
    md5,
  )}&key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "brain-library-mcp/0.1",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Annas fast_download HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as FastDownloadResponse;
}

/**
 * Guess the file extension from a URL or Content-Disposition header.
 * Falls back to the provided default.
 */
function guessExtension(
  url: string,
  contentDisposition: string | null,
  fallback: string,
): string {
  // Content-Disposition: attachment; filename="some-book.epub"
  if (contentDisposition) {
    const m = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    if (m) {
      const fn = decodeURIComponent(m[1].replace(/"/g, "").trim());
      const dot = fn.lastIndexOf(".");
      if (dot > 0 && dot < fn.length - 1) {
        return fn.slice(dot + 1).toLowerCase();
      }
    }
  }
  // URL path: ".../something.epub?token=..."
  try {
    const path = new URL(url).pathname;
    const dot = path.lastIndexOf(".");
    if (dot > 0 && dot < path.length - 1) {
      const ext = path.slice(dot + 1).toLowerCase();
      if (/^[a-z0-9]{2,5}$/.test(ext)) return ext;
    }
  } catch {
    // ignore
  }
  return fallback;
}

/**
 * Full pipeline: resolve a fast download URL for `md5` and stream the file into
 * `targetDir`. Returns the local path, inferred extension, and the parsed
 * API response (so callers can surface quota info).
 *
 * `extHint` is used when the URL/Content-Disposition don't include a usable
 * extension (e.g. ".epub" got stripped). Usually you'd pass the extension
 * from the search result here.
 */
export async function downloadAnnasBook(
  md5: string,
  targetDir: string,
  extHint: string = "bin",
): Promise<{ path: string; ext: string; api: FastDownloadResponse }> {
  const api = await fastDownloadAnnas(md5);
  if (!api.download_url) {
    throw new Error(
      `Anna's fast_download did not return a URL${
        api.error ? `: ${api.error}` : ""
      }`,
    );
  }

  const res = await fetch(api.download_url, {
    headers: { "User-Agent": "brain-library-mcp/0.1" },
  });
  if (!res.ok) {
    throw new Error(`Anna's file download HTTP ${res.status}`);
  }

  const ext = guessExtension(
    api.download_url,
    res.headers.get("content-disposition"),
    extHint || "bin",
  );

  await mkdir(targetDir, { recursive: true });
  const filename = `annas-${md5.slice(0, 8)}.${ext}`;
  const path = join(targetDir, filename);

  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buf);

  return { path, ext, api };
}

/**
 * Project Gutenberg client via Gutendex (https://gutendex.com).
 *
 * Gutendex is a community-maintained JSON API over the Gutenberg catalog.
 * No authentication required.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const GUTENDEX_BASE = "https://gutendex.com/books";

export interface GutenbergBook {
  id: number;
  title: string;
  authors: { name: string; birth_year?: number | null; death_year?: number | null }[];
  languages: string[];
  download_count: number;
  formats: Record<string, string>; // mime → URL
  subjects: string[];
}

interface GutendexResponse {
  count: number;
  results: GutenbergBook[];
}

export async function searchGutenberg(
  query: string,
  options: { language?: string; limit?: number } = {},
): Promise<GutenbergBook[]> {
  const params = new URLSearchParams({ search: query });
  if (options.language) params.set("languages", options.language);

  const url = `${GUTENDEX_BASE}/?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gutendex ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as GutendexResponse;
  return data.results.slice(0, options.limit ?? 10);
}

export async function getGutenbergBook(id: number): Promise<GutenbergBook> {
  const res = await fetch(`${GUTENDEX_BASE}/${id}`);
  if (!res.ok) throw new Error(`Gutendex ${res.status}: ${await res.text()}`);
  return (await res.json()) as GutenbergBook;
}

export async function topGutenberg(
  limit: number = 20,
  language?: string,
): Promise<GutenbergBook[]> {
  const params = new URLSearchParams({ sort: "popular" });
  if (language) params.set("languages", language);
  const res = await fetch(`${GUTENDEX_BASE}/?${params.toString()}`);
  if (!res.ok) throw new Error(`Gutendex ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as GutendexResponse;
  return data.results.slice(0, limit);
}

/**
 * Pick the best download URL from the formats map.
 * Priority: EPUB (no images) → EPUB (with images) → plain text → HTML.
 */
function pickBestFormat(formats: Record<string, string>): { url: string; ext: string } | null {
  // Prefer EPUB without images (smaller, faster, well-formed)
  const preferences: { mime: string; ext: string }[] = [
    { mime: "application/epub+zip", ext: "epub" },
    { mime: "text/plain; charset=utf-8", ext: "txt" },
    { mime: "text/plain", ext: "txt" },
    { mime: "text/html; charset=utf-8", ext: "html" },
    { mime: "text/html", ext: "html" },
  ];

  for (const { mime, ext } of preferences) {
    // Skip "images.zip" variants and "zip" archives by URL pattern
    for (const [mimeKey, url] of Object.entries(formats)) {
      if (mimeKey === mime && !url.endsWith(".zip") && !url.includes("images")) {
        return { url, ext };
      }
    }
  }
  return null;
}

/**
 * Download a Gutenberg book by id to a target directory.
 * Returns the local file path.
 */
export async function downloadGutenbergBook(
  id: number,
  targetDir: string,
): Promise<{ path: string; ext: string; book: GutenbergBook }> {
  const book = await getGutenbergBook(id);
  const choice = pickBestFormat(book.formats);
  if (!choice) {
    throw new Error(`No downloadable EPUB/TXT/HTML format for book ${id}`);
  }

  await mkdir(targetDir, { recursive: true });
  const filename = `gutenberg-${id}.${choice.ext}`;
  const path = join(targetDir, filename);

  const res = await fetch(choice.url);
  if (!res.ok) throw new Error(`Download ${res.status}: ${choice.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buf);

  return { path, ext: choice.ext, book };
}

export function formatGutenbergBookSummary(b: GutenbergBook): string {
  const authors = b.authors.map((a) => a.name).join("; ") || "Unknown";
  const langs = b.languages.join(",");
  const formatList = Object.keys(b.formats)
    .filter((m) => m.includes("epub") || m.includes("text") || m.includes("html"))
    .map((m) => {
      if (m.includes("epub")) return "epub";
      if (m.includes("html")) return "html";
      return "txt";
    });
  const uniqFormats = [...new Set(formatList)].join("/");
  return `#${b.id} [${langs}] "${b.title}" — ${authors} (${uniqFormats}, ${b.download_count} downloads)`;
}

#!/usr/bin/env node
/**
 * mnemex-library MCP server.
 *
 * Tools:
 *   library.search             — search Gutenberg + Anna's Archive at once.
 *   library.gutenberg_top      — top-N popular Project Gutenberg books.
 *   library.gutenberg_get      — full metadata for a Gutenberg book by id.
 *   library.gutenberg_download — download a Gutenberg book into brain/raw/books/<slug>/
 *                                and (optionally) trigger ingest-book.sh to make book.md.
 *   library.annas_search       — Anna's Archive only, with richer filtering.
 *
 * Anna's Archive direct downloading is NOT auto-performed: their mirrors use
 * Cloudflare protection and slow-download throttles, so we return the download
 * page URL and let the user click through in a browser. The downloaded file
 * is then converted via the existing ingest-book.sh.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

import {
  searchGutenberg,
  getGutenbergBook,
  topGutenberg,
  downloadGutenbergBook,
  formatGutenbergBookSummary,
} from "./gutenberg.js";
import {
  searchAnnas,
  formatAnnasResultSummary,
  downloadAnnasBook,
} from "./annas.js";

const execFileP = promisify(execFile);

// Root of your LLM wiki. Set WIKI_ROOT (preferred) or the legacy BRAIN_DIR
// env var to point the MCP at your wiki. Defaults to ~/mnemex.
const WIKI_ROOT =
  process.env.WIKI_ROOT ||
  process.env.BRAIN_DIR ||
  join(homedir(), "mnemex");
const BOOKS_DIR = join(WIKI_ROOT, "raw", "books");
const INGEST_SCRIPT = join(WIKI_ROOT, "scripts", "ingest-book.sh");

// ---------- tool schemas ----------

const SearchInput = z.object({
  query: z.string().describe("Title, author, or keywords to search for"),
  language: z
    .string()
    .optional()
    .describe(
      "ISO 639-1 language filter (e.g. 'en', 'ru'). Applied to both sources.",
    ),
  extension: z
    .string()
    .optional()
    .describe(
      "Annas-only filter, e.g. 'epub' or 'pdf'. Ignored by Gutenberg.",
    ),
  limit: z.number().int().min(1).max(50).default(10).describe("Max results per source"),
});

const GutenbergTopInput = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  language: z.string().optional(),
});

const GutenbergGetInput = z.object({
  id: z.number().int().describe("Project Gutenberg book id"),
});

const GutenbergDownloadInput = z.object({
  id: z.number().int().describe("Project Gutenberg book id"),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Use kebab-case for slug")
    .describe("Folder name under brain/raw/books/"),
  auto_ingest: z
    .boolean()
    .default(true)
    .describe(
      "If true, run ingest-book.sh after download so book.md is ready for LLM ingest.",
    ),
});

const AnnasSearchInput = z.object({
  query: z.string(),
  language: z.string().optional(),
  extension: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

const AnnasDownloadInput = z.object({
  md5: z
    .string()
    .regex(/^[a-f0-9]{32}$/i, "md5 must be a 32-char hex string")
    .describe("Anna's Archive file md5 (from library.annas_search results)"),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Use kebab-case for slug")
    .describe("Folder name under brain/raw/books/"),
  extension: z
    .string()
    .optional()
    .describe(
      "Hint for file extension (e.g. 'epub', 'pdf'). Used only if the response doesn't carry one.",
    ),
  auto_ingest: z
    .boolean()
    .default(true)
    .describe("If true, run ingest-book.sh after download."),
});

// ---------- server ----------

const server = new Server(
  { name: "mnemex-library", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "library_search",
      description:
        "Search for books across Project Gutenberg AND Anna's Archive. Returns ranked candidates from both. Use when the user names a book or asks 'is there X in my sources'.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          language: { type: "string" },
          extension: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    {
      name: "library_gutenberg_top",
      description:
        "Top-N most downloaded Project Gutenberg books, optionally by language. Useful for discovering classics.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          language: { type: "string" },
        },
      },
    },
    {
      name: "library_gutenberg_get",
      description: "Get full metadata for a Project Gutenberg book by its numeric id.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "number" } },
        required: ["id"],
      },
    },
    {
      name: "library_gutenberg_download",
      description:
        "Download a Project Gutenberg book by id into brain/raw/books/<slug>/, then optionally run ingest-book.sh to produce book.md. **After a successful download you should automatically perform the wiki ingest in TWO phases**, per <WIKI_ROOT>/CLAUDE.md. PHASE 1 (CONTENT) — delegate to a Task subagent: read CLAUDE.md + templates/{source,entity,concept}.md + book.md; create source/entity/concept pages under wiki/. PHASE 2 (BOOKKEEPING) — separate short step (parent agent or a small follow-up subagent): update index.md sections + header counts; append log.md ingest entry; flip meta.yaml llm_ingested:true. Splitting is required because a single long subagent risks socket timeout on the finalization steps for large books. Do not wait for the user to ask again.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          slug: { type: "string" },
          auto_ingest: { type: "boolean" },
        },
        required: ["id", "slug"],
      },
    },
    {
      name: "library_annas_search",
      description:
        "Search Anna's Archive only, with richer filters (language, extension). Returns candidates with md5 and download_page_url. With ANNAS_ARCHIVE_KEY set, follow up with library.annas_download to fetch automatically; otherwise open download_page_url in a browser.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          language: { type: "string" },
          extension: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    {
      name: "library_annas_download",
      description:
        "Member-only fast download from Anna's Archive. Requires ANNAS_ARCHIVE_KEY env var (secret key from the Anna's account page). Fetches the file by md5 into brain/raw/books/<slug>/ and runs ingest-book.sh to produce book.md. **After a successful download you should automatically perform the wiki ingest in TWO phases**, per <WIKI_ROOT>/CLAUDE.md. PHASE 1 (CONTENT) — delegate to a Task subagent: read CLAUDE.md + templates/{source,entity,concept}.md + book.md; create source/entity/concept pages under wiki/. Subagent should explicitly NOT touch index.md, log.md, or meta.yaml — its scope is content only. When it returns, verify the created pages. PHASE 2 (BOOKKEEPING) — separate short step (parent agent inline OR a small follow-up subagent if many entities): update index.md sections + header counts; append a `## [YYYY-MM-DD HH:MM] ingest | <title>` entry to log.md listing every page touched; flip meta.yaml llm_ingested:true. Splitting is required because a single long subagent risks socket timeout on the finalization steps for large books (Cialdini run, 2026-05-29, was a real example). Do not wait for the user to ask again. Daily download quota applies per Anna's membership tier.",
      inputSchema: {
        type: "object",
        properties: {
          md5: { type: "string" },
          slug: { type: "string" },
          extension: { type: "string" },
          auto_ingest: { type: "boolean" },
        },
        required: ["md5", "slug"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    switch (name) {
      case "library_search": {
        const input = SearchInput.parse(args);
        const [gut, annas] = await Promise.allSettled([
          searchGutenberg(input.query, {
            language: input.language,
            limit: input.limit,
          }),
          searchAnnas(input.query, {
            language: input.language,
            extension: input.extension,
            limit: input.limit,
          }),
        ]);

        const gutResults = gut.status === "fulfilled" ? gut.value : [];
        const annasResults = annas.status === "fulfilled" ? annas.value : [];

        const lines: string[] = [];
        lines.push(`# Gutenberg (${gutResults.length})`);
        if (gut.status === "rejected") lines.push(`  ! error: ${gut.reason}`);
        for (const b of gutResults) lines.push("  " + formatGutenbergBookSummary(b));

        lines.push("");
        lines.push(`# Anna's Archive (${annasResults.length})`);
        if (annas.status === "rejected") lines.push(`  ! error: ${annas.reason}`);
        for (const r of annasResults) lines.push("  " + formatAnnasResultSummary(r));

        lines.push("");
        lines.push(
          "To download a Gutenberg book: call library.gutenberg_download with id and a kebab-case slug.",
        );
        lines.push(
          "For Anna's results: open the download_page_url in a browser, save the file, then run ingest-book.sh locally.",
        );

        return textResult(lines.join("\n"), {
          gutenberg: gutResults,
          annas: annasResults,
        });
      }

      case "library_gutenberg_top": {
        const input = GutenbergTopInput.parse(args);
        const books = await topGutenberg(input.limit, input.language);
        const text = books.map(formatGutenbergBookSummary).join("\n");
        return textResult(text, { books });
      }

      case "library_gutenberg_get": {
        const input = GutenbergGetInput.parse(args);
        const book = await getGutenbergBook(input.id);
        return textResult(formatGutenbergBookSummary(book), { book });
      }

      case "library_gutenberg_download": {
        const input = GutenbergDownloadInput.parse(args);
        const targetDir = join(BOOKS_DIR, input.slug);
        const { path, ext, book } = await downloadGutenbergBook(input.id, targetDir);

        const lines: string[] = [];
        lines.push(`Downloaded "${book.title}" → ${path}`);
        lines.push(`Format: ${ext}  Size: see file.`);

        if (input.auto_ingest) {
          if (!existsSync(INGEST_SCRIPT)) {
            lines.push("");
            lines.push(
              `WARNING: ingest-book.sh not found at ${INGEST_SCRIPT} — download succeeded but conversion skipped. Run it manually.`,
            );
          } else {
            try {
              const { stdout, stderr } = await execFileP(
                "bash",
                [INGEST_SCRIPT, path, input.slug],
                { env: { ...process.env, WIKI_ROOT, BRAIN_DIR: WIKI_ROOT } },
              );
              lines.push("");
              lines.push("ingest-book.sh output:");
              lines.push(stdout);
              if (stderr) {
                lines.push("stderr:");
                lines.push(stderr);
              }
            } catch (err: unknown) {
              const e = err as { message?: string; stdout?: string; stderr?: string };
              lines.push("");
              lines.push(
                `ingest-book.sh failed: ${e.message ?? String(err)}. You can run it manually:\n  ${INGEST_SCRIPT} ${path} ${input.slug}`,
              );
            }
          }
        } else {
          lines.push("");
          lines.push(
            `Next: run ${INGEST_SCRIPT} ${path} ${input.slug} to produce book.md`,
          );
        }

        lines.push("");
        lines.push(formatIngestNextStep(input.slug));

        return textResult(lines.join("\n"), { path, ext, book, slug: input.slug });
      }

      case "library_annas_search": {
        const input = AnnasSearchInput.parse(args);
        const results = await searchAnnas(input.query, {
          language: input.language,
          extension: input.extension,
          limit: input.limit,
        });
        const hasKey = Boolean(process.env.ANNAS_ARCHIVE_KEY);
        const text =
          results.map(formatAnnasResultSummary).join("\n") +
          (hasKey
            ? "\n\nCall library.annas_download with md5 + slug to fetch automatically."
            : "\n\nOpen any download_page_url in your browser to fetch the file. (Set ANNAS_ARCHIVE_KEY to enable library.annas_download.)");
        return textResult(text, { results });
      }

      case "library_annas_download": {
        const input = AnnasDownloadInput.parse(args);
        const targetDir = join(BOOKS_DIR, input.slug);
        const { path, ext, api } = await downloadAnnasBook(
          input.md5,
          targetDir,
          input.extension,
        );

        const lines: string[] = [];
        lines.push(`Downloaded md5:${input.md5.slice(0, 8)} → ${path}`);
        lines.push(`Format: ${ext}`);
        if (api.account_fast_download_info?.downloads_left !== undefined) {
          const info = api.account_fast_download_info;
          lines.push(
            `Quota: ${info.downloads_left}/${info.downloads_per_day ?? "?"} fast downloads left today.`,
          );
        }

        if (input.auto_ingest) {
          if (!existsSync(INGEST_SCRIPT)) {
            lines.push("");
            lines.push(
              `WARNING: ingest-book.sh not found at ${INGEST_SCRIPT} — download succeeded but conversion skipped. Run it manually.`,
            );
          } else {
            try {
              const { stdout, stderr } = await execFileP(
                "bash",
                [INGEST_SCRIPT, path, input.slug],
                { env: { ...process.env, WIKI_ROOT, BRAIN_DIR: WIKI_ROOT } },
              );
              lines.push("");
              lines.push("ingest-book.sh output:");
              lines.push(stdout);
              if (stderr) {
                lines.push("stderr:");
                lines.push(stderr);
              }
            } catch (err: unknown) {
              const e = err as { message?: string; stdout?: string; stderr?: string };
              lines.push("");
              lines.push(
                `ingest-book.sh failed: ${e.message ?? String(err)}. You can run it manually:\n  ${INGEST_SCRIPT} ${path} ${input.slug}`,
              );
            }
          }
        } else {
          lines.push("");
          lines.push(
            `Next: run ${INGEST_SCRIPT} ${path} ${input.slug} to produce book.md`,
          );
        }

        lines.push("");
        lines.push(formatIngestNextStep(input.slug));

        return textResult(lines.join("\n"), {
          path,
          ext,
          slug: input.slug,
          md5: input.md5,
          downloads_left: api.account_fast_download_info?.downloads_left,
          next_action: "wiki_ingest",
          ingest_target: join(BOOKS_DIR, input.slug, "book.md"),
        });
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${msg}` }],
      isError: true,
    };
  }
});

function textResult(text: string, structured?: unknown) {
  return {
    content: [{ type: "text", text }],
    ...(structured !== undefined ? { structuredContent: structured } : {}),
  };
}

/**
 * Render the post-download "next step" block. Used by both gutenberg_download
 * and annas_download so the calling agent / human gets a uniform nudge.
 *
 * The two-phase split (content subagent → bookkeeping) is mandatory: a single
 * long-running subagent risks socket timeout on the finalization steps for
 * large books. The Cialdini run on 2026-05-29 hit exactly that failure mode.
 */
function formatIngestNextStep(slug: string): string {
  return [
    "──────────────────────────────────────────────",
    "📚 NEXT STEP — wiki ingest (do this NOW without waiting for user)",
    "──────────────────────────────────────────────",
    `Integrate this book into the LLM wiki at ${WIKI_ROOT}/wiki/ per ${WIKI_ROOT}/CLAUDE.md.`,
    "",
    "▸ PHASE 1 — CONTENT (delegate to a Task subagent):",
    `    1. Read ${WIKI_ROOT}/CLAUDE.md (operating manual)`,
    `    2. Read ${WIKI_ROOT}/templates/{source,entity,concept}.md`,
    `    3. Read ${WIKI_ROOT}/raw/books/${slug}/book.md (chapter by chapter)`,
    `    4. Create ${WIKI_ROOT}/wiki/sources/<Source-Page>.md`,
    `    5. Create / update entity pages in ${WIKI_ROOT}/wiki/entities/`,
    `    6. Create / update concept pages in ${WIKI_ROOT}/wiki/concepts/ (typically 8–15)`,
    "    ↳ Subagent's scope is CONTENT ONLY. It MUST NOT touch index.md, log.md, or meta.yaml.",
    "",
    "▸ PHASE 2 — BOOKKEEPING (parent inline, or a small separate subagent):",
    `    7. Update ${WIKI_ROOT}/index.md (sections + header counts: Sources · Entities · Concepts · Syntheses)`,
    `    8. Append "## [YYYY-MM-DD HH:MM] ingest | <title>" entry to ${WIKI_ROOT}/log.md, listing every page touched`,
    `    9. Flip ${WIKI_ROOT}/raw/books/${slug}/meta.yaml — set llm_ingested: true and fill title/author/year/language`,
    "",
    "Rationale for the split: a single long subagent on a big book risks socket timeout on the final 3 mechanical steps. Splitting keeps phase 2 fast and recoverable.",
    `If the user explicitly says "skip ingest", do not start.`,
  ].join("\n");
}

// ---------- run ----------

const transport = new StdioServerTransport();
await server.connect(transport);
// stderr — stdout is reserved for MCP framing.
process.stderr.write("mnemex-library MCP server ready\n");

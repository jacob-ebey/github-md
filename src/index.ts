import { createElement } from "react";
import { renderToString } from "react-dom/server";

import emoji from "node-emoji";
import frontmatter from "front-matter";
import hljs from "highlight.js";
import { marked } from "marked";
import sanitize from "sanitize-html";

import Demo from "./demo";
import { initSentry } from "./sentry";

let REVALIDATE_AFTER_SECONDS = 5 * 60;
let STALE_FOR_SECONDS = 2 * 24 * 60 * 60;

declare global {
  interface CacheStorage {
    default: Cache;
  }
}

type Env = {
  SENTRY_DSN?: string;
};

type ApiData = {
  attributes: unknown;
  html: string;
};

type ApiError = {
  error: string;
};

type ApiResponse = ApiData | ApiError;

type Cached = ApiData;

type CachedFile = {
  path: string;
  sha: string;
};

type CachedFiles = {
  sha: string;
  files: CachedFile[];
};

export default {
  fetch: handleFetch,
};

async function handleFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const sentry = initSentry(request, ctx, env.SENTRY_DSN);

  try {
    let url = new URL(request.url);

    let response = shouldSkipCache(request)
      ? null
      : await caches.default.match(request.url);

    if (response) {
      return response;
    }

    if (url.pathname === "/") {
      response = await renderDocs(request, ctx);
    } else if (url.pathname.split("/")[3] === "blob") {
      response = await renderDemo(request, ctx);
    } else if (url.pathname.split("/").filter((s) => s !== "").length === 3) {
      response = await renderFiles(request, ctx);
    } else {
      response = await renderMarkdown(request, ctx);
    }

    ctx.waitUntil(caches.default.put(request.url, response.clone()));

    return response;
  } catch (error) {
    sentry.captureException(error);
    console.log(error);

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}

async function renderDocs(
  request: Request,
  ctx: ExecutionContext
): Promise<Response> {
  let url = new URL(request.url);
  let domain = new URL("/", url).href;

  let markdownHeaders = new Headers();
  request.headers.has("Cache-Control") &&
    markdownHeaders.append(
      "Cache-Control",
      request.headers.get("Cache-Control")!
    );

  let markdownResponse = await renderMarkdown(
    new Request(new URL("/jacob-ebey/github-md/main/README.md", domain).href, {
      headers: markdownHeaders,
    }),
    ctx
  );
  let markdownJson = (await markdownResponse.json()) as ApiResponse;
  let html = "html" in markdownJson ? markdownJson.html : markdownJson.error;

  return new Response(
    "<!DOCTYPE html>" + renderToString(createElement(Demo, { html })),
    {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control":
          markdownResponse.headers.get("Cache-Control") || "no-cache",
      },
    }
  );
}

async function renderDemo(
  request: Request,
  ctx: ExecutionContext
): Promise<Response> {
  let url = new URL(request.url);
  let domain = new URL("/", url).href;
  let file = url.pathname.replace("/blob/", "/");

  let markdownHeaders = new Headers();
  request.headers.has("Cache-Control") &&
    markdownHeaders.append(
      "Cache-Control",
      request.headers.get("Cache-Control")!
    );
  let markdownResponse = await renderMarkdown(
    new Request(new URL(file, domain).href, {
      headers: markdownHeaders,
    }),
    ctx
  );
  if (markdownResponse.status === 404 && !url.pathname.endsWith(".md")) {
    url.pathname = url.pathname + ".md";
    return new Response(null, { status: 302, headers: { Location: url.href } });
  }
  let markdownJson = (await markdownResponse.json()) as ApiResponse;
  let html = "html" in markdownJson ? markdownJson.html : markdownJson.error;

  let publicPath = url.pathname.split("/").slice(0, 5).join("/");
  console.log(publicPath);
  html = html.replace(/href="\//g, `href="${publicPath}/`);

  return new Response(
    "<!DOCTYPE html>" + renderToString(createElement(Demo, { html })),
    {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control":
          markdownResponse.headers.get("Cache-Control") || "no-cache",
      },
    }
  );
}

async function renderFiles(
  request: Request,
  ctx: ExecutionContext
): Promise<Response> {
  let now = Date.now();
  let url = new URL(request.url);
  let [user, repo, sha] = url.pathname.split("/").filter((s) => s !== "");

  let filesJsonKey = `files${url.pathname}`;
  let cached = shouldSkipCache(request)
    ? null
    : await readFromCache(filesJsonKey);

  let response: Response | null = null;
  if (cached) {
    response = cached.response;

    if (cached.staleAt < now) {
      ctx.waitUntil(
        createNewFilesCacheEntry(user, repo, sha).then(
          (toCache) => toCache && writeToCache(filesJsonKey, toCache)
        )
      );
    }
  } else {
    let data = await createNewFilesCacheEntry(user, repo, sha);
    if (data) {
      response = new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });

      ctx.waitUntil(writeToCache(filesJsonKey, data));
    }
  }

  if (!response) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  response.headers.set(
    "Cache-Control",
    `public, max-age=${REVALIDATE_AFTER_SECONDS}, immutable`
  );

  return response;
}

async function renderMarkdown(
  request: Request,
  ctx: ExecutionContext
): Promise<Response> {
  let now = Date.now();
  let url = new URL(request.url);

  let kvJsonKey = `json-swr${url.pathname}`;
  let cached = shouldSkipCache(request) ? null : await readFromCache(kvJsonKey);

  let response: Response | null = null;
  if (cached) {
    response = cached.response;

    if (cached.staleAt < now) {
      ctx.waitUntil(
        getMarkdownFromGitHub(url).then(
          (toCache) => toCache && writeToCache(kvJsonKey, toCache)
        )
      );
    }
  } else {
    let data = await getMarkdownFromGitHub(url);
    if (data) {
      response = new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });

      ctx.waitUntil(writeToCache(kvJsonKey, data));
    }
  }

  if (!response) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  response.headers.set(
    "Cache-Control",
    `public, max-age=${REVALIDATE_AFTER_SECONDS}, immutable`
  );

  return response;
}

async function readFromCache(
  key: string
): Promise<{ response: Response; staleAt: number } | null> {
  let url = `kv://${key}`;
  let response = await caches.default.match(url, {});
  if (!response) return null;

  return {
    response,
    staleAt: Number(response.headers.get("Stale-At") || 0),
  };
}

async function writeToCache(
  key: string,
  value: unknown,
  contentType: string = "application/json"
): Promise<void> {
  let url = `kv://${key}`;
  await caches.default.put(
    url,
    new Response(JSON.stringify(value), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": `public, max-age=${STALE_FOR_SECONDS}, immutable`,
        "Stale-At": (Date.now() + REVALIDATE_AFTER_SECONDS * 1000).toFixed(0),
      },
    })
  );
}

async function getMarkdownFromGitHub(url: URL): Promise<Cached | null> {
  let contentResponse = await fetch(
    new URL(url.pathname, "https://raw.githubusercontent.com/").href,
    {
      headers: {
        "User-Agent": "github-md.com",
      },
    }
  );
  if (!contentResponse.ok) return null;
  let markdown = await contentResponse.text();

  return parseMarkdown(markdown);
}

async function createNewFilesCacheEntry(
  user: string,
  repo: string,
  sha: string
): Promise<CachedFiles | null> {
  let contentResponse = await fetch(
    `https://api.github.com/repos/${user}/${repo}/git/trees/${sha}?recursive=1`,
    {
      headers: {
        "User-Agent": "github-md.com",
      },
    }
  );

  if (!contentResponse.ok) return null;
  let content = (await contentResponse.json()) as {
    sha: string;
    tree: {
      path: string;
      type: "blob" | "tree";
      sha: string;
    }[];
  };

  let files = content.tree.reduce((acc, item) => {
    if (item.type === "blob" && item.path.toLocaleLowerCase().endsWith(".md")) {
      acc.push({
        path: item.path,
        sha: item.sha,
      });
    }
    return acc;
  }, [] as CachedFile[]);

  return {
    sha: content.sha,
    files: await Promise.all(files),
  };
}

function emojiReplacer(match: string) {
  return emoji.emojify(match);
}

function parseMarkdown(markdown: string): ApiData {
  let { body, attributes } = frontmatter(markdown);

  body = body.replace(/(:.*:)/g, emojiReplacer);

  let html = marked(body, {
    highlight: (code, language) => {
      if (language && hljs.getLanguage(language)) {
        try {
          return hljs.highlight(code, { language }).value;
        } catch (__) {}
      }
      return code;
    },
    langPrefix: "hljs language-",
    gfm: true,
    headerIds: true,
    smartLists: true,
  });
  html = sanitize(html, {
    allowedTags: [
      "address",
      "article",
      "aside",
      "footer",
      "header",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hgroup",
      "main",
      "nav",
      "section",
      "blockquote",
      "img",
      "dd",
      "div",
      "dl",
      "dt",
      "figcaption",
      "figure",
      "hr",
      "li",
      "main",
      "ol",
      "p",
      "pre",
      "ul",
      "a",
      "abbr",
      "b",
      "bdi",
      "bdo",
      "br",
      "cite",
      "code",
      "data",
      "dfn",
      "em",
      "i",
      "kbd",
      "mark",
      "q",
      "rb",
      "rp",
      "rt",
      "rtc",
      "ruby",
      "s",
      "samp",
      "small",
      "span",
      "strong",
      "sub",
      "sup",
      "time",
      "u",
      "var",
      "wbr",
      "caption",
      "col",
      "colgroup",
      "table",
      "tbody",
      "td",
      "tfoot",
      "th",
      "thead",
      "tr",
    ],
    disallowedTagsMode: "discard",
    allowedAttributes: {
      "*": ["class", "id", "style"],
      a: ["href", "name", "target"],
      // We don't currently allow img itself by default, but
      // these attributes would make sense if we did.
      img: ["src", "srcset", "alt", "title", "width", "height", "loading"],
    },
    // Lots of these won't come up by default because we don't allow them
    selfClosing: [
      "img",
      "br",
      "hr",
      "area",
      "base",
      "basefont",
      "input",
      "link",
      "meta",
    ],
    // URL schemes we permit
    allowedSchemes: ["http", "https", "ftp", "mailto", "tel"],
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    allowProtocolRelative: true,
    enforceHtmlBoundary: true,
  });

  return { attributes, html };
}

function shouldSkipCache(request: Request): boolean {
  let hasNoCache =
    request.headers.get("Cache-Control")?.toLowerCase().includes("no-cache") ||
    request.headers.get("pragma")?.toLowerCase().includes("no-cache") ||
    false;

  return hasNoCache;
}

import { createElement } from "react";
import { renderToString } from "react-dom/server";

import emoji from "node-emoji";
import frontmatter from "front-matter";
import hljs from "highlight.js";
import { marked } from "marked";
import sanitize from "sanitize-html";

import Demo from "./demo";

const REVALIDATE_AFTER_MS = 5 * 60 * 1000;
const STALE_FOR_SECONDS = 2 * 24 * 60 * 60;

type Env = {
  GITHUB_MD: KVNamespace;
};

type ApiData = {
  attributes: unknown;
  html: string;
};

type ApiError = {
  error: string;
};

type ApiResponse = ApiData | ApiError;

type Cached = ApiData & {
  staleAt: number;
};

export default {
  fetch: handleFetch,
};

async function handleFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  let url = new URL(request.url);

  if (url.pathname === "/") {
    return renderDocs(request, env, ctx);
  }
  if (url.pathname.startsWith("/_demo/")) {
    return renderDemo(request, env, ctx);
  }

  return renderMarkdown(request, env, ctx);
}

async function renderDocs(request: Request, env: Env, ctx: ExecutionContext) {
  let url = new URL(request.url);
  let domain = new URL("/", url).href;

  let markdownResponse = await handleFetch(
    new Request(new URL("/jacob-ebey/github-md/main/README.md", domain).href),
    env,
    ctx
  );
  let markdownJson = (await markdownResponse.json()) as ApiResponse;
  let html = "html" in markdownJson ? markdownJson.html : markdownJson.error;

  return new Response(
    "<!DOCTYPE html>" + renderToString(createElement(Demo, { html })),
    {
      headers: { "Content-Type": "text/html" },
    }
  );
}

async function renderDemo(request: Request, env: Env, ctx: ExecutionContext) {
  let url = new URL(request.url);
  let domain = new URL("/", url).href;
  let file = url.pathname.slice("/_demo".length);

  let markdownResponse = await handleFetch(
    new Request(new Request(new URL(file, domain).href)),
    env,
    ctx
  );
  let markdownJson = (await markdownResponse.json()) as ApiResponse;
  let html = "html" in markdownJson ? markdownJson.html : markdownJson.error;

  return new Response(
    "<!DOCTYPE html>" + renderToString(createElement(Demo, { html })),
    {
      headers: { "Content-Type": "text/html" },
    }
  );
}

async function renderMarkdown(
  request: Request,
  { GITHUB_MD }: Env,
  ctx: ExecutionContext
): Promise<Response> {
  let now = Date.now();
  let url = new URL(request.url);

  let kvJsonKey = `json-swr${url.pathname}`;
  let cachedJson = await GITHUB_MD.get(kvJsonKey, {
    cacheTtl: STALE_FOR_SECONDS,
  });
  let cached = cachedJson ? JSON.parse(cachedJson) : null;

  if (cached && cached.staleAt < now) {
    ctx.waitUntil(
      createNewCacheEntry(url, now).then(
        (toCache) =>
          toCache &&
          GITHUB_MD.put(kvJsonKey, JSON.stringify(toCache), {
            expirationTtl: STALE_FOR_SECONDS,
          })
      )
    );
  } else if (!cached) {
    cached = await createNewCacheEntry(url, now);
    if (cached) {
      ctx.waitUntil(
        GITHUB_MD.put(kvJsonKey, JSON.stringify(cached), {
          expirationTtl: STALE_FOR_SECONDS,
        })
      );
    }
  }

  if (!cached) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(cached), {
    headers: { "Content-Type": "application/json" },
  });
}

async function createNewCacheEntry(
  url: URL,
  now: number
): Promise<Cached | null> {
  let contentResponse = await fetch(
    new URL(url.pathname, "https://raw.githubusercontent.com/").href
  );
  if (!contentResponse.ok) return null;
  let markdown = await contentResponse.text();

  let data = parseMarkdown(markdown);

  return {
    ...data,
    staleAt: now + REVALIDATE_AFTER_MS,
  };
}

function parseMarkdown(markdown: string): ApiData {
  let { body, attributes } = frontmatter(markdown);
  const replacer = (match: string) => emoji.emojify(match);
  body = body.replace(/(:.*:)/g, replacer);
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

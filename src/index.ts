import { createElement } from "preact";
import { renderToString } from "preact-render-to-string";
import hljs from "highlight.js";
import MarkdownParser from "markdown-it";
import frontmatter from "front-matter";

import Demo from "./demo";
import Docs from "./docs";

type Env = {
  GITHUB_MD: KVNamespace;
};

const entry = {
  async fetch(
    request: Request,
    { GITHUB_MD }: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      let url = new URL(request.url);
      let domain = new URL("/", url).href;

      if (url.pathname === "/") {
        let markdownResponse = await entry.fetch(
          new Request(new URL("/jacob-ebey/github-md/main/README.md", domain).href),
          { GITHUB_MD },
          ctx
        );
        let markdown = (await markdownResponse.json()) as {
          error: string;
          html: string;
        };

        let html = renderToString(createElement(Docs, { html: markdown.html || markdown.error }));
        return new Response("<!DOCTYPE html>" + html, {
          headers: { "Content-Type": "text/html" },
        });
      }

      if (url.pathname.startsWith("/_demo/")) {
        let file = url.pathname.slice("/_demo".length);
        console.log({ href: new URL(file, domain).href });
        let markdownResponse = await entry.fetch(
          new Request(new URL(file, domain).href),
          { GITHUB_MD },
          ctx
        );
        let markdown = (await markdownResponse.json()) as {
          error: string;
          html: string;
        };
        let html = renderToString(
          createElement(Demo, { html: markdown.html || markdown.error })
        );
        return new Response("<!DOCTYPE html>" + html, {
          status: markdownResponse.status,
          headers: { "Content-Type": "text/html" },
        });
      }

      let kvJsonKey = `json${url.pathname}`;
      let json = await GITHUB_MD.get(kvJsonKey);

      if (json) {
        return new Response(json, {
          headers: { "Content-Type": "application/json" },
        });
      }

      let kvMarkdownKey = `md${url.pathname}`;
      let markdown = await GITHUB_MD.get(kvMarkdownKey);

      if (!markdown) {
        let contentResponse = await fetch(
          new URL(url.pathname, "https://raw.githubusercontent.com/").href
        );
        if (contentResponse.ok) {
          markdown = await contentResponse.text();
          ctx.waitUntil(
            GITHUB_MD.put(kvMarkdownKey, markdown, { expirationTtl: 10 * 60 })
          );
        }
      }

      if (!markdown) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      let parser = new MarkdownParser({
        html: true,
        linkify: true,
        langPrefix: "hljs language-",
        highlight: (str, lang) => {
          if (lang && hljs.getLanguage(lang)) {
            try {
              return hljs.highlight(str, { language: lang }).value;
            } catch (__) {}
          }

          return ""; // use external default escaping
        },
      });

      let { body, attributes } = frontmatter(markdown);
      let html = parser.render(body);

      json = JSON.stringify({
        attributes,
        html,
      });

      ctx.waitUntil(GITHUB_MD.put(kvJsonKey, json, { expirationTtl: 10 * 60 }));

      return new Response(json, {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error(error?.message || error);
      error?.stack && console.error(error.stack);
      return new Response("Something went wrong", { status: 500 });
    }
  },
};

export default entry;

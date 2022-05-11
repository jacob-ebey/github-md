import { createElement } from "react";
import { renderToString } from "react-dom/server";

import emoji from "node-emoji";
import frontmatter from "front-matter";
import hljs from "highlight.js";
import { marked } from "marked";
import sanitize from "sanitize-html";

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
          new Request(
            new URL("/jacob-ebey/github-md/main/README.md", domain).href
          ),
          { GITHUB_MD },
          ctx
        );
        let markdown = (await markdownResponse.json()) as {
          error: string;
          html: string;
        };

        let html = renderToString(
          createElement(Docs, { html: markdown.html || markdown.error })
        );
        return new Response("<!DOCTYPE html>" + html, {
          headers: { "Content-Type": "text/html" },
        });
      }

      if (url.pathname.startsWith("/_demo/")) {
        let file = url.pathname.slice("/_demo".length);
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

      json = JSON.stringify({
        attributes,
        html,
      });

      ctx.waitUntil(GITHUB_MD.put(kvJsonKey, json, { expirationTtl: 10 * 60 }));

      return new Response(json, {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.log(error);
      return new Response("Something went wrong", { status: 500 });
    }
  },
};

export default entry;

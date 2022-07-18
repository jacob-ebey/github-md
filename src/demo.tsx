import * as React from "react";

export default function Demo({
  title,
  description,
  html,
}: {
  title?: string;
  description?: string;
  html: string;
}) {
  return (
    <html lang="en-us">
      <head>
        <meta charSet="UTF-8" />
        <title>{title || "github-md"}</title>
        <meta
          name="description"
          content={description || "A markdown parser API for GitHub"}
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/@exampledev/new.css@1.1.3/new.css"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/highlight.js@11.5.1/styles/a11y-dark.css"
        />
      </head>
      <body>
        <main>
          <article dangerouslySetInnerHTML={{ __html: html }} />
        </main>
      </body>
    </html>
  );
}

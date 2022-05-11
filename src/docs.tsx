import * as React from "react";

export default function Docs({ html }: { html: string }) {
  return (
    <html>
      <head>
        <meta charSet="UTF-8" />
        <title>github-md</title>
        <meta name="description" content="A markdown parser API for GitHub" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@exampledev/new.css@1.1.3/new.min.css"
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

import { h } from "preact";

export default function Demo({ html }: { html: string }) {
  return (
    <html>
      <head>
        <title>github-md</title>
        <meta name="description" content="A markdown parser API for GitHub" />
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

import { h } from "preact";

export default function Docs({ domain }: { domain: string }) {
  return (
    <html>
      <head>
        <title>github-md</title>
        <meta name="description" content="A markdown parser API for GitHub" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@exampledev/new.css@1.1.3/new.min.css"
        />
      </head>
      <body>
        <main>
          <article>
            <h1>github-md</h1>
            <p>A markdown parser API for GitHub.</p>

            <h2>Endpoint</h2>
            <p>
              <code>
                {domain}[username]/[repository]/[branch|tag|sha]/[filepath]
              </code>
            </p>

            <h2>Response</h2>
            <dl>
              <dt>attributes</dt>
              <dd>The attributes parsed off the front matter</dd>
              <dt>html</dt>
              <dd>The HTML rendered from the markdown</dd>
            </dl>

            <p>Examples:</p>
            <ul>
              <li>
                <a
                  href={`${domain}remix-run/remix/main/docs/index.md`}
                  target="_blank"
                >
                  {domain}remix-run/remix/main/docs/index.md
                </a>
              </li>
              <li>
                <a
                  href={`${domain}facebook/react/17.0.2/README.md`}
                  target="_blank"
                >
                  {domain}facebook/react/17.0.2/README.md
                </a>
              </li>
            </ul>
          </article>
        </main>
      </body>
    </html>
  );
}

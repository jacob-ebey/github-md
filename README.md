# github-md

A markdown parser API for GitHub.

Source: https://github.com/jacob-ebey/github-md

## Endpoint

```
/[username]/[repository]/[branch|tag|sha]/[filepath]
```

## Response

attributes
: The attributes parsed off the front matter

html
: The HTML rendered from the markdown

## Examples:

- https://github-md.com/remix-run/remix/main/docs/index.md
- https://github-md.com/facebook/react/17.0.2/README.md

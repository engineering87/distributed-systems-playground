# Security policy

Distributed Systems Playground runs entirely in the browser. It has no server, stores scenarios only in the browser's local storage, and loads no code from third parties apart from web fonts.

## What counts as a security issue

- A scenario, a shared link or an imported file that makes the page run code other than the simulation.
- A way for a shared scenario to read or send data from the viewer's browser.
- Anything that lets content escape the page's own storage.

A scenario that makes the simulation slow or stop with an error is a bug, not a security issue. Please report it as a normal issue.

## Known analyzer findings

The download helper builds a `blob:` URL from data that originates in the page, which static analysis reports as "DOM text reinterpreted as HTML". The blob is always typed `application/octet-stream`, the link carries a `download` attribute and the URL is revoked right after the click, and the two SVG exports are sanitized before they leave the page, so the content is never rendered as a document. Alerts on that line are dismissed with this justification.

## Reporting

Please do not open a public issue for security problems. Contact the maintainer through the email address on the [GitHub profile](https://github.com/engineering87), with a description and, if possible, a scenario that reproduces the problem.

You will get an answer as soon as possible. Once fixed, the issue will be described in the [changelog](CHANGELOG.md).

## Supported versions

Only the latest version, the one in the `main` branch, receives fixes.

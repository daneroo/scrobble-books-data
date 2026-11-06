# Glossary

- **Rate limit**: our cap on requests started per second (`--rate`). Ours, not
  Goodreads'.
- **WAF challenge**: Goodreads' AWS Web Application Firewall answering a page
  request with status 202 and a JavaScript challenge page instead of the page.
  Cleared by a fresh `aws-waf-token` cookie (a browser load of a Goodreads
  page). Trigger unknown: assumed per source IP, perhaps with rate; unproven.
- **Attempts**: scrape runs one `bun run publish` needs until one passes. The
  aggregate stability measure: 1 is a clean run.

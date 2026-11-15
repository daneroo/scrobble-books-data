# Glossary

- **Rate limit**: our cap on requests started per second (`--rate`). Ours, not
  Goodreads'.
- **WAF challenge**: Goodreads' AWS Web Application Firewall answering a page
  request with status 202 and a JavaScript challenge page instead of the page.
  Cleared by a fresh `aws-waf-token` cookie (a browser load of a Goodreads
  page). Trigger unknown: assumed per source IP, perhaps with rate; unproven.
- **Attempt**: one try of one request. A request has at most 6; a timeout, a 429
  or a 5xx is retried, a 202 is not.
- **Restart**: one more pass of the whole run, after a pass fails on a WAF
  challenge or on too many retries; it reads back the pages this run already
  fetched. At most 100, 60 s apart.

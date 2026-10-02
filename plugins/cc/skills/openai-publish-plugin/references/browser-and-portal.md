# Browser and portal operations

Use the host's available browser capability. No particular automation library,
local cache path, or extra installation is required by this skill.

## Connect to an authorized browser

1. Prefer the available managed browser. If login reports that the browser is not
   secure, let the user sign in through their supported browser and authorize
   remote control. Repeated automated sign-ins rarely resolve that message.
2. Discover available Playwright/CDP tools before installing anything. Confirm the
   user's remote debugging setting, displayed address, and browser approval.
   Modern Chrome may expose a browser WebSocket such as
   `ws://127.0.0.1:9222/devtools/browser`; use the actual endpoint for this instance.
   A missing `/json/version` response alone does not prove CDP is unavailable.
3. Diagnose the actual connection error. `ECONNREFUSED` suggests no reachable
   listener; inspect the setting and endpoint. A protected `DevToolsActivePort`
   file does not require granting Full Disk Access or reading cookies to proceed.
4. For `EADDRNOTAVAIL`, inspect socket pressure and process ownership. In the
   Superskill session, orphaned Wrangler processes exhausted local sockets.
   That is a diagnostic example, not a universal cause. Stop only identified
   processes when authorized; never use a broad kill or disable protections.

Do not inspect saved credentials, expose session cookies, or weaken browser
security to connect. If access remains unavailable, finish package preparation
and provide an exact manual portal handoff.

## Locate and operate the saved release

- Start at `https://platform.openai.com/plugins` and locate the actual plugin under
  the correct organization. A legacy edit link or blank form may be the wrong
  entry. Inspect existing plugins before creating a duplicate.
- Read visible identity, version, checks, review state, and publication state.
  Confirm the intended release before uploads or irreversible transitions.
- Verify saved values after each mutation. Browser success messages alone do not
  establish that the intended version was uploaded or made public.
- Leave legal checkboxes for the publisher. Read back the state after they submit.
  The historical Superskill release reached **In review**; that observation does
  not establish approval or publication for any subsequent release.

## Diagnose policy URL warnings

- Check redirects, TLS, body content, robots rules, authentication, and relevant
  CDN/WAF evidence. A user-agent probe is useful evidence but does not reproduce
  the reviewer's IP, network, or exact fetch behavior.
- In the Superskill session, ordinary requests returned 200 while a GPTBot probe
  returned 403 with a Cloudflare GPTBot block. The portal warning persisted, and
  submission later entered review. We did not establish that the checker used
  GPTBot or that its warning could safely be ignored for another release.
- Distinguish an observed blocker from a suspected cause. Retain unresolved
  warnings in the handoff. Do not broadly enable training crawlers or disable
  security merely to remove a submission warning; use a narrowly justified,
  authorized change when evidence identifies the relevant rule.
- Retry after a relevant fix or one plausible transient failure. If the warning
  persists, collect non-secret evidence and give the owner or OpenAI support a
  concrete issue report. Do not claim a passing check without a saved result.

Leave the user's signed-in browser available for their legal and review actions.

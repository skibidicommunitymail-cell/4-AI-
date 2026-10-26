# 4-AI Hub — Cold Workspace

A responsive, dependency-free web workspace for collaborating with Grok (xAI), ChatGPT via OpenAI API, Claude (Anthropic), and Gemini (Google AI API). The project uses plain HTML, CSS, and JavaScript; no npm build is required.

## What's new in this update

- Cold, minimal, responsive interface with animated ambient background, animated brand mark, compact icon-only attachment/send controls, hover tooltips, mobile sidebar, and optional accent/motion settings.
- First-visit welcome and local account registration/sign-in. Passwords are stored as salted PBKDF2 hashes in the browser. This is a **local-only profile**, not a server account; it does not sync across devices and is not a substitute for production authentication.
- Per-account chat history persisted in browser storage. Refreshing restores the selected chat and already received messages. If the page reloads while an AI request is in progress, the request itself cannot resume, but its saved transcript remains.
- Completed project-mode sessions are automatically marked as saved projects. Open them later, export the whole transcript as Markdown, and download fenced HTML as a separate `.html` file from the isolated preview.
- HTML preview appears when a model emits an HTML code block. It runs in a sandboxed iframe with network connections blocked by CSP. This is a live preview of received HTML snippets, not a connected IDE capable of editing arbitrary files or binary archives.
- Optional browser speech recognition for voice input and speech synthesis for answers. Browser support and microphone permission are required.
- Per-key debounced connection checks, individual status details, model discovery from provider APIs, fallbacks between returned/known model IDs, request timeouts, and clearer distinction between invalid keys and unavailable deployment proxy.
- A visible Plus plan concept ($20/month) explains the planned 40-provider experience. Payment processing, server-managed keys, and extra providers are **not active in this build**; only the four listed providers are implemented.

## Deploy to Cloudflare Pages (GitHub integration)

**Important:** this project is designed for **Cloudflare Pages**, not a static-assets-only Cloudflare Worker. The `functions/api/provider/[[path]].js` file is a Pages Function used by the frontend to send provider requests through `/api/provider/...`.

1. Push the contents of this folder to the root of the GitHub repository. The repository root should contain `index.html`, `functions/`, `assets/`, `css/`, and `js/` directly (not nested inside another project folder).
2. In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git**.
3. Choose the existing GitHub repository and production branch `main`.
4. Choose **Framework preset: None**.
5. Set **Build command** to `exit 0`. This project has no compile/build step; the command also lets Pages run the Functions deployment pipeline.
6. Set **Build output directory** to `.`.
7. Leave **Root directory** blank because the project files are at the repository root.
8. Deploy. Cloudflare should publish a `*.pages.dev` URL. Check that `/` loads the app and that `/api/provider/...` is routed to the Pages Function.

### Authentication and secrets

For a GitHub-connected Pages project, do **not** copy `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` from the failed Worker into the Pages project. The Git integration is authorized through Cloudflare's GitHub connection. The app currently asks each user to enter their own provider API keys (OpenAI, Anthropic, Google, or xAI) in the app's settings; no provider API key is required to publish the static site itself.

Do not create a Worker Builds deploy command for this project. There is no `wrangler pages deploy` or `wrangler deploy` command needed in the GitHub-integrated Pages build settings.

For local static development without Pages Functions, the app attempts direct provider requests. Browser CORS rules may block some providers; use a development server that supports the Pages Functions route for realistic connection testing.

## API key troubleshooting

- Enter the **secret API key** from the provider's API console. A Project ID, Organization ID, user ID, model name, or regular website password is not an API key.
- OpenAI API billing is separate from a ChatGPT subscription. Provider APIs may require API billing, enabled access, and remaining quota.
- Basic validation requests the provider's model list. Optional test generation additionally makes a short completion and may use a small amount of quota.
- A `401` normally means an invalid/revoked key; `403` may be permissions or access; `429` usually means a quota/rate limit; a network/proxy error is not evidence that the key is wrong.
- The proxy is an allow-list, same-origin Cloudflare Pages Function. It forwards only the key for the chosen provider and does not intentionally save/log key values. Browser storage still makes the user's key accessible to any malicious script served by the same site, so only deploy code you trust.

## Storage

Local profiles, chat transcripts, local preferences, and provider keys are kept in `localStorage` in this browser. Keep important projects exported. Clearing browser storage or switching browser/device removes access unless you have exported the data. Binary file contents are not uploaded as binary artifacts by the current static frontend; text-like attachments are included within conservative context limits, while binary files contribute their name/type/size only.

## Tests

```sh
node --check js/providers.js
node --check js/app.js
node --test tests/*.test.cjs
```

The automated suite (10 tests) uses mocked provider responses to test key-status classification, response parsing, model fallback, cancellation, proxy routing, and missing-proxy diagnostics—including the misleading HTTP 200 HTML fallback. A browser smoke check also confirmed no JavaScript runtime errors and no horizontal overflow at 390 px and 360 px widths. Real provider connectivity requires your own API keys and a deployed server function; no live API calls are claimed by the test results.

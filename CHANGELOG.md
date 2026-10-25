# Changelog

## Cold Workspace update

- Rebuilt the UI around a dark, cool-toned, minimal workspace with animated ambient background and an animated image-based brand mark.
- Added local account register/login, per-account key/settings storage, persistent chat history, saved-project filtering, chat search, chat deletion, and Markdown export.
- Added a responsive sidebar and mobile drawer; compact paper-plane send and attachment icons with tooltips; profile/plan/settings controls.
- Added debounced, immediate API key validation with a clear distinction between API keys and IDs, provider-specific key guides, reveal-key controls, and per-field diagnostics.
- Improved Cloudflare Pages proxy diagnostics, including the case where a missing Function returns the app HTML with HTTP 200; it is now reported as a deployment issue rather than accepted as a valid key.
- Reset per-account provider state and activity during profile switching to avoid carrying statuses from one local account into another.
- Anchored the composer at the bottom and checked small-screen layouts at 390 px and 360 px without horizontal overflow.
- Added sandboxed HTML preview and HTML download for generated HTML code blocks; speech input where supported and optional spoken model responses.
- Added a Plus plan preview ($20/month) without claiming payment or 40-provider functionality that is not implemented.
- Added proxy-specific unit tests; all tests must pass before publishing.

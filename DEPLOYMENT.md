# Deployment

## Cloudflare Pages

This project is configured as a static HTML5 game and can be deployed directly from GitHub.

1. In Cloudflare, open **Workers & Pages** and choose **Create application → Pages → Connect to Git**.
2. Select `alexdevriesxing/kung-fu-imperial-guards`.
3. Use the production branch `main`.
4. Build command: leave empty for the standalone build, or use `npm run build` when the Vite source build is present.
5. Output directory: `/` for the standalone build, or `dist` for the Vite source build.
6. Enable automatic production deployments from `main`.

The repository also includes security and caching headers appropriate for a browser game.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Amplify Hosting sets AWS_APP_ID and AWS_BRANCH during the build, which gives the public URL
// needed for the Viber link preview (og:image must be an absolute URL).
const siteUrl =
  process.env.SITE_URL ??
  (process.env.AWS_APP_ID && process.env.AWS_BRANCH
    ? `https://${process.env.AWS_BRANCH}.${process.env.AWS_APP_ID}.amplifyapp.com`
    : '');

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
    },
  ],
  resolve: {
    // Only used by demo mode, which runs the real resolvers in the browser.
    alias: {
      '@aws-appsync/utils': fileURLToPath(new URL('./devsim/appsync-utils.js', import.meta.url)),
    },
  },
});

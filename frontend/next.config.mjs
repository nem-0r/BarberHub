/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' bundles a minimal server.js for Docker prod (Dockerfile.prod).
  // Has NO effect on `pnpm dev` — only changes `next build` output.
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // Allow Next.js image optimization to fetch from Supabase Storage.
    // If your storage host differs, add it here. To fall back to the old
    // behaviour, set `unoptimized: true` and remove remotePatterns.
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      // Google account avatars (lh3..lh6.googleusercontent.com) — populated
      // into users.avatar_url on Google OAuth signup.
      { protocol: 'https', hostname: '**.googleusercontent.com' },
    ],
  },
  async headers() {
    return [
      {
        // Google Identity Services opens a popup and posts the credential
        // back via window.postMessage. The default COOP ('same-origin')
        // blocks that call. 'same-origin-allow-popups' keeps isolation but
        // lets the GIS popup communicate with the opener.
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
    ]
  },
}

export default nextConfig

"use client"

import { GoogleOAuthProvider } from "@react-oauth/google"

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

export function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  // No client ID configured → render children unwrapped so dev environments
  // without OAuth still boot. The login page checks this and hides the button.
  if (!CLIENT_ID) return <>{children}</>
  return <GoogleOAuthProvider clientId={CLIENT_ID}>{children}</GoogleOAuthProvider>
}

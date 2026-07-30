# Google and GitHub OAuth with Lovable

OAuth provider credentials and protocol handling belong to Authenik8. Lovable
renders buttons and completes the one-time frontend exchange.

## Backend callback URLs

Local:

```text
http://localhost:3000/api/auth/oauth/google/callback
http://localhost:3000/api/auth/oauth/github/callback
```

Recommended production:

```text
https://api.example.com/api/auth/oauth/google/callback
https://api.example.com/api/auth/oauth/github/callback
```

The provider console, `GOOGLE_REDIRECT_URI`/`GITHUB_REDIRECT_URI`, and actual
public API URL must match exactly.

## Sign-in flow

1. Navigate the browser to `client.auth.oauthUrl("google")` or `"github"`.
2. Authenik8 creates provider state and performs the callback.
3. Authenik8 stores a session exchange payload in Redis for 60 seconds.
4. It redirects to the fixed
   `WEB_ORIGIN/auth/callback?code=<single-use-code>`.
5. Call `client.auth.exchangeOAuth(code)` once and immediately replace the
   browser URL with a clean route.

The code is not a token. Never log or persist it. Expired, replayed, or invalid
state must fail.

## Account linking

Call `account.startProviderLink(provider)`, then navigate to the returned
backend URL. Linking uses a separate short-lived ticket and server-side
collision policy. `account.unlinkProvider(provider)` refuses to remove the
last available sign-in method.

There is no arbitrary frontend return destination. Success and failure routes
derive from the exact `WEB_ORIGIN`, preventing open redirects.

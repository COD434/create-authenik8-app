# The Identity Engine

At the heart of Authenik8 is the Identity Engine, a unified authentication core built into `authenik8-core`.

## Why a dedicated Identity Engine?

Traditional auth systems often treat login as separate, isolated flows:

- Email and password follow one path.
- Google OAuth follows another path.
- GitHub follows another path.

This can produce duplicate accounts, inconsistent data, fragile linking logic, and security gaps.

The Identity Engine treats authentication as an identity resolution problem instead of only validating credentials.

## What it does

- **Unified identity resolution:** Resolves credentials, OAuth, and future strategies into one consistent user identity.
- **Smart account linking:** Detects an existing user through policy-approved signals and requires secure linking instead of creating duplicates.
- **Profile normalization:** Converts provider-specific data into the application's unified user shape.
- **Secure token lifecycle management:** Handles access and refresh tokens with rotation, replay protection, and Redis-backed state.
- **Consistent security layer:** Applies common rate limiting, session controls, and authorization primitives across authentication methods.

## OAuth through the Identity Engine

OAuth is not implemented as unrelated Passport.js-style routes:

1. The application receives the provider callback.
2. The Identity Engine validates and normalizes the profile.
3. It chooses an existing-provider login, explicit account link, or new identity according to policy.
4. It returns consistent tokens and user data.

This design keeps new providers and authentication methods inside the same identity and security model.

Read [Using authenik8-core](authenik8-core.md) for the generated integration and token lifecycle.

[Back to the documentation index](../README.md#documentation)

# Security

Security is a property of the whole system, not a middleware you add at the end.
The default posture is deny: every request is untrusted, every object is
protected, and every secret stays on the server.

### A8-SEC-01 Server-side sessions

**Rule.** Authentication state lives on the server. The browser holds an opaque
session identifier in a hardened cookie. Rotate the session on sign-in and on
privilege change. Expire it on sign-out and after an idle timeout.

**In practice.** Store session data in a server-side store with an explicit TTL.
Use a rotating refresh token only if the architecture requires it, and keep the
refresh token server-side or in an HttpOnly cookie. Never treat a client-side
flag as proof of authentication.

**Smell.** A JWT in `localStorage` used as the session. A session ID that never
rotates. A "remember me" token with no revocation path. Authentication enforced
only by a frontend route guard.

**Source.** *The Web Application Hacker's Handbook*, ch. 7 (Attacking Session
Management); *The JWT Handbook*, ch. 8 (Best Current Practices).

### A8-SEC-02 Server-side authorization

**Rule.** Authorize every action and every object on the server. Check the
authenticated subject, the tenant, the object's owner, and the action. Deny by
default.

**In practice.** Put the check in the application layer, close to the use case.
Use a policy function that takes the actor, action, and resource. Re-check at
execution time for queued or delegated work. Do not rely on an ID being hard to
guess.

**Smell.** `GET /orders/:id` returns any order to any signed-in user. A frontend
hides a button and calls that "authorization." A tenant ID comes from the request
body. An admin check only in the UI.

**Source.** *The Web Application Hacker's Handbook*, ch. 8 (Attacking Access
Controls); *Domain-Driven Design Distilled*, ch. 2 (Bounded Contexts).

### A8-SEC-03 Validate untrusted input

**Rule.** Validate every external input at the boundary: shape, type, length,
range, encoding, and allowed values. Reject early with a safe error. Do not rely
on client-side validation.

**In practice.** Parse HTTP bodies, query strings, headers, cookies, file names,
and third-party responses with a schema. Normalize before validating when the
format allows it. Enforce limits before allocating memory or doing work.

**Smell.** `req.body` passed to a service. A file upload with no size or type
limit. A redirect target taken from a query parameter. A regex that can
catastrophically backtrack.

**Source.** *The Web Application Hacker's Handbook*, ch. 5 (Bypassing Client-Side
Controls) and ch. 9 (Attacking Data Stores); *The Pragmatic Programmer*, Topic 23
(Design by Contract).

### A8-SEC-04 Secrets stay server-side

**Rule.** Secrets never appear in client code, browser storage, URLs, logs,
error messages, or source control. Load them from a server-side secret store or
environment at runtime.

**In practice.** Keep `.env` files out of git; commit only `.env.example` with
placeholders. Redact tokens in logs. Use short-lived credentials and rotate them.
Separate build-time public configuration from runtime secrets.

**Smell.** An API key in a React bundle. `localStorage.setItem("token", ...)`. A
secret in a query string. A stack trace containing an authorization header. A
private key committed "for local testing."

**Source.** *The Web Application Hacker's Handbook*, ch. 15 (Exploiting
Information Disclosure); *Real-World Cryptography*, ch. 8 (Randomness and
Secrets); *The JWT Handbook*, ch. 8 (Best Current Practices).

### A8-SEC-05 Use vetted cryptography

**Rule.** Do not invent cryptographic protocols or primitives. Use maintained
libraries and standard constructions. Hash passwords with Argon2id, scrypt, or
bcrypt, never with a fast general-purpose digest.

**In practice.** Use the platform's `crypto` for randomness and standard
algorithms. Use a password-hashing library with a per-user salt and a calibrated
work factor. Use authenticated encryption (AES-GCM or ChaCha20-Poly1305) when you
need encryption. Keep keys out of code and rotate them.

**Smell.** `md5(password)`. `sha256(password)`. A homemade XOR cipher. A random
token from `Math.random()`. A key derived from a short password with no KDF.
"Rolling your own" JWT signing.

**Source.** *Real-World Cryptography*, ch. 2 (Hash Functions), ch. 4
(Authenticated Encryption), and ch. 11 (User Authentication); *The JWT Handbook*,
ch. 8 (Best Current Practices).

### A8-SEC-06 Verify JWTs completely

**Rule.** Verify the signature, the algorithm allowlist, and the claims. Reject
`none`, algorithm confusion, expired tokens, wrong issuers, and wrong audiences.
Do not use `decode` as verification.

**In practice.** Pass an explicit `algorithms` list. Validate `iss`, `aud`, `exp`,
`nbf`, and `iat` with a small clock skew. Pin the key set and refresh it safely.
Keep access tokens short-lived and make revocation possible.

**Smell.** `jwt.decode(token)` used to authorize. `algorithms: ["none"]`. A
verification call with no algorithm option. Accepting a token from any issuer. A
token with a one-year expiry and no revocation.

**Source.** *The JWT Handbook*, ch. 8 (Annex A: Best Current Practices); *The Web
Application Hacker's Handbook*, ch. 7 (Attacking Session Management).

### A8-SEC-07 Cookies and CSRF

**Rule.** Session cookies are `HttpOnly`, `Secure`, and `SameSite=Lax` or
`Strict`. State-changing requests require CSRF protection: a token, an origin
check, or both.

**In practice.** Set the cookie path narrowly. Use `__Host-` where possible. Do
not put session data in a cookie the client can read. For APIs, require a custom
header or a CSRF token in addition to the cookie. Reject cross-origin writes.

**Smell.** `SameSite=None` without a reason. A session cookie readable by
JavaScript. A POST that changes state with no CSRF check. CORS `*` with
credentials.

**Source.** *The Web Application Hacker's Handbook*, ch. 7 (Attacking Session
Management); *The JWT Handbook*, ch. 8 (Best Current Practices).

### A8-SEC-08 Contextual output encoding

**Rule.** Encode data for the context where it is rendered: HTML text, HTML
attribute, URL, JavaScript, CSS, or SQL. Do not build HTML by string
concatenation from untrusted data.

**In practice.** Let the framework escape by default. Use a maintained sanitizer
if rich HTML is required. Set a Content Security Policy. Avoid `innerHTML`,
`dangerouslySetInnerHTML`, and template `|safe` filters on user data.

**Smell.** `element.innerHTML = userInput`. `dangerouslySetInnerHTML` with
server data. A template that disables escaping. A CSP of `unsafe-inline` and
`unsafe-eval` "to make it work."

**Source.** *The Web Application Hacker's Handbook*, ch. 12 (Cross-Site
Scripting) and ch. 13 (Other Client-Side Attacks).

### A8-SEC-09 SSRF, command injection, and path traversal

**Rule.** Never pass untrusted data to a shell, a filesystem path, or an
outbound URL without an allowlist and canonicalization. Treat these as code
execution and data exfiltration risks.

**In practice.** Avoid the shell; pass argument arrays to `execFile`. Resolve
paths and verify they stay inside the intended root. Allowlist outbound hosts and
schemes; block link-local and metadata addresses. Do not follow redirects to
private networks.

**Smell.** `exec("convert " + filename)`. `fetch(req.query.url)`. `path.join(root,
userPath)` with no containment check. A webhook URL that can point at
`169.254.169.254`.

**Source.** *The Web Application Hacker's Handbook*, ch. 10 (Attacking Back-End
Components); *The Pragmatic Programmer*, Topic 23 (Design by Contract).

### A8-SEC-10 Security logging and rate limits

**Rule.** Log security-relevant events with enough context to investigate, but
never log secrets, tokens, passwords, or unnecessary personal data. Rate-limit
authentication, recovery, and expensive endpoints.

**In practice.** Log sign-in success and failure, authorization denials, privilege
changes, and admin actions with a correlation ID. Use structured logs. Apply
per-account and per-IP limits with backoff. Alert on spikes, not on every event.

**Smell.** A login endpoint with no limit. A log line containing a password or
Authorization header. An error log with a full request body. No record of failed
authorization.

**Source.** *The Web Application Hacker's Handbook*, ch. 6 (Attacking
Authentication) and ch. 15 (Exploiting Information Disclosure); *Designing
Data-Intensive Applications*, ch. 1 (Reliability).

### A8-SEC-11 Supply-chain hygiene

**Rule.** Pin dependencies, review lockfile changes, and run automated
vulnerability checks. Give build and runtime credentials the least privilege
they need.

**In practice.** Use a lockfile in CI. Review new direct dependencies for
maintenance and license. Run `npm audit` or an equivalent in CI. Do not execute
install scripts from untrusted packages in privileged environments.

**Smell.** A floating `latest` dependency. A lockfile change nobody reviewed. A
CI token with write access to every repository. A postinstall script from an
unknown package.

**Source.** *The Pragmatic Programmer*, Topic 51 (Pragmatic Starter Kit); *The
Web Application Hacker's Handbook*, ch. 18 (Attacking the Application Server).

### A8-SEC-12 Threat model first

**Rule.** Before building a feature, name the assets, actors, trust boundaries,
and abuse cases. Security requirements are design inputs, not a later checklist.

**In practice.** Write a short threat model: what can be read, changed, or
exhausted; who can reach each boundary; what happens if a component is
compromised. Add mitigations to the plan and tests. Revisit the model when the
data flow changes.

**Smell.** A new admin endpoint with no threat review. A feature that moves data
across a boundary with no owner. A "security pass" scheduled after launch. A
design that assumes the internal network is trusted.

**Source.** *The Web Application Hacker's Handbook*, ch. 1 (Web Application
Insecurity) and ch. 2 (Core Defense Mechanisms); *Software Architecture: The Hard
Parts*, ch. 11 (Analyzing Architecture Risk).

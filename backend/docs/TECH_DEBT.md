# Technical Debt

## Auth Internal Integration

- Current approach: backend-to-backend calls from Renowa to ZonaDev Auth use `X-Internal-Secret` (`AUTH_INTERNAL_SECRET`).
- Future evolution: replace with Service Token (JWT de servico).
- Trigger: when multiple backends need internal calls to ZonaDev Auth with centralized rotation, scope, and audit.

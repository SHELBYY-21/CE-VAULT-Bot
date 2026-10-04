# CE VAULT — Mistral AI

The server-side AI endpoint is `POST /api/ai/chat`.

- Provider: Mistral only (`mistral-small-latest`).
- Production variables: `MISTRAL_API_KEY` and `API_SECRET` on the `ce-vault-web` service.
- Request header: `x-api-key: <API_SECRET>` and `content-type: application/json`.
- Body: `{ "messages": [{ "role": "user", "content": "ping" }] }`.
- Success: `{ "ok": true, "provider": "mistral", "model": "mistral-small-latest", "answer": "..." }`.
- The API key never belongs in the browser or Git repository.
- AI output must not directly mutate transactions or settlement state.
- Verify typecheck, tests, build and a real authenticated request after deployment.

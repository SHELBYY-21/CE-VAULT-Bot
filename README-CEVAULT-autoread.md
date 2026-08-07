# CE VAULT - Auto Read Slip (Version 2)

This branch adds automatic slip reading, Grok parsing, and the 3-step flow:
1. **Onboarding / Add Admin**: Authorize admins and register users (`/register`, `/start`).
2. **Auto OCR + Parse (Slip Tower)**: Receive slip photos, run Dual OCR + Grok Vision AI, and display structured fields (Amount, Bank, Last 4 digits, Date/Time, Confidence %, Rate, Should Send USDT).
3. **Send USDT Summary**: Log USDT outgoing transfers, display daily summary ledger, calculate remaining balance and net profit.

## Environment Setup
Create a `.env` file with the following keys:

```env
BOT_TOKEN=your-telegram-bot-token
BOT_OWNER=ownerusername
GROK_API_KEY=your_grok_api_key
GROK_API_URL=https://api.x.ai/v1/chat/completions
GROK_MODEL=grok-4.20-non-reasoning
OCR_PROVIDER=auto
GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json
```

Important: Do NOT commit secrets. Put keys in environment variables as shown above.

## Running the Bot
```bash
npm install
npm run dev # Next.js Webhook
# OR for standalone bot script:
npx ts-node src/bot/index.ts
```

## Running Tests
```bash
npm test
```

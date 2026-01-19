# 🔍 Upwork Jobs Scraper API

A self-hosted API server that scrapes Upwork job listings with **automatic Cloudflare bypass**. Built for integration with n8n and other automation tools.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Bypass-orange)

## ✨ Features

- 🛡️ **Cloudflare Bypass** - Uses `puppeteer-real-browser` with automatic CAPTCHA solving
- 🔄 **Keyword Rotation** - Continues from where it stopped on the last call
- 📊 **Rich Job Data** - Extracts title, description, budget, skills, client info, and more
- 🎯 **Limit Control** - Set maximum jobs to return per request
- 🔌 **n8n Ready** - Designed for workflow automation
- 💾 **Persistent Profile** - Maintains browser session across restarts

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/upwork-jobs-scraper.git
cd upwork-jobs-scraper

# Install dependencies
npm install

# Start the server
npm start
```

## 🚀 Quick Start

### Start the server
```bash
npm start
```

The server will run on `http://localhost:3000`

### Test if it works
```bash
curl http://localhost:3000/test
```

### Scrape jobs
```bash
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["n8n", "automation"], "limit": 20}'
```

## 📡 API Endpoints

### `GET /`
Health check endpoint.

### `GET /test`
Quick test to verify scraping works.

### `POST /scrape`
Main scraping endpoint.

**Request Body:**
```json
{
  "keywords": ["n8n", "automation", "make.com"],
  "limit": 30,
  "rotate": true
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `keywords` | array | required | List of search keywords |
| `limit` | number | 100 | Maximum jobs to return |
| `rotate` | boolean | false | Enable keyword rotation |

**Response:**
```json
{
  "success": true,
  "totalJobs": 30,
  "limit": 30,
  "rotation": true,
  "keywordsProcessed": 2,
  "nextStartKeyword": "make.com",
  "scrapedAt": "2024-01-18T10:00:00.000Z",
  "jobs": [
    {
      "jobId": "123456789",
      "title": "n8n Automation Expert Needed",
      "url": "https://www.upwork.com/jobs/...",
      "postedAt": "2 hours ago",
      "description": "Looking for an expert...",
      "budget": "Hourly",
      "experienceLevel": "Intermediate",
      "duration": "Less than 1 month",
      "clientPaymentVerified": true,
      "clientSpent": "$10K+",
      "clientLocation": "United States",
      "skills": ["n8n", "Automation", "API"],
      "proposals": "5 to 10",
      "keyword": "n8n",
      "scrapedAt": "2024-01-18T10:00:00.000Z"
    }
  ]
}
```

### `GET /close`
Close the browser instance.

## 🔄 Keyword Rotation

When `rotate: true` is enabled:

1. **First call**: Scrapes from keyword 1, stops when limit reached
2. **Second call**: Continues from where it stopped
3. **And so on**: Cycles through all keywords

This ensures all keywords get equal coverage over multiple calls.

## 🔧 n8n Integration

### HTTP Request Node Setup:

1. **Method**: `POST`
2. **URL**: `http://localhost:3000/scrape`
3. **Body Content Type**: `JSON`
4. **Body**:
```json
{
  "keywords": ["n8n", "automation", "make.com", "zapier"],
  "limit": 30,
  "rotate": true
}
```

> **Note**: If n8n runs in Docker, use `http://host.docker.internal:3000/scrape`

### Workflow Example:

```
Schedule Trigger (Every 1 hour)
       ↓
HTTP Request (/scrape)
       ↓
Split Jobs (Item Lists)
       ↓
Filter Duplicates (by jobId)
       ↓
Save to Notion/Google Sheets
       ↓
Send Telegram Notification
```

## 📂 Job Data Fields

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | string | Unique job identifier |
| `title` | string | Job title |
| `url` | string | Direct link to job posting |
| `postedAt` | string | When the job was posted |
| `description` | string | Job description (max 1000 chars) |
| `budget` | string | Hourly rate or fixed price |
| `experienceLevel` | string | Entry/Intermediate/Expert |
| `duration` | string | Estimated project duration |
| `clientPaymentVerified` | boolean | Client payment verification status |
| `clientSpent` | string | Total client spending on Upwork |
| `clientLocation` | string | Client's country |
| `skills` | array | Required skills |
| `proposals` | string | Number of proposals received |
| `keyword` | string | Search keyword that found this job |
| `scrapedAt` | string | Timestamp of scraping |

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |

### Browser Mode

The browser runs in "off-screen" mode (`--window-position=-3000,-3000`) to stay invisible while maintaining full Cloudflare bypass capability.

> **Note**: Headless mode does NOT work with Cloudflare bypass. The browser must run in visible mode but is positioned off-screen.

## ⚠️ Important Notes

1. **Session Expiry**: Browser session may expire after a few days. If you encounter Cloudflare blocks, restart the server.

2. **Rate Limiting**: Add delays between requests to avoid being detected. The API includes a 3-second delay between keywords.

3. **Terms of Service**: Automated scraping may violate Upwork's Terms of Service. Use responsibly and at your own risk.

4. **Taskbar**: The browser icon will appear in your taskbar. This is expected behavior as true headless mode doesn't bypass Cloudflare.

## 🐛 Troubleshooting

### Cloudflare Block
- Restart the server: `npm start`
- Delete `chrome-profile/` folder and restart

### No Jobs Found
- Check if selectors are still valid (Upwork may change their HTML)
- Look at `last_scrape.png` for debugging

### Browser Won't Launch
- Ensure Node.js 18+ is installed
- Delete `chrome-profile/` folder
- Run `npm install` again

## 📝 License

MIT License - Feel free to use, modify, and distribute.

## 🙏 Credits

- [puppeteer-real-browser](https://github.com/ZFC-Digital/puppeteer-real-browser) - Cloudflare bypass
- [Express.js](https://expressjs.com/) - Web framework
- [Puppeteer](https://pptr.dev/) - Browser automation

---

**Made with ❤️ for the automation community**

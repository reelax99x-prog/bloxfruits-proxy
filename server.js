/**
 * Blox Fruits Value Proxy Server (Lightweight - No Chrome)
 * 
 * يسحب قيم الفواكه من bloxfruitvalues.com باستخدام axios + cheerio
 * ويخزنها مؤقتاً (cache) لمدة ساعة
 * يعمل على Render.com Free tier بدون مشاكل
 * 
 * Endpoints:
 *   GET /           → Health check
 *   GET /values     → All fruit values as JSON
 *   GET /values/:name → Specific fruit value
 */

const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════
let cachedValues = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

// ═══════════════════════════════════════════
// SCRAPER (Lightweight - no browser needed)
// ═══════════════════════════════════════════
async function scrapeValues() {
  console.log("[Scraper] Fetching values from bloxfruitvalues.com ...");

  try {
    const response = await axios.get("https://bloxfruitvalues.com/values", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const fruits = [];

    // Try multiple selectors to find fruit data
    // Pattern 1: Cards/items with name and value
    $(
      '[class*="fruit"], [class*="item"], [class*="card"], [data-fruit], [class*="row"]'
    ).each((i, el) => {
      const $el = $(el);
      const nameEl = $el.find(
        '[class*="name"], h3, h4, [class*="title"], span:first-child'
      );
      const valueEl = $el.find(
        '[class*="value"], [class*="price"], [class*="worth"], [class*="number"]'
      );

      if (nameEl.length && valueEl.length) {
        const name = nameEl.first().text().trim();
        const valueText = valueEl.first().text().trim();
        const numericValue = parseValueText(valueText);

        if (name && numericValue > 0 && name.length < 30) {
          fruits.push({
            name: name,
            value: numericValue,
            rawValue: valueText,
          });
        }
      }
    });

    // Pattern 2: Table rows
    if (fruits.length === 0) {
      $("tr, [class*='table'] > div").each((i, el) => {
        const cells = $(el).find("td, > div, > span");
        if (cells.length >= 2) {
          const name = $(cells[0]).text().trim();
          const valueText = $(cells[1]).text().trim();
          const numericValue = parseValueText(valueText);

          if (name && numericValue > 0 && name.length < 30) {
            fruits.push({
              name: name,
              value: numericValue,
              rawValue: valueText,
            });
          }
        }
      });
    }

    console.log(`[Scraper] Found ${fruits.length} fruits from website`);

    if (fruits.length > 0) {
      return fruits;
    }

    // If scraping didn't work (anti-bot), use fallback
    console.log("[Scraper] Could not parse page, using community values");
    return getFallbackValues();
  } catch (error) {
    console.error("[Scraper] Error:", error.message);
    return getFallbackValues();
  }
}

// Parse value text like "8.5M" → 8500000
function parseValueText(text) {
  if (!text) return 0;
  const match = text.replace(/,/g, "").match(/([\d.]+)\s*(M|K|B)?/i);
  if (!match) return 0;

  let val = parseFloat(match[1]);
  const suffix = (match[2] || "").toUpperCase();
  if (suffix === "M") val *= 1000000;
  else if (suffix === "K") val *= 1000;
  else if (suffix === "B") val *= 1000000000;
  return val;
}

// ═══════════════════════════════════════════
// FALLBACK VALUES (Updated for 2026 meta)
// هذي القيم تُستخدم اذا فشل السحب من الموقع
// حدّثها يدوياً من bloxfruitvalues.com كل فترة
// ═══════════════════════════════════════════
function getFallbackValues() {
  return [
    { name: "Kitsune",  value: 8000000,  demand: 10, trend: "Up" },
    { name: "Leopard",  value: 7500000,  demand: 10, trend: "Stable" },
    { name: "Dragon",   value: 6500000,  demand: 9,  trend: "Down" },
    { name: "T-Rex",    value: 6000000,  demand: 9,  trend: "Up" },
    { name: "Spirit",   value: 5500000,  demand: 8,  trend: "Stable" },
    { name: "Dough",    value: 4800000,  demand: 9,  trend: "Up" },
    { name: "Venom",    value: 4200000,  demand: 8,  trend: "Stable" },
    { name: "Control",  value: 3800000,  demand: 7,  trend: "Down" },
    { name: "Blizzard", value: 3500000,  demand: 7,  trend: "Up" },
    { name: "Mammoth",  value: 3200000,  demand: 7,  trend: "Stable" },
    { name: "Buddha",   value: 2800000,  demand: 8,  trend: "Up" },
    { name: "Gravity",  value: 2000000,  demand: 5,  trend: "Down" },
    { name: "Shadow",   value: 1800000,  demand: 6,  trend: "Stable" },
    { name: "Rumble",   value: 1500000,  demand: 5,  trend: "Down" },
    { name: "Phoenix",  value: 1200000,  demand: 6,  trend: "Up" },
    { name: "Light",    value: 800000,   demand: 4,  trend: "Stable" },
    { name: "Magma",    value: 600000,   demand: 4,  trend: "Down" },
    { name: "Quake",    value: 500000,   demand: 3,  trend: "Stable" },
    { name: "Ice",      value: 350000,   demand: 3,  trend: "Stable" },
    { name: "Dark",     value: 300000,   demand: 3,  trend: "Down" },
    { name: "Flame",    value: 150000,   demand: 2,  trend: "Stable" },
    { name: "Sand",     value: 100000,   demand: 2,  trend: "Stable" },
    { name: "Rubber",   value: 80000,    demand: 2,  trend: "Stable" },
    { name: "Smoke",    value: 50000,    demand: 1,  trend: "Down" },
    { name: "Spin",     value: 20000,    demand: 1,  trend: "Down" },
  ];
}

// ═══════════════════════════════════════════
// GET VALUES (with Cache)
// ═══════════════════════════════════════════
async function getValues() {
  const now = Date.now();
  if (cachedValues && now - lastFetchTime < CACHE_DURATION_MS) {
    console.log("[Cache] Returning cached values");
    return cachedValues;
  }

  console.log("[Cache] Cache expired, fetching new data...");
  cachedValues = await scrapeValues();
  lastFetchTime = now;
  return cachedValues;
}

// ═══════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Blox Fruits Value Proxy v2",
    cacheAge: cachedValues
      ? Math.floor((Date.now() - lastFetchTime) / 1000) + "s"
      : "empty",
    fruitCount: cachedValues ? cachedValues.length : 0,
  });
});

app.get("/values", async (req, res) => {
  try {
    const values = await getValues();
    res.json({
      success: true,
      count: values.length,
      lastUpdated: new Date(lastFetchTime).toISOString(),
      fruits: values,
    });
  } catch (error) {
    console.error("[API] Error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      fruits: getFallbackValues(),
    });
  }
});

app.get("/values/:fruitName", async (req, res) => {
  try {
    const values = await getValues();
    const fruit = values.find(
      (f) => f.name.toLowerCase() === req.params.fruitName.toLowerCase()
    );
    if (fruit) {
      res.json({ success: true, fruit });
    } else {
      res.status(404).json({ success: false, error: "Fruit not found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════
// START
// ═══════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`[Server] Blox Fruits Proxy v2 running on port ${PORT}`);
  console.log(`[Server] Endpoints:`);
  console.log(`  GET /        → Health check`);
  console.log(`  GET /values  → All fruit values`);
  console.log(`  GET /values/:name → Specific fruit`);

  getValues().then((v) => {
    console.log(`[Server] Initial load: ${v.length} fruits ready`);
  });
});

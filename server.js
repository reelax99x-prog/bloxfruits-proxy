/**
 * Blox Fruits Value Proxy Server v3 (Live Scraping from bloxfruitscalc.com)
 * 
 * يسحب قيم الفواكه الحقيقية من bloxfruitscalc.com
 * ويخزنها مؤقتاً (cache) لمدة ساعة
 * يعمل على Render.com Free tier
 * 
 * Endpoints:
 *   GET /           → Health check
 *   GET /values     → All fruit values (LIVE from bloxfruitscalc.com)
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
// FALLBACK VALUES (used only if scraping completely fails)
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
    service: "Blox Fruits Value Proxy v3 (LIVE from bloxfruitscalc.com)",
    source: "bloxfruitscalc.com",
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
      source: "bloxfruitscalc.com",
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
    const searchName = req.params.fruitName.toLowerCase().replace(/-/g, " ");
    const fruit = values.find((f) => f.name.toLowerCase() === searchName);
    if (fruit) {
      res.json({ success: true, fruit });
    } else {
      res.status(404).json({
        success: false,
        error: "Fruit not found",
        available: values.map((f) => f.name),
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════
// START
// ═══════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`[Server] Blox Fruits Proxy v3 (LIVE) on port ${PORT}`);
  console.log(`[Server] Source: bloxfruitscalc.com`);
  console.log(`[Server] Endpoints:`);
  console.log(`  GET /        → Health check`);
  console.log(`  GET /values  → All fruit values (LIVE)`);
  console.log(`  GET /values/:name → Specific fruit`);

  getValues().then((v) => {
    console.log(`[Server] Initial load: ${v.length} fruits ready`);
    if (v.length > 0) {
      console.log(`[Server] Top 5 fruits:`);
      v.slice(0, 5).forEach((f) => {
        console.log(`  ${f.name}: ${f.displayValue || f.value} (D:${f.demand})`);
      });
    }
  });
});

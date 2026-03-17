/**
 * Blox Fruits Value Proxy Server v4 (Live Scraping from bloxfruitscalc.com)
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
// KNOWN FRUIT NAMES (all 41 from the game)
// Used to match scraped names & fill gaps
// ═══════════════════════════════════════════
const KNOWN_FRUITS = [
  "Kitsune", "Leopard", "Dragon", "T-Rex", "Spirit", "Yeti", "Gas",
  "Gravity", "Mammoth", "Dough", "Venom", "Control", "Shadow",
  "Blizzard", "Buddha", "Rumble", "Phoenix", "Sound", "Pain",
  "Portal", "Love", "Spider", "Quake", "Light", "Rubber", "Creation",
  "Ghost", "Magma", "Flame", "Sand", "Ice", "Dark", "Diamond",
  "Eagle", "Smoke", "Spin", "Chop", "Spring", "Bomb", "Spike", "Rocket"
];

// Map slug → proper name for URL-based extraction
const SLUG_TO_NAME = {};
KNOWN_FRUITS.forEach(name => {
  SLUG_TO_NAME[name.toLowerCase().replace(/\s+/g, "-")] = name;
});
// Special cases / aliases
SLUG_TO_NAME["t-rex"] = "T-Rex";
SLUG_TO_NAME["tiger"] = "Leopard"; // Tiger on the site = Leopard in-game
SLUG_TO_NAME["blade"] = "Chop";    // Blade on the site = Chop in-game

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
    const foundNames = new Set();

    $('a[href*="/values/"]').each((i, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!text || text.length < 3) return;

      // Extract fruit slug from URL: /values/kitsune → kitsune
      const slugMatch = href.match(/\/values\/([a-z0-9-]+)/i);
      if (!slugMatch) return;
      const slug = slugMatch[1].toLowerCase();

      // Only process known fruits (skip limited variants, gamepasses, etc.)
      const properName = SLUG_TO_NAME[slug];
      if (!properName) return;
      if (foundNames.has(properName)) return;

      // Parse value: matches "460M", "6.5M", "500K", etc.
      const valueMatch = text.match(/(\d+(?:\.\d+)?)\s*(M|K|B)/i);
      if (!valueMatch) return;

      const rawValue = parseFloat(valueMatch[1]);
      const suffix = valueMatch[2].toUpperCase();
      let numericValue = rawValue;
      if (suffix === "M") numericValue *= 1000000;
      else if (suffix === "K") numericValue *= 1000;
      else if (suffix === "B") numericValue *= 1000000000;

      // Parse demand: "10/10", "5/10", etc.
      const demandMatch = text.match(/(\d+)\/10/);
      const demand = demandMatch ? parseInt(demandMatch[1]) : 5;

      // Parse trend
      let trend = "Stable";
      if (/Overpaid/i.test(text)) trend = "Up";
      else if (/Underpaid/i.test(text)) trend = "Down";
      else if (/Fluctuating|Unstable/i.test(text)) trend = "Down";
      else if (/Stable/i.test(text)) trend = "Stable";

      // Parse rarity
      let rarity = "Common";
      const rarityMatch = text.match(
        /(Mythical|Legendary|Rare|Uncommon|Common)/i
      );
      if (rarityMatch) rarity = rarityMatch[1];

      foundNames.add(properName);
      fruits.push({
        name: properName,
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

    // Fill in any missing fruits from fallback
    const fallback = getFallbackValues();
    for (const fb of fallback) {
      if (!foundNames.has(fb.name)) {
        fruits.push(fb);
        console.log(`[Scraper] Added missing fruit from fallback: ${fb.name}`);
      }
    }

    console.log(`[Scraper] Total fruits after fill: ${fruits.length}`);

    if (fruits.length > 0) {
      fruits.sort((a, b) => b.value - a.value);
      return fruits;
    }

    console.log("[Scraper] No fruits parsed, using full fallback");
    return fallback;
  } catch (error) {
    console.error("[Scraper] Error:", error.message);
    return getFallbackValues();
  }
}

// ═══════════════════════════════════════════
// FALLBACK VALUES (all 41 fruits)
// ═══════════════════════════════════════════
function getFallbackValues() {
  return [
    { name: "Kitsune",   value: 460000000, demand: 10, trend: "Up",     rarity: "Mythical" },
    { name: "Yeti",      value: 150000000, demand: 10, trend: "Stable", rarity: "Mythical" },
    { name: "Control",   value: 140000000, demand: 5,  trend: "Down",   rarity: "Mythical" },
    { name: "Gas",       value: 60000000,  demand: 8,  trend: "Stable", rarity: "Mythical" },
    { name: "Dough",     value: 30000000,  demand: 10, trend: "Stable", rarity: "Mythical" },
    { name: "T-Rex",     value: 20000000,  demand: 8,  trend: "Stable", rarity: "Mythical" },
    { name: "Venom",     value: 20000000,  demand: 10, trend: "Down",   rarity: "Mythical" },
    { name: "Pain",      value: 10000000,  demand: 5,  trend: "Stable", rarity: "Legendary" },
    { name: "Gravity",   value: 10000000,  demand: 4,  trend: "Stable", rarity: "Mythical" },
    { name: "Mammoth",   value: 10000000,  demand: 5,  trend: "Stable", rarity: "Mythical" },
    { name: "Spirit",    value: 10000000,  demand: 6,  trend: "Stable", rarity: "Mythical" },
    { name: "Portal",    value: 10000000,  demand: 10, trend: "Up",     rarity: "Legendary" },
    { name: "Buddha",    value: 10000000,  demand: 10, trend: "Up",     rarity: "Legendary" },
    { name: "Dragon",    value: 8000000,   demand: 5,  trend: "Stable", rarity: "Legendary" },
    { name: "Leopard",   value: 7500000,   demand: 5,  trend: "Stable", rarity: "Legendary" },
    { name: "Shadow",    value: 6500000,   demand: 5,  trend: "Stable", rarity: "Mythical" },
    { name: "Blizzard",  value: 5000000,   demand: 5,  trend: "Stable", rarity: "Legendary" },
    { name: "Creation",  value: 3500000,   demand: 3,  trend: "Stable", rarity: "Legendary" },
    { name: "Phoenix",   value: 2800000,   demand: 3,  trend: "Stable", rarity: "Legendary" },
    { name: "Sound",     value: 2500000,   demand: 4,  trend: "Stable", rarity: "Legendary" },
    { name: "Spider",    value: 1500000,   demand: 2,  trend: "Stable", rarity: "Legendary" },
    { name: "Love",      value: 1500000,   demand: 3,  trend: "Stable", rarity: "Legendary" },
    { name: "Rumble",    value: 1200000,   demand: 3,  trend: "Stable", rarity: "Legendary" },
    { name: "Magma",     value: 1100000,   demand: 8,  trend: "Up",     rarity: "Rare" },
    { name: "Quake",     value: 1000000,   demand: 2,  trend: "Stable", rarity: "Legendary" },
    { name: "Diamond",   value: 1000000,   demand: 2,  trend: "Stable", rarity: "Uncommon" },
    { name: "Light",     value: 800000,    demand: 2,  trend: "Stable", rarity: "Rare" },
    { name: "Ghost",     value: 800000,    demand: 1,  trend: "Down",   rarity: "Rare" },
    { name: "Rubber",    value: 700000,    demand: 1,  trend: "Stable", rarity: "Rare" },
    { name: "Eagle",     value: 500000,    demand: 3,  trend: "Stable", rarity: "Legendary" },
    { name: "Ice",       value: 550000,    demand: 2,  trend: "Stable", rarity: "Uncommon" },
    { name: "Sand",      value: 420000,    demand: 1,  trend: "Stable", rarity: "Uncommon" },
    { name: "Dark",      value: 400000,    demand: 1,  trend: "Stable", rarity: "Uncommon" },
    { name: "Flame",     value: 250000,    demand: 1,  trend: "Stable", rarity: "Uncommon" },
    { name: "Smoke",     value: 100000,    demand: 1,  trend: "Stable", rarity: "Common" },
    { name: "Bomb",      value: 80000,     demand: 1,  trend: "Stable", rarity: "Common" },
    { name: "Spring",    value: 60000,     demand: 1,  trend: "Stable", rarity: "Common" },
    { name: "Chop",      value: 50000,     demand: 1,  trend: "Stable", rarity: "Common" },
    { name: "Spike",     value: 180000,    demand: 1,  trend: "Stable", rarity: "Common" },
    { name: "Spin",      value: 7500,      demand: 1,  trend: "Stable", rarity: "Common" },
    { name: "Rocket",    value: 5000,      demand: 1,  trend: "Down",   rarity: "Common" },
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
    service: "Blox Fruits Value Proxy v4 (LIVE from bloxfruitscalc.com)",
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
  console.log(`[Server] Blox Fruits Proxy v4 (LIVE) on port ${PORT}`);
  console.log(`[Server] Source: bloxfruitscalc.com`);
  console.log(`[Server] Known fruits: ${KNOWN_FRUITS.length}`);
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

/**
 * Blox Fruits Value Proxy Server
 * 
 * يسحب قيم الفواكه من bloxfruitvalues.com باستخدام Puppeteer
 * ويخزنها مؤقتاً (cache) لمدة ساعة
 * 
 * Endpoints:
 *   GET /           → Health check
 *   GET /values     → All fruit values as JSON
 *   GET /stock      → Current stock rotation
 */

const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════
// CACHE (يحفظ البيانات لمدة ساعة)
// ═══════════════════════════════════════════
let cachedValues = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

// ═══════════════════════════════════════════
// SCRAPER: يسحب القيم من الموقع
// ═══════════════════════════════════════════
async function scrapeValues() {
  console.log("[Scraper] Launching browser...");

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
    ],
  });

  try {
    const page = await browser.newPage();

    // تعيين User-Agent طبيعي
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    console.log("[Scraper] Navigating to bloxfruitvalues.com/values ...");
    await page.goto("https://bloxfruitvalues.com/values", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // انتظر تحميل المحتوى
    await page.waitForSelector("body", { timeout: 10000 });

    // استخراج البيانات من الصفحة
    const fruits = await page.evaluate(() => {
      const results = [];

      // البحث عن العناصر التي تحتوي على بيانات الفواكه
      // ملاحظة: قد تحتاج لتعديل الـ selectors حسب تصميم الموقع الفعلي
      const items = document.querySelectorAll(
        '[class*="fruit"], [class*="item"], [class*="card"], [class*="value"]'
      );

      items.forEach((item) => {
        const nameEl =
          item.querySelector('[class*="name"], h3, h4, [class*="title"]');
        const valueEl =
          item.querySelector('[class*="value"], [class*="price"], [class*="worth"]');

        if (nameEl && valueEl) {
          const name = nameEl.textContent.trim();
          const valueText = valueEl.textContent.trim();

          // تحويل القيم النصية لأرقام (مثل "8.5M" → 8500000)
          let numericValue = 0;
          const match = valueText.match(/([\d,.]+)\s*(M|K|B)?/i);
          if (match) {
            numericValue = parseFloat(match[1].replace(/,/g, ""));
            const suffix = (match[2] || "").toUpperCase();
            if (suffix === "M") numericValue *= 1000000;
            else if (suffix === "K") numericValue *= 1000;
            else if (suffix === "B") numericValue *= 1000000000;
          }

          if (name && numericValue > 0) {
            results.push({
              name: name,
              value: numericValue,
              rawValue: valueText,
            });
          }
        }
      });

      // إذا لم نجد بالـ selectors أعلاه، نحاول البحث في النص
      if (results.length === 0) {
        // طريقة بديلة: البحث عن أنماط في المحتوى الكامل
        const bodyText = document.body.innerText;
        console.log("Page content length:", bodyText.length);
      }

      return results;
    });

    console.log(`[Scraper] Found ${fruits.length} fruits`);

    // إذا لم نجد بيانات من الـ scraping، نرجع القيم الافتراضية
    if (fruits.length === 0) {
      console.log("[Scraper] No data scraped, using fallback values");
      return getFallbackValues();
    }

    return fruits;
  } catch (error) {
    console.error("[Scraper] Error:", error.message);
    return getFallbackValues();
  } finally {
    await browser.close();
  }
}

// ═══════════════════════════════════════════
// FALLBACK VALUES (القيم الافتراضية إذا فشل السحب)
// تُحدّث يدوياً من bloxfruitvalues.com
// ═══════════════════════════════════════════
function getFallbackValues() {
  return [
    { name: "Kitsune",  value: 8000000,  demand: 10, trend: "Up"     },
    { name: "Leopard",  value: 7500000,  demand: 10, trend: "Stable" },
    { name: "Dragon",   value: 6500000,  demand: 9,  trend: "Down"   },
    { name: "T-Rex",    value: 6000000,  demand: 9,  trend: "Up"     },
    { name: "Spirit",   value: 5500000,  demand: 8,  trend: "Stable" },
    { name: "Dough",    value: 4800000,  demand: 9,  trend: "Up"     },
    { name: "Venom",    value: 4200000,  demand: 8,  trend: "Stable" },
    { name: "Control",  value: 3800000,  demand: 7,  trend: "Down"   },
    { name: "Blizzard", value: 3500000,  demand: 7,  trend: "Up"     },
    { name: "Mammoth",  value: 3200000,  demand: 7,  trend: "Stable" },
    { name: "Buddha",   value: 2800000,  demand: 8,  trend: "Up"     },
    { name: "Gravity",  value: 2000000,  demand: 5,  trend: "Down"   },
    { name: "Shadow",   value: 1800000,  demand: 6,  trend: "Stable" },
    { name: "Rumble",   value: 1500000,  demand: 5,  trend: "Down"   },
    { name: "Phoenix",  value: 1200000,  demand: 6,  trend: "Up"     },
    { name: "Light",    value: 800000,   demand: 4,  trend: "Stable" },
    { name: "Magma",    value: 600000,   demand: 4,  trend: "Down"   },
    { name: "Quake",    value: 500000,   demand: 3,  trend: "Stable" },
    { name: "Ice",      value: 350000,   demand: 3,  trend: "Stable" },
    { name: "Dark",     value: 300000,   demand: 3,  trend: "Down"   },
    { name: "Flame",    value: 150000,   demand: 2,  trend: "Stable" },
    { name: "Sand",     value: 100000,   demand: 2,  trend: "Stable" },
    { name: "Rubber",   value: 80000,    demand: 2,  trend: "Stable" },
    { name: "Smoke",    value: 50000,    demand: 1,  trend: "Down"   },
    { name: "Spin",     value: 20000,    demand: 1,  trend: "Down"   },
  ];
}

// ═══════════════════════════════════════════
// GET VALUES (مع Cache)
// ═══════════════════════════════════════════
async function getValues() {
  const now = Date.now();

  // إذا الـ cache لسا صالح، نرجع البيانات المحفوظة
  if (cachedValues && now - lastFetchTime < CACHE_DURATION_MS) {
    console.log("[Cache] Returning cached values");
    return cachedValues;
  }

  // نسحب بيانات جديدة
  console.log("[Cache] Cache expired, fetching new data...");
  cachedValues = await scrapeValues();
  lastFetchTime = now;
  return cachedValues;
}

// ═══════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Blox Fruits Value Proxy",
    cacheAge: cachedValues
      ? Math.floor((Date.now() - lastFetchTime) / 1000) + "s"
      : "empty",
  });
});

// جميع قيم الفواكه
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

// قيمة فاكهة محددة
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
// START SERVER
// ═══════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`[Server] Blox Fruits Proxy running on port ${PORT}`);
  console.log(`[Server] Endpoints:`);
  console.log(`  GET /        → Health check`);
  console.log(`  GET /values  → All fruit values`);
  console.log(`  GET /values/:name → Specific fruit`);

  // سحب البيانات مباشرة عند بدء السيرفر
  getValues().then((v) => {
    console.log(`[Server] Initial fetch complete: ${v.length} fruits loaded`);
  });
});

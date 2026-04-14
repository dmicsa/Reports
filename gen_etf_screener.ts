import YahooFinance from "npm:yahoo-finance2";

type HorizonYears = 1 | 3 | 5 | 10;

type FlatEtfRow = {
  symbol: string;
  name: string;
  exchange: string | null;
  category: string | null;
  sponsor: string | null;
  aumBillions: number | null;
  morningstarRating: number | null;
  ar1Y: number | null;
  sr1Y: number | null;
  sd1Y: number | null;
  ar3Y: number | null;
  sr3Y: number | null;
  sd3Y: number | null;
  ar5Y: number | null;
  sr5Y: number | null;
  sd5Y: number | null;
  ar10Y: number | null;
  sr10Y: number | null;
  sd10Y: number | null;
};

type RatingOverride = {
  morningstar?: number | null;
  exchange?: string | null;
};

type OverridesFile = {
  notes?: string;
  ratings?: Record<string, RatingOverride>;
};

type PricePoint = {
  date: Date;
  close: number;
};

type ComputedMetrics = {
  annualizedReturn: number | null;
  annualizedStdDev: number | null;
  sharpeRatio: number | null;
};

type CliOptions = {
  outputPath: string;
  overridesPath: string;
  cachePath: string;
  symbols: Set<string> | null;
};

type UniverseEntry = {
  symbol: string;
  companyName: string | null;
  screenerOneYearPercentage: number | null;
};

type CachedEnrichment = {
  schemaVersion: number;
  updatedAt: string;
  aumBillions: number | null;
  category: string | null;
  sponsor: string | null;
  morningstarRating: number | null;
  ar1Y: number | null;
  sr1Y: number | null;
  sd1Y: number | null;
  ar3Y: number | null;
  sr3Y: number | null;
  sd3Y: number | null;
  ar5Y: number | null;
  sr5Y: number | null;
  sd5Y: number | null;
  ar10Y: number | null;
  sr10Y: number | null;
  sd10Y: number | null;
};

const OUTPUT_PATH = "./etf_screener.html";
const OVERRIDES_PATH = "./etf_screener_overrides.json";
const CACHE_PATH = "./etf_screener_cache.json";
const CACHE_VERSION = 4;
const NASDAQ_ETF_SCREENER_URL = "https://api.nasdaq.com/api/screener/etf?download=true";
const QUOTE_BATCH_SIZE = 100;
const QUOTE_BATCH_CONCURRENCY = 4;
const ENRICH_CONCURRENCY = 8;
const CACHE_TTL_HOURS = 72;
const HISTORY_BUFFER_YEARS = 11;
const NASDAQ_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  origin: "https://www.nasdaq.com",
  referer: "https://www.nasdaq.com/market-activity/etf/screener",
};
const MORNINGSTAR_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};
const HORIZONS: Array<{ years: HorizonYears; label: string }> = [
  { years: 1, label: "1Y" },
  { years: 3, label: "3Y" },
  { years: 5, label: "5Y" },
  { years: 10, label: "10Y" },
];

const yahooFinance = new YahooFinance();

async function main() {
  const options = parseArgs(Deno.args);
  const overrides = await readOverrides(options.overridesPath);
  const cache = await readCache(options.cachePath);
  const fullUniverse = await fetchNasdaqUniverse();
  const selectedUniverse = fullUniverse.filter((entry) => {
    if (!options.symbols) {
      return true;
    }

    return options.symbols.has(entry.symbol);
  });

  if (selectedUniverse.length === 0) {
    throw new Error("No ETF symbols selected for the screener run.");
  }

  console.log(`Fetched ${selectedUniverse.length} ETFs from the Nasdaq screener.`);
  const quoteMap = await fetchQuoteMap(selectedUniverse.map((entry) => entry.symbol));
  const baseRows = selectedUniverse.map((entry) => {
    return buildBaseRow(entry, quoteMap.get(entry.symbol), overrides[entry.symbol]);
  });

  const refreshCount = baseRows.filter((row) => !isCacheFresh(cache[row.symbol])).length;
  console.log(`Refreshing ${refreshCount} ETF enrichments...`);
  const enriched = await mapLimit(baseRows, ENRICH_CONCURRENCY, async (row) => {
    const currentCache = cache[row.symbol];
    if (isCacheFresh(currentCache)) {
      return { symbol: row.symbol, enrichment: currentCache };
    }

    try {
      return {
        symbol: row.symbol,
        enrichment: await enrichEtfRow(row, overrides),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Enrichment fallback for ${row.symbol}: ${message}`);
      return {
        symbol: row.symbol,
        enrichment: currentCache ?? null,
      };
    }
  });

  for (const result of enriched) {
    if (result.enrichment) {
      cache[result.symbol] = result.enrichment;
    }
  }
  await writeCache(options.cachePath, cache);

  const rows = baseRows.map((row) => applyEnrichment(row, cache[row.symbol])).sort((left, right) => {
    return (right.aumBillions ?? -1) - (left.aumBillions ?? -1);
  });

  const generatedAt = formatGeneratedAt(new Date());
  const html = renderHtml(rows, generatedAt);
  await Deno.writeTextFile(options.outputPath, html);

  const morningstarCoverage = rows.filter((row) => row.morningstarRating !== null).length;
  console.log(`Written: ${options.outputPath}`);
  console.log(`Rows: ${rows.length}`);
  console.log(`Morningstar coverage: ${morningstarCoverage}/${rows.length}`);
}

function buildBaseRow(
  entry: UniverseEntry,
  quoteData: Record<string, unknown> | undefined,
  override: RatingOverride | undefined,
): FlatEtfRow {
  return {
    symbol: entry.symbol,
    name:
      toNullableString(quoteData?.["longName"])
      ?? toNullableString(quoteData?.["shortName"])
      ?? entry.companyName
      ?? entry.symbol,
    exchange:
      toNullableString(quoteData?.["fullExchangeName"])
      ?? toNullableString(quoteData?.["exchange"]),
    category: null,
    sponsor: null,
    aumBillions: toBillions(toNullableNumber(quoteData?.["netAssets"])),
    morningstarRating: clampRating(override?.morningstar ?? null),
    ar1Y: entry.screenerOneYearPercentage,
    sr1Y: null,
    sd1Y: null,
    ar3Y: null,
    sr3Y: null,
    sd3Y: null,
    ar5Y: null,
    sr5Y: null,
    sd5Y: null,
    ar10Y: null,
    sr10Y: null,
    sd10Y: null,
  };
}

async function fetchNasdaqUniverse(): Promise<UniverseEntry[]> {
  const response = await fetch(NASDAQ_ETF_SCREENER_URL, {
    headers: NASDAQ_HEADERS,
  });
  if (!response.ok) {
    throw new Error(`Nasdaq ETF screener request failed with ${response.status}`);
  }

  const payload = asObject(await response.json());
  const data = asObject(payload["data"]);
  const screenerData = asObject(data["data"]);
  const rows = Array.isArray(screenerData["rows"]) ? screenerData["rows"] : [];

  return rows
    .map((row) => {
      const record = asObject(row);
      const symbol = toNullableString(record["symbol"]);
      if (!symbol) {
        return null;
      }

      return {
        symbol,
        companyName: toNullableString(record["companyName"]),
        screenerOneYearPercentage: parseLooseNumber(record["oneYearPercentage"]),
      } satisfies UniverseEntry;
    })
    .filter((entry): entry is UniverseEntry => entry !== null);
}

async function fetchQuoteMap(symbols: string[]): Promise<Map<string, Record<string, unknown>>> {
  const uniqueSymbols = [...new Set(symbols)];
  const chunks = chunkArray(uniqueSymbols, QUOTE_BATCH_SIZE);
  const quoteMap = new Map<string, Record<string, unknown>>();

  await mapLimit(chunks, QUOTE_BATCH_CONCURRENCY, async (chunk) => {
    try {
      const quoteResponse: unknown = await yahooFinance.quote(chunk);
      const quotes = Array.isArray(quoteResponse) ? quoteResponse : [];
      for (const item of quotes) {
        const record = asObject(item);
        const symbol = toNullableString(record["symbol"]);
        if (symbol) {
          quoteMap.set(symbol, record);
        }
      }
    } catch {
      await mapLimit(chunk, Math.min(10, chunk.length), async (symbol) => {
        try {
          const quoteResponse: unknown = await yahooFinance.quote(symbol);
          const record = asObject(quoteResponse);
          const resolvedSymbol = toNullableString(record["symbol"]);
          if (resolvedSymbol) {
            quoteMap.set(resolvedSymbol, record);
          }
        } catch {
          // Keep the row from the Nasdaq universe even when the quote API misses it.
        }
      });
    }
  });

  return quoteMap;
}

async function enrichEtfRow(
  baseRow: FlatEtfRow,
  overrides: Record<string, RatingOverride>,
): Promise<CachedEnrichment> {
  const symbol = baseRow.symbol;
  const override = overrides[symbol] ?? {};
  let stats: Record<string, unknown> = {};
  let performance: Record<string, unknown> = {};

  try {
    const quoteSummary = await yahooFinance.quoteSummary(symbol, {
      modules: ["defaultKeyStatistics", "fundPerformance", "price", "quoteType"],
    });
    stats = asObject(quoteSummary.defaultKeyStatistics);
    performance = asObject(quoteSummary.fundPerformance);
  } catch {
    // History-driven metrics are still usable even when quoteSummary is unavailable.
  }

  const trailingReturns = asObject(performance["trailingReturns"]);
  const riskLookup = getRiskStatisticsLookup(performance["riskOverviewStatistics"]);
  const history = await yahooFinance.historical(symbol, {
    period1: subtractYears(new Date(), HISTORY_BUFFER_YEARS),
    period2: new Date(),
    interval: "1d",
  });

  const points = normalizeHistory(history);
  const metrics1Y = computeMetrics(points, 1);
  const metrics3Y = computeMetrics(points, 3);
  const metrics5Y = computeMetrics(points, 5);
  const metrics10Y = computeMetrics(points, 10);

  return {
    schemaVersion: CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    aumBillions:
      toBillions(toNullableNumber(stats["totalAssets"]))
      ?? baseRow.aumBillions,
    category: toNullableString(performance["fundCategoryName"]) ?? toNullableString(stats["category"]),
    sponsor: toNullableString(stats["fundFamily"]),
    morningstarRating: clampRating(override.morningstar ?? null),
    ar1Y:
      toPercent(metrics1Y.annualizedReturn)
      ?? toPercent(toNullableNumber(trailingReturns["oneYear"]))
      ?? baseRow.ar1Y,
    sr1Y: roundValue(metrics1Y.sharpeRatio, 2),
    sd1Y: toPercent(metrics1Y.annualizedStdDev),
    ar3Y:
      toPercent(metrics3Y.annualizedReturn)
      ?? toPercent(toNullableNumber(trailingReturns["threeYear"])),
    sr3Y:
      roundValue(metrics3Y.sharpeRatio, 2)
      ?? roundValue(toNullableNumber(riskLookup.get("3y")?.["sharpeRatio"]), 2),
    sd3Y:
      toPercent(metrics3Y.annualizedStdDev)
      ?? roundValue(toNullableNumber(riskLookup.get("3y")?.["stdDev"]), 2),
    ar5Y:
      toPercent(metrics5Y.annualizedReturn)
      ?? toPercent(toNullableNumber(trailingReturns["fiveYear"])),
    sr5Y:
      roundValue(metrics5Y.sharpeRatio, 2)
      ?? roundValue(toNullableNumber(riskLookup.get("5y")?.["sharpeRatio"]), 2),
    sd5Y:
      toPercent(metrics5Y.annualizedStdDev)
      ?? roundValue(toNullableNumber(riskLookup.get("5y")?.["stdDev"]), 2),
    ar10Y:
      toPercent(metrics10Y.annualizedReturn)
      ?? toPercent(toNullableNumber(trailingReturns["tenYear"])),
    sr10Y:
      roundValue(metrics10Y.sharpeRatio, 2)
      ?? roundValue(toNullableNumber(riskLookup.get("10y")?.["sharpeRatio"]), 2),
    sd10Y:
      toPercent(metrics10Y.annualizedStdDev)
      ?? roundValue(toNullableNumber(riskLookup.get("10y")?.["stdDev"]), 2),
  };
}

function getRiskStatisticsLookup(riskOverview: unknown): Map<string, Record<string, unknown>> {
  const lookup = new Map<string, Record<string, unknown>>();
  const riskOverviewObject = asObject(riskOverview);
  const riskStatistics = Array.isArray(riskOverviewObject["riskStatistics"])
    ? riskOverviewObject["riskStatistics"]
    : [];

  for (const entry of riskStatistics) {
    const record = asObject(entry);
    const year = toNullableString(record["year"]);
    if (year) {
      lookup.set(year.toLowerCase(), record);
    }
  }

  return lookup;
}

function applyEnrichment(row: FlatEtfRow, enrichment: CachedEnrichment | undefined): FlatEtfRow {
  if (!enrichment) {
    return row;
  }

  return {
    ...row,
    aumBillions: preferValue(enrichment.aumBillions, row.aumBillions),
    category: preferValue(enrichment.category, row.category),
    sponsor: preferValue(enrichment.sponsor, row.sponsor),
    morningstarRating: preferValue(enrichment.morningstarRating, row.morningstarRating),
    ar1Y: preferValue(enrichment.ar1Y, row.ar1Y),
    sr1Y: preferValue(enrichment.sr1Y, row.sr1Y),
    sd1Y: preferValue(enrichment.sd1Y, row.sd1Y),
    ar3Y: preferValue(enrichment.ar3Y, row.ar3Y),
    sr3Y: preferValue(enrichment.sr3Y, row.sr3Y),
    sd3Y: preferValue(enrichment.sd3Y, row.sd3Y),
    ar5Y: preferValue(enrichment.ar5Y, row.ar5Y),
    sr5Y: preferValue(enrichment.sr5Y, row.sr5Y),
    sd5Y: preferValue(enrichment.sd5Y, row.sd5Y),
    ar10Y: preferValue(enrichment.ar10Y, row.ar10Y),
    sr10Y: preferValue(enrichment.sr10Y, row.sr10Y),
    sd10Y: preferValue(enrichment.sd10Y, row.sd10Y),
  };
}

function normalizeHistory(history: unknown[]): PricePoint[] {
  return history
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const rawDate = row.date;
      const rawClose = toNullableNumber(row.adjClose) ?? toNullableNumber(row.close);

      if (!(rawDate instanceof Date) || rawClose === null || rawClose <= 0) {
        return null;
      }

      return {
        date: rawDate,
        close: rawClose,
      };
    })
    .filter((point): point is PricePoint => point !== null)
    .sort((left, right) => left.date.getTime() - right.date.getTime());
}

function computeMetrics(points: PricePoint[], years: HorizonYears): ComputedMetrics {
  const endPoint = points.at(-1);
  if (!endPoint) {
    return emptyMetrics();
  }

  const cutoff = new Date(endPoint.date);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  const startIndex = points.findIndex((point) => point.date >= cutoff);
  if (startIndex < 0) {
    return emptyMetrics();
  }

  const slice = points.slice(startIndex);
  if (slice.length < Math.max(40, years * 126)) {
    return emptyMetrics();
  }

  const startPoint = slice[0];
  const spanYears = (endPoint.date.getTime() - startPoint.date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (spanYears < years * 0.85 || startPoint.close <= 0 || endPoint.close <= 0) {
    return emptyMetrics();
  }

  const dailyReturns: number[] = [];
  for (let index = 1; index < slice.length; index += 1) {
    const previousClose = slice[index - 1].close;
    const currentClose = slice[index].close;
    const dailyReturn = currentClose / previousClose - 1;
    if (Number.isFinite(dailyReturn)) {
      dailyReturns.push(dailyReturn);
    }
  }

  if (dailyReturns.length < Math.max(30, years * 126 - 1)) {
    return emptyMetrics();
  }

  const annualizedReturn = Math.pow(endPoint.close / startPoint.close, 1 / spanYears) - 1;
  const meanDailyReturn = mean(dailyReturns);
  const stdDailyReturn = standardDeviation(dailyReturns);
  const annualizedStdDev = stdDailyReturn * Math.sqrt(252);
  const annualizedMeanReturn = meanDailyReturn * 252;
  const sharpeRatio = annualizedStdDev > 0 ? annualizedMeanReturn / annualizedStdDev : null;

  return {
    annualizedReturn: Number.isFinite(annualizedReturn) ? annualizedReturn : null,
    annualizedStdDev: Number.isFinite(annualizedStdDev) ? annualizedStdDev : null,
    sharpeRatio: sharpeRatio !== null && Number.isFinite(sharpeRatio) ? sharpeRatio : null,
  };
}

function emptyMetrics(): ComputedMetrics {
  return {
    annualizedReturn: null,
    annualizedStdDev: null,
    sharpeRatio: null,
  };
}

async function fetchMorningstarRating(
  symbol: string,
  options: { exchangeHint: string | null; exchangeName: string | null },
): Promise<number | null> {
  const exchangeHints = buildMorningstarCandidates(options.exchangeHint, options.exchangeName);

  for (const exchangeCode of exchangeHints) {
    const url = `https://www.morningstar.com/etfs/${exchangeCode}/${symbol.toLowerCase()}/quote`;
    try {
      const response = await fetch(url, { headers: MORNINGSTAR_HEADERS });
      if (!response.ok) {
        continue;
      }

      const text = await response.text();
      const match = text.match(/rating of\s+([1-5])\s+out of 5 stars/i);
      if (match) {
        return Number(match[1]);
      }
    } catch {
      // Ignore and continue to the next exchange candidate.
    }
  }

  return null;
}

function buildMorningstarCandidates(
  explicitHint: string | null,
  exchangeName: string | null,
): string[] {
  const guessed: string[] = [];
  const source = `${explicitHint ?? ""} ${exchangeName ?? ""}`.toLowerCase();
  if (/(arca|pcx|nysearca|nyse arca|arcx)/.test(source)) {
    guessed.push("arcx");
  }
  if (/(nasdaq|ngm|nms|xnas|nasdaqgm|nasdaqgs)/.test(source)) {
    guessed.push("xnas");
  }
  if (/(bats|cboe)/.test(source)) {
    guessed.push("bats");
  }
  if (/(amex|american|xase|ase)/.test(source)) {
    guessed.push("xase");
  }
  if (explicitHint) {
    guessed.unshift(explicitHint.toLowerCase());
  }

  return uniqueStrings([...guessed, "arcx", "xnas", "bats", "xase", "xnys"]);
}

function parseArgs(args: string[]): CliOptions {
  let outputPath = OUTPUT_PATH;
  let overridesPath = OVERRIDES_PATH;
  let cachePath = CACHE_PATH;
  let symbols: Set<string> | null = null;

  for (const arg of args) {
    if (arg.startsWith("--output=")) {
      outputPath = arg.slice("--output=".length);
      continue;
    }
    if (arg.startsWith("--overrides=")) {
      overridesPath = arg.slice("--overrides=".length);
      continue;
    }
    if (arg.startsWith("--cache=")) {
      cachePath = arg.slice("--cache=".length);
      continue;
    }
    if (arg.startsWith("--symbols=")) {
      const rawSymbols = arg.slice("--symbols=".length);
      symbols = new Set(
        rawSymbols
          .split(",")
          .map((value) => value.trim().toUpperCase())
          .filter((value) => value.length > 0),
      );
    }
  }

  return {
    outputPath,
    overridesPath,
    cachePath,
    symbols,
  };
}

async function readOverrides(path: string): Promise<Record<string, RatingOverride>> {
  try {
    const text = await Deno.readTextFile(path);
    const parsed = JSON.parse(text) as OverridesFile;
    return parsed.ratings ?? {};
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {};
    }

    throw error;
  }
}

async function readCache(path: string): Promise<Record<string, CachedEnrichment>> {
  try {
    const text = await Deno.readTextFile(path);
    return JSON.parse(text) as Record<string, CachedEnrichment>;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {};
    }

    throw error;
  }
}

async function writeCache(path: string, cache: Record<string, CachedEnrichment>): Promise<void> {
  await Deno.writeTextFile(path, JSON.stringify(cache, null, 2));
}

function isCacheFresh(entry: CachedEnrichment | undefined): boolean {
  if (!entry) {
    return false;
  }
  if (entry.schemaVersion !== CACHE_VERSION) {
    return false;
  }

  const updatedAt = Date.parse(entry.updatedAt);
  if (Number.isNaN(updatedAt)) {
    return false;
  }

  return Date.now() - updatedAt <= CACHE_TTL_HOURS * 60 * 60 * 1000;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const avg = mean(values);
  const variance = values.reduce((sum, value) => {
    return sum + (value - avg) ** 2;
  }, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function toBillions(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return roundValue(value / 1_000_000_000, 2);
}

function toPercent(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return roundValue(value * 100, 2);
}

function roundValue(value: number | null, decimals: number): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clampRating(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(1, Math.min(5, Math.round(value)));
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseLooseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replaceAll(",", "")
    .replaceAll("$", "")
    .replaceAll("%", "")
    .trim();
  if (!normalized || normalized === "N/A") {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function preferValue<T>(preferred: T | null | undefined, fallback: T | null): T | null {
  return preferred ?? fallback;
}

function subtractYears(date: Date, years: number): Date {
  const copy = new Date(date);
  copy.setUTCFullYear(copy.getUTCFullYear() - years);
  return copy;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.toLowerCase()))];
}

function formatGeneratedAt(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function renderHtml(rows: FlatEtfRow[], generatedAt: string): string {
  const jsonRows = JSON.stringify(rows).replace(/</g, "\\u003c");
  const copyrightYear = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="darkreader-lock">
  <title>ETF Screener</title>
  <style>
    :root {
      --bg: #f6f8f4;
      --panel: rgba(255,255,255,0.9);
      --panel-strong: #ffffff;
      --ink: #15221b;
      --muted: #5f7168;
      --line: #d5ddd5;
      --accent: #18392b;
      --accent-soft: #eef3ec;
      --row-bg: rgba(255,255,255,0.72);
      --row-hover-bg: rgba(230,236,230,0.88);
      --row-hover-overlay: rgba(21,34,27,0.08);
      --shadow: 0 18px 40px rgba(30, 41, 59, 0.08);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(144, 190, 109, 0.18), transparent 28%),
        radial-gradient(circle at top right, rgba(190, 122, 95, 0.14), transparent 22%),
        linear-gradient(180deg, #f8faf6 0%, #eef2eb 100%);
    }

    .page {
      width: 100%;
      max-width: none;
      margin: 0;
      padding: 32px 24px 56px;
    }

    .copyright {
      margin: 0 0 14px;
      color: #6f7f76;
      font-size: 0.92rem;
      line-height: 1.4;
    }

    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.9fr);
      gap: 20px;
      margin-bottom: 20px;
    }

    .hero-card,
    .summary-card,
    .controls-card,
    .table-card,
    .method-card {
      background: var(--panel);
      border: 1px solid rgba(255,255,255,0.75);
      backdrop-filter: blur(12px);
      box-shadow: var(--shadow);
      border-radius: 24px;
    }

    .hero-card {
      padding: 28px 28px 24px;
      background: linear-gradient(145deg, rgba(255,255,255,0.96), rgba(248,250,246,0.82));
    }

    .kicker {
      margin: 0 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 0.74rem;
      color: #6f7f76;
      font-weight: 700;
    }

    h1 {
      margin: 0;
      font-size: clamp(2rem, 4vw, 3.5rem);
      line-height: 0.98;
      letter-spacing: -0.04em;
    }

    .lead {
      margin: 14px 0 0;
      max-width: none;
      width: 100%;
      color: var(--muted);
      font-size: 1rem;
      line-height: 1.6;
    }

    .summary-card {
      padding: 24px;
      display: grid;
      gap: 14px;
      align-content: start;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .stat {
      padding: 14px 16px;
      border-radius: 18px;
      background: var(--panel-strong);
      border: 1px solid var(--line);
    }

    .stat-label {
      display: block;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #718379;
      margin-bottom: 6px;
      font-weight: 700;
    }

    .stat-value {
      display: block;
      font-size: 1.6rem;
      letter-spacing: -0.03em;
      font-weight: 700;
    }

    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .pill {
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(248, 250, 246, 0.95);
      color: var(--muted);
      font-size: 0.82rem;
      white-space: nowrap;
    }

    .pill strong { color: var(--ink); }

    .controls-card {
      padding: 22px;
      margin-bottom: 18px;
    }

    .controls-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 18px;
    }

    .controls-header h2,
    .table-header h2,
    .method-card h2 {
      margin: 0;
      font-size: 1.05rem;
      letter-spacing: -0.02em;
    }

    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 10px 14px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      background: var(--accent);
      color: white;
    }

    button.secondary {
      background: white;
      color: var(--ink);
      border: 1px solid var(--line);
    }

    .control-grid {
      display: grid;
      grid-template-columns: minmax(320px, 1.15fr) repeat(4, minmax(240px, 1fr));
      gap: 14px;
      align-items: start;
    }

    .control-card {
      padding: 16px;
      border-radius: 18px;
      background: var(--panel-strong);
      border: 1px solid var(--line);
    }

    .control-card h3 {
      margin: 0 0 12px;
      font-size: 0.95rem;
      letter-spacing: -0.02em;
    }

    .control-card p {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 0.84rem;
      line-height: 1.45;
    }

    .field-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .field {
      display: grid;
      gap: 6px;
    }

    .field.full {
      grid-column: 1 / -1;
    }

    label {
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6f7f76;
      font-weight: 700;
    }

    input,
    select {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #fbfcfa;
      padding: 10px 12px;
      font: inherit;
      color: var(--ink);
    }

    input:focus,
    select:focus {
      outline: 2px solid rgba(24, 57, 43, 0.15);
      border-color: #8ea894;
    }

    .table-card {
      overflow: hidden;
    }

    .table-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 18px 20px 14px;
    }

    .table-wrap {
      overflow: auto;
      border-top: 1px solid var(--line);
    }

    table {
      width: 100%;
      min-width: 1640px;
      border-collapse: collapse;
      font-size: 0.92rem;
    }

    thead th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: #eef3ec;
      color: #30443a;
      text-align: left;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 14px 12px;
      border-bottom: 1px solid var(--line);
      cursor: pointer;
      white-space: nowrap;
      user-select: none;
    }

    tbody td {
      padding: 12px;
      border-bottom: 1px solid rgba(213, 221, 213, 0.75);
      vertical-align: middle;
      background: var(--row-bg);
    }

    tbody td.numeric[data-key] {
      transition: box-shadow 120ms ease;
    }

    tbody tr:hover td {
      background: var(--row-hover-bg);
    }

    tbody tr:hover td.numeric[data-key] {
      box-shadow: inset 0 0 0 999px var(--row-hover-overlay);
    }

    th.numeric,
    td.numeric {
      text-align: right;
      font-family: "JetBrains Mono", Consolas, monospace;
    }

    td.symbol {
      font-weight: 700;
      letter-spacing: 0.03em;
    }

    td.meta {
      color: var(--muted);
      font-size: 0.84rem;
    }

    .sort-indicator {
      display: inline-block;
      min-width: 14px;
      margin-left: 6px;
      color: #809086;
    }

    .empty-state {
      padding: 28px 22px;
      color: var(--muted);
    }

    .method-card {
      padding: 22px;
      margin-top: 18px;
    }

    .method-card p,
    .method-card li {
      color: var(--muted);
      line-height: 1.6;
    }

    .method-card ul {
      margin: 10px 0 0;
      padding-left: 18px;
    }

    @media (max-width: 1280px) {
      .hero,
      .control-grid,
      .horizon-grid {
        grid-template-columns: 1fr;
      }

      .page {
        padding-inline: 16px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <p class="copyright">©${copyrightYear}, Dan Micsa, PhD, Processed by GPT-5.4</p>
    <section class="hero">
      <div class="hero-card">
        <p class="kicker">ETF Universe Screener</p>
        <h1>Filter the ETF universe with live risk, return, and rating controls.</h1>
        <p class="lead">
          The table below starts from the full Nasdaq ETF screener universe, then enriches each listing with Yahoo Finance AUM and
          return-risk data where available. You can screen the full ETF listing set with controls for AUM, annualized return,
          standard deviation, and Sharpe ratio. Numeric cells use the existing RG palette so
          strong values read visually before you sort.
        </p>
        <p class="lead">
          AR, SR, and SD are all annualized. AR and SD are shown in percent, so SPY should be around 15 rather than 0.15.
          SR uses daily adjusted closes with a 0% risk-free rate.
        </p>
      </div>
      <div class="summary-card">
        <div class="stats-grid">
          <div class="stat">
            <span class="stat-label">Universe</span>
            <span class="stat-value" id="universeCount">0</span>
          </div>
          <div class="stat">
            <span class="stat-label">Filtered</span>
            <span class="stat-value" id="filteredCount">0</span>
          </div>
          <div class="stat">
            <span class="stat-label">Filtered AUM</span>
            <span class="stat-value" id="filteredAum">-</span>
          </div>
          <div class="stat">
            <span class="stat-label">Generated</span>
            <span class="stat-value" id="generatedAt">${generatedAt}</span>
          </div>
        </div>
        <div class="pill-row">
          <span class="pill"><strong>Morningstar coverage</strong> <span id="morningstarCoverage">-</span></span>
          <span class="pill"><strong>Default sort</strong> 5Y annualized SR descending</span>
        </div>
      </div>
    </section>

    <section class="controls-card">
      <div class="controls-header">
        <h2>Controls</h2>
        <div class="button-row">
          <button type="button" id="copyTickers">Copy filtered tickers</button>
          <button type="button" class="secondary" id="resetFilters">Reset filters</button>
        </div>
      </div>

      <div class="control-grid">
        <div class="control-card">
          <h3>Universe and Ratings</h3>
          <div class="field-row">
            <div class="field full">
              <label for="searchFilter">Search</label>
              <input id="searchFilter" type="search" placeholder="Ticker, fund name, category, sponsor">
            </div>
            <div class="field">
              <label for="aumMin">AUM Min ($B)</label>
              <input id="aumMin" type="number" step="0.01" placeholder="Any" value="1">
            </div>
            <div class="field">
              <label for="aumMax">AUM Max ($B)</label>
              <input id="aumMax" type="number" step="0.01" placeholder="Any">
            </div>
            <div class="field">
              <label for="morningstarMin">Morningstar Min</label>
              <select id="morningstarMin">
                <option value="">Any</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </div>
          </div>
        </div>

        <div class="control-card">
          <h3>1Y Filters</h3>
          <div class="field-row">
            <div class="field"><label for="ar1YMin">Annual AR Min</label><input id="ar1YMin" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="ar1YMax">Annual AR Max</label><input id="ar1YMax" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sr1YMin">Annual SR Min</label><input id="sr1YMin" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sr1YMax">Annual SR Max</label><input id="sr1YMax" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sd1YMin">Annual SD Min</label><input id="sd1YMin" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sd1YMax">Annual SD Max</label><input id="sd1YMax" type="number" step="0.01" placeholder="Any"></div>
          </div>
        </div>

        <div class="control-card">
          <h3>3Y Filters</h3>
          <div class="field-row">
            <div class="field"><label for="ar3YMin">Annual AR Min</label><input id="ar3YMin" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="ar3YMax">Annual AR Max</label><input id="ar3YMax" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sr3YMin">Annual SR Min</label><input id="sr3YMin" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sr3YMax">Annual SR Max</label><input id="sr3YMax" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sd3YMin">Annual SD Min</label><input id="sd3YMin" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sd3YMax">Annual SD Max</label><input id="sd3YMax" type="number" step="0.01" placeholder="Any"></div>
          </div>
        </div>

        <div class="control-card">
          <h3>5Y Filters</h3>
          <div class="field-row">
            <div class="field"><label for="ar5YMin">Annual AR Min</label><input id="ar5YMin" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="ar5YMax">Annual AR Max</label><input id="ar5YMax" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sr5YMin">Annual SR Min</label><input id="sr5YMin" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sr5YMax">Annual SR Max</label><input id="sr5YMax" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sd5YMin">Annual SD Min</label><input id="sd5YMin" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sd5YMax">Annual SD Max</label><input id="sd5YMax" type="number" step="0.01" placeholder="Any"></div>
          </div>
        </div>

        <div class="control-card">
          <h3>10Y Filters</h3>
          <div class="field-row">
            <div class="field"><label for="ar10YMin">Annual AR Min</label><input id="ar10YMin" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="ar10YMax">Annual AR Max</label><input id="ar10YMax" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sr10YMin">Annual SR Min</label><input id="sr10YMin" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sr10YMax">Annual SR Max</label><input id="sr10YMax" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sd10YMin">Annual SD Min</label><input id="sd10YMin" type="number" step="0.01" placeholder="Any"></div>
            <div class="field"><label for="sd10YMax">Annual SD Max</label><input id="sd10YMax" type="number" step="0.01" placeholder="Any"></div>
          </div>
        </div>
      </div>
    </section>

    <section class="table-card">
      <div class="table-header">
        <h2>Filtered Universe</h2>
        <div class="pill-row" id="activeFilters"></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr id="tableHead"></tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
      <div class="empty-state" id="emptyState" hidden>No ETFs match the current filter set.</div>
    </section>

    <section class="method-card">
      <h2>Method</h2>
      <ul>
        <li>The starting universe comes from Nasdaq's ETF screener endpoint, not a hand-picked symbol list.</li>
        <li>AUM comes from Yahoo Finance fund statistics and is shown in billions of dollars.</li>
        <li>AR is annualized return in percent, SD is annualized standard deviation in percent, and SR is annualized Sharpe ratio computed from daily adjusted closes over each horizon.</li>
        <li>Morningstar rating is scraped from public ETF quote pages when available.</li>
      </ul>
    </section>
  </div>

  <script>
    const DATA = ${jsonRows};

    const COLUMNS = [
      { key: "symbol", label: "Ticker", type: "text", className: "symbol" },
      { key: "name", label: "ETF", type: "text" },
      { key: "category", label: "Category", type: "text", className: "meta" },
      { key: "sponsor", label: "Sponsor", type: "text", className: "meta" },
      { key: "aumBillions", label: "AUM ($B)", type: "number", digits: 1, higherIsBetter: true },
      { key: "morningstarRating", label: "Morningstar", type: "number", digits: 0, higherIsBetter: true },
      { key: "ar1Y", label: "1Y AR Ann %", type: "number", digits: 1, higherIsBetter: true },
      { key: "sr1Y", label: "1Y SR Ann", type: "number", digits: 2, higherIsBetter: true },
      { key: "sd1Y", label: "1Y SD Ann %", type: "number", digits: 1, higherIsBetter: false },
      { key: "ar3Y", label: "3Y AR Ann %", type: "number", digits: 1, higherIsBetter: true },
      { key: "sr3Y", label: "3Y SR Ann", type: "number", digits: 2, higherIsBetter: true },
      { key: "sd3Y", label: "3Y SD Ann %", type: "number", digits: 1, higherIsBetter: false },
      { key: "ar5Y", label: "5Y AR Ann %", type: "number", digits: 1, higherIsBetter: true },
      { key: "sr5Y", label: "5Y SR Ann", type: "number", digits: 2, higherIsBetter: true },
      { key: "sd5Y", label: "5Y SD Ann %", type: "number", digits: 1, higherIsBetter: false },
      { key: "ar10Y", label: "10Y AR Ann %", type: "number", digits: 1, higherIsBetter: true },
      { key: "sr10Y", label: "10Y SR Ann", type: "number", digits: 2, higherIsBetter: true },
      { key: "sd10Y", label: "10Y SD Ann %", type: "number", digits: 1, higherIsBetter: false },
    ];

    const FILTER_INPUT_IDS = [
      "searchFilter",
      "aumMin", "aumMax", "morningstarMin",
      "ar1YMin", "ar1YMax", "sr1YMin", "sr1YMax", "sd1YMin", "sd1YMax",
      "ar3YMin", "ar3YMax", "sr3YMin", "sr3YMax", "sd3YMin", "sd3YMax",
      "ar5YMin", "ar5YMax", "sr5YMin", "sr5YMax", "sd5YMin", "sd5YMax",
      "ar10YMin", "ar10YMax", "sr10YMin", "sr10YMax", "sd10YMin", "sd10YMax",
    ];

    const DEFAULT_FILTER_VALUES = {
      aumMin: "1",
    };

    const state = {
      sortKey: "sr5Y",
      sortAsc: false,
    };

    const RG_PALETTE = ["oklch(0.75 0.2 25)", 16643811, "oklch(0.75 0.2 143)"];

    renderHeader();
    bindControls();
    render();

    function bindControls() {
      FILTER_INPUT_IDS.forEach((id) => {
        const element = document.getElementById(id);
        element.addEventListener("input", render);
        element.addEventListener("change", render);
      });

      document.getElementById("resetFilters").addEventListener("click", () => {
        FILTER_INPUT_IDS.forEach((id) => {
          const element = document.getElementById(id);
          element.value = DEFAULT_FILTER_VALUES[id] ?? "";
        });
        render();
      });

      document.getElementById("copyTickers").addEventListener("click", async () => {
        const filtered = getVisibleRows();
        const text = filtered.map((row) => row.symbol).join(", ");
        if (!text) {
          return;
        }
        await navigator.clipboard.writeText(text);
      });
    }

    function renderHeader() {
      const head = document.getElementById("tableHead");
      head.innerHTML = COLUMNS.map((column) => {
        const numericClass = column.type === "number" ? "numeric" : "";
        const sortIndicator = state.sortKey === column.key ? (state.sortAsc ? "▲" : "▼") : "";
        return '<th class="' + numericClass + '" data-key="' + column.key + '">'
          + column.label
          + '<span class="sort-indicator">'
          + sortIndicator
          + '</span></th>';
      }).join("");

      head.querySelectorAll("th").forEach((cell) => {
        cell.addEventListener("click", () => {
          const key = cell.dataset.key;
          if (state.sortKey === key) {
            state.sortAsc = !state.sortAsc;
          } else {
            state.sortKey = key;
            state.sortAsc = false;
          }
          renderHeader();
          render();
        });
      });
    }

    function render() {
      const body = document.getElementById("tableBody");
      const filtered = getVisibleRows();
      body.innerHTML = filtered.map(renderRow).join("");
      document.getElementById("emptyState").hidden = filtered.length !== 0;
      updateSummary(filtered);
      updateActiveFilters();
      applyColors(filtered);
    }

    function getVisibleRows() {
      return sortRows(getFilteredRows());
    }

    function renderRow(row) {
      return '<tr>' + COLUMNS.map((column) => renderCell(row, column)).join("") + '</tr>';
    }

    function renderCell(row, column) {
      const value = row[column.key];
      const numericClass = column.type === "number" ? "numeric" : "";
      const extraClass = column.className ?? "";
      if (column.type !== "number") {
        return '<td class="' + numericClass + ' ' + extraClass + '">' + escapeHtml(value ?? '-') + '</td>';
      }

      const display = formatNumber(value, column);
      const raw = value === null || Number.isNaN(value) ? "" : String(value);
      return '<td class="' + numericClass + '" data-key="' + column.key + '" data-value="' + raw + '">' + display + '</td>';
    }

    function getFilteredRows() {
      const search = document.getElementById("searchFilter").value.trim().toLowerCase();
      const aumMin = getNumericFilter("aumMin");
      const aumMax = getNumericFilter("aumMax");
      const morningstarMin = getNumericFilter("morningstarMin");

      return DATA.filter((row) => {
        if (search) {
          const haystack = [row.symbol, row.name, row.category, row.sponsor]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(search)) {
            return false;
          }
        }

        if (!withinRange(row.aumBillions, aumMin, aumMax)) {
          return false;
        }
        if (!meetsMinimum(row.morningstarRating, morningstarMin)) {
          return false;
        }

        for (const horizon of ["1Y", "3Y", "5Y", "10Y"]) {
          if (!withinRange(row["ar" + horizon], getNumericFilter("ar" + horizon + "Min"), getNumericFilter("ar" + horizon + "Max"))) {
            return false;
          }
          if (!withinRange(row["sr" + horizon], getNumericFilter("sr" + horizon + "Min"), getNumericFilter("sr" + horizon + "Max"))) {
            return false;
          }
          if (!withinRange(row["sd" + horizon], getNumericFilter("sd" + horizon + "Min"), getNumericFilter("sd" + horizon + "Max"))) {
            return false;
          }
        }

        return true;
      });
    }

    function sortRows(rows) {
      return [...rows].sort((left, right) => {
        const column = COLUMNS.find((item) => item.key === state.sortKey);
        const leftValue = left[state.sortKey];
        const rightValue = right[state.sortKey];

        if (column?.type === "number") {
          const leftNumeric = leftValue ?? Number.NEGATIVE_INFINITY;
          const rightNumeric = rightValue ?? Number.NEGATIVE_INFINITY;
          return state.sortAsc ? leftNumeric - rightNumeric : rightNumeric - leftNumeric;
        }

        const leftText = String(leftValue ?? "");
        const rightText = String(rightValue ?? "");
        return state.sortAsc ? leftText.localeCompare(rightText) : rightText.localeCompare(leftText);
      });
    }

    function updateSummary(filtered) {
      const filteredAum = filtered.reduce((sum, row) => sum + (row.aumBillions ?? 0), 0);
      const morningstarCoverage = DATA.filter((row) => row.morningstarRating !== null).length;
      document.getElementById("universeCount").textContent = String(DATA.length);
      document.getElementById("filteredCount").textContent = String(filtered.length);
      document.getElementById("filteredAum").textContent = filtered.length ? "$" + formatCompact(filteredAum) + "B" : "-";
      document.getElementById("morningstarCoverage").textContent = String(morningstarCoverage) + "/" + String(DATA.length);
    }

    function updateActiveFilters() {
      const active = [];
      if (document.getElementById("searchFilter").value.trim()) {
        active.push("Search: " + document.getElementById("searchFilter").value.trim());
      }
      FILTER_INPUT_IDS
        .filter((id) => id !== "searchFilter")
        .forEach((id) => {
          const value = document.getElementById(id).value;
          if (!value) {
            return;
          }
          active.push(readableFilterLabel(id) + " " + value);
        });

      const activeFilters = document.getElementById("activeFilters");
  activeFilters.innerHTML = active.map((label) => '<span class="pill">' + escapeHtml(label) + '</span>').join("");
    }

    function applyColors(rows) {
      const columnRanges = getColumnRanges(rows);
      document.querySelectorAll("td.numeric[data-key]").forEach((cell) => {
        const key = cell.dataset.key;
        const value = Number(cell.dataset.value);
        if (!key || Number.isNaN(value)) {
          cell.style.background = "rgba(255,255,255,0.72)";
          cell.style.color = "var(--ink)";
          cell.style.fontWeight = "600";
          return;
        }

        const range = columnRanges[key];
        if (!range || range.min === range.max) {
          cell.style.background = "rgba(255,255,255,0.72)";
          cell.style.color = "var(--ink)";
          cell.style.fontWeight = "700";
          cell.style.textShadow = "none";
          return;
        }

        cell.style.background = getPaletteColor(value, range.min, range.max, !range.higherIsBetter);
        cell.style.color = "#0f172a";
        cell.style.fontWeight = "700";
        cell.style.textShadow = "0 1px 0 rgba(255,255,255,.35)";
      });
    }

    function getColumnRanges(rows) {
      return Object.fromEntries(
        COLUMNS
          .filter((column) => column.type === "number")
          .map((column) => {
            const values = rows
              .map((row) => row[column.key])
              .filter((value) => value !== null && !Number.isNaN(value));
            return [column.key, {
              min: values.length ? Math.min(...values) : 0,
              max: values.length ? Math.max(...values) : 0,
              higherIsBetter: column.higherIsBetter !== false,
            }];
          })
      );
    }

    function getNumericFilter(id) {
      const raw = document.getElementById(id).value;
      if (raw === "") {
        return null;
      }
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? numeric : null;
    }

    function withinRange(value, min, max) {
      if (min === null && max === null) {
        return true;
      }
      if (value === null || Number.isNaN(value)) {
        return false;
      }
      if (min !== null && value < min) {
        return false;
      }
      if (max !== null && value > max) {
        return false;
      }
      return true;
    }

    function meetsMinimum(value, min) {
      if (min === null) {
        return true;
      }
      if (value === null || Number.isNaN(value)) {
        return false;
      }
      return value >= min;
    }

    function formatNumber(value, column) {
      if (value === null || Number.isNaN(value)) {
        return "-";
      }
      if (column.key === "aumBillions") {
        return "$" + formatCompact(value) + "B";
      }
      return Number(value).toFixed(column.digits ?? 2);
    }

    function readableFilterLabel(id) {
      return id
        .replace(/([A-Z])/g, " $1")
        .replace(/\\b([0-9]) Y\\b/g, "$1Y")
        .replace(/^./, (value) => value.toUpperCase());
    }

    function formatCompact(value) {
      return value.toFixed(1);
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function parseOKLCH(source) {
      const match = source.match(/oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)/);
      if (!match) {
        return null;
      }
      return oklchToRgb(Number(match[1]), Number(match[2]), Number(match[3]) * Math.PI / 180);
    }

    function oklchToRgb(L, C, h) {
      const a = C * Math.cos(h);
      const b = C * Math.sin(h);
      const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = L - 0.0894841775 * a - 1.291485548 * b;
      const ll = l_ * l_ * l_;
      const mm = m_ * m_ * m_;
      const ss = s_ * s_ * s_;
      const red = 4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss;
      const green = -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss;
      const blue = -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss;
      const toSrgb = (channel) => {
        return channel <= 0.0031308
          ? 12.92 * channel
          : 1.055 * Math.pow(Math.max(channel, 0), 1 / 2.4) - 0.055;
      };
      return [
        Math.round(Math.min(255, Math.max(0, toSrgb(red) * 255))),
        Math.round(Math.min(255, Math.max(0, toSrgb(green) * 255))),
        Math.round(Math.min(255, Math.max(0, toSrgb(blue) * 255))),
      ];
    }

    function rgbToOKLCH(r, g, b) {
      const linearize = (channel) => {
        return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
      };
      const red = linearize(r / 255);
      const green = linearize(g / 255);
      const blue = linearize(b / 255);
      const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
      const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
      const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
      const l_ = Math.cbrt(l);
      const m_ = Math.cbrt(m);
      const s_ = Math.cbrt(s);
      const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
      const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
      const bv = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
      return { L, C: Math.sqrt(a * a + bv * bv), h: Math.atan2(bv, a) };
    }

    function toArray(value) {
      if (Array.isArray(value)) {
        return value;
      }
      if (typeof value === "string" && value.startsWith("oklch")) {
        return parseOKLCH(value);
      }
      return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    }

    function getPaletteColor(value, minValue, maxValue, reverse = false) {
      if (value === null || Number.isNaN(value)) {
        return "transparent";
      }
      let t = maxValue !== minValue ? (value - minValue) / (maxValue - minValue) : 0;
      t = Math.max(0, Math.min(1, t));
      if (reverse) {
        t = 1 - t;
      }
      const segmentCount = RG_PALETTE.length - 1;
      const scaledT = t * segmentCount;
      const index = Math.min(Math.floor(scaledT), segmentCount - 1);
      const fraction = scaledT - index;
      const start = rgbToOKLCH(...toArray(RG_PALETTE[index]));
      const end = rgbToOKLCH(...toArray(RG_PALETTE[index + 1]));
      let deltaHue = end.h - start.h;
      if (deltaHue > Math.PI) {
        deltaHue -= 2 * Math.PI;
      }
      if (deltaHue < -Math.PI) {
        deltaHue += 2 * Math.PI;
      }
      const [r, g, b] = oklchToRgb(
        start.L + (end.L - start.L) * fraction,
        start.C + (end.C - start.C) * fraction,
        start.h + deltaHue * fraction,
      );
      return "rgb(" + r + "," + g + "," + b + ")";
    }
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

await main();
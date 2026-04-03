type NamedScore = {
  score: number;
};

type MappingComponent = {
  kind: "region" | "sector" | "asset";
  name: string;
  weight: number;
};

type TickerMapping = {
  components: MappingComponent[];
  adjustment?: number;
};

type CliOptions = {
  outlookPath: string;
  tsvPath: string;
  commandPath: string;
  copy: boolean;
  write: boolean;
};

const DEFAULT_OPTIONS: CliOptions = {
  outlookPath: "./MarketOutlook.html",
  tsvPath: "./MonthlyOutlook.tsv",
  commandPath: "./MonthlyOutlookCommand.md",
  copy: true,
  write: true,
};

const tickerMappings: Record<string, TickerMapping> = {
  DIA: {
    components: [{ kind: "region", name: "United States (quality tilt)", weight: 1 }],
    adjustment: -2,
  },
  IWM: {
    components: [{ kind: "region", name: "United States (quality tilt)", weight: 1 }],
    adjustment: -46,
  },
  SPY: {
    components: [{ kind: "region", name: "United States (quality tilt)", weight: 1 }],
  },
  QQQ: {
    components: [
      { kind: "region", name: "United States (quality tilt)", weight: 0.7 },
      { kind: "sector", name: "Semiconductors", weight: 0.3 },
    ],
    adjustment: -7,
  },
  EWJ: {
    components: [{ kind: "region", name: "Japan", weight: 1 }],
  },
  IEFA: {
    components: [{ kind: "region", name: "Europe", weight: 1 }],
  },
  EEMS: {
    components: [
      { kind: "region", name: "EM ex-China", weight: 0.5 },
      { kind: "region", name: "China", weight: 0.5 },
    ],
    adjustment: 3,
  },
  IEMG: {
    components: [{ kind: "region", name: "EM ex-China", weight: 1 }],
  },
  EWW: {
    components: [
      { kind: "region", name: "United States (quality tilt)", weight: 0.35 },
      { kind: "region", name: "EM ex-China", weight: 0.65 },
    ],
    adjustment: -4,
  },
  INDA: {
    components: [{ kind: "region", name: "India", weight: 1 }],
  },
  EPP: {
    components: [
      { kind: "region", name: "EM ex-China", weight: 0.6 },
      { kind: "region", name: "China", weight: 0.4 },
    ],
  },
  ILF: {
    components: [
      { kind: "region", name: "EM ex-China", weight: 0.6 },
      { kind: "asset", name: "Petrol (Brent/WTI crude)", weight: 0.2 },
      { kind: "sector", name: "Materials", weight: 0.2 },
    ],
    adjustment: 7,
  },
  VNM: {
    components: [
      { kind: "region", name: "EM ex-China", weight: 0.7 },
      { kind: "region", name: "China", weight: 0.3 },
    ],
    adjustment: 3,
  },
  TIP: {
    components: [
      { kind: "asset", name: "US Treasuries (7-10Y)", weight: 0.7 },
      { kind: "asset", name: "Gold", weight: 0.15 },
      { kind: "asset", name: "Petrol (Brent/WTI crude)", weight: 0.15 },
    ],
    adjustment: -6,
  },
  TLT: {
    components: [{ kind: "asset", name: "US Treasuries (7-10Y)", weight: 1 }],
  },
  LQD: {
    components: [{ kind: "asset", name: "US Treasuries (7-10Y)", weight: 1 }],
    adjustment: -20,
  },
  HYG: {
    components: [{ kind: "asset", name: "US Treasuries (7-10Y)", weight: 1 }],
    adjustment: -28,
  },
  EMB: {
    components: [
      { kind: "region", name: "EM ex-China", weight: 0.6 },
      { kind: "asset", name: "US Treasuries (7-10Y)", weight: 0.4 },
    ],
    adjustment: -12,
  },
  EUO: {
    components: [{ kind: "asset", name: "US Dollar Index", weight: 1 }],
    adjustment: -14,
  },
  FXY: {
    components: [{ kind: "asset", name: "US Dollar Index", weight: 1 }],
    adjustment: 10,
  },
  FXA: {
    components: [{ kind: "asset", name: "US Dollar Index", weight: 1 }],
    adjustment: 14,
  },
  FXB: {
    components: [{ kind: "asset", name: "US Dollar Index", weight: 1 }],
    adjustment: 6,
  },
  FXE: {
    components: [
      { kind: "region", name: "Europe", weight: 0.5 },
      { kind: "asset", name: "US Dollar Index", weight: 0.5 },
    ],
    adjustment: 3,
  },
  FXF: {
    components: [{ kind: "asset", name: "US Dollar Index", weight: 1 }],
  },
  UNG: {
    components: [{ kind: "asset", name: "Petrol (Brent/WTI crude)", weight: 1 }],
    adjustment: -6,
  },
  DBA: {
    components: [{ kind: "asset", name: "DBA (Agriculture basket)", weight: 1 }],
  },
  DBB: {
    components: [{ kind: "asset", name: "DBB (Basic materials basket)", weight: 1 }],
  },
  DBO: {
    components: [{ kind: "asset", name: "Petrol (Brent/WTI crude)", weight: 1 }],
  },
  DBC: {
    components: [
      { kind: "asset", name: "Petrol (Brent/WTI crude)", weight: 0.4 },
      { kind: "asset", name: "DBA (Agriculture basket)", weight: 0.3 },
      { kind: "asset", name: "DBB (Basic materials basket)", weight: 0.3 },
    ],
    adjustment: -3,
  },
  PALL: {
    components: [
      { kind: "asset", name: "DBB (Basic materials basket)", weight: 0.6 },
      { kind: "region", name: "Europe", weight: 0.4 },
    ],
    adjustment: -11,
  },
  PPLT: {
    components: [
      { kind: "asset", name: "Gold", weight: 0.6 },
      { kind: "asset", name: "Silver", weight: 0.4 },
    ],
    adjustment: -28,
  },
  SLV: {
    components: [{ kind: "asset", name: "Silver", weight: 1 }],
  },
  GLD: {
    components: [{ kind: "asset", name: "Gold", weight: 1 }],
  },
  SIL: {
    components: [
      { kind: "asset", name: "Silver", weight: 0.6 },
      { kind: "sector", name: "Semiconductors", weight: 0.1 },
      { kind: "asset", name: "Gold", weight: 0.3 },
    ],
    adjustment: -18,
  },
  GDX: {
    components: [
      { kind: "asset", name: "Gold", weight: 0.7 },
      { kind: "asset", name: "Silver", weight: 0.3 },
    ],
    adjustment: -20,
  },
  XLP: {
    components: [{ kind: "sector", name: "Consumer Staples", weight: 1 }],
  },
  XLK: {
    components: [
      { kind: "sector", name: "Semiconductors", weight: 0.6 },
      { kind: "sector", name: "Communication Services", weight: 0.2 },
      { kind: "region", name: "United States (quality tilt)", weight: 0.2 },
    ],
  },
  XLI: {
    components: [{ kind: "sector", name: "Industrials", weight: 1 }],
  },
  XLB: {
    components: [{ kind: "sector", name: "Materials", weight: 1 }],
  },
  XLY: {
    components: [{ kind: "sector", name: "Consumer Discretionary", weight: 1 }],
  },
  XLE: {
    components: [{ kind: "sector", name: "Energy", weight: 1 }],
  },
  XLU: {
    components: [{ kind: "sector", name: "Utilities", weight: 1 }],
  },
  XLV: {
    components: [{ kind: "sector", name: "Healthcare", weight: 1 }],
  },
  XLF: {
    components: [{ kind: "sector", name: "Financials", weight: 1 }],
  },
  XHB: {
    components: [
      { kind: "sector", name: "Consumer Discretionary", weight: 0.5 },
      { kind: "sector", name: "Industrials", weight: 0.3 },
      { kind: "asset", name: "US Treasuries (7-10Y)", weight: 0.2 },
    ],
    adjustment: -4,
  },
  ITB: {
    components: [
      { kind: "sector", name: "Consumer Discretionary", weight: 0.5 },
      { kind: "sector", name: "Industrials", weight: 0.3 },
      { kind: "asset", name: "US Treasuries (7-10Y)", weight: 0.2 },
    ],
  },
  IBB: {
    components: [{ kind: "sector", name: "Healthcare", weight: 1 }],
    adjustment: -32,
  },
  AMLP: {
    components: [
      { kind: "sector", name: "Energy", weight: 0.7 },
      { kind: "asset", name: "US Treasuries (7-10Y)", weight: 0.3 },
    ],
    adjustment: 2,
  },
  VNQ: {
    components: [{ kind: "sector", name: "Real Estate", weight: 1 }],
  },
};

const args = parseArgs(Deno.args);
const options = buildOptions(args);

const [outlookHtml, existingTsv, commandText] = await Promise.all([
  Deno.readTextFile(options.outlookPath),
  Deno.readTextFile(options.tsvPath),
  Deno.readTextFile(options.commandPath),
]);

if (!commandText.includes("1-month tactical conviction scores")) {
  console.warn("Warning: command file does not include the expected scoring guidance.");
}

const sectorData = extractArray<{ sector: string; score: number }>(outlookHtml, "sectorData");
const regionData = extractArray<{ region: string; score: number }>(outlookHtml, "regionData");
const assetData = extractArray<{ asset: string; score: number }>(outlookHtml, "assetData");
const sourceData = extractArray<{ source: string; equity: number; defensive: number; international: number }>(outlookHtml, "sourceData");

const scoreMaps = {
  sector: new Map(sectorData.map((item) => [item.sector, item] as const)),
  region: new Map(regionData.map((item) => [item.region, item] as const)),
  asset: new Map(assetData.map((item) => [item.asset, item] as const)),
};

const tickers = existingTsv
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split("\t")[0]);

const equityPulse = average(sourceData.map((item) => item.equity));
const defensiveTilt = average(sourceData.map((item) => item.defensive));
const internationalBias = average(sourceData.map((item) => item.international));

const rows = tickers.map((ticker) => {
  const mapping = tickerMappings[ticker];
  if (!mapping) {
    throw new Error(`No ticker mapping defined for ${ticker}`);
  }

  const weightedScore = averageWeighted(
    mapping.components.map((component) => {
      const item = scoreMaps[component.kind].get(component.name);
      if (!item) {
        throw new Error(`Missing ${component.kind} score for \"${component.name}\" while scoring ${ticker}`);
      }
      return { value: item.score, weight: component.weight };
    }),
  );

  const score = clamp(Math.round(2 * (weightedScore - 50) + (mapping.adjustment ?? 0)), -100, 100);
  return { ticker, score };
});

const tsv = rows.map((row) => `${row.ticker}\t${formatPercent(row.score)}`).join("\n") + "\n";

if (options.write) {
  await Deno.writeTextFile(options.tsvPath, tsv);
}

if (options.copy) {
  await copyToClipboard(tsv);
}

const scores = rows.map((row) => row.score).sort((a, b) => a - b);
const stats = {
  count: scores.length,
  mean: round2(average(scores)),
  median: computeMedian(scores),
  positive: scores.filter((value) => value > 0).length,
  negative: scores.filter((value) => value < 0).length,
  zero: scores.filter((value) => value === 0).length,
};

console.log(`Updated: ${options.tsvPath}`);
console.log(`Clipboard: ${options.copy ? "yes" : "no"}`);
console.log(`Mean: ${stats.mean}%`);
console.log(`Median: ${stats.median}%`);
console.log(`Positive: ${stats.positive}`);
console.log(`Negative: ${stats.negative}`);
console.log(`Zero: ${stats.zero}`);
console.log(`Source equity pulse: ${round2(equityPulse)}`);
console.log(`Source defensive tilt: ${round2(defensiveTilt)}`);
console.log(`Source international bias: ${round2(internationalBias)}`);

function parseArgs(argv: string[]): Map<string, string | boolean> {
  const parsed = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    if (arg === "--no-copy" || arg === "--no-write") {
      parsed.set(arg, true);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for argument ${arg}`);
    }
    parsed.set(arg, next);
    index += 1;
  }
  return parsed;
}

function buildOptions(parsed: Map<string, string | boolean>): CliOptions {
  return {
    outlookPath: stringArg(parsed, "--outlook", DEFAULT_OPTIONS.outlookPath),
    tsvPath: stringArg(parsed, "--tsv", DEFAULT_OPTIONS.tsvPath),
    commandPath: stringArg(parsed, "--command", DEFAULT_OPTIONS.commandPath),
    copy: !parsed.has("--no-copy"),
    write: !parsed.has("--no-write"),
  };
}

function stringArg(parsed: Map<string, string | boolean>, key: string, fallback: string): string {
  const value = parsed.get(key);
  return typeof value === "string" ? value : fallback;
}

function extractArray<T>(html: string, variableName: string): T[] {
  const regex = new RegExp(`const\\s+${variableName}\\s*=\\s*(\\[[\\s\\S]*?\\]);`);
  const match = html.match(regex);
  if (!match) {
    throw new Error(`Could not find ${variableName} in outlook HTML`);
  }

  const source = match[1];
  return Function(`"use strict"; return (${source});`)() as T[];
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageWeighted(entries: { value: number; weight: number }[]): number {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight === 0) {
    throw new Error("Weighted average has zero total weight");
  }
  const totalValue = entries.reduce((sum, entry) => sum + entry.value * entry.weight, 0);
  return totalValue / totalWeight;
}

function computeMedian(sortedValues: number[]): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const middle = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
  }
  return sortedValues[middle];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: number): string {
  return `${value}%`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function copyToClipboard(text: string): Promise<void> {
  if (Deno.build.os === "windows") {
    const command = new Deno.Command("cmd", {
      args: ["/c", "clip"],
      stdin: "piped",
      stdout: "null",
      stderr: "piped",
    });
    const process = command.spawn();
    const writer = process.stdin.getWriter();
    await writer.write(new TextEncoder().encode(text));
    await writer.close();
    const { code, stderr } = await process.output();
    if (code !== 0) {
      throw new Error(`Clipboard copy failed: ${new TextDecoder().decode(stderr)}`);
    }
    return;
  }

  throw new Error("Clipboard copy is currently implemented only for Windows.");
}
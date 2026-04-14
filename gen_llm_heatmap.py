"""
Generates local_llm_builds.html — LLM hardware heatmap.
Systems = rows, Metrics = columns. Columns are sortable.
Colors are applied in-browser via OKLCH interpolation (Red→Green perceptual gradient).
Output: d:\\My\\Work\\Reports\\local_llm_builds.html
"""

from datetime import date
from typing import cast

MetricValue = int | float
MetricColumn = list[MetricValue]
NumericColumn = list[int] | list[float]
DataColumn = list[str] | NumericColumn

COST_KEY = "System Cost ($)"
WORKSTATION_HOST_ALLOWANCE = 1600
SERVER_HOST_ALLOWANCE = 3000

data: dict[str, DataColumn] = {
    "Systems": [
        "Mac Studio Ultra",
        "Dual RTX 4090",
        "Triple RTX 3090",
        "Quad 4060 Ti",
        "Dual RTX 3090",
        "Mac Studio Max",
        "Single RTX 4090",
        "Ryzen AI Max+ 395",
        "Single RTX 4080S",
        "Mac Mini Pro",
        "Tiiny AI Pocket Lab",
        "NVIDIA DGX Spark",
        "Quadro RTX 8000 48GB",
        "AMD Radeon Pro W7900",
        "AMD Instinct MI210 64GB",
        "AMD Radeon Pro W7800",
        "AMD Radeon Pro Duo 32GB",
    ],
    COST_KEY: [
        4799,
        4800,
        3600,
        2800,
        2500,
        2399,
        3200,
        2500,
        2100,
        1499,
        1999,
        2999,
        10000 + WORKSTATION_HOST_ALLOWANCE,
        3999 + WORKSTATION_HOST_ALLOWANCE,
        12000 + SERVER_HOST_ALLOWANCE,
        2499 + WORKSTATION_HOST_ALLOWANCE,
        999 + WORKSTATION_HOST_ALLOWANCE,
    ],
    "Memory (GB)": [
        128,
        48,
        72,
        64,
        48,
        96,
        24,
        128,
        16,
        64,
        80,
        128,
        48,
        48,
        64,
        32,
        32,
    ],
    "Bandwidth (GB/s)": [
        800,
        1008,
        936,
        288,
        936,
        400,
        1008,
        270,
        736,
        200,
        205,
        273,
        672,
        864,
        1600,
        576,
        448,
    ],
    "Power (W)": [
        370,
        1200,
        1400,
        800,
        900,
        150,
        750,
        120,
        600,
        85,
        65,
        170,
        260,
        295,
        300,
        260,
        250,
    ],
    "8B Llama 3 t/s": [
        55,
        140,
        100,
        45,
        100,
        35,
        140,
        30,
        110,
        25,
        24,
        38,
        72,
        82,
        110,
        60,
        16,
    ],
    "32B Qwen t/s": [25, 65, 40, 18, 45, 15, 50, 15, 10, 12, 14, 18, 28, 31, 44, 22, 6],
    "70B Llama 3 t/s": [16, 26, 20, 8, 18, 8, 4, 5, 2.5, 4, 6, 5, 11, 12.5, 21, 4, 1],
    "104B CommandR t/s": [
        10,
        1.5,
        12,
        4,
        1.5,
        6,
        1,
        3.5,
        0.5,
        2,
        4.5,
        3.5,
        1.8,
        2.0,
        5.0,
        0.8,
        0.2,
    ],
}

systems = cast(list[str], data["Systems"])
row_count = len(systems)
for key, values in data.items():
    if key == "Systems":
        continue
    numeric_values = cast(MetricColumn, values)
    if len(numeric_values) != row_count:
        raise ValueError(
            f"Column '{key}' has {len(numeric_values)} values, expected {row_count}"
        )


def metric_column(key: str) -> MetricColumn:
    return cast(MetricColumn, data[key])


data["Tokens/k$ (32B)"] = [
    round((t / c) * 1000, 2)
    for t, c in zip(metric_column("32B Qwen t/s"), metric_column(COST_KEY))
]
data["Tokens/k$ (70B)"] = [
    round((t / c) * 1000, 2)
    for t, c in zip(metric_column("70B Llama 3 t/s"), metric_column(COST_KEY))
]

LOWER_IS_BETTER = {COST_KEY, "Power (W)"}

COLUMN_RANGE_OVERRIDES: dict[str, dict[str, MetricValue]] = {
    COST_KEY: {"max": 15000},
}

metrics = [k for k in data if k != "Systems"]


def fmt(key: str, val: MetricValue) -> str:
    if "$" in key and "Tokens/k$" not in key:
        return f"${int(val):,}"
    if "Tokens/k$" in key:
        return f"{val:.2f}"
    return str(val)


col_min = {
    m: COLUMN_RANGE_OVERRIDES.get(m, {}).get("min", min(metric_column(m)))
    for m in metrics
}
col_max = {
    m: COLUMN_RANGE_OVERRIDES.get(m, {}).get("max", max(metric_column(m)))
    for m in metrics
}

today = date.today()
generated_label = f"{today.strftime('%B')} {today.day}, {today.year}"

# Build header with data-min, data-max, data-invert for JS coloring
headers_html = "<th onclick=\"srt(0)\">System<span class='arr' id='arr0'></span></th>"
for i, m in enumerate(metrics):
    lo = col_min[m]
    hi = col_max[m]
    inv = "1" if m in LOWER_IS_BETTER else "0"
    headers_html += (
        f'<th onclick="srt({i + 1})" '
        f"data-min='{lo}' data-max='{hi}' data-inv='{inv}'>"
        f"{m}<span class='arr' id='arr{i + 1}'></span></th>"
    )

# Build rows — just data-val, no inline background
rows_html = ""
for i, sys_name in enumerate(systems):
    cells = "".join(
        f"<td data-val='{metric_column(m)[i]}'>{fmt(m, metric_column(m)[i])}</td>"
        for m in metrics
    )
    rows_html += f"<tr><td class='rh'>{sys_name}</td>{cells}</tr>\n"

html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Local LLM Hardware Heatmap</title>
<style>
  body{{font-family:-apple-system,sans-serif;background:#0f172a;color:#fff;margin:40px}}
  h1{{color:#f8fafc;margin-bottom:5px}}
  p{{color:#94a3b8;margin-bottom:20px;line-height:1.5}}
  .wrap{{overflow-x:auto;border-radius:8px;box-shadow:0 4px 6px -1px rgba(0,0,0,.5)}}
  table{{border-collapse:collapse;width:100%;background:#1e293b}}
  th,td{{padding:13px 15px;border-bottom:1px solid #334155;border-right:1px solid #334155;text-align:center}}
  th{{background:#0f172a;font-weight:600;text-transform:uppercase;font-size:.82em;
      letter-spacing:.05em;cursor:pointer;user-select:none;white-space:nowrap}}
  th:hover{{background:#1e293b}}
  .rh{{font-weight:bold;text-align:left;background:#1e293b;color:#f8fafc;
       border-right:2px solid #475569;white-space:nowrap}}
  .arr{{margin-left:5px;font-size:.9em;color:#64748b}}
  .arr.asc::after{{content:'▲';color:#38bdf8}}
  .arr.desc::after{{content:'▼';color:#38bdf8}}
  .footer{{margin-top:32px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}}
  .pill{{border:1px solid #334155;background:rgba(255,255,255,.06);border-radius:999px;
         padding:7px 13px;font-size:.82em;color:#94a3b8;white-space:nowrap}}
  .pill strong{{color:#cbd5e1}}
    .methodology{{margin-top:24px;padding:18px 20px;border:1px solid #334155;
      border-radius:12px;background:rgba(255,255,255,.04);max-width:1200px}}
    .methodology h2{{margin:0 0 10px;color:#f8fafc;font-size:1.02rem}}
    .methodology p{{margin:8px 0 0;color:#cbd5e1;line-height:1.55}}
    .methodology strong{{color:#f8fafc}}
</style>
</head>
<body>
<h1>Local AI Hardware Heatmap</h1>
<p>Green = best &nbsp;|&nbsp; Red = worst &nbsp;|&nbsp; OKLCH gradient per column &nbsp;|&nbsp; Click any header to sort</p>
<div class="wrap"><table id="T">
<thead><tr>{headers_html}</tr></thead>
<tbody>
{rows_html}</tbody>
</table></div>

<div class="methodology">
  <h2>Methodology</h2>
  <p><strong>Pricing normalization:</strong> The {COST_KEY.lower()} column is normalized to complete local-build acquisition cost, not raw add-in card MSRP. Discrete workstation GPUs were converted to system pricing with a fixed ${WORKSTATION_HOST_ALLOWANCE:,} host allowance, while passive datacenter accelerators use a ${SERVER_HOST_ALLOWANCE:,} server-platform allowance.</p>
  <p><strong>Vendor-sourced fields:</strong> VRAM, memory bandwidth, and board power use vendor-published specs where available, including AMD product pages for W7800, W7900, and MI210, NVIDIA Quadro RTX 8000 quick specs, and AMD's Radeon Pro Duo launch material.</p>
  <p><strong>Estimated fields:</strong> LLM throughput and tokens-per-dollar values are model-side inference estimates based on memory capacity, memory bandwidth, architecture class, and software maturity rather than direct apples-to-apples benchmark runs on identical hosts.</p>
</div>

<div class="footer">
  <span class="pill"><strong>Prepared for</strong> Dan Micsa, PhD</span>
  <span class="pill"><strong>Processed by</strong> GPT-5.4</span>
  <span class="pill"><strong>Generated</strong> {generated_label}</span>
  <span class="pill"><strong>Data</strong> Mixed vendor specs and model-side estimates; pricing normalized to full-system cost</span>
</div>

<script>
// ── Palette (matches Standard.js / RG palette exactly) ──────────────────────
const RG_PALETTE = ["oklch(0.75 0.2 25)", 16643811, "oklch(0.75 0.2 143)"];

function parseOKLCH(s) {{
  const m = s.match(/oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)/);
  if (!m) return null;
  return oklchToRgb(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]) * Math.PI / 180);
}}

function oklchToRgb(L, C, h) {{
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774*a + 0.2158037573*b;
  const m_ = L - 0.1055613458*a - 0.0638541728*b;
  const s_ = L - 0.0894841775*a - 1.2914855480*b;
  const ll = l_*l_*l_, mm = m_*m_*m_, ss = s_*s_*s_;
  const r  =  4.0767416621*ll - 3.3077115913*mm + 0.2309699292*ss;
  const g  = -1.2684380046*ll + 2.6097574011*mm - 0.3413193965*ss;
  const bl = -0.0041960863*ll - 0.7034186147*mm + 1.7076147010*ss;
  const toS = c => c <= 0.0031308 ? 12.92*c : 1.055*Math.pow(Math.max(c,0), 1/2.4) - 0.055;
  return [Math.round(Math.min(255,Math.max(0,toS(r)*255))),
          Math.round(Math.min(255,Math.max(0,toS(g)*255))),
          Math.round(Math.min(255,Math.max(0,toS(bl)*255)))];
}}

function rgbToOKLCH(r, g, b) {{
  const lin = c => c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
  r = lin(r/255); g = lin(g/255); b = lin(b/255);
  const l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b;
  const m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b;
  const s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L  = 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_;
  const a  = 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_;
  const bv = 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_;
  return {{L, C: Math.sqrt(a*a+bv*bv), h: Math.atan2(bv, a)}};
}}

function toArr(c) {{
  if (Array.isArray(c)) return c;
  if (typeof c === 'string' && c.startsWith('oklch')) return parseOKLCH(c);
  return [(c>>16)&0xFF, (c>>8)&0xFF, c&0xFF];
}}

function getPaletteColor(value, minVal, maxVal, reverse=false) {{
  if (value === null || isNaN(value)) return 'transparent';
  let t = maxVal !== minVal ? (value - minVal) / (maxVal - minVal) : 0;
  t = Math.max(0, Math.min(1, t));
  if (reverse) t = 1 - t;
  const seg = RG_PALETTE.length - 1;
  const st  = t * seg;
  const idx = Math.min(Math.floor(st), seg - 1);
  const frac = st - idx;
  const o1 = rgbToOKLCH(...toArr(RG_PALETTE[idx]));
  const o2 = rgbToOKLCH(...toArr(RG_PALETTE[idx+1]));
  let dh = o2.h - o1.h;
  if (dh >  Math.PI) dh -= 2*Math.PI;
  if (dh < -Math.PI) dh += 2*Math.PI;
  const [r,g,b] = oklchToRgb(
    o1.L + (o2.L - o1.L)*frac,
    o1.C + (o2.C - o1.C)*frac,
    o1.h + dh*frac
  );
  return `rgb(${{r}},${{g}},${{b}})`;
}}

// ── Apply colors ─────────────────────────────────────────────────────────────
function applyColors() {{
  const tb  = document.getElementById("T");
  const ths = tb.querySelectorAll("thead th");
  const rows = [...tb.tBodies[0].rows];

  ths.forEach((th, ci) => {{
    if (ci === 0) return;  // skip System col
    const lo  = parseFloat(th.dataset.min);
    const hi  = parseFloat(th.dataset.max);
    const inv = th.dataset.inv === "1";
    rows.forEach(row => {{
      const td  = row.cells[ci];
      if (!td) return;
      const v = parseFloat(td.dataset.val);
      td.style.background = getPaletteColor(v, lo, hi, inv);
      td.style.color = "#0f172a";
      td.style.fontWeight = "600";
      td.style.textShadow = "0 1px 0 rgba(255,255,255,.35)";
    }});
  }});
}}

// ── Sorting ──────────────────────────────────────────────────────────────────
let sc=-1, sa=true;
function srt(ci) {{
  const tb = document.getElementById("T");
  const bd = tb.tBodies[0];
  const rs = [...bd.rows];
  sa = (sc === ci) ? !sa : true;
  sc = ci;

  document.querySelectorAll(".arr").forEach(a => a.className = "arr");
  const arr = document.getElementById("arr" + ci);
  if (arr) arr.className = "arr " + (sa ? "asc" : "desc");

  rs.sort((a, b) => {{
    if (ci === 0) {{
      const va = a.cells[0].innerText.trim();
      const vb = b.cells[0].innerText.trim();
      return sa ? va.localeCompare(vb) : vb.localeCompare(va);
    }}
    const va = parseFloat(a.cells[ci].dataset.val);
    const vb = parseFloat(b.cells[ci].dataset.val);
    return sa ? va - vb : vb - va;
  }});

  rs.forEach(r => bd.appendChild(r));
  applyColors();  // reapply after sort
}}

applyColors();
</script>
</body>
</html>"""

out = r"d:\My\Work\Reports\local_llm_builds.html"
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("Written:", out)

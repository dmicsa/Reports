"""
Generates LocalLLM.html — LLM hardware heatmap.
Systems = rows, Metrics = columns. Columns are sortable.
Colors are applied in-browser via the Standard.js palette (getPaletteColor).
Output: d:\\My\\Work\\Reports\\LocalLLM.html
"""

from datetime import date
from typing import cast

MetricValue = int | float
NumericColumn = list[int] | list[float]
DataColumn = str | list[str | int | float]

COST_KEY = "System Cost (k$)"
WORKSTATION_HOST_ALLOWANCE = 1600
SERVER_HOST_ALLOWANCE = 3000
BUDGET_CAP = 20000

data: dict[str, DataColumn] = {
    "Systems": [
        "Mac Studio M5 Ultra 96GB",
        "Mac Studio M5 Ultra 256GB",
        "Mac Studio M5 Max 128GB",
        "Mac Studio M3 Ultra 96GB",
        "Mac Studio M4 Max 128GB",
        "Mac Mini Pro",
        "Dual RTX 4090",
        "Triple RTX 3090",
        "Quad 4060 Ti 16GB",
        "Dual RTX 3090",
        "Single RTX 5090",
        "Dual RTX 5090",
        "Ryzen AI Max+ 395",
        "Single RTX 4090",
        "Tiiny AI Pocket Lab",
        "NVIDIA DGX Spark",
        "Quadro RTX 8000 48GB",
        "RTX PRO 6000 Blackwell 96GB",
        "AMD Radeon Pro W7900",
        "AMD Instinct MI210 64GB",
        "AMD Radeon Pro W7800",
        "AMD Radeon Pro Duo 32GB",
    ],
    COST_KEY: [
        5499,
        5499 + 4000,
        3999,
        5299,
        3499,
        1999,
        4800 + 1600,
        3900 + 1600,
        449 * 4 + WORKSTATION_HOST_ALLOWANCE,
        1300 * 2 + WORKSTATION_HOST_ALLOWANCE,
        5000 + WORKSTATION_HOST_ALLOWANCE,
        10000 + WORKSTATION_HOST_ALLOWANCE,
        3649,
        2400 + WORKSTATION_HOST_ALLOWANCE,
        1999,
        4699,
        10000 + WORKSTATION_HOST_ALLOWANCE,
        12500 + WORKSTATION_HOST_ALLOWANCE,
        3500 + WORKSTATION_HOST_ALLOWANCE,
        4299 + SERVER_HOST_ALLOWANCE,
        3229 + WORKSTATION_HOST_ALLOWANCE,
        999 + WORKSTATION_HOST_ALLOWANCE,
    ],
    "Memory (GB)": [
        96,
        256,
        128,
        96,
        128,
        64,
        48,
        72,
        64,
        48,
        32,
        64,
        128,
        24,
        80,
        128,
        48,
        96,
        48,
        64,
        32,
        32,
    ],
    "Bandwidth (GB/s)": [
        1200,
        1200,
        614,
        819,
        546,
        200,
        1008,
        936,
        288,
        936,
        1792,
        3584,
        270,
        1008,
        205,
        273,
        672,
        1790,
        864,
        1600,
        576,
        448,
    ],
    "Power (W)": [
        300,
        300,
        160,
        280,
        180,
        85,
        1200,
        1400,
        800,
        900,
        750,
        1350,
        120,
        750,
        65,
        170,
        260,
        800,
        295,
        300,
        260,
        250,
    ],
    "t/s (32B)": [44, 44, 35, 30, 20, 12, 65, 40, 18, 45, 55, 90, 15, 50, 14, 18, 28, 55, 31, 44, 22, 6],
    "t/s (70B)": [25, 25, 20, 17, 9, 4, 26, 20, 8, 18, 30, 33, 5, 4, 6, 5, 11, 32, 12.5, 21, 4, 1],
    "t/s (104B)": [
        16,
        16,
        7,
        11,
        6,
        2,
        1.5,
        12,
        4,
        1.5,
        1.5,
        8,
        3.5,
        1,
        4.5,
        3.5,
        1.8,
        10,
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
    numeric_values = cast(list, values)
    if len(numeric_values) != row_count:
        raise ValueError(
            f"Column '{key}' has {len(numeric_values)} values, expected {row_count}"
        )

for cost in cast(list[int], data[COST_KEY]):
    if cost > BUDGET_CAP:
        raise ValueError(f"System cost ${cost:,} exceeds the ${BUDGET_CAP:,} budget cap")


def metric_column(key: str) -> list[int | float]:
    return cast(list[int | float], data[key])


data["t/kW (32B)"] = [
    round(t / p * 1000, 1)
    for t, p in zip(metric_column("t/s (32B)"), metric_column("Power (W)"))
]
data["t/k$ (32B)"] = [
    round((t / c) * 1000, 2)
    for t, c in zip(metric_column("t/s (32B)"), metric_column(COST_KEY))
]
data["t/kW (70B)"] = [
    round(t / p * 1000, 1)
    for t, p in zip(metric_column("t/s (70B)"), metric_column("Power (W)"))
]
data["t/k$ (70B)"] = [
    round((t / c) * 1000, 2)
    for t, c in zip(metric_column("t/s (70B)"), metric_column(COST_KEY))
]
data["t/kW (104B)"] = [
    round(t / p * 1000, 1)
    for t, p in zip(metric_column("t/s (104B)"), metric_column("Power (W)"))
]
data["t/k$ (104B)"] = [
    round((t / c) * 1000, 2)
    for t, c in zip(metric_column("t/s (104B)"), metric_column(COST_KEY))
]

LOWER_IS_BETTER = {COST_KEY, "Power (W)"}

COLUMN_RANGE_OVERRIDES: dict[str, dict[str, MetricValue]] = {
    COST_KEY: {"min": 1.5, "max": BUDGET_CAP / 1000},
    "Bandwidth (GB/s)": {"max": 3584},
    "t/s (32B)": {"max": 90},
    "t/s (70B)": {"max": 33},
}

metrics = [
    k
    for k in [
        COST_KEY,
        "Memory (GB)",
        "Bandwidth (GB/s)",
        "Power (W)",
        "t/s (32B)",
        "t/k$ (32B)",
        "t/kW (32B)",
        "t/s (70B)",
        "t/k$ (70B)",
        "t/kW (70B)",
        "t/s (104B)",
        "t/k$ (104B)",
        "t/kW (104B)",
    ]
    if k in data
]


def fmt(key: str, val: MetricValue) -> str:
    if key == COST_KEY:
        return f"{val / 1000:.1f}"
    if key.startswith("t/k$"):
        return f"{val:.2f}"
    if key.startswith("t/kW"):
        return f"{val:.1f}"
    if key in {"Bandwidth (GB/s)", "Power (W)"}:
        return f"{int(val):,}"
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

THEME_OPTIONS = [
    ("solarized-light", "Solarized Light (default)", True),
    ("dark", "Dark", False),
    ("kiwi-dark", "Kiwi Dark", False),
    ("kiwi-light", "Kiwi Light", False),
    ("light", "Light", False),
    ("mint-haze", "Mint Haze", False),
    ("mint-haze-dark", "Mint Haze Dark", False),
    ("oil", "Oil", False),
    ("petal-blush", "Petal Blush", False),
    ("petal-blush-dark", "Petal Blush Dark", False),
    ("rose-linen", "Rose Linen", False),
    ("rose-linen-dark", "Rose Linen Dark", False),
    ("rust-brown", "Rust Brown", False),
    ("sage-sea", "Sage Sea", False),
    ("sage-sea-dark", "Sage Sea Dark", False),
    ("warm-sand", "Warm Sand", False),
    ("warm-sand-dark", "Warm Sand Dark", False),
]

theme_options_html = "\n".join(
    f'      <option value="{value}"{" selected" if selected else ""}>{label}</option>'
    for value, label, selected in THEME_OPTIONS
)

headers_html = '<th class="col-ix" onclick="setSortArrow(0)">System</th>'
for i, m in enumerate(metrics):
    gsep = " col-gsep" if m.startswith("t/s (") else ""
    headers_html += (
        f'<th class="col-num{gsep}" onclick="setSortArrow({i + 1})">{m}</th>'
    )

rows_html = ""
for i, sys_name in enumerate(systems):
    cells = ""
    for m in metrics:
        val = metric_column(m)[i]
        data_val = round(val / 1000, 2) if m == COST_KEY else val
        gsep = " col-gsep" if m.startswith("t/s (") else ""
        cells += (
            f'<td class="col-num{gsep}" data-field="{m}" data-val="{data_val}">'
            f"{fmt(m, val)}</td>"
        )
    rows_html += (
        f'<tr><td data-field="System" data-val="{sys_name}">{sys_name}</td>'
        f"{cells}</tr>\n"
    )

ranges_js = ",\n        ".join(
    f"'{m}': {{ min: {col_min[m]}, max: {col_max[m]}, reverse: {'true' if m in LOWER_IS_BETTER else 'false'} }}"
    for m in metrics
)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
\t<meta name="darkreader-lock">
  <title>Local LLM Hardware Heatmap</title>
  <link rel="stylesheet" href="https://dmicsa.github.io/HTMLAssets/Theme.css">
  <style>
    body {{ background-color: var(--bg-color); color: var(--fg-color); margin: 20px; transition: background-color 0.3s, color 0.3s; }}
    .report-header {{ display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }}
    .methodology {{ margin-top: 24px; padding: 18px 20px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-color); max-width: 1200px; }}
    .methodology h2 {{ margin: 0 0 10px; color: var(--fg-color); font-size: 1.02rem; }}
    .methodology p {{ margin: 8px 0 0; color: var(--fg-color); line-height: 1.55; }}
    .methodology strong {{ color: var(--fg-color); }}
    .card {{ overflow-x: auto; }}
    /* Numeric columns 2x wider (Theme.css pins .col-num at 80px) */
    #summaryTable td.col-num, #summaryTable th.col-num {{
      width: 160px !important;
      min-width: 160px !important;
      max-width: 160px !important;
    }}
    /* Thicker separator before each model group (32B / 70B / 104B) */
    #summaryTable td.col-gsep, #summaryTable th.col-gsep {{
      border-left: 3px solid var(--border-color) !important;
    }}
    /* First (System) column 4x base width (Theme.css pins .col-ix at 60px) */
    #summaryTable th.col-ix, #summaryTable td:first-child {{
      width: 320px !important;
      min-width: 320px !important;
      max-width: 320px !important;
      text-align: left !important;
    }}
  </style>
  <script src="https://dmicsa.github.io/HTMLAssets/Standard.js"></script>
  <script>
    let currentSortCol = -1;
    let currentSortAsc = true;

    function updateNumberFormat() {{
        const table = document.getElementById('summaryTable');
        if(!table) return;
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {{
            Array.from(row.children).forEach(cell => {{
                const f = cell.getAttribute('data-field');
                const val = parseFloat(cell.getAttribute('data-val'));
                if (isNaN(val)) return;
                if (f === '{COST_KEY}') {{
                    cell.textContent = val.toFixed(1);
                }} else if (f.startsWith('t/k$')) {{
                    cell.textContent = val.toFixed(2);
                }} else if (f.startsWith('t/kW')) {{
                    cell.textContent = val.toFixed(1);
                }} else if (f === 'Bandwidth (GB/s)' || f === 'Power (W)') {{
                    cell.textContent = val.toLocaleString('en-US');
                }} else {{
                    cell.textContent = String(val);
                }}
            }});
        }});
    }}

    function setSortArrow(colIndex) {{
      const table = document.getElementById('summaryTable');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      const ths = Array.from(table.querySelectorAll('thead th'));
      const trs = Array.from(tbody.querySelectorAll('tr'));
      if (currentSortCol === colIndex) {{
          currentSortAsc = !currentSortAsc;
      }} else {{
          currentSortCol = colIndex;
          currentSortAsc = true;
          if (colIndex > 0) currentSortAsc = false;
      }}
      ths.forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
      const th = ths[colIndex];
      if (th) th.classList.add(currentSortAsc ? 'sort-asc' : 'sort-desc');
      const ascMult = currentSortAsc ? 1 : -1;
      trs.sort((a, b) => {{
          let cellA = a.children[colIndex];
          let cellB = b.children[colIndex];
          if (!cellA || !cellB) return 0;
          let valA = cellA.getAttribute('data-val');
          if (!valA) valA = cellA.innerText.trim();
          let valB = cellB.getAttribute('data-val');
          if (!valB) valB = cellB.innerText.trim();
          let fA = parseFloat(valA);
          let fB = parseFloat(valB);
          if (!isNaN(fA) && !isNaN(fB)) return (fA - fB) * ascMult;
          return valA.localeCompare(valB) * ascMult;
      }});
      trs.forEach(tr => tbody.appendChild(tr));
      if (typeof updateTableColors === 'function') updateTableColors();
    }}

    const renderTable = updateTableColors;

    document.addEventListener('DOMContentLoaded', () => {{
       try {{ initStandard(); }} catch (e) {{}}
       setSortArrow(0);
       updateNumberFormat();
       try {{ refreshMetaChips(document); }} catch (e) {{}}
       updateTableColors();
    }});
  </script></head><body class="solarized-light">
  <div class="report-header">
    <h1>Local LLM Hardware Heatmap</h1>
  <div class="controls-group">
    <div class="palette-dropdown">
      <input type="checkbox" id="palette-toggle">
      <label for="palette-toggle" class="palette-button" id="palette-btn-label">
        <span id="current-palette-name">Loading...</span>
      </label>
      <div class="palette-menu" id="palette-menu"></div>
    </div>
    <select id="themeSelect" onchange="setTheme(this.value)" title="Select Theme">
{theme_options_html}
    </select>
  </div>  </div>
  <p style="color: var(--fg-color); margin-bottom: 20px;">Green = best &nbsp;|&nbsp; Red = worst &nbsp;|&nbsp; Per-column OKLCH palette gradient &nbsp;|&nbsp; Click any header to sort &nbsp;|&nbsp; Budget cap: $20,000</p>

  <div class="card">
  <table id="summaryTable" class="grid-table">
    <thead>
      <tr>{headers_html}</tr>
    </thead>
    <tbody>
{rows_html}</tbody>
  </table>
  </div>

  <div class="methodology">
    <h2>Methodology</h2>
    <p><strong>Budget cap:</strong> All systems are normalized to complete acquisition cost under a $20,000 ceiling (September 2026 pricing), shown in k$ (thousands USD). The {COST_KEY.lower()} column is normalized to full local-build/system cost, not raw add-in card MSRP. Discrete workstation GPUs were converted to system pricing with a fixed ${WORKSTATION_HOST_ALLOWANCE:,} host allowance, while passive datacenter accelerators use a ${SERVER_HOST_ALLOWANCE:,} server-platform allowance.</p>
    <p><strong>September 2026 market refresh (verified street/used pricing):</strong> RTX 5090 32GB new street ~$5,000 (Sep 1, 2026: cheapest US listings $4,930&ndash;$5,170, 2.5&times; the $1,999 MSRP amid the GDDR7 shortage; Tom's Hardware tracker low $4,799), so Single = $5,000 + $1,600 host = $6,600 and Dual = $10,000 + $1,600 = $11,600. Used RTX 4090 ~$2,400 (eBay sold-listing average $2,362 on Sep 5, 2026, range $2,000&ndash;$2,541). Used RTX 3090 ~$1,300 (Aug 2026 eBay median $1,275, up ~50% since January on local-AI demand). RTX 4060 Ti 16GB new ~$449. AMD Radeon PRO W7900 ~$3,500 (Sep 2026 lowest-average $3,157); W7800 ~$3,229; used MI210 ~$4,299 + $3,000 server platform. Strix Halo 128GB boxes (Ryzen AI Max+ 395, GMKtec EVO-X2) ~$3,649 &mdash; DRAM shortage roughly doubled 128GB mini-PC prices since launch. Apple announced the Mac Studio M5 Max ($2,499 base; 128GB config ~$3,999) and M5 Ultra ($5,499 base with 96GB, +$4,000 for 256GB; 1.2 TB/s bandwidth, shipping Sept 22) on Aug 25, 2026, discontinuing the M4 Max and M3 Ultra; the M5 Ultra 512GB (late October, expected well above $10k) is not yet priced. M5 Max/M5 Ultra throughput is estimated from the 614 GB/s / 1.2 TB/s bandwidth (M5 Max: ~110 t/s 8B, ~20 t/s 70B; M5 Ultra: ~90 t/s 8B at Q4). RTX PRO 6000 Blackwell Workstation 96GB card ~$12,500 (NVIDIA marketplace $13,250 after the Aug 13 raise toward $16,000; street spans $10,499 B&H to $16,999 Newegg, used $9,500&ndash;$11,000), so system = $12,500 + $1,600 = $14,100. NVIDIA DGX Spark $4,699. Quadro RTX 8000 48GB reflects new-old-stock pricing.</p>
    <p><strong>Vendor-sourced fields:</strong> VRAM, memory bandwidth, and board power use vendor-published specs where available: RTX 5090 (32GB, 1,792 GB/s, 575W), RTX PRO 6000 Blackwell (96GB ECC GDDR7, 1,790 GB/s, 600W), Mac Studio M3 Ultra (96GB unified, 819 GB/s), and AMD product pages for W7800, W7900, and MI210.</p>
    <p><strong>Estimated fields:</strong> LLM throughput and ratio values are model-side inference estimates (Q4_K_M llama.cpp class) based on memory capacity, memory bandwidth, architecture class, and software maturity &mdash; anchored to community 2026 benchmarks (RTX 5090: ~145 t/s 8B, ~55 t/s 32B, ~38 t/s 70B tight-fit; Dual RTX 5090: ~33 t/s 70B Q4 tensor-parallel; RTX PRO 6000: ~32 t/s 70B, 96GB holds 120B-class) rather than direct apples-to-apples runs on identical hosts. The 70B figure on the Single RTX 5090 reflects a near-full 32GB fit with minimal context headroom.</p>
    <p><strong>Ratio columns (grouped at the end):</strong> The nine t/* columns are the cross product of the three reference models {{32B, 70B, 104B}} and the three units {{t/s, t/k$, t/kW}}. t/s = raw throughput; t/k$ = t/s per $1,000 of system cost; t/kW = t/s per kilowatt of total system power.</p>
  </div>

  <div class="footer">
    <p>Local LLM Hardware Heatmap v2.0.0 &copy; 2026 Dan Micsa, PhD (dmicsa@gmail.com)</p>
    <p>Data vintage: {generated_label} &middot; Generated on {today.isoformat()}</p>
  </div>

<script>
const COLUMN_RANGES = {{
        {ranges_js}
    }};

    function updateTableColors() {{
    const table = document.getElementById('summaryTable');
    if (!table) return;
    if (typeof getPaletteColor !== 'function' || typeof applyBackgroundWithContrast !== 'function') return;
    const cells = table.querySelectorAll('tbody td[data-field][data-val]');
    cells.forEach(cell => {{
        const field = cell.getAttribute('data-field');
        const rawVal = parseFloat(cell.getAttribute('data-val'));
        const range = COLUMN_RANGES[field];
        if (!field || Number.isNaN(rawVal) || !range) return;
        const rgb = getPaletteColor(rawVal, range.min, range.max, range.reverse);
        applyBackgroundWithContrast(cell, rgb);
    }});
}}

(function() {{
    const previousSetPalette = window.setPalette;
    if (typeof previousSetPalette === 'function') {{
        window.setPalette = function(name) {{
            previousSetPalette(name);
            updateTableColors();
        }};
    }}

    const previousRenderTable = window.renderTable;
    window.renderTable = function() {{
        if (typeof previousRenderTable === 'function') {{
            previousRenderTable();
        }}
        updateTableColors();
    }};
}})();
</script>
</body>
</html>"""

out = r"d:\My\Work\Reports\LocalLLM.html"
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("Written:", out)

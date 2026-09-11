"""
Generates funds_performance.html — mutual funds table in the team standard HTML format.

Data (as of run date):
  - 10Y AR / SD / 10Y SR computed live from 10y monthly NAV history (yfinance,
    dividend-adjusted close), Sharpe uses 13-week T-bill (^IRX) as risk-free rate.
  - Morningstar overall rating via yfinance .info.

Output: D:\\My\\Work\\Reports\\funds_performance.html
Run:    D:\\My\\Work\\Reports\\.venv\\Scripts\\python.exe gen_funds_report.py
"""

import datetime
import math
import concurrent.futures

import pandas as pd
import yfinance as yf

FUNDS = [
    ("SSSYX", "State Street Equity 500 Index K"),
    ("FSPSX", "Fidelity International Index"),
    ("SSFEX", "State Street Aggregate Bond Index K"),
    ("FSMDX", "FIDELITY MID CAP INDEX"),
    ("DFSTX", "DFA US Small Cap I"),
    ("DFREX", "DFA Real Estate Securities I"),
    ("AVUVX", "Avantis U.S. Small Cap Value Instl"),
    ("BKGPX", "BlackRock 60/40 Target Allocation K"),
    ("DSCGX", "DFA US Small Cap Growth Instl"),
    ("FIMVX", "Fidelity Mid Cap Value Index"),
    ("FIPDX", "Fidelity Inflation-Protected Bond Index Fund"),
    ("FMDGX", "FIDELITY MID CAP GROWTH INDEX"),
    ("GOIXX", "Federated Hermes Govt Obl IS"),
    ("HFARX", "Janus Henderson Developed World Bond N"),
    ("MGRDX", "MFS International Growth R6"),
    ("MIGNX", "MFS Massachusetts Inv Gr Stk R6"),
    ("PEQSX", "Putnam Large Cap Value R6"),
    ("PIMIX", "PIMCO Income Fund"),
    ("PTRQX", "PGIM Total Return Bond R6"),
    ("RGNGX", "American Funds Growth and Inc Port R6"),
    ("RINGX", "American Funds Cnsrv Gr & Inc R-6"),
    ("RNWGX", "American Funds New World R6"),
    ("SSBSX", "State Street Target Retirement 2025 K"),
    ("SSBYX", "State Street Target Retirement 2030 K"),
    ("SSCKX", "State Street Target Retirement 2035 K"),
    ("SSCQX", "State Street Target Retirement 2040 K"),
    ("SSDEX", "State Street Target Retirement 2045 K"),
    ("SSDLX", "State Street Target Retirement 2050 K"),
    ("SSDQX", "State Street Target Retirement 2055 K"),
    ("SSDYX", "State Street Target Retirement 2060 K"),
    ("SSFKX", "State Street Target Retirement 2065 K"),
    ("SSFOX", "State Street Target Retirement K"),
]

RF_FALLBACK = 0.04  # annualized, used if ^IRX data is unavailable

THEMES = [
    "solarized-light", "dark", "kiwi-dark", "kiwi-light", "light",
    "mint-haze", "mint-haze-dark", "oil", "petal-blush", "petal-blush-dark",
    "rose-linen", "rose-linen-dark", "rust-brown", "sage-sea", "sage-sea-dark",
    "warm-sand", "warm-sand-dark",
]

TOOL = "Funds Performance Report Generator v1.1.0"


def title_case(theme):
    return " ".join(w.capitalize() for w in theme.split("-"))


def risk_free_monthly():
    try:
        irx = yf.Ticker("^IRX").history(period="10y", interval="1mo")["Close"].dropna()
        return {idx.tz_localize(None).to_period("M"): float(v) / 100.0 / 12.0 for idx, v in irx.items()}
    except Exception:
        return {}


def get_rating(ticker):
    try:
        val = yf.Ticker(ticker).info.get("morningStarOverallRating")
        return ticker, int(val) if val else None
    except Exception:
        return ticker, None


def fund_stats(ticker):
    px = yf.Ticker(ticker).history(period="10y", interval="1mo")["Close"].dropna()
    rets = px.pct_change().dropna()
    sd = float(rets.std(ddof=1) * math.sqrt(12))
    years = (px.index[-1] - px.index[0]).days / 365.25
    ar = (float(px.iloc[-1]) / float(px.iloc[0])) ** (1.0 / years) - 1.0
    months = rets.index.tz_localize(None).to_period("M")
    rf = pd.Series([RF_MAP.get(m, RF_FALLBACK / 12.0) for m in months], index=rets.index)
    ex = rets - rf
    denom = float(ex.std(ddof=1) * math.sqrt(12))
    sr = (float(ex.mean()) * 12.0) / denom if denom > 0 else float("nan")
    if sd < 0.005:  # money-market-like: SR undefined
        sr = float("nan")
    return ticker, ar, sd, sr


print(f"Computing 10Y AR/SD/SR and Morningstar ratings for {len(FUNDS)} funds…")
RF_MAP = risk_free_monthly()

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    stats = {r[0]: r[1:] for r in ex.map(lambda f: fund_stats(f[0]), FUNDS)}
    ratings = dict(ex.map(lambda t: get_rating(t[0]), FUNDS))


def num(v, nd):
    return "" if v is None or (isinstance(v, float) and math.isnan(v)) else f"{v:.{nd}f}"


def rating_cell(ticker):
    r = ratings.get(ticker)
    if r is None:
        return "<td class='col-num' data-field=\"Rating\" data-val=\"\">-</td>"
    stars = "★" * r + "☆" * (5 - r)
    return (f"<td class='col-num' data-field=\"Rating\" data-val=\"{r}\" "
            f"title='{stars}'>{r}</td>")


rows = []
for ix, (t, name) in enumerate(FUNDS, 1):
    ar, sd, sr = stats[t]
    rows.append(
        f"<tr><td class=\"col-ix\" data-field=\"Ix\" data-val=\"{ix}\">{ix}</td>"
        f"<td class=\"col-ticker\" data-field=\"Ticker\" data-val=\"{t}\">{t}</td>"
        f"<td class=\"col-name\" data-field=\"Name\" data-val=\"{name}\">{name}</td>"
        f"<td class=\"col-num\" data-field=\"10Y AR\" data-val=\"{num(ar, 4)}\">{num(ar, 4)}</td>"
        f"<td class=\"col-num\" data-field=\"SD\" data-val=\"{num(sd, 4)}\">{num(sd, 4)}</td>"
        f"<td class=\"col-num\" data-field=\"10Y SR\" data-val=\"{num(sr, 4)}\">{num(sr, 4)}</td>"
        f"{rating_cell(t)}</tr>"
    )
rows_html = "\n".join(rows)

theme_options = "\n".join(
    f"      <option value=\"{th}\"{' selected' if th == 'solarized-light' else ''}>{title_case(th)}</option>"
    for th in THEMES
)

now = datetime.datetime.now()
generated = f"Generated on {now:%Y-%m-%d} at {now:%H:%M:%S}"

head = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
\t<meta name="darkreader-lock">
  <title>Mutual Funds Performance</title>
  <link rel="stylesheet" href="https://dmicsa.github.io/HTMLAssets/Theme.css">
  <style>
    body { background-color: var(--bg-color); color: var(--fg-color); margin: 20px; transition: background-color 0.3s, color 0.3s; }
    /* Controls handled by report-header in Theme.css */
    .report-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    /* Numeric columns 50% wider (Theme.css pins .col-num at 80px) */
    .grid-table td.col-num, .grid-table th.col-num {
      width: 120px !important;
      min-width: 120px !important;
      max-width: 120px !important;
    }
  </style>
  <script src="https://dmicsa.github.io/HTMLAssets/Standard.js"></script>
"""

body = """  <script>
    // --- Local State ---
    let usePercent = false;
    let currentSortCol = -1;
    let currentSortAsc = true;

    // --- Helpers ---
    function togglePercent() {
      usePercent = !usePercent;
      const btn = document.getElementById('percentToggle');
      if(btn) btn.classList.toggle('active', usePercent);
      try { localStorage.setItem('ms_percent', usePercent); } catch(e){}
      updateNumberFormat();
    }

    function updateNumberFormat() {
        const table = document.getElementById('summaryTable');
        if(!table) return;

\t\t// Fields that can be toggled to %
\t\tconst pctFields = ['10Y AR', 'SD'];
\t\tconst srFields = ['10Y SR'];

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            Array.from(row.children).forEach(cell => {
                const f = cell.getAttribute('data-field');
\t\t\t\tconst val = parseFloat(cell.getAttribute('data-val'));
\t\t\t\tif (isNaN(val)) return;

\t\t\t\tif (pctFields.includes(f)) {
\t\t\t\t\tcell.textContent = usePercent
\t\t\t\t\t\t? (val * 100).toFixed(1) + '%'
\t\t\t\t\t\t: val.toFixed(2);
\t\t\t\t} else if (srFields.includes(f)) {
\t\t\t\t\tcell.textContent = val.toFixed(2);
                }
            });
        });
    }

    function setSortArrow(colIndex) {
      const table = document.getElementById('summaryTable');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      const ths = Array.from(table.querySelectorAll('thead th'));
      const trs = Array.from(tbody.querySelectorAll('tr'));

      if (currentSortCol === colIndex) {
          currentSortAsc = !currentSortAsc;
      } else {
          currentSortCol = colIndex;
          currentSortAsc = true;
\t\t  if (colIndex > 4) currentSortAsc = false;
      }

      ths.forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
      const th = ths[colIndex];
      if (th) th.classList.add(currentSortAsc ? 'sort-asc' : 'sort-desc');

      const ascMult = currentSortAsc ? 1 : -1;

      trs.sort((a, b) => {
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
      });

      trs.forEach(tr => tbody.appendChild(tr));
      if (typeof updateTableColors === 'function') updateTableColors();
    }



    const renderTable = updateTableColors;

    document.addEventListener('DOMContentLoaded', () => {
       initStandard();
       setSortArrow(0);
       try {
          // If stored percent preference is true, toggle it ON (which runs updateNumberFormat)
          if(localStorage.getItem('ms_percent') === 'true') togglePercent();
          // Otherwise, run updateNumberFormat explicitly to ensure default 2-decimal formatting
          else updateNumberFormat();
       } catch(e) {
          updateNumberFormat();
       }
\t\t refreshMetaChips(document);
       updateTableColors();
    });
  </script></head><body class="solarized-light">
  <div class="report-header">
    <h1>10-Year Mutual Fund Performance</h1>
  <div class="controls-group">
    <button id="percentToggle" class="btn btn-sm" onclick="togglePercent()" title="Toggle percentage display">%</button>
    <div class="palette-dropdown">
      <input type="checkbox" id="palette-toggle">
      <label for="palette-toggle" class="palette-button" id="palette-btn-label">
        <span id="current-palette-name">Loading...</span>
      </label>
      <div class="palette-menu" id="palette-menu"></div>
    </div>
    <select id="themeSelect" onchange="setTheme(this.value)" title="Select Theme">
__THEME_OPTIONS__
    </select>
  </div>  </div>

  <div class="card">
  <table id="summaryTable" class="grid-table">
    <thead>
      <tr><th class="col-ix" onclick="setSortArrow(0)">Ix</th><th class="col-ticker sort-asc" onclick="setSortArrow(1)">Ticker</th><th class="col-name" onclick="setSortArrow(2)">Name</th><th class="col-num" onclick="setSortArrow(3)">10Y AR</th><th class="col-num" onclick="setSortArrow(4)">SD</th><th class="col-num" onclick="setSortArrow(5)">10Y SR</th><th class="col-num" onclick="setSortArrow(6)">Rating</th></tr>
    </thead>
    <tbody>
__ROWS__
</tbody>
  </table>
  </div>
  <div class="footer">
  <p>__TOOL__ &copy; 2026 Dan Micsa, PhD (dmicsa@gmail.com)</p>
  <p>__GENERATED__</p>
</div>

<script>
function updateTableColors() {
    const table = document.getElementById('summaryTable');
    if (!table) return;

    const cells = table.querySelectorAll('tbody td[data-field][data-val]');
    cells.forEach(cell => {
        const field = cell.getAttribute('data-field');
        const rawVal = parseFloat(cell.getAttribute('data-val'));
        if (!field || Number.isNaN(rawVal)) return;

        let min = 0.0;
        let max = 1.0;
        let reverse = false;
        let colorValue = rawVal;
        let usePalette = false;

        if (field.includes('AR')) {
            usePalette = true;
            colorValue = Math.max(0.1, Math.min(0.3, rawVal));
            min = 0.1;
            max = 0.3;
        } else if (field === 'MaxDD') {
            usePalette = true;
            colorValue = Math.max(0.1, Math.min(0.3, Math.abs(rawVal)));
            min = 0.1;
            max = 0.3;
            reverse = true;
        } else if (field === 'Win ratio') {
            usePalette = true;
            colorValue = rawVal;
            min = 0.3;
            max = 0.7;
        } else if (field === 'SD') {
            usePalette = true;
            colorValue = Math.max(0.1, Math.min(0.3, rawVal));
            min = 0.1;
            max = 0.3;
            reverse = true;
        } else if (field === 'LS SR' || field === '10Y SR') {
            usePalette = true;
            colorValue = rawVal;
            min = 1.0;
            max = 2.0;
        } else if (field === 'Quality') {
            usePalette = true;
            colorValue = Math.max(0.0, Math.min(1.0, rawVal));
            min = 0.0;
            max = 1.0;
        } else if (field === 'Signals Used') {
            usePalette = true;
            colorValue = Math.max(6.0, Math.min(30.0, rawVal));
            min = 6.0;
            max = 30.0;
        }

        if (usePalette) {
            const rgb = getPaletteColor(colorValue, min, max, reverse);
            applyBackgroundWithContrast(cell, rgb);
        }
    });
}

(function() {
    const previousSetPalette = window.setPalette;
    if (typeof previousSetPalette === 'function') {
        window.setPalette = function(name) {
            previousSetPalette(name);
            updateTableColors();
        };
    }

    const previousRenderTable = window.renderTable;
    window.renderTable = function() {
        if (typeof previousRenderTable === 'function') {
            previousRenderTable();
        }
        updateTableColors();
    };
})();
</script>
</body>
</html>"""

html = head + body.replace("__THEME_OPTIONS__", theme_options) \
                  .replace("__ROWS__", rows_html) \
                  .replace("__TOOL__", TOOL) \
                  .replace("__GENERATED__", generated)

out = r"D:\My\Work\Reports\funds_performance.html"
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("Written:", out)

"""
Generates funds_performance.html — mutual funds table with live Morningstar ratings via yfinance.
Output: d:\\My\\Work\\Reports\\funds_performance.html
Run:    python gen_funds_report.py
"""

import re
import concurrent.futures
import yfinance as yf

FUNDS = [
    ("SSSYX", "State Street Equity 500 Index K",              "15.46%", "0.85"),
    ("FSPSX", "Fidelity International Index",                 "9.02%",  "0.55"),
    ("SSFEX", "State Street Aggregate Bond Index K",          "2.54%",  "0.49"),
    ("FSMDX", "FIDELITY MID CAP INDEX",                       "11.94%", "0.62"),
    ("DFSTX", "DFA US Small Cap I",                           "12.74%", "0.57"),
    ("DFREX", "DFA Real Estate Securities I",                 "5.93%",  "0.29"),
    ("AVUVX", "Avantis U.S. Small Cap Value Instl",           "18.79%", "0.64"),
    ("BKGPX", "BlackRock 60/40 Target Allocation K",          "11.22%", "0.96"),
    ("DSCGX", "DFA US Small Cap Growth Instl",                "12.22%", "0.55"),
    ("FIMVX", "Fidelity Mid Cap Value Index",                 "11.21%", "0.51"),
    ("FIPDX", "Fidelity Inflation-Protected Bond Index Fund", "3.33%",  "0.61"),
    ("FMDGX", "FIDELITY MID CAP GROWTH INDEX",                "10.60%", "0.43"),
    ("GOIXX", "Federated Hermes Govt Obl IS",                 "0.00%",  "0.00"),
    ("HFARX", "Janus Henderson Developed World Bond N",       "2.42%",  "0.51"),
    ("MGRDX", "MFS International Growth R6",                  "12.19%", "0.78"),
    ("MIGNX", "MFS Massachusetts Inv Gr Stk R6",              "21.76%", "1.11"),
    ("PEQSX", "Putnam Large Cap Value R6",                    "18.25%", "1.03"),
    ("PIMIX", "PIMCO Income Fund",                            "4.83%",  "1.15"),
    ("PTRQX", "PGIM Total Return Bond R6",                    "3.15%",  "0.59"),
    ("RGNGX", "American Funds Growth and Inc Port R6",        "13.76%", "1.02"),
    ("RINGX", "American Funds Cnsrv Gr & Inc R-6",            "8.73%",  "1.03"),
    ("RNWGX", "American Funds New World R6",                  "12.12%", "0.74"),
    ("SSBSX", "State Street Target Retirement 2025 K",        "10.74%", "0.99"),
    ("SSBYX", "State Street Target Retirement 2030 K",        "11.71%", "0.96"),
    ("SSCKX", "State Street Target Retirement 2035 K",        "12.17%", "0.93"),
    ("SSCQX", "State Street Target Retirement 2040 K",        "12.75%", "0.91"),
    ("SSDEX", "State Street Target Retirement 2045 K",        "12.97%", "0.88"),
    ("SSDLX", "State Street Target Retirement 2050 K",        "13.19%", "0.87"),
    ("SSDQX", "State Street Target Retirement 2055 K",        "12.82%", "0.84"),
    ("SSDYX", "State Street Target Retirement 2060 K",        "12.46%", "0.84"),
    ("SSFKX", "State Street Target Retirement 2065 K",        "15.13%", "1.03"),
    ("SSFOX", "State Street Target Retirement K",             "7.27%",  "0.97"),
]

GOOD_AR  = {t for t,_,ar,_ in FUNDS if float(ar.strip('%')) >= 15}
GOOD_SR  = {t for t,_,_,sr in FUNDS if float(sr) >= 1.0}

def get_rating(ticker):
    try:
        val = yf.Ticker(ticker).info.get("morningStarOverallRating")
        return ticker, int(val) if val else None
    except Exception:
        return ticker, None

print("Fetching Morningstar ratings…")
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
    ratings = dict(ex.map(lambda t: get_rating(t[0]), FUNDS))

def rating_cell(ticker):
    r = ratings.get(ticker)
    if r is None:
        return "<td class='numeric'>-</td>"
    stars = "★" * r + "☆" * (5 - r)
    return f"<td class='numeric rating-{r}' title='{stars}'>{r}</td>"

rows = "\n".join(
    f"<tr>"
    f"<td>{t}</td>"
    f"<td>{name}</td>"
    f"<td class='numeric{' good-val' if t in GOOD_AR else ''}'>{ar}</td>"
    f"<td class='numeric{' good-val' if t in GOOD_SR else ''}'>{sr}</td>"
    f"{rating_cell(t)}"
    f"</tr>"
    for t, name, ar, sr in FUNDS
)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Mutual Funds Performance</title>
<style>
  body{{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;margin:40px;background:#f8fafc;color:#1e293b}}
  h1{{color:#0f172a;margin-bottom:20px}}
  .wrap{{background:#fff;border-radius:8px;box-shadow:0 4px 6px -1px rgb(0 0 0/.1);overflow:hidden}}
  table{{width:100%;border-collapse:collapse;text-align:left}}
  th,td{{padding:12px 16px;border-bottom:1px solid #e2e8f0}}
  th{{background:#f1f5f9;font-weight:600;cursor:pointer;user-select:none;white-space:nowrap}}
  th:hover{{background:#e2e8f0}}
  th::after{{content:'\\21D5';margin-left:8px;font-size:.8em;color:#94a3b8}}
  th.asc::after{{content:'\\2191';color:#3b82f6}}
  th.desc::after{{content:'\\2193';color:#3b82f6}}
  tr:last-child td{{border-bottom:none}}
  tr:hover td{{background:#f8fafc}}
  .numeric{{font-family:Consolas,monospace;text-align:right}}
  th.numeric{{text-align:right}}
  .good-val{{color:#16a34a;font-weight:500}}
  .rating-5{{color:#16a34a;font-weight:600}}
  .rating-4{{color:#2563eb;font-weight:600}}
  .rating-3{{color:#ca8a04;font-weight:600}}
  .rating-2{{color:#ea580c;font-weight:600}}
  .rating-1{{color:#dc2626;font-weight:600}}
</style>
</head>
<body>
<h1>10-Year Mutual Fund Performance</h1>
<div class="wrap"><table id="T">
<thead><tr>
  <th onclick="srt(0,'s')">Ticker</th>
  <th onclick="srt(1,'s')">Fund Name</th>
  <th class="numeric" onclick="srt(2,'p')">10Y AR</th>
  <th class="numeric" onclick="srt(3,'n')">10Y SR</th>
  <th class="numeric" onclick="srt(4,'n')">Rating ★</th>
</tr></thead>
<tbody>
{rows}
</tbody>
</table></div>
<script>
let sc=-1,sa=true;
function srt(ci,tp){{
  const tb=document.getElementById("T"),bd=tb.tBodies[0],rs=[...bd.rows];
  const hs=tb.querySelectorAll("th");
  sa=(sc===ci)?!sa:(tp==='s');
  sc=ci;
  hs.forEach(h=>h.classList.remove("asc","desc"));
  hs[ci].classList.add(sa?"asc":"desc");
  rs.sort((a,b)=>{{
    let va=a.cells[ci].innerText.trim(),vb=b.cells[ci].innerText.trim();
    if(tp==='n'){{va=parseFloat(va)||0;vb=parseFloat(vb)||0;}}
    else if(tp==='p'){{va=parseFloat(va)||0;vb=parseFloat(vb)||0;}}
    return sa?(va<vb?-1:va>vb?1:0):(va>vb?-1:va<vb?1:0);
  }});
  rs.forEach(r=>bd.appendChild(r));
}}
srt(3,'n');
</script>
</body>
</html>"""

out = r"d:\My\Work\Reports\funds_performance.html"
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("Written:", out)

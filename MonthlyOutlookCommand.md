Update [MonthlyOutlook.tsv](d:/My/Work/Reports/MonthlyOutlook.tsv) using the current market outlook framework and all known sources already referenced in [MarketOutlook.html](d:/My/Work/Reports/MarketOutlook.html).

Rules for the update:

1. Use these source families explicitly when forming the view:
Goldman Sachs, JPMorgan, Morgan Stanley, BlackRock, Fidelity, Charles Schwab, Vanguard, State Street, CME FedWatch, Atlanta Fed GDPNow, OECD leading indicators.

2. Treat the TSV values as 1-month tactical conviction scores, not predicted returns.
The scale is from `-100%` to `100%`.

3. Keep the sheet historically realistic, not broadly optimistic.
Do not make almost everything positive.
Prefer a balanced distribution with a moderate positive bias only if the evidence clearly supports it.

4. Target calibration:
Average score should usually land around `+5%` to `+10%` unless there is a very strong macro reason to be more aggressive.
Include a meaningful number of negative values when risk assets are not universally attractive.

5. Keep the scores internally consistent with the current outlook logic:
US quality, regions, bonds, gold, silver, dollar, petrol, DBA, DBB, sectors, and real estate should align with the latest narrative in [MarketOutlook.html](d:/My/Work/Reports/MarketOutlook.html).

6. Be careful with proxies and ETF mapping:
`SPY`, `DIA`, `QQQ`, `IWM` map to US equity style views.
`EWJ`, `IEFA`, `EEMS`, `IEMG`, `EWW`, `INDA`, `EPP`, `ILF`, `VNM` map to regional views.
`TIP`, `TLT`, `LQD`, `HYG`, `EMB` map to rates and credit.
`EUO`, `FXY`, `FXA`, `FXB`, `FXE`, `FXF` map to currency views.
`UNG`, `DBA`, `DBB`, `DBO`, `DBC`, `PALL`, `PPLT`, `SLV`, `GLD`, `SIL`, `GDX` map to commodity and precious-metals views.
`XLP`, `XLK`, `XLI`, `XLB`, `XLY`, `XLE`, `XLU`, `XLV`, `XLF`, `XHB`, `ITB`, `IBB`, `AMLP`, `VNQ` map to sectors and thematic equity exposures.

7. Hard constraints:
Every line must remain TSV in the format `TICKER<TAB>SCORE%`.
No duplicate tickers unless the source file already requires them.
No values outside `-100%` to `100%`.

8. After updating the file:
Copy the full TSV content of [MonthlyOutlook.tsv](d:/My/Work/Reports/MonthlyOutlook.tsv) to the clipboard.

9. In the response, also report:
The mean, median, count of positive values, and count of negative values.

10. If the resulting sheet looks too optimistic on breadth, revise it once before finishing.

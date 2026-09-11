param(
  [string]$ReportPath = (Join-Path $PSScriptRoot 'MarketOutlook.html'),
  [string]$ApiKey = $env:MARKET_OUTLOOK_API_KEY,
  [string]$ApiUrl = $env:MARKET_OUTLOOK_API_URL,
  [string]$Model = $env:MARKET_OUTLOOK_MODEL,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'

function Get-EnvValue {
  param(
    [string[]]$Names
  )

  foreach ($name in $Names) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value
    }
  }

  return $null
}

function Resolve-ApiUrl {
  param(
    [string]$ConfiguredUrl
  )

  if (-not [string]::IsNullOrWhiteSpace($ConfiguredUrl)) {
    return $ConfiguredUrl
  }

  $baseUrl = Get-EnvValue -Names @('OPENAI_BASE_URL')
  if (-not [string]::IsNullOrWhiteSpace($baseUrl)) {
    $trimmed = $baseUrl.TrimEnd('/')
    if ($trimmed -match '/(chat/completions|responses)$') {
      return $trimmed
    }

    return "$trimmed/responses"
  }

  return 'https://api.openai.com/v1/responses'
}

function Set-ReportDates {
  param(
    [string]$Html,
    [string]$FullDate,
    [string]$MonthDate
  )

  $updated = [regex]::Replace(
    $Html,
    '<title>.*?</title>',
    "<title>1Month Market Outlook from $FullDate</title>",
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )

  $updated = [regex]::Replace(
    $updated,
    '<h1>.*?</h1>',
    "<h1>1Month Market Outlook from $FullDate</h1>",
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )

  $updated = [regex]::Replace(
    $updated,
    '<div class="method-pill">As of .*?</div>',
    "<div class=`"method-pill`">As of $MonthDate</div>",
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )

  return $updated
}

function Extract-MessageText {
  param(
    $MessageContent
  )

  if ($MessageContent -is [string]) {
    return $MessageContent
  }

  if ($MessageContent -is [System.Collections.IEnumerable]) {
    $parts = foreach ($item in $MessageContent) {
      if ($null -ne $item.text) {
        $item.text
      }
    }
    return ($parts -join "`n")
  }

  return [string]$MessageContent
}

function Extract-ResponsesText {
  param(
    $ResponseObject
  )

  if ($null -ne $ResponseObject.output_text -and -not [string]::IsNullOrWhiteSpace([string]$ResponseObject.output_text)) {
    return [string]$ResponseObject.output_text
  }

  $parts = New-Object System.Collections.Generic.List[string]

  if ($null -ne $ResponseObject.output) {
    foreach ($entry in $ResponseObject.output) {
      if ($entry.type -eq 'message' -and $null -ne $entry.content) {
        foreach ($part in $entry.content) {
          if ($part.type -eq 'output_text' -and -not [string]::IsNullOrWhiteSpace($part.text)) {
            $parts.Add($part.text)
          }
        }
      }
    }
  }

  return ($parts -join "`n")
}

if (-not (Test-Path -LiteralPath $ReportPath)) {
  throw "Report file not found: $ReportPath"
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = Get-EnvValue -Names @('OPENAI_API_KEY')
}

if ([string]::IsNullOrWhiteSpace($Model)) {
  $Model = Get-EnvValue -Names @('OPENAI_MODEL')
}

if ([string]::IsNullOrWhiteSpace($Model)) {
  $Model = 'gpt-5.4'
}

$ApiUrl = Resolve-ApiUrl -ConfiguredUrl $ApiUrl

$reportDate = Get-Date
$fullDate = $reportDate.ToString('MMMM d, yyyy', [System.Globalization.CultureInfo]::InvariantCulture)
$monthDate = $reportDate.ToString('MMMM yyyy', [System.Globalization.CultureInfo]::InvariantCulture)

if ($ValidateOnly) {
  Write-Host "Validation OK"
  Write-Host "Report path: $ReportPath"
  Write-Host "API URL: $ApiUrl"
  Write-Host "Model: $Model"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw @"
Missing API key.

Set one of these environment variables before running the batch file:
  MARKET_OUTLOOK_API_KEY
  OPENAI_API_KEY

Optional:
  MARKET_OUTLOOK_API_URL or OPENAI_BASE_URL
  MARKET_OUTLOOK_MODEL or OPENAI_MODEL
"@
}

$currentHtml = Get-Content -LiteralPath $ReportPath -Raw

$systemPrompt = @"
You are an expert macro and markets analyst plus front-end report generator.
Rewrite the provided HTML market outlook so it reflects the latest available market view for the current date.

Rules:
- Return only a complete HTML document. No markdown fences, no explanation.
- Preserve the team's standard report format exactly; do not redesign it:
  * Head must contain: <meta charset="UTF-8">, <meta name="darkreader-lock">, the Theme.css link
    https://dmicsa.github.io/HTMLAssets/Theme.css, the small inline style block (body uses var(--bg-color)/var(--fg-color),
    .report-header flex), and the script https://dmicsa.github.io/HTMLAssets/Standard.js followed by the standard JS block
    (togglePercent, updateNumberFormat, setSortArrow, sortState, sortTable, DOMContentLoaded init with initStandard(),
    localStorage ms_percent handling, refreshMetaChips, updateTableColors).
  * <body class="solarized-light"> with a .report-header containing the h1 and a .controls-group holding the palette
    dropdown and the theme <select> with exactly these 17 options (in this order): solarized-light (selected), dark,
    kiwi-dark, kiwi-light, light, mint-haze, mint-haze-dark, oil, petal-blush, petal-blush-dark, rose-linen,
    rose-linen-dark, rust-brown, sage-sea, sage-sea-dark, warm-sand, warm-sand-dark. Labels are the title-cased names.
  * All content sits in .card wrappers; data tables use class "grid-table" with thead th onclick="sortTable('<tableId>', n)",
    numeric cells carrying data-field and data-val so columns sort, and custom col-label/col-txt/col-range/col-desc
    column classes from the inline style for narrative columns.
  * Keep the SVG sector bar chart, KPI metric cards, scenario/trigger cards, bullet panels, and the tooltip; all colors
    must come from CSS variables (var(--bg-color), var(--fg-color), var(--table-bg), var(--border-color), var(--hover-bg),
    var(--highlight-color)) or the data-driven hsla score scale - never hardcoded theme colors. Do not add Google Fonts.
  * Footer: report name + version, (c) Dan Micsa, PhD (dmicsa@gmail.com), and "Generated on <date> at <time>".
- Preserve the JS data arrays const sectorData, const regionData, const assetData, and const sourceData with the same
  item shapes and the same sector/region/asset names (ticker scoring depends on them).
- Keep the report tactical for a 1-month horizon.
- Refresh the market data, scores, ranges, scenarios, tables, and explanatory text.
- Keep and update the cross-asset section for Gold, Silver, US Dollar Index, US Treasuries, Petrol, DBA, and DBB.
- Keep the quantified source matrix and update the commentary so it matches the refreshed outlook.
- If the model or endpoint does not have true live browsing, still produce the best available updated report using the freshest accessible knowledge and keep the tone conservative rather than over-precise.
- Maintain valid HTML, CSS, and JavaScript in a single file.
"@

$userPrompt = @"
Current date: $fullDate
As-of month label: $monthDate

Regenerate this report with updated market outlook data and refreshed commentary while preserving the single-file HTML format:

$currentHtml
"@

$headers = @{
  Authorization = "Bearer $ApiKey"
}

Write-Host "Calling AI model '$Model' via $ApiUrl ..."
$usingResponsesApi = $ApiUrl.TrimEnd('/').EndsWith('/responses')

if ($usingResponsesApi) {
  $body = @{
    model = $Model
    temperature = 0.3
    max_output_tokens = 16000
    tools = @(
      @{ type = 'web_search_preview' }
    )
    input = @(
      @{
        role = 'system'
        content = @(
          @{ type = 'input_text'; text = $systemPrompt }
        )
      },
      @{
        role = 'user'
        content = @(
          @{ type = 'input_text'; text = $userPrompt }
        )
      }
    )
  } | ConvertTo-Json -Depth 12

  $response = Invoke-RestMethod -Method Post -Uri $ApiUrl -Headers $headers -Body $body -ContentType 'application/json'
  $rawContent = Extract-ResponsesText -ResponseObject $response
} else {
  $body = @{
    model = $Model
    temperature = 0.3
    max_tokens = 16000
    messages = @(
      @{ role = 'system'; content = $systemPrompt },
      @{ role = 'user'; content = $userPrompt }
    )
  } | ConvertTo-Json -Depth 10

  $response = Invoke-RestMethod -Method Post -Uri $ApiUrl -Headers $headers -Body $body -ContentType 'application/json'

  if ($null -eq $response.choices -or $response.choices.Count -eq 0) {
    throw 'AI endpoint returned no choices.'
  }

  $rawContent = Extract-MessageText -MessageContent $response.choices[0].message.content
}

if ([string]::IsNullOrWhiteSpace($rawContent)) {
  throw 'AI endpoint returned an empty completion.'
}

$match = [regex]::Match($rawContent, '```(?:html)?\s*([\s\S]*?)\s*```')
$generatedHtml = if ($match.Success) { $match.Groups[1].Value } else { $rawContent }
$generatedHtml = $generatedHtml.Trim()

if ($generatedHtml -notmatch '<html' -or $generatedHtml -notmatch '</html>') {
  throw 'AI output does not look like a complete HTML document.'
}

$generatedHtml = Set-ReportDates -Html $generatedHtml -FullDate $fullDate -MonthDate $monthDate

$backupPath = Join-Path (Split-Path -Parent $ReportPath) ("MarketOutlook.backup.{0}.html" -f $reportDate.ToString('yyyyMMdd-HHmmss'))
Copy-Item -LiteralPath $ReportPath -Destination $backupPath -Force
Set-Content -LiteralPath $ReportPath -Value $generatedHtml -Encoding UTF8

Write-Host "AI regeneration complete."
Write-Host "Updated report: $ReportPath"
Write-Host "Backup saved:   $backupPath"
Write-Host "Title date:     $fullDate"
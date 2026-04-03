const vscode = require('vscode');
const fs = require('fs/promises');
const path = require('path');

let runPromise;

function activate(context) {
  const output = vscode.window.createOutputChannel('Market Outlook Automation');

  const command = vscode.commands.registerCommand('marketOutlook.updateViaCopilot', async () => {
    await runUpdate(context, output, { automated: false });
  });

  context.subscriptions.push(command, output);

  const shouldAutorun = process.env.MARKET_OUTLOOK_AUTORUN === '1'
    || vscode.workspace.getConfiguration('marketOutlook').get('autoRunOnStartup', false);

  if (shouldAutorun && !runPromise) {
    runPromise = runUpdate(context, output, { automated: true }).finally(() => {
      runPromise = undefined;
    });
  }
}

exports.activate = activate;

function deactivate() {
  return undefined;
}

exports.deactivate = deactivate;

async function runUpdate(context, output, options) {
  output.appendLine(`[${new Date().toISOString()}] Starting market outlook refresh`);

  try {
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
      throw new Error('Open the Reports workspace before running the market outlook automation.');
    }

    const reportPath = resolveReportPath(workspaceFolder.fsPath);
    const currentHtml = await fs.readFile(reportPath, 'utf8');
    const reportDate = new Date();
    const fullDate = formatDate(reportDate, 'long');
    const monthDate = formatDate(reportDate, 'month');

    const model = await selectCopilotModel();
    output.appendLine(`[${new Date().toISOString()}] Using model: ${model.vendor}/${model.family || 'default'}`);

    const prompt = buildPrompt({ currentHtml, fullDate, monthDate });
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const cancellation = new vscode.CancellationTokenSource();

    const response = await model.sendRequest(messages, {}, cancellation.token);
    let generatedHtml = '';
    for await (const chunk of response.text) {
      generatedHtml += chunk;
    }

    generatedHtml = stripMarkdownFence(generatedHtml).trim();
    if (!generatedHtml.includes('<html') || !generatedHtml.includes('</html>')) {
      throw new Error('Copilot returned content that is not a complete HTML document.');
    }

    generatedHtml = setReportDates(generatedHtml, fullDate, monthDate);

    const backupPath = path.join(path.dirname(reportPath), `MarketOutlook.backup.${timestamp(reportDate)}.html`);
    await fs.copyFile(reportPath, backupPath);
    await fs.writeFile(reportPath, generatedHtml, 'utf8');

    output.appendLine(`[${new Date().toISOString()}] Updated report: ${reportPath}`);
    output.appendLine(`[${new Date().toISOString()}] Backup saved: ${backupPath}`);

    if (!options.automated) {
      vscode.window.showInformationMessage(`Market outlook updated: ${path.basename(reportPath)}`);
    }

    const shouldExit = process.env.MARKET_OUTLOOK_EXIT_ON_COMPLETE === '1'
      || vscode.workspace.getConfiguration('marketOutlook').get('exitAfterAutomation', false);

    if (options.automated && shouldExit) {
      output.appendLine(`[${new Date().toISOString()}] Automation complete, exiting VS Code`);
      await vscode.commands.executeCommand('workbench.action.quit');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[${new Date().toISOString()}] Refresh failed: ${message}`);
    if (!options.automated) {
      vscode.window.showErrorMessage(`Market outlook refresh failed: ${message}`);
    }

    const shouldExit = process.env.MARKET_OUTLOOK_EXIT_ON_COMPLETE === '1'
      || vscode.workspace.getConfiguration('marketOutlook').get('exitAfterAutomation', false);
    if (options.automated && shouldExit) {
      await vscode.commands.executeCommand('workbench.action.quit');
    }
  }
}

function getWorkspaceFolder() {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return undefined;
  }

  return vscode.workspace.workspaceFolders[0];
}

function resolveReportPath(workspaceRoot) {
  const configured = vscode.workspace.getConfiguration('marketOutlook').get('reportPath', 'MarketOutlook.html');
  if (path.isAbsolute(configured)) {
    return configured;
  }

  return path.join(workspaceRoot, configured);
}

async function selectCopilotModel() {
  const preferredFamilies = [undefined, 'gpt-4o'];

  for (const family of preferredFamilies) {
    const selector = family ? { vendor: 'copilot', family } : { vendor: 'copilot' };
    const models = await vscode.lm.selectChatModels(selector);
    if (models.length > 0) {
      return models[0];
    }
  }

  throw new Error('No Copilot chat model is available. Check that GitHub Copilot Chat is installed, signed in, and enabled for language model access.');
}

function buildPrompt({ currentHtml, fullDate, monthDate }) {
  return [
    'You are an expert macro and markets analyst plus front-end report generator.',
    'Rewrite the provided HTML market outlook so it reflects the latest available market view for the current date.',
    'Return only a complete HTML document. No markdown fences, no commentary.',
    'Preserve the overall visual design and structure unless a small change materially improves clarity.',
    'Keep the report tactical for a 1-month horizon.',
    'Refresh the market data, sector scores, regional scores, cross-asset scores, scenarios, and source matrix commentary.',
    'Keep and update the cross-asset section for Gold, Silver, US Dollar Index, US Treasuries, Petrol, DBA, and DBB.',
    'Use conservative ranges if knowledge is uncertain. Avoid fake precision.',
    `Current date: ${fullDate}`,
    `As-of month label: ${monthDate}`,
    'Current HTML follows:',
    currentHtml
  ].join('\n\n');
}

function stripMarkdownFence(text) {
  const match = text.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
  return match ? match[1] : text;
}

function setReportDates(html, fullDate, monthDate) {
  let updated = html.replace(/<title>.*?<\/title>/is, `<title>1Month Market Outlook from ${fullDate}</title>`);
  updated = updated.replace(/<h1>.*?<\/h1>/is, `<h1>1Month Market Outlook from ${fullDate}</h1>`);
  updated = updated.replace(/<div class="method-pill">As of .*?<\/div>/is, `<div class="method-pill">As of ${monthDate}</div>`);
  return updated;
}

function formatDate(date, kind) {
  const options = kind === 'month'
    ? { month: 'long', year: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

function timestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}
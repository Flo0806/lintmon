import * as vscode from 'vscode';
import { DiagnosticsTreeProvider } from './providers/treeViewProvider';

/**
 * Extension activation entry point
 * Called when VS Code activates the extension
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('LintMon extension is now active');

  // Create the tree view provider
  const treeProvider = new DiagnosticsTreeProvider(context);

  // Register the tree view
  const treeView = vscode.window.createTreeView('lintmon.diagnosticsView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  // Set tree view reference for badge updates
  treeProvider.setTreeView(treeView);

  // Register commands
  const refreshCommand = vscode.commands.registerCommand('lintmon.refresh', () => {
    treeProvider.refreshImmediate(); // Manual refresh = immediate, no debounce
  });

  const nextDiagnosticCommand = vscode.commands.registerCommand('lintmon.nextDiagnostic', () => {
    treeProvider.navigateToNext();
  });

  const previousDiagnosticCommand = vscode.commands.registerCommand('lintmon.previousDiagnostic', () => {
    treeProvider.navigateToPrevious();
  });

  const quickFixCommand = vscode.commands.registerCommand('lintmon.quickFix', (item) => {
    treeProvider.applyQuickFix(item);
  });

  // Watch for configuration changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('lintmon')) {
      treeProvider.refresh();
    }
  });

  // Watch for file saves if enabled
  const fileSaveWatcher = vscode.workspace.onDidSaveTextDocument(() => {
    const config = vscode.workspace.getConfiguration('lintmon');
    if (config.get<boolean>('refreshOnSave', true)) {
      treeProvider.refresh();
    }
  });

  // Watch for diagnostics changes
  const diagnosticsWatcher = vscode.languages.onDidChangeDiagnostics(() => {
    treeProvider.refresh();
  });

  // Add to subscriptions for cleanup
  context.subscriptions.push(
    treeView,
    refreshCommand,
    nextDiagnosticCommand,
    previousDiagnosticCommand,
    quickFixCommand,
    configWatcher,
    fileSaveWatcher,
    diagnosticsWatcher
  );

  // Initial refresh
  treeProvider.refresh();
}

/**
 * Extension deactivation
 * Called when VS Code deactivates the extension
 */
export function deactivate(): void {
  console.log('LintMon extension is now deactivated');
}

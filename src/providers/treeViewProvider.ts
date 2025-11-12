import * as vscode from 'vscode';
import { DiagnosticItem, GroupMode } from '../types';
import { DiagnosticsProvider } from './diagnosticsProvider';

/**
 * Tree data provider for the diagnostics view
 */
export class DiagnosticsTreeProvider implements vscode.TreeDataProvider<DiagnosticItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DiagnosticItem | undefined | null> = new vscode.EventEmitter<DiagnosticItem | undefined | null>();
  readonly onDidChangeTreeData: vscode.Event<DiagnosticItem | undefined | null> = this._onDidChangeTreeData.event;

  private diagnosticsProvider: DiagnosticsProvider;
  private currentIndex = 0;
  private flatDiagnosticsList: DiagnosticItem[] = [];
  private isRefreshing = false;
  private refreshTimeout?: NodeJS.Timeout;
  private pendingRefresh = false; // Flag: refresh requested during scan
  private isPaused = false; // Flag: scanning is paused

  constructor(
    private context: vscode.ExtensionContext,
    private treeView?: vscode.TreeView<DiagnosticItem>
  ) {
    this.diagnosticsProvider = new DiagnosticsProvider();
  }

  /**
   * Set the tree view reference (needed for badge updates)
   */
  setTreeView(treeView: vscode.TreeView<DiagnosticItem>): void {
    this.treeView = treeView;
  }

  /**
   * Refresh the tree view (debounced)
   */
  refresh(): void {
    // Don't refresh if paused
    if (this.isPaused) {
      return;
    }

    // If already refreshing, mark as pending and return
    if (this.isRefreshing) {
      this.pendingRefresh = true;
      return;
    }

    // Debounce: If called multiple times quickly, only refresh once
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    this.refreshTimeout = setTimeout(async () => {
      // Also scan and update badge in background, even if view not visible
      await this.refreshBadgeInBackground();
      this._onDidChangeTreeData.fire(undefined);
    }, 500); // 500ms debounce
  }

  /**
   * Force immediate refresh (for manual refresh button)
   */
  refreshImmediate(): void {
    // Don't refresh if paused
    if (this.isPaused) {
      return;
    }

    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    // If already refreshing, mark as pending
    if (this.isRefreshing) {
      this.pendingRefresh = true;
      return;
    }

    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Toggle pause/resume scanning
   */
  togglePause(): void {
    this.isPaused = !this.isPaused;

    if (this.isPaused) {
      // Paused - show message
      if (this.treeView) {
        this.treeView.message = '$(debug-pause) Scanning paused';
        this.treeView.badge = {
          tooltip: 'Scanning paused',
          value: 0,
        };
      }
      vscode.window.showInformationMessage('LintMon: Scanning paused');
    } else {
      // Resumed - clear message and refresh
      if (this.treeView) {
        this.treeView.message = undefined;
      }
      vscode.window.showInformationMessage('LintMon: Scanning resumed');
      this.refreshImmediate();
    }

    // Update command icon
    vscode.commands.executeCommand('setContext', 'lintmon.isPaused', this.isPaused);
  }

  /**
   * Check if scanning is paused
   */
  isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Update the badge count in the Activity Bar
   */
  private updateBadge(): void {
    if (!this.treeView) {
      return;
    }

    const errorCount = this.flatDiagnosticsList.filter(
      item => item.severity === vscode.DiagnosticSeverity.Error
    ).length;

    if (errorCount > 0) {
      this.treeView.badge = {
        tooltip: `${errorCount} error${errorCount !== 1 ? 's' : ''}`,
        value: errorCount,
      };
    } else {
      this.treeView.badge = undefined;
    }
  }

  /**
   * Show scanning state in badge (no number, just tooltip)
   */
  private showScanningBadge(): void {
    if (!this.treeView) {
      return;
    }

    // Show empty badge with "Scanning..." tooltip
    // Badge will be updated with actual count after scan
    this.treeView.badge = {
      tooltip: 'Scanning project...',
      value: 0, // 0 makes badge invisible but keeps tooltip
    };
  }

  /**
   * Refresh badge in background (even if view not visible)
   * This ensures badge updates when user is in another tab
   */
  private async refreshBadgeInBackground(): Promise<void> {
    if (!this.treeView || this.isRefreshing) {
      return;
    }

    try {
      // Show scanning state
      this.showScanningBadge();

      // Quick scan just for error count
      const diagnosticItems = await this.diagnosticsProvider.getDiagnostics();
      this.flatDiagnosticsList = this.flattenDiagnostics(diagnosticItems);
      this.updateBadge();
    } catch (error) {
      console.error('Error updating badge:', error);
      // Clear scanning badge on error
      if (this.treeView) {
        this.treeView.badge = undefined;
      }
    }
  }

  /**
   * Get tree item for display
   */
  getTreeItem(element: DiagnosticItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      element.label,
      element.children && element.children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    // Set icon based on severity
    if (element.severity !== undefined) {
      switch (element.severity) {
        case vscode.DiagnosticSeverity.Error:
          treeItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
          break;
        case vscode.DiagnosticSeverity.Warning:
          treeItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
          break;
        case vscode.DiagnosticSeverity.Information:
          treeItem.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
          break;
        case vscode.DiagnosticSeverity.Hint:
          treeItem.iconPath = new vscode.ThemeIcon('lightbulb', new vscode.ThemeColor('editorHint.foreground'));
          break;
      }
    } else if (element.type === 'file') {
      treeItem.iconPath = vscode.ThemeIcon.File;
    } else if (element.type === 'errorType') {
      treeItem.iconPath = new vscode.ThemeIcon('symbol-event');
    }

    // Set command to open file on click
    if (element.diagnostic && element.uri) {
      treeItem.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [
          element.uri,
          {
            selection: new vscode.Range(
              element.diagnostic.range.start,
              element.diagnostic.range.end
            ),
          },
        ],
      };
    }

    // Add description with additional info
    if (element.type === 'diagnostic') {
      // For ESLint, just show the rule name (not "eslint: rule")
      // For TypeScript, show "ts [code]"
      if (element.code) {
        const source = element.source?.toLowerCase() || '';
        if (source.includes('eslint')) {
          // ESLint: Just show the rule name
          treeItem.description = String(element.code);
        } else {
          // TypeScript/others: Show source + code
          treeItem.description = element.source
            ? `${element.source} [${element.code}]`
            : `[${element.code}]`;
        }
      } else if (element.source) {
        treeItem.description = element.source;
      }
    }

    // Add tooltip
    if (element.diagnostic) {
      treeItem.tooltip = element.diagnostic.message;
    }

    return treeItem;
  }

  /**
   * Get children for tree item
   */
  async getChildren(element?: DiagnosticItem): Promise<DiagnosticItem[]> {
    if (!vscode.workspace.workspaceFolders) {
      return [];
    }

    if (element) {
      // Return children of the element
      return element.children || [];
    }

    // If paused, return empty or show paused message
    if (this.isPaused) {
      return [];
    }

    // Root level - get all diagnostics
    const config = vscode.workspace.getConfiguration('lintmon');
    const groupMode = config.get<GroupMode>('groupBy', 'both');

    // Show loading state
    this.isRefreshing = true;
    this.showScanningBadge(); // Show scanning badge
    if (this.treeView) {
      this.treeView.message = '$(sync~spin) Scanning project...';
    }

    try {
      const diagnosticItems = await this.diagnosticsProvider.getDiagnostics();

      // Update flat list for navigation
      this.flatDiagnosticsList = this.flattenDiagnostics(diagnosticItems);

      // Update badge after we have the flat list
      this.updateBadge();

      // Clear loading state
      if (this.treeView) {
        this.treeView.message = undefined;
      }

      // Group diagnostics based on mode
      return this.groupDiagnostics(diagnosticItems, groupMode);
    } catch (error) {
      console.error('Error getting diagnostics:', error);
      if (this.treeView) {
        this.treeView.message = '$(error) Failed to scan project';
      }
      return [];
    } finally {
      this.isRefreshing = false;

      // If a refresh was requested during the scan, trigger it now
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        // Schedule refresh after a short delay to avoid immediate re-scan
        setTimeout(() => {
          this._onDidChangeTreeData.fire(undefined);
        }, 100);
      }
    }
  }

  /**
   * Navigate to the next diagnostic
   */
  navigateToNext(): void {
    if (this.flatDiagnosticsList.length === 0) {
      vscode.window.showInformationMessage('No diagnostics found');
      return;
    }

    this.currentIndex = (this.currentIndex + 1) % this.flatDiagnosticsList.length;
    this.openDiagnostic(this.flatDiagnosticsList[this.currentIndex]);
  }

  /**
   * Navigate to the previous diagnostic
   */
  navigateToPrevious(): void {
    if (this.flatDiagnosticsList.length === 0) {
      vscode.window.showInformationMessage('No diagnostics found');
      return;
    }

    this.currentIndex = (this.currentIndex - 1 + this.flatDiagnosticsList.length) % this.flatDiagnosticsList.length;
    this.openDiagnostic(this.flatDiagnosticsList[this.currentIndex]);
  }

  /**
   * Apply quick fix to a diagnostic
   */
  async applyQuickFix(item: DiagnosticItem): Promise<void> {
    if (!item.diagnostic || !item.uri) {
      return;
    }

    // Get code actions for this diagnostic
    const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      item.uri,
      item.diagnostic.range
    );

    if (!codeActions || codeActions.length === 0) {
      vscode.window.showInformationMessage('No quick fixes available for this diagnostic');
      return;
    }

    // Apply the first available fix
    const action = codeActions[0];
    if (action.edit) {
      await vscode.workspace.applyEdit(action.edit);
      vscode.window.showInformationMessage('Quick fix applied');
    } else if (action.command) {
      await vscode.commands.executeCommand(action.command.command, ...action.command.arguments || []);
    }
  }

  /**
   * Open a diagnostic in the editor
   */
  private openDiagnostic(item: DiagnosticItem): void {
    if (!item.diagnostic || !item.uri) {
      return;
    }

    vscode.window.showTextDocument(item.uri, {
      selection: new vscode.Range(
        item.diagnostic.range.start,
        item.diagnostic.range.end
      ),
    });
  }

  /**
   * Flatten diagnostics tree into a list for navigation
   */
  private flattenDiagnostics(items: DiagnosticItem[]): DiagnosticItem[] {
    const result: DiagnosticItem[] = [];

    const flatten = (items: DiagnosticItem[]) => {
      for (const item of items) {
        if (item.type === 'diagnostic') {
          result.push(item);
        }
        if (item.children) {
          flatten(item.children);
        }
      }
    };

    flatten(items);
    return result;
  }

  /**
   * Group diagnostics based on the selected mode
   */
  private groupDiagnostics(items: DiagnosticItem[], mode: GroupMode): DiagnosticItem[] {
    switch (mode) {
      case 'file':
        return this.groupByFile(items);
      case 'errorType':
        return this.groupByErrorType(items);
      case 'both':
        return this.groupByBoth(items);
      default:
        return items;
    }
  }

  /**
   * Group diagnostics by file
   */
  private groupByFile(items: DiagnosticItem[]): DiagnosticItem[] {
    const fileMap = new Map<string, DiagnosticItem>();

    for (const item of items) {
      if (item.type === 'diagnostic' && item.uri) {
        const filePath = item.uri.fsPath;
        if (!fileMap.has(filePath)) {
          fileMap.set(filePath, {
            type: 'file',
            label: vscode.workspace.asRelativePath(item.uri),
            uri: item.uri,
            children: [],
          });
        }
        fileMap.get(filePath)!.children!.push(item);
      }
    }

    return Array.from(fileMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Group diagnostics by error type
   */
  private groupByErrorType(items: DiagnosticItem[]): DiagnosticItem[] {
    const errorMap = new Map<string, DiagnosticItem>();

    for (const item of items) {
      if (item.type === 'diagnostic') {
        const key = `${item.source || 'unknown'}:${item.code || 'unknown'}`;
        if (!errorMap.has(key)) {
          errorMap.set(key, {
            type: 'errorType',
            label: item.code ? `${item.source}: ${item.code}` : item.source || 'Unknown',
            source: item.source,
            code: item.code,
            children: [],
          });
        }
        errorMap.get(key)!.children!.push(item);
      }
    }

    return Array.from(errorMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Group diagnostics by both file and error type
   */
  private groupByBoth(items: DiagnosticItem[]): DiagnosticItem[] {
    // First group by file
    const fileGroups = this.groupByFile(items);

    // Then within each file, group by error type
    for (const fileGroup of fileGroups) {
      if (fileGroup.children) {
        const errorGroups = this.groupByErrorType(fileGroup.children);
        fileGroup.children = errorGroups;
      }
    }

    return fileGroups;
  }
}

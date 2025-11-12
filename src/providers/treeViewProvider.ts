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

  constructor(private context: vscode.ExtensionContext) {
    this.diagnosticsProvider = new DiagnosticsProvider();
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
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
      const parts: string[] = [];
      if (element.source) {
        parts.push(element.source);
      }
      if (element.code) {
        parts.push(`[${element.code}]`);
      }
      if (parts.length > 0) {
        treeItem.description = parts.join(' ');
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

    // Root level - get all diagnostics
    const config = vscode.workspace.getConfiguration('lintmon');
    const groupMode = config.get<GroupMode>('groupBy', 'both');

    const diagnosticItems = await this.diagnosticsProvider.getDiagnostics();

    // Update flat list for navigation
    this.flatDiagnosticsList = this.flattenDiagnostics(diagnosticItems);

    // Group diagnostics based on mode
    return this.groupDiagnostics(diagnosticItems, groupMode);
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

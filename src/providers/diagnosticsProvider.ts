import * as vscode from 'vscode';
import { DiagnosticItem } from '../types';

/**
 * Provider for collecting diagnostics from the workspace
 */
export class DiagnosticsProvider {
  /**
   * Get all diagnostics from the workspace
   */
  async getDiagnostics(): Promise<DiagnosticItem[]> {
    const config = vscode.workspace.getConfiguration('lintmon');
    const showErrors = config.get<boolean>('showErrors', true);
    const showWarnings = config.get<boolean>('showWarnings', true);
    const enableTypeScript = config.get<boolean>('enableTypeScript', true);
    const enableESLint = config.get<boolean>('enableESLint', true);
    const fileTypes = config.get<string[]>('fileTypes', ['.ts', '.tsx', '.js', '.jsx', '.vue']);
    const excludePatterns = config.get<string[]>('excludePatterns', []);

    const items: DiagnosticItem[] = [];

    // Get all diagnostics from VS Code
    const allDiagnostics = vscode.languages.getDiagnostics();

    for (const [uri, diagnostics] of allDiagnostics) {
      // Check if file matches configured file types
      const fileName = uri.fsPath;
      const hasMatchingExtension = fileTypes.some(ext => fileName.endsWith(ext));
      if (!hasMatchingExtension) {
        continue;
      }

      // Check if file matches exclude patterns
      const relativePath = vscode.workspace.asRelativePath(uri);
      const isExcluded = excludePatterns.some(pattern => {
        // Simple glob pattern matching
        const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
        return regex.test(relativePath);
      });
      if (isExcluded) {
        continue;
      }

      for (const diagnostic of diagnostics) {
        // Filter by severity
        if (diagnostic.severity === vscode.DiagnosticSeverity.Error && !showErrors) {
          continue;
        }
        if (diagnostic.severity === vscode.DiagnosticSeverity.Warning && !showWarnings) {
          continue;
        }

        // Filter by source
        const source = diagnostic.source?.toLowerCase() || '';
        if (source.includes('ts') || source.includes('typescript')) {
          if (!enableTypeScript) {
            continue;
          }
        }
        if (source.includes('eslint')) {
          if (!enableESLint) {
            continue;
          }
        }

        // Create diagnostic item
        items.push({
          type: 'diagnostic',
          label: this.getDiagnosticLabel(diagnostic),
          diagnostic,
          uri,
          severity: diagnostic.severity,
          source: diagnostic.source,
          code: diagnostic.code as string | number | undefined,
        });
      }
    }

    return items;
  }

  /**
   * Create a display label for a diagnostic
   */
  private getDiagnosticLabel(diagnostic: vscode.Diagnostic): string {
    const line = diagnostic.range.start.line + 1;
    const col = diagnostic.range.start.character + 1;
    const message = diagnostic.message.split('\n')[0]; // First line only
    return `[${line}:${col}] ${message}`;
  }
}

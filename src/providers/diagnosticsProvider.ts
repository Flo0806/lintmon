import * as vscode from 'vscode';
import { DiagnosticItem } from '../types';
import { ConfigDetector } from '../utils/configDetector';
import { FrameworkDetector } from '../utils/frameworkDetector';
import { TypeScriptChecker } from '../utils/tsChecker';
import { ESLintChecker } from '../utils/eslintChecker';

/**
 * Provider for collecting diagnostics from the workspace
 */
export class DiagnosticsProvider {
  private configDetector?: ConfigDetector;
  private frameworkDetector?: FrameworkDetector;
  private tsChecker?: TypeScriptChecker;
  private eslintChecker?: ESLintChecker;
  private configsValidated = false;
  private tsConfigPath?: string;
  private eslintConfigPath?: string;

  /**
   * Get all diagnostics from the workspace
   */
  async getDiagnostics(): Promise<DiagnosticItem[]> {
    // Initialize detectors if workspace is available
    if (!this.configDetector && vscode.workspace.workspaceFolders) {
      const workspaceRoot = vscode.workspace.workspaceFolders[0].uri;
      this.configDetector = new ConfigDetector(workspaceRoot);
      this.frameworkDetector = new FrameworkDetector(workspaceRoot);
      this.tsChecker = new TypeScriptChecker(workspaceRoot);
      this.eslintChecker = new ESLintChecker(workspaceRoot);

      // Validate configs once on first run
      if (!this.configsValidated) {
        const configs = await this.configDetector.validateConfigs();
        this.tsConfigPath = configs.tsConfig;
        this.eslintConfigPath = configs.eslintConfig;
        this.configsValidated = true;

        // Log detected framework
        if (this.frameworkDetector) {
          const framework = await this.frameworkDetector.detectFramework();
          if (framework) {
            console.log(`LintMon: Detected framework: ${framework.name}`);
          }
        }
      }
    }

    const config = vscode.workspace.getConfiguration('lintmon');
    const showErrors = config.get<boolean>('showErrors', true);
    const showWarnings = config.get<boolean>('showWarnings', true);
    const enableTypeScript = config.get<boolean>('enableTypeScript', true);
    const enableESLint = config.get<boolean>('enableESLint', true);
    const fileTypes = config.get<string[]>('fileTypes', ['.ts', '.tsx', '.js', '.jsx', '.vue']);
    let excludePatterns = config.get<string[]>('excludePatterns', []);

    // Add framework-specific exclude patterns
    if (this.frameworkDetector) {
      const frameworkExcludes = await this.frameworkDetector.getFrameworkExcludePatterns();
      excludePatterns = [...excludePatterns, ...frameworkExcludes];
    }

    const items: DiagnosticItem[] = [];

    // Check scan mode setting
    const scanMode = config.get<string>('scanMode', 'full');
    const useFullProjectScan = scanMode === 'full';

    if (useFullProjectScan) {
      // Full project scan mode
      await this.collectFromFullProjectScan(items, showErrors, showWarnings, enableTypeScript, enableESLint, fileTypes, excludePatterns);
    } else {
      // Fallback: Use VS Code's diagnostics (only open files)
      await this.collectFromVSCodeDiagnostics(items, showErrors, showWarnings, enableTypeScript, enableESLint, fileTypes, excludePatterns);
    }

    return items;
  }

  /**
   * Collect diagnostics using full project scan (TypeScript + ESLint CLI)
   */
  private async collectFromFullProjectScan(
    items: DiagnosticItem[],
    showErrors: boolean,
    showWarnings: boolean,
    enableTypeScript: boolean,
    enableESLint: boolean,
    fileTypes: string[],
    excludePatterns: string[]
  ): Promise<void> {
    // Collect TypeScript diagnostics
    if (enableTypeScript && this.tsChecker && this.tsConfigPath) {
      try {
        console.log('LintMon: Starting TypeScript scan...');
        const tsDiagnostics = await this.tsChecker.getAllDiagnostics(this.tsConfigPath);
        console.log(`LintMon: Found ${tsDiagnostics.size} files with TS diagnostics`);

        for (const [filePath, diagnostics] of tsDiagnostics) {
          // Skip global diagnostics for now
          if (filePath === '__global__') {
            continue;
          }

          // Check file type
          const hasMatchingExtension = fileTypes.some(ext => filePath.endsWith(ext));
          if (!hasMatchingExtension) {
            continue;
          }

          // Check exclude patterns
          const relativePath = vscode.workspace.asRelativePath(filePath);
          const isExcluded = excludePatterns.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
            return regex.test(relativePath);
          });
          if (isExcluded) {
            continue;
          }

          const uri = vscode.Uri.file(filePath);
          console.log(`LintMon: Processing ${diagnostics.length} diagnostics for ${relativePath}`);

          for (const tsDiag of diagnostics) {
            const diagnostic = this.tsChecker.convertDiagnostic(tsDiag);
            if (!diagnostic) {
              console.warn(`LintMon: Failed to convert diagnostic in ${relativePath}`);
              continue;
            }

            // Filter by severity
            if (diagnostic.severity === vscode.DiagnosticSeverity.Error && !showErrors) {
              continue;
            }
            if (diagnostic.severity === vscode.DiagnosticSeverity.Warning && !showWarnings) {
              continue;
            }

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
        console.log(`LintMon: Added ${items.length} TS diagnostics to list`);
      } catch (error) {
        console.error('Error collecting TypeScript diagnostics:', error);
        vscode.window.showErrorMessage('LintMon: Failed to collect TypeScript diagnostics');
      }
    }

    // Collect ESLint diagnostics
    if (enableESLint && this.eslintChecker) {
      try {
        const eslintDiagnostics = await this.eslintChecker.getAllDiagnostics();

        for (const [filePath, diagnostics] of eslintDiagnostics) {
          // Check file type
          const hasMatchingExtension = fileTypes.some(ext => filePath.endsWith(ext));
          if (!hasMatchingExtension) {
            continue;
          }

          // Check exclude patterns
          const relativePath = vscode.workspace.asRelativePath(filePath);
          const isExcluded = excludePatterns.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
            return regex.test(relativePath);
          });
          if (isExcluded) {
            continue;
          }

          const uri = vscode.Uri.file(filePath);

          for (const diagnostic of diagnostics) {
            // Filter by severity
            if (diagnostic.severity === vscode.DiagnosticSeverity.Error && !showErrors) {
              continue;
            }
            if (diagnostic.severity === vscode.DiagnosticSeverity.Warning && !showWarnings) {
              continue;
            }

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
      } catch (error) {
        console.error('Error collecting ESLint diagnostics:', error);
        vscode.window.showErrorMessage('LintMon: Failed to collect ESLint diagnostics');
      }
    }
  }

  /**
   * Collect diagnostics from VS Code's built-in diagnostics (fallback mode)
   */
  private async collectFromVSCodeDiagnostics(
    items: DiagnosticItem[],
    showErrors: boolean,
    showWarnings: boolean,
    enableTypeScript: boolean,
    enableESLint: boolean,
    fileTypes: string[],
    excludePatterns: string[]
  ): Promise<void> {
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

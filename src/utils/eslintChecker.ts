import * as vscode from 'vscode';
import * as path from 'path';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

/**
 * ESLint checker that scans all files in the project
 */
export class ESLintChecker {
  private workspaceRoot: string;

  constructor(workspaceRoot: vscode.Uri) {
    this.workspaceRoot = workspaceRoot.fsPath;
  }

  /**
   * Get all ESLint diagnostics from the entire project
   */
  async getAllDiagnostics(): Promise<Map<string, vscode.Diagnostic[]>> {
    const diagnosticsMap = new Map<string, vscode.Diagnostic[]>();

    try {
      // Check if ESLint is available
      const hasLocalESLint = await this.hasLocalESLint();
      if (!hasLocalESLint) {
        console.log('ESLint not found in node_modules');
        return diagnosticsMap;
      }

      // Run ESLint with JSON output
      const eslintCmd = this.getESLintCommand();
      const { stdout } = await exec(eslintCmd, {
        cwd: this.workspaceRoot,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      });

      // Parse ESLint JSON output
      const results = JSON.parse(stdout);

      for (const result of results) {
        if (result.messages.length === 0) {
          continue;
        }

        const filePath = result.filePath;
        const diagnostics: vscode.Diagnostic[] = [];

        for (const message of result.messages) {
          const diagnostic = this.convertMessage(message);
          if (diagnostic) {
            diagnostics.push(diagnostic);
          }
        }

        if (diagnostics.length > 0) {
          diagnosticsMap.set(filePath, diagnostics);
        }
      }

    } catch (error: any) {
      // ESLint returns exit code 1 when there are linting errors
      // but still outputs valid JSON
      if (error.stdout) {
        try {
          const results = JSON.parse(error.stdout);
          for (const result of results) {
            if (result.messages.length === 0) {
              continue;
            }

            const filePath = result.filePath;
            const diagnostics: vscode.Diagnostic[] = [];

            for (const message of result.messages) {
              const diagnostic = this.convertMessage(message);
              if (diagnostic) {
                diagnostics.push(diagnostic);
              }
            }

            if (diagnostics.length > 0) {
              diagnosticsMap.set(filePath, diagnostics);
            }
          }
        } catch (parseError) {
          console.error('Error parsing ESLint output:', parseError);
        }
      } else {
        console.error('Error running ESLint:', error.message);
      }
    }

    return diagnosticsMap;
  }

  /**
   * Convert ESLint message to VS Code diagnostic
   */
  private convertMessage(message: any): vscode.Diagnostic | undefined {
    const line = (message.line || 1) - 1;
    const column = (message.column || 1) - 1;
    const endLine = (message.endLine || message.line || 1) - 1;
    const endColumn = (message.endColumn || message.column || 1) - 1;

    const range = new vscode.Range(
      new vscode.Position(line, column),
      new vscode.Position(endLine, endColumn)
    );

    let severity: vscode.DiagnosticSeverity;
    switch (message.severity) {
      case 2:
        severity = vscode.DiagnosticSeverity.Error;
        break;
      case 1:
        severity = vscode.DiagnosticSeverity.Warning;
        break;
      default:
        severity = vscode.DiagnosticSeverity.Information;
    }

    const diagnostic = new vscode.Diagnostic(range, message.message, severity);
    diagnostic.source = 'eslint';
    diagnostic.code = message.ruleId;

    return diagnostic;
  }

  /**
   * Get the ESLint command to run
   */
  private getESLintCommand(): string {
    const config = vscode.workspace.getConfiguration('lintmon');
    const fileTypes = config.get<string[]>('fileTypes', ['.ts', '.tsx', '.js', '.jsx', '.vue']);

    // Build file extensions for ESLint
    const extensions = fileTypes.map(ext => ext.replace('.', '')).join(',');

    // Use local ESLint from node_modules
    const eslintPath = path.join(this.workspaceRoot, 'node_modules', '.bin', 'eslint');

    return `"${eslintPath}" . --ext ${extensions} --format json --max-warnings=-1`;
  }

  /**
   * Check if ESLint is installed locally
   */
  private async hasLocalESLint(): Promise<boolean> {
    const eslintPath = path.join(this.workspaceRoot, 'node_modules', 'eslint');
    try {
      const fs = require('fs').promises;
      await fs.access(eslintPath);
      return true;
    } catch {
      return false;
    }
  }
}

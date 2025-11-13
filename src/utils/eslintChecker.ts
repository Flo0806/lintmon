import * as vscode from 'vscode';
import * as path from 'path';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

/**
 * ESLint message from JSON output
 */
interface ESLintMessage {
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity: number;
  message: string;
  ruleId?: string;
}

/**
 * ESLint result from JSON output
 */
interface ESLintResult {
  filePath: string;
  messages: ESLintMessage[];
}

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

      // Detect if using flat config
      const hasFlatConfig = await this.hasFlatConfig();

      // Run ESLint with JSON output
      const eslintCmd = await this.getESLintCommand(hasFlatConfig);
      const { stdout } = await exec(eslintCmd, {
        cwd: this.workspaceRoot,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      });

      // Parse ESLint JSON output
      const results = JSON.parse(stdout) as ESLintResult[];
      this.parseESLintResults(results, diagnosticsMap);

    } catch (error: unknown) {
      // ESLint returns exit code 1 when there are linting errors
      // but still outputs valid JSON
      if (this.isExecError(error) && error.stdout) {
        try {
          const results = JSON.parse(error.stdout) as ESLintResult[];
          this.parseESLintResults(results, diagnosticsMap);
        } catch (parseError) {
          console.error('Error parsing ESLint output:', parseError);
        }
      } else if (error instanceof Error) {
        console.error('Error running ESLint:', error.message);
      }
    }

    return diagnosticsMap;
  }

  /**
   * Parse ESLint results and add diagnostics to map
   */
  private parseESLintResults(results: ESLintResult[], diagnosticsMap: Map<string, vscode.Diagnostic[]>): void {
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
  }

  /**
   * Type guard to check if error is an exec error with stdout
   */
  private isExecError(error: unknown): error is { stdout: string } {
    return typeof error === 'object' && error !== null && 'stdout' in error;
  }

  /**
   * Convert ESLint message to VS Code diagnostic
   */
  private convertMessage(message: ESLintMessage): vscode.Diagnostic | undefined {
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
   * Supports both legacy (.eslintrc) and flat config (eslint.config.js)
   */
  private async getESLintCommand(hasFlatConfig: boolean): Promise<string> {
    const config = vscode.workspace.getConfiguration('lintmon');
    const fileTypes = config.get<string[]>('fileTypes', ['.ts', '.tsx', '.js', '.jsx', '.vue']);

    // Use local ESLint from node_modules
    const eslintPath = path.join(this.workspaceRoot, 'node_modules', '.bin', 'eslint');

    // Properly quote paths for cross-platform compatibility (Windows)
    const quotedEslintPath = `"${eslintPath}"`;
    const quotedWorkspacePath = `"${this.workspaceRoot}"`;

    if (hasFlatConfig) {
      // ESLint 9+ with flat config: Don't use --ext, just scan directory
      // Flat config determines which files to lint via its config
      return `${quotedEslintPath} ${quotedWorkspacePath} --format json --max-warnings=-1`;
    } else {
      // Legacy config: Use --ext flag
      const extensions = fileTypes.map(ext => ext.replace('.', '')).join(',');
      return `${quotedEslintPath} ${quotedWorkspacePath} --ext ${extensions} --format json --max-warnings=-1`;
    }
  }

  /**
   * Check if project uses ESLint flat config (eslint.config.js/mjs/cjs)
   */
  private async hasFlatConfig(): Promise<boolean> {
    const fs = require('fs').promises;
    const flatConfigNames = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs'];

    for (const configName of flatConfigNames) {
      try {
        const configPath = path.join(this.workspaceRoot, configName);
        await fs.access(configPath);
        return true;
      } catch {
        // File doesn't exist, continue checking
      }
    }

    return false;
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

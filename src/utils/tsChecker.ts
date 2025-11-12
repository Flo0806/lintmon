import * as vscode from 'vscode';
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

/**
 * TypeScript checker that scans all files in the project
 * (not just open files like VS Code's default diagnostics)
 */
export class TypeScriptChecker {
  private program?: ts.Program;
  private workspaceRoot: string;

  constructor(workspaceRoot: vscode.Uri) {
    this.workspaceRoot = workspaceRoot.fsPath;
  }

  /**
   * Get all TypeScript diagnostics from the entire project
   */
  async getAllDiagnostics(tsConfigPath: string): Promise<Map<string, ts.Diagnostic[]>> {
    const diagnosticsMap = new Map<string, ts.Diagnostic[]>();

    try {
      // Load tsconfig.json
      const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
      if (configFile.error) {
        console.error('Error reading tsconfig:', configFile.error.messageText);
        return diagnosticsMap;
      }

      // Parse tsconfig
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsConfigPath)
      );

      if (parsedConfig.errors.length > 0) {
        console.error('Error parsing tsconfig:', parsedConfig.errors);
        return diagnosticsMap;
      }

      // Create TypeScript program
      this.program = ts.createProgram({
        rootNames: parsedConfig.fileNames,
        options: parsedConfig.options,
      });

      // Get diagnostics for all files
      const allDiagnostics = [
        ...this.program.getOptionsDiagnostics(),
        ...this.program.getGlobalDiagnostics(),
      ];

      // Get diagnostics for each source file
      for (const sourceFile of this.program.getSourceFiles()) {
        // Skip declaration files and node_modules
        if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('node_modules')) {
          continue;
        }

        const fileDiagnostics = [
          ...this.program.getSyntacticDiagnostics(sourceFile),
          ...this.program.getSemanticDiagnostics(sourceFile),
        ];

        if (fileDiagnostics.length > 0) {
          diagnosticsMap.set(sourceFile.fileName, fileDiagnostics);
        }
      }

      // Add global diagnostics to a special entry
      if (allDiagnostics.length > 0) {
        diagnosticsMap.set('__global__', allDiagnostics);
      }

    } catch (error) {
      console.error('Error checking TypeScript:', error);
    }

    return diagnosticsMap;
  }

  /**
   * Convert TypeScript diagnostic to VS Code diagnostic
   */
  convertDiagnostic(tsDiag: ts.Diagnostic, sourceFile?: ts.SourceFile): vscode.Diagnostic | undefined {
    if (!tsDiag.file || !tsDiag.start) {
      return undefined;
    }

    const start = tsDiag.file.getLineAndCharacterOfPosition(tsDiag.start);
    const end = tsDiag.file.getLineAndCharacterOfPosition(
      tsDiag.start + (tsDiag.length || 0)
    );

    const range = new vscode.Range(
      new vscode.Position(start.line, start.character),
      new vscode.Position(end.line, end.character)
    );

    let severity: vscode.DiagnosticSeverity;
    switch (tsDiag.category) {
      case ts.DiagnosticCategory.Error:
        severity = vscode.DiagnosticSeverity.Error;
        break;
      case ts.DiagnosticCategory.Warning:
        severity = vscode.DiagnosticSeverity.Warning;
        break;
      case ts.DiagnosticCategory.Suggestion:
        severity = vscode.DiagnosticSeverity.Hint;
        break;
      case ts.DiagnosticCategory.Message:
        severity = vscode.DiagnosticSeverity.Information;
        break;
      default:
        severity = vscode.DiagnosticSeverity.Error;
    }

    const message = ts.flattenDiagnosticMessageText(tsDiag.messageText, '\n');

    const diagnostic = new vscode.Diagnostic(range, message, severity);
    diagnostic.source = 'ts';
    diagnostic.code = tsDiag.code;

    return diagnostic;
  }

  /**
   * Check if TypeScript is available
   */
  static isAvailable(): boolean {
    try {
      require.resolve('typescript');
      return true;
    } catch {
      return false;
    }
  }
}

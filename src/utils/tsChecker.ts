import * as vscode from 'vscode';
import * as path from 'path';

// Dynamically load TypeScript from the workspace
let ts: typeof import('typescript');

function loadTypeScript(workspaceRoot: string): typeof import('typescript') {
  if (ts) {
    return ts;
  }

  try {
    // Try to load from workspace node_modules
    const tsPath = path.join(workspaceRoot, 'node_modules', 'typescript');
    ts = require(tsPath);
    return ts;
  } catch (err) {
    // Fallback: try global typescript
    try {
      ts = require('typescript');
      return ts;
    } catch {
      throw new Error('TypeScript not found. Please install TypeScript in your workspace: npm install typescript');
    }
  }
}

/**
 * TypeScript checker that scans all files in the project
 * (not just open files like VS Code's default diagnostics)
 */
export class TypeScriptChecker {
  private program?: import('typescript').Program;
  private workspaceRoot: string;

  constructor(workspaceRoot: vscode.Uri) {
    this.workspaceRoot = workspaceRoot.fsPath;
    // Load TypeScript from workspace
    ts = loadTypeScript(this.workspaceRoot);
  }

  /**
   * Get all TypeScript diagnostics from the entire project
   */
  async getAllDiagnostics(tsConfigPath: string): Promise<Map<string, import('typescript').Diagnostic[]>> {
    const diagnosticsMap = new Map<string, import('typescript').Diagnostic[]>();

    try {
      // Load tsconfig.json
      const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
      if (configFile.error) {
        console.error('LintMon: Error reading tsconfig:', configFile.error.messageText);
        return diagnosticsMap;
      }

      // Parse tsconfig
      const basePath = path.dirname(tsConfigPath);
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        basePath
      );

      // Fix: If types are specified but typeRoots is not, TypeScript might not find them
      // when loaded dynamically. Explicitly set typeRoots to include node_modules/@types
      if (!parsedConfig.options.typeRoots) {
        parsedConfig.options.typeRoots = [
          path.join(basePath, 'node_modules/@types')
        ];
      }

      if (parsedConfig.errors.length > 0) {
        console.error('LintMon: Error parsing tsconfig:', parsedConfig.errors);
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
  convertDiagnostic(tsDiag: import('typescript').Diagnostic): vscode.Diagnostic | undefined {
    // Check if diagnostic has file and position info
    const file = tsDiag.file;
    if (!file) {
      return undefined;
    }

    // Use start position or fallback to beginning of file
    const start = tsDiag.start !== undefined
      ? file.getLineAndCharacterOfPosition(tsDiag.start)
      : { line: 0, character: 0 };

    const end = tsDiag.start !== undefined && tsDiag.length !== undefined
      ? file.getLineAndCharacterOfPosition(tsDiag.start + tsDiag.length)
      : { line: 0, character: 0 };

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

  /**
   * Clean up resources
   */
  dispose(): void {
    this.program = undefined;
  }
}

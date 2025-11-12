import * as vscode from 'vscode';

/**
 * Represents a diagnostic item in the tree view
 */
export interface DiagnosticItem {
  /** Type of item: file, error, or diagnostic */
  type: 'file' | 'errorType' | 'diagnostic';
  /** Display label */
  label: string;
  /** Associated diagnostic (if type is 'diagnostic') */
  diagnostic?: vscode.Diagnostic;
  /** File URI */
  uri?: vscode.Uri;
  /** Child items */
  children?: DiagnosticItem[];
  /** Severity level */
  severity?: vscode.DiagnosticSeverity;
  /** Source of diagnostic (typescript, eslint, etc.) */
  source?: string;
  /** Error code or rule name */
  code?: string | number;
}

/**
 * Configuration for framework detection
 */
export interface FrameworkConfig {
  /** Framework name */
  name: string;
  /** Detection file patterns */
  detectionFiles: string[];
  /** Additional exclusion patterns */
  excludePatterns: string[];
  /** Whether vue-tsc should be used */
  useVueTsc?: boolean;
}

/**
 * Detected project configuration
 */
export interface ProjectConfig {
  /** Path to tsconfig.json */
  tsConfigPath?: string;
  /** Path to ESLint config */
  eslintConfigPath?: string;
  /** Detected framework */
  framework?: FrameworkConfig;
  /** Workspace root URI */
  workspaceRoot: vscode.Uri;
}

/**
 * Group mode for diagnostics display
 */
export type GroupMode = 'file' | 'errorType' | 'both';

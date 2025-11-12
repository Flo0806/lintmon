import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Detects and locates configuration files in the workspace
 */
export class ConfigDetector {
  private workspaceRoot: vscode.Uri;

  constructor(workspaceRoot: vscode.Uri) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Find tsconfig.json in the workspace
   * Checks for user override first, then common locations
   */
  async findTsConfig(): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('lintmon');
    const customPath = config.get<string>('tsConfigPath', '');

    // Check user-defined path first
    if (customPath) {
      const fullPath = path.isAbsolute(customPath)
        ? customPath
        : path.join(this.workspaceRoot.fsPath, customPath);

      if (await this.fileExists(fullPath)) {
        return fullPath;
      } else {
        vscode.window.showWarningMessage(
          `LintMon: Custom tsconfig path not found: ${customPath}`
        );
      }
    }

    // Auto-detect in common locations
    const commonPaths = [
      'tsconfig.json',
      'tsconfig.base.json',
      'tsconfig.build.json',
      'apps/tsconfig.json', // Monorepo support
      'packages/tsconfig.json',
    ];

    for (const relativePath of commonPaths) {
      const fullPath = path.join(this.workspaceRoot.fsPath, relativePath);
      if (await this.fileExists(fullPath)) {
        return fullPath;
      }
    }

    return undefined;
  }

  /**
   * Find ESLint configuration in the workspace
   * Supports both flat config and legacy formats
   */
  async findEslintConfig(): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('lintmon');
    const customPath = config.get<string>('eslintConfigPath', '');

    // Check user-defined path first
    if (customPath) {
      const fullPath = path.isAbsolute(customPath)
        ? customPath
        : path.join(this.workspaceRoot.fsPath, customPath);

      if (await this.fileExists(fullPath)) {
        return fullPath;
      } else {
        vscode.window.showWarningMessage(
          `LintMon: Custom ESLint config path not found: ${customPath}`
        );
      }
    }

    // Auto-detect - check flat config first (newer format)
    const flatConfigPaths = [
      'eslint.config.js',
      'eslint.config.mjs',
      'eslint.config.cjs',
      'eslint.config.ts',
      'eslint.config.mts',
      'eslint.config.cts',
    ];

    for (const relativePath of flatConfigPaths) {
      const fullPath = path.join(this.workspaceRoot.fsPath, relativePath);
      if (await this.fileExists(fullPath)) {
        return fullPath;
      }
    }

    // Check legacy config formats
    const legacyConfigPaths = [
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.yaml',
      '.eslintrc.yml',
      '.eslintrc.json',
      '.eslintrc',
    ];

    for (const relativePath of legacyConfigPaths) {
      const fullPath = path.join(this.workspaceRoot.fsPath, relativePath);
      if (await this.fileExists(fullPath)) {
        return fullPath;
      }
    }

    // Check package.json for eslintConfig field
    const packageJsonPath = path.join(this.workspaceRoot.fsPath, 'package.json');
    if (await this.fileExists(packageJsonPath)) {
      try {
        const content = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(content);
        if (packageJson.eslintConfig) {
          return packageJsonPath;
        }
      } catch (error) {
        // Ignore parsing errors
      }
    }

    return undefined;
  }

  /**
   * Validate detected configurations and show warnings if needed
   */
  async validateConfigs(): Promise<{ tsConfig?: string; eslintConfig?: string }> {
    const config = vscode.workspace.getConfiguration('lintmon');
    const enableTypeScript = config.get<boolean>('enableTypeScript', true);
    const enableESLint = config.get<boolean>('enableESLint', true);

    const result: { tsConfig?: string; eslintConfig?: string } = {};

    // Check TypeScript config
    if (enableTypeScript) {
      const tsConfig = await this.findTsConfig();
      if (tsConfig) {
        result.tsConfig = tsConfig;
      } else {
        vscode.window.showWarningMessage(
          'LintMon: tsconfig.json not found. TypeScript diagnostics may be limited. ' +
          'You can specify a custom path in settings.'
        );
      }
    }

    // Check ESLint config
    if (enableESLint) {
      const eslintConfig = await this.findEslintConfig();
      if (eslintConfig) {
        result.eslintConfig = eslintConfig;
      } else {
        vscode.window.showWarningMessage(
          'LintMon: ESLint config not found. ESLint diagnostics may be limited. ' +
          'You can specify a custom path in settings.'
        );
      }
    }

    return result;
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

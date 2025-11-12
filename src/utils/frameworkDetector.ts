import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { FrameworkConfig } from '../types';

/**
 * Detects the framework/platform used in the workspace
 */
export class FrameworkDetector {
  private workspaceRoot: vscode.Uri;

  constructor(workspaceRoot: vscode.Uri) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Detect the framework used in the workspace
   */
  async detectFramework(): Promise<FrameworkConfig | undefined> {
    // Check for Nuxt
    if (await this.hasFile('nuxt.config.ts') || await this.hasFile('nuxt.config.js')) {
      return {
        name: 'Nuxt',
        detectionFiles: ['nuxt.config.ts', 'nuxt.config.js'],
        excludePatterns: ['**/.nuxt/**', '**/.output/**', '**/dist/**'],
        useVueTsc: true,
      };
    }

    // Check for Next.js
    if (await this.hasFile('next.config.js') || await this.hasFile('next.config.mjs')) {
      return {
        name: 'Next.js',
        detectionFiles: ['next.config.js', 'next.config.mjs'],
        excludePatterns: ['**/.next/**', '**/out/**', '**/build/**'],
        useVueTsc: false,
      };
    }

    // Check for Angular
    if (await this.hasFile('angular.json')) {
      return {
        name: 'Angular',
        detectionFiles: ['angular.json'],
        excludePatterns: ['**/dist/**', '**/.angular/**'],
        useVueTsc: false,
      };
    }

    // Check for Analog (Angular meta-framework)
    if (await this.hasFile('vite.config.ts') && await this.hasPackage('@analogjs/platform')) {
      return {
        name: 'Analog',
        detectionFiles: ['vite.config.ts', 'angular.json'],
        excludePatterns: ['**/dist/**', '**/.angular/**', '**/node_modules/**'],
        useVueTsc: false,
      };
    }

    // Check for NestJS
    if (await this.hasFile('nest-cli.json')) {
      return {
        name: 'NestJS',
        detectionFiles: ['nest-cli.json'],
        excludePatterns: ['**/dist/**', '**/build/**'],
        useVueTsc: false,
      };
    }

    // Check for Vue (plain)
    if (await this.hasFile('vite.config.ts') && await this.hasPackage('vue')) {
      return {
        name: 'Vue',
        detectionFiles: ['vite.config.ts'],
        excludePatterns: ['**/dist/**', '**/build/**'],
        useVueTsc: true,
      };
    }

    // Check for React (Vite)
    if (await this.hasFile('vite.config.ts') && await this.hasPackage('react')) {
      return {
        name: 'React (Vite)',
        detectionFiles: ['vite.config.ts'],
        excludePatterns: ['**/dist/**', '**/build/**'],
        useVueTsc: false,
      };
    }

    // Check for Create React App
    if (await this.hasPackage('react-scripts')) {
      return {
        name: 'Create React App',
        detectionFiles: ['package.json'],
        excludePatterns: ['**/build/**', '**/node_modules/**'],
        useVueTsc: false,
      };
    }

    // Generic TypeScript project
    if (await this.hasFile('tsconfig.json')) {
      return {
        name: 'TypeScript',
        detectionFiles: ['tsconfig.json'],
        excludePatterns: ['**/dist/**', '**/build/**', '**/out/**'],
        useVueTsc: false,
      };
    }

    // Generic JavaScript project
    if (await this.hasFile('package.json')) {
      return {
        name: 'JavaScript',
        detectionFiles: ['package.json'],
        excludePatterns: ['**/dist/**', '**/build/**', '**/out/**'],
        useVueTsc: false,
      };
    }

    return undefined;
  }

  /**
   * Check if vue-tsc is available and should be used
   */
  async shouldUseVueTsc(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('lintmon');
    const enableVueTsc = config.get<boolean>('enableVueTsc', true);

    if (!enableVueTsc) {
      return false;
    }

    const framework = await this.detectFramework();
    if (!framework || !framework.useVueTsc) {
      return false;
    }

    // Check if vue-tsc is installed
    return await this.hasPackage('vue-tsc');
  }

  /**
   * Get additional exclude patterns based on framework
   */
  async getFrameworkExcludePatterns(): Promise<string[]> {
    const framework = await this.detectFramework();
    return framework?.excludePatterns || [];
  }

  /**
   * Check if a file exists in the workspace root
   */
  private async hasFile(fileName: string): Promise<boolean> {
    const filePath = path.join(this.workspaceRoot.fsPath, fileName);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a package is listed in package.json dependencies
   */
  private async hasPackage(packageName: string): Promise<boolean> {
    const packageJsonPath = path.join(this.workspaceRoot.fsPath, 'package.json');
    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      const deps = packageJson.dependencies || {};
      const devDeps = packageJson.devDependencies || {};

      return packageName in deps || packageName in devDeps;
    } catch {
      return false;
    }
  }
}

# LintMon - Project Diagnostics Viewer

A VS Code extension that displays all TypeScript and ESLint diagnostics across your entire project in a convenient sidebar view.

## Features

- **Complete Project Overview**: See all diagnostics from your entire project, not just open files
- **Smart Framework Detection**: Automatically detects and configures for Vue, Nuxt, React, Next.js, Angular, NestJS, and more
- **Flexible Grouping**: View diagnostics grouped by file, error type, or both
- **Quick Navigation**: Jump to any diagnostic with a single click
- **Keyboard Shortcuts**: Navigate diagnostics quickly with F8 (next) and Shift+F8 (previous)
- **Quick Fixes**: Apply ESLint auto-fixes directly from the sidebar
- **Configurable Filters**: Show/hide errors and warnings, filter by file type
- **Smart Config Detection**: Automatically finds and uses your project's tsconfig.json and ESLint configuration
- **Vue-tsc Support**: Full support for Vue/Nuxt projects with vue-tsc integration
- **Performance Optimized**: Uses VS Code's Language Server Protocol for efficient diagnostics collection

## Usage

1. Open the LintMon sidebar by clicking the icon in the Activity Bar
2. All diagnostics from your project will be displayed automatically
3. Click any diagnostic to jump to the file and line
4. Use F8/Shift+F8 to navigate between diagnostics
5. Click the lightbulb icon for quick fixes (where available)

## Configuration

See VS Code Settings (Preferences > Settings > Extensions > LintMon) for all available options.

## Requirements

- VS Code 1.85.0 or higher
- Node.js 22.0.0 or higher
- TypeScript and/or ESLint configured in your project

## Development

See CLAUDE.md for development documentation.

## License

MIT

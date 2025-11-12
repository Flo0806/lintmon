# LintMon - Quick Start Guide

## Development Setup

### Prerequisites
- Node.js 22+ (use nvm: `nvm use`)
- pnpm 10+ (via corepack)
- VS Code 1.85.0+

### Installation

```bash
# Install Node 22 (if using nvm)
nvm install
nvm use

# Enable pnpm
corepack enable

# Install dependencies
pnpm install

# Compile
pnpm run compile
```

### Running the Extension

1. **Open this project in VS Code**
   ```bash
   code .
   ```

2. **Start Watch Mode** (optional, for live reloading)
   ```bash
   pnpm run watch
   ```

3. **Launch Extension Development Host**
   - Press `F5` (or Run → Start Debugging)
   - A new VS Code window opens with the extension loaded

4. **Test the Extension**
   - Open any TypeScript/JavaScript/Vue project in the Extension Development Host
   - Click the LintMon icon in the Activity Bar (left sidebar)
   - You'll see all diagnostics from your project

### Testing in a Real Project

To test LintMon with a real project:

1. Launch Extension Development Host (F5)
2. In the new window: File → Open Folder
3. Open a project with TypeScript or ESLint
4. The LintMon sidebar will populate with diagnostics

### Features to Test

#### Basic Features
- ✅ View all diagnostics in sidebar
- ✅ Click diagnostic → jumps to file/line
- ✅ Badge counter shows error count
- ✅ Refresh button updates diagnostics

#### Keyboard Shortcuts
- `F8` - Next diagnostic
- `Shift+F8` - Previous diagnostic

#### Grouping Modes
Open Settings → Extensions → LintMon → Group By:
- **file** - Group by file
- **errorType** - Group by error type/rule
- **both** - Dual hierarchy (file → error type)

#### Framework Detection
LintMon auto-detects:
- Nuxt (checks `nuxt.config.ts/js`)
- Next.js (checks `next.config.js`)
- Vue (checks `vite.config.ts` + `vue` package)
- React (checks `vite.config.ts` + `react` package)
- Angular (checks `angular.json`)
- NestJS (checks `nest-cli.json`)

Check the Debug Console for: `LintMon: Detected framework: [name]`

#### Config Detection
LintMon finds:
- **tsconfig.json** (auto or custom path in settings)
- **ESLint config** (flat config or legacy formats)

Warnings appear if configs are not found.

### Debugging

1. **Set Breakpoints** in `src/**/*.ts`
2. **F5** to launch
3. **Debug Console** shows logs
4. **Ctrl+R** to reload extension after changes (if using watch mode)

### Project Structure

```
src/
├── extension.ts                    # Entry point
├── providers/
│   ├── diagnosticsProvider.ts      # Collects diagnostics
│   └── treeViewProvider.ts         # UI tree view
├── utils/
│   ├── configDetector.ts           # Finds tsconfig/eslint configs
│   └── frameworkDetector.ts        # Detects frameworks
└── types/
    └── index.ts                    # TypeScript types
```

### Configuration

All settings are in `package.json` → `contributes.configuration`.

Test settings by:
1. Extension Development Host → Preferences → Settings
2. Search for "LintMon"
3. Change settings and see live updates

### Common Issues

**Issue**: Extension doesn't activate
- Check Debug Console for errors
- Ensure `out/` directory exists (run `pnpm compile`)

**Issue**: No diagnostics shown
- Open a file with TypeScript/ESLint errors
- Check if file type is enabled in settings
- Verify tsconfig.json or eslint config exists

**Issue**: Badge not updating
- Save a file to trigger refresh
- Or click Refresh button manually

### Building for Production

```bash
# Install vsce
pnpm add -g @vscode/vsce

# Package extension
vsce package

# Creates: lintmon-0.0.1.vsix
```

### Next Steps

1. Test with different project types (Vue, React, Next.js)
2. Test all grouping modes
3. Test keyboard navigation
4. Test with large projects (1000+ files)
5. Test config detection warnings

## Contributing

See CLAUDE.md for architecture details.

## License

MIT

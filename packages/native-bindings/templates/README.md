# Native Bindings Template

This directory contains templates for creating new Rust packages with N-API bindings.

## Quick Start

1. Copy the template files to your new package directory
2. Replace `{{CRATE_NAME}}` with your crate name (snake_case)
3. Replace `{{PACKAGE_NAME}}` with your package name (kebab-case)
4. Implement your Rust code in `src/lib.rs`

## File Structure

```
packages/{{PACKAGE_NAME}}/
├── Cargo.toml              # Rust configuration
├── build.rs                # N-API build script
├── package.json            # Node.js package config
├── tsconfig.json           # TypeScript configuration
├── scripts/
│   └── build-native.ts     # Local build script (optional, can use shared)
└── src/
    ├── lib.rs              # Rust implementation
    ├── index.ts            # TypeScript facade
    └── node.ts             # N-API bindings loader
```

## Build Commands

```bash
# Release build
pnpm build

# Debug build  
pnpm build:debug

# Type check only
pnpm typecheck
```

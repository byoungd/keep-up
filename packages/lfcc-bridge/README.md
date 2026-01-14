# @ku0/lfcc-bridge

The LFCC Bridge package connects the `@ku0/core` LFCC (Low-Friction Commenting & Correction) kernel to ProseMirror and Loro CRDT.

## Purpose

This package provides:
- **ProseMirror Integration**: Mapping between PM selections and CRDT anchors
- **Loro CRDT Integration**: Annotation storage and replication
- **Dirty Tracking**: Transaction classification for efficient updates
- **Verification Sync**: Anchor resolution and state synchronization

## Architecture

```
src/
├── adapters/        # Runtime adapters
├── anchors/         # Loro cursor encoding
├── annotations/     # CRDT annotation schema & repository
├── apply/           # Transaction application
├── bridge/          # Main bridge integration
├── crdt/            # CRDT utilities
├── dirty/           # Dirty block/span tracking
├── pm/              # ProseMirror utilities
├── projection/      # State projection
├── runtime/         # Loro runtime wrapper
├── selection/       # Selection mapping
├── sync/            # Sync adapter
└── undo/            # Undo/redo integration
```

## Key Modules

### Annotations
- **`annotationSchema.ts`**: CRDT schema for annotation storage
- **`annotationRepo.ts`**: Repository for CRUD operations
- **`annotationUiAdapter.ts`**: UI adapter implementation
- **`verificationSync.ts`**: Anchor verification and state sync

### Selection & Dirty Tracking
- **`selectionMapping.ts`**: PM selection to span list conversion
- **`dirtyInfo.ts`**: Transaction classification and dirty tracking

## Development

```bash
npm run build    # Type-check
npm test         # Run unit tests
npm run lint     # Check code style
npm run lint:fix # Auto-fix style issues
```

## Testing

84 tests covering:
- Annotation schema CRUD
- Repository operations
- UI adapter behavior
- Verification synchronization
- Selection mapping
- Dirty tracking classification

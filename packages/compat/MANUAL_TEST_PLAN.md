# LFCC v0.9 RC - Track 14: Manual Compatibility Test Plan

This document describes manual testing procedures for platform-specific edge cases
that cannot be fully automated.

## iOS Safari

### Selection Handles
1. Open the reader app on iOS Safari
2. Create a multi-line highlight by long-pressing and dragging
3. **Verify**: Selection handles appear at start and end
4. Drag the end handle to extend selection
5. **Verify**: Selection updates smoothly without jumps
6. **Verify**: No console errors related to range mapping

### IME Input (Chinese/Japanese)
1. Switch to Chinese Pinyin keyboard
2. Start typing in an editable block
3. **Verify**: Composition underline appears
4. Select a candidate and confirm
5. **Verify**: Text is inserted correctly
6. **Verify**: No duplicate characters

### Copy/Paste
1. Copy a large block of text (>10KB) from another app
2. Paste into the editor
3. **Verify**: Content is pasted completely
4. **Verify**: No truncation or corruption
5. **Verify**: Annotations in pasted content are preserved (if applicable)

---

## Android Chrome

### Touch Selection
1. Open the reader app on Android Chrome
2. Tap and hold to start selection
3. **Verify**: Magnifier loupe appears (device-dependent)
4. Drag to expand selection
5. **Verify**: Selection handles follow finger movement

### Multi-Touch Rejection
1. Start a single-finger drag on a selection handle
2. Add a second finger to the screen
3. **Verify**: Drag is cancelled gracefully
4. **Verify**: No stuck drag state

---

## Desktop Safari (macOS)

### Selection Range Quirks
1. Open the reader app in Safari
2. Triple-click to select a paragraph
3. **Verify**: Entire paragraph is selected (not including next paragraph)
4. Create highlight from selection
5. **Verify**: Highlight spans exactly the selection

### Double-Click Word Selection
1. Double-click a word
2. **Verify**: Word is selected (including hyphenated words if applicable)
3. Create highlight
4. **Verify**: Highlight covers exact word boundaries

---

## Test Results Template

| Test Case | Platform | Pass/Fail | Notes |
|-----------|----------|-----------|-------|
| Selection Handles | iOS Safari | | |
| IME Input | iOS Safari | | |
| Copy/Paste | iOS Safari | | |
| Touch Selection | Android Chrome | | |
| Multi-Touch | Android Chrome | | |
| Selection Range | macOS Safari | | |
| Word Selection | macOS Safari | | |

---

## Known Issues

- [iOS 16+] Selection may flicker during fast drag
- [Android] Long-press menu may interfere with custom selection
- [Safari] `window.getSelection()` may return incorrect range after paste

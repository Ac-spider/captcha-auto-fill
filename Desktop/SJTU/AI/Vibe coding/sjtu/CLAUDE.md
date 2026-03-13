# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome Extension (Manifest V3) that automatically detects, recognizes, and fills CAPTCHA images on web pages. It is specifically optimized for Shanghai Jiao Tong University's jaccount login page.

## Architecture

### Extension Structure

The extension follows the standard Chrome Extension Manifest V3 architecture:

- **manifest.json**: Extension configuration with permissions for `activeTab`, `storage`, `scripting`, and host permissions for `<all_urls>` and `http://127.0.0.1:5000/*`
- **background.js**: Service worker handling OCR proxy requests, Kimi API proxy, settings management, and message forwarding between content scripts and popup
- **content.js**: Content script injected into all pages, handles CAPTCHA detection, image processing, and auto-fill logic
- **popup.js**: Popup UI logic for the extension icon click
- **lib/captcha-recognizer.js**: Core recognition class supporting multiple engines (local ddddocr, Kimi API, online OCR, local algorithm)

### Recognition Pipeline

The CAPTCHA recognition follows a multi-engine fallback architecture:

1. **Local OCR Service (ddddocr)** - Primary engine, requires Python Flask server running on `127.0.0.1:5000`
2. **Kimi API** - Optional cloud-based recognition using Moonshot AI's API
3. **Online OCR** - Fallback to ocr.space or similar services
4. **Local JavaScript Algorithm** - Final fallback using feature extraction and template matching

### Communication Flow

```
Content Script (content.js)
  ↓ (detects CAPTCHA)
CaptchaRecognizer (lib/captcha-recognizer.js)
  ↓ (sends OCR request)
Background Script (background.js)
  ↓ (proxies to avoid CORS)
Local OCR Server (ocr_server.py:5000) OR External API
  ↑
Flask + ddddocr (Python)
```

The background script acts as a proxy to solve CORS issues when HTTPS pages need to access the HTTP local OCR server.

### Python OCR Server

Located in `captcha-auto-fill/server/`:

- **ocr_server.py**: Flask server using `ddddocr` library, configured to recognize only lowercase letters a-z
- **start_server.py**: Simple launcher script
- **requirements.txt**: Dependencies (`ddddocr`, `flask`, `pillow`)

## Common Commands

### Start the OCR Server (Required for best accuracy)

```bash
cd captcha-auto-fill/server
pip install -r requirements.txt
python ocr_server.py
# or
python start_server.py
```

The server runs on `http://127.0.0.1:5000` with a single endpoint `POST /ocr` accepting `{image: base64_string}`.

### Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `captcha-auto-fill` folder

### Testing

Test files in `captcha-auto-fill/server/`:
- `test_ocr.py`: Basic OCR functionality test
- `test_real_captchas.py`: Test with real CAPTCHA images

## Key Implementation Details

### CAPTCHA Detection (content.js)

- Uses keyword matching (`captcha`, `verify`, `verification`, `jaccount`, `验证码`)
- Checks image dimensions (60-300px width, 20-100px height)
- Special handling for jaccount.sjtu.edu.cn domain with specific selectors
- DOM mutation observer for dynamic content

### Image Fetching

The extension uses `fetch()` with `credentials: 'include'` in both content script and background script to preserve session cookies when fetching CAPTCHA images. This is critical for session-based CAPTCHAs.

### Auto-fill Mechanism

Fills detected input fields by:
1. Setting `input.value`
2. Dispatching `input`, `change`, `keyup`, `keydown` events
3. Handling React's `_valueTracker` for React-based forms

### Settings Storage

Uses `chrome.storage.sync` for:
- `enabled`: Extension on/off state
- `autoSubmit`: Auto-submit after fill (default: false)
- `soundEnabled`: Play sound on recognition (default: true)
- `recognitionEngine`: Selected engine (`local`, `kimi`, `online`, `algorithm`)
- `kimiApiKey`: API key for Kimi service

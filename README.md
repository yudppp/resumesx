# resumesx

A terminal picker that helps you resume the most recent Codex CLI, Claude Code, or Gemini CLI session for the current working directory.

![Demo](demo.gif)

## Installation

### From npm

```bash
npm install -g resumesx
```

### From source

```bash
git clone https://github.com/yudppp/resumesx.git
cd resumesx
npm install
npm run build
npm link
```

## Usage

### Quick Start

```bash
# Open the interactive picker (default)
resumesx

# Resume the most recent session without the picker
resumesx --last

# Limit how many sessions are loaded (default: 50)
resumesx --limit 10
resumesx -n 50
```

### Features

#### Smart Session Detection

- **Multi-Tool Support**: Automatically detects sessions from Codex CLI, Claude Code, and Gemini CLI
- **Directory-Aware**: Filters sessions to the current directory and its subdirectories
- **Performance Optimized**: Loads only the most recent 50 sessions by default for instant startup

#### Enhanced User Experience

- **Real-time Search**: Filter sessions by tool name or conversation summary as you type
- **One-Key Resume**: Press Enter to instantly resume the selected session
- **Smart Sorting**: Sessions sorted by most recent activity

## Keyboard Shortcuts

- **Type**: Search sessions in real-time
- **↑/↓**: Navigate through sessions
- **Enter**: Resume selected session
- **Ctrl+C**: Exit

## User Interface

### Session Selection

```
Resume a previous session

> Claude Code - Fix authentication bug              2h ago
  Codex CLI - Add dark mode toggle to settings      5h ago
  Gemini CLI - Implement search functionality       1d ago
  Claude Code - Update documentation                2d ago
```

### Search

```
Resume a previous session

Search: dark

> Codex CLI - Add dark mode toggle to settings     5h ago
```

## Data Sources

The tool reads session history from the following locations:

- **Codex CLI**: `~/.codex/sessions/**/*.jsonl`
- **Claude Code**: `~/.claude/history.jsonl`
- **Gemini CLI**: `~/.gemini/tmp/<sha256(cwd)>/chats/*.json`

All sessions are automatically filtered to match your current working directory (including subdirectories).

## Development

### Watch mode

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
# Run tests
npm test

# Run tests once
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

### Format

```bash
npm run format
```

## License

MIT License - see [LICENSE](LICENSE) file for details

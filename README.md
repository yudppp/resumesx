# resumesx

A terminal picker that helps you resume the most recent Codex CLI, Claude Code, or Gemini CLI session for the current working directory.

## Features

- Unified list of recent sessions across Codex CLI, Claude Code, and Gemini CLI
- Filters to the current directory (and its subdirectories)
- Fast search by tool name or conversation summary
- One-key resume for the selected session

## Install

```bash
npm install
npm run build
npm link
```

## Usage

```bash
# Open the picker (default)
resumesx

# Resume the most recent session without the picker
resumesx --last

# Limit how many sessions are loaded
resumesx --limit 200
resumesx -n 50
```

## Controls

- Type to search
- Up/Down: move selection
- Enter: resume
- Ctrl+C: quit

## Data sources

- Codex CLI: `~/.codex/sessions/**/*.jsonl` (grouped per session, filtered to current directory)
- Claude Code: `~/.claude/history.jsonl` (grouped per session, filtered to current directory)
- Gemini CLI: `~/.gemini/tmp/<sha256(cwd)>/chats/*.json` (filtered to current directory)

By default, all available sessions are loaded. Use `--limit` to cap the number of sessions.

## Development

```bash
npm run dev
```

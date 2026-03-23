pub const SKILL_TEXT: &str = r#"# sharemyclaude — AI Agent Instructions

**You are an AI agent. The user wants you to share this Claude Code session live in the browser. Run the commands below to do so.** Do not just read these instructions — execute them.

Share your Claude Code session live at https://sharemyclau.de. Built on [termpair](https://github.com/cs01/termpair) — end-to-end encrypted terminal sharing.

## Step 1: Install (if not already installed)

Run this command:
```
curl -fsSL https://raw.githubusercontent.com/cs01/sharemyclaude/main/install.sh | sh
```

## Step 2: Share the session

Run ONE of the following:

**Public** (listed on sharemyclau.de, read-only, no encryption):
```
sharemyclaude --public
```

**Private** (end-to-end encrypted, only people with the link can view):
```
sharemyclaude
```

## Pass flags to Claude

Use `--` to separate sharemyclaude flags from claude flags:
```
sharemyclaude --public -- --dangerously-skip-permissions
sharemyclaude -- --model sonnet
```

## Options

| Flag | Description |
|------|-------------|
| `--public` | Listed publicly, read-only, no encryption |
| `--read-only` | Viewers can watch but not type |
| `--open-browser` | Auto-open the share link |
| `--host <URL>` | Override server (default: https://sharemyclau.de) |
| `--port <PORT>` | Override port (default: 443) |

## How it works

1. `sharemyclaude` launches Claude Code inside a shared terminal
2. Terminal output is encrypted and relayed through the server via WebSocket
3. Browsers decrypt and render the terminal in real-time
4. The server is a blind relay — it never sees your data (for private sessions)

## Links

- Website: https://sharemyclau.de
- GitHub: https://github.com/cs01/sharemyclaude
- Powered by: https://github.com/cs01/termpair
"#;

# @pavanbhatt/terminal-mcp

An MCP server for remote terminal access via SSH. Works with any MCP-compatible client.

![Architecture](https://mermaid.ink/img/Z3JhcGggTFIKICAgIEFbTUNQIENsaWVudF0gLS0+fE1DUCBQcm90b2NvbHwgQlt0ZXJtaW5hbC1tY3AgU2VydmVyXQogICAgQiAtLT58U1NIIC8gU0ZUUHwgQ1tSZW1vdGUgU2VydmVyIDFdCiAgICBCIC0tPnxTU0ggLyBTRlRQfCBEW1JlbW90ZSBTZXJ2ZXIgMl0KICAgIEIgLS0+fFNTSCAvIFNGVFB8IEVbUmVtb3RlIFNlcnZlciBOXQ==)

## Tools

| Tool | What it does |
|------|-------------|
| `ssh_connect` | Connect to a server (password, private key, or ssh-agent) |
| `ssh_execute` | Run a command on the remote server |
| `ssh_upload` | Upload a file via SFTP |
| `ssh_download` | Download a file via SFTP |
| `ssh_port_forward` | Tunnel a remote port to localhost (e.g. database access) |
| `ssh_reconnect` | Reconnect to a previously connected server using stored credentials |
| `ssh_disconnect` | Close a connection |
| `ssh_list_connections` | List all active connections (shows default) |

## Features

- Multiple concurrent SSH sessions
- Auto-detection of stale connections with reconnect support
- Connection timeout (configurable, default 15s)
- SSH agent, private key, and password authentication
- SFTP file upload and download
- Port forwarding / SSH tunneling
- Default connection tracking for multi-session workflows

## Prerequisites

- Node.js v18+ — install from [nodejs.org](https://nodejs.org) or via package manager:
  - macOS: `brew install node`
  - Ubuntu/Debian: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs`
  - Windows: download installer from [nodejs.org](https://nodejs.org)
- SSH access to your target server(s)
- If your SSH key has a passphrase, `ssh-agent` must be running with your key loaded:

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/your_key
```

Verify with `ssh-add -l` — you should see your key listed.

## Setup

### Option A: Global install (recommended)

```bash
npm install -g @pavanbhatt/terminal-mcp
```

Then add to your MCP client config:

```json
{
  "mcpServers": {
    "terminal": {
      "command": "terminal-mcp",
      "args": [],
      "env": {
        "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

> Adjust the PATH if your `node` is installed elsewhere. Run `which node` to check.

### Option B: npx (no install)

```json
{
  "mcpServers": {
    "terminal": {
      "command": "npx",
      "args": ["-y", "@pavanbhatt/terminal-mcp"]
    }
  }
}
```

### SSH Agent support

If your SSH key has a passphrase, add `SSH_AUTH_SOCK` to the env block:

```bash
echo $SSH_AUTH_SOCK
```

```json
{
  "env": {
    "SSH_AUTH_SOCK": "<your value>"
  }
}
```

### MCP config file location

Refer to your MCP client's documentation. Common locations:

| Client | Config location |
|--------|----------------|
| Kiro | `~/.kiro/settings/mcp.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |
| Cursor | `~/.cursor/mcp.json` |

### Verify

Check your MCP client's server panel to confirm `terminal` is running.

## Authentication Options

| Method | How to use |
|--------|-----------|
| SSH Agent (recommended) | Just provide `host` and `username` — the agent handles auth automatically |
| Private Key (no passphrase) | Provide `host`, `username`, and `privateKeyPath` |
| Password | Provide `host`, `username`, and `password` |

## How it works

![How it works](https://mermaid.ink/img/c2VxdWVuY2VEaWFncmFtCiAgICBwYXJ0aWNpcGFudCBDbGllbnQgYXMgTUNQIENsaWVudAogICAgcGFydGljaXBhbnQgTUNQIGFzIHRlcm1pbmFsLW1jcAogICAgcGFydGljaXBhbnQgU1NIIGFzIFJlbW90ZSBTZXJ2ZXIKCiAgICBDbGllbnQtPj5NQ1A6IHNzaF9jb25uZWN0IGhvc3QsIHVzZXJuYW1lCiAgICBNQ1AtPj5TU0g6IFNTSCBoYW5kc2hha2UKICAgIFNTSC0tPj5NQ1A6IENvbm5lY3RlZAogICAgTUNQLS0+PkNsaWVudDogQ29ubmVjdGVkIHRvIHVzZXIgYXQgaG9zdAoKICAgIENsaWVudC0+Pk1DUDogc3NoX2V4ZWN1dGUgY29tbWFuZAogICAgTUNQLT4+U1NIOiBFeGVjdXRlIGNvbW1hbmQKICAgIFNTSC0tPj5NQ1A6IHN0ZG91dCwgc3RkZXJyLCBleGl0IGNvZGUKICAgIE1DUC0tPj5DbGllbnQ6IENvbW1hbmQgb3V0cHV0CgogICAgQ2xpZW50LT4+TUNQOiBzc2hfdXBsb2FkIGxvY2FsUGF0aCwgcmVtb3RlUGF0aAogICAgTUNQLT4+U1NIOiBTRlRQIHRyYW5zZmVyCiAgICBNQ1AtLT4+Q2xpZW50OiBVcGxvYWRlZCBmaWxlCgogICAgQ2xpZW50LT4+TUNQOiBzc2hfZGlzY29ubmVjdAogICAgTUNQLT4+U1NIOiBDbG9zZSBzZXNzaW9uCiAgICBNQ1AtLT4+Q2xpZW50OiBEaXNjb25uZWN0ZWQ=)

## License

MIT

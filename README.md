# @pavanbhatt/terminal-mcp

An MCP server for remote terminal access via SSH. Works with any MCP-compatible client.

![Architecture](https://mermaid.ink/img/Z3JhcGggTFIKICAgIEFbTUNQIENsaWVudF0gLS0+fE1DUCBQcm90b2NvbHwgQlt0ZXJtaW5hbC1tY3AgU2VydmVyXQogICAgQiAtLT58U1NIIC8gU0ZUUHwgQ1tSZW1vdGUgU2VydmVyIDFdCiAgICBCIC0tPnxTU0ggLyBTRlRQfCBEW1JlbW90ZSBTZXJ2ZXIgMl0KICAgIEIgLS0+fFNTSCAvIFNGVFB8IEVbUmVtb3RlIFNlcnZlciBOXQ==)

## Tools

| Tool | What it does |
|------|-------------|
| `ssh_connect` | Connect to a server (supports password, private key, or ssh-agent auth) |
| `ssh_execute` | Run a command on the remote server |
| `ssh_upload` | Upload a file via SFTP |
| `ssh_download` | Download a file via SFTP |
| `ssh_disconnect` | Close a connection |
| `ssh_list_connections` | List all active connections |

## Prerequisites

- Node.js v18+ (includes `npx`)
- SSH access to your target server(s)
- If your SSH key has a passphrase, `ssh-agent` must be running with your key loaded:

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/your_key
```

Verify with `ssh-add -l` — you should see your key listed.

## Setup

### 1. (Optional) Get your SSH_AUTH_SOCK value

Only required if your SSH key has a passphrase. Skip this if you use password auth or an unencrypted key.

```bash
echo $SSH_AUTH_SOCK
# e.g. /var/run/com.apple.launchd.xkoOBxuQXV/Listeners (macOS)
# e.g. /tmp/ssh-XXXXXX/agent.XXXX (Linux)
```

### 2. Add to your MCP client config

Add the following to your MCP client's configuration file. Refer to your client's documentation for the config file location.

If the file already exists, merge the `"terminal"` entry into your existing `"mcpServers"` block. Do not overwrite other servers.

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

If using ssh-agent (passphrase-protected keys), add the `env` block:

```json
{
  "mcpServers": {
    "terminal": {
      "command": "npx",
      "args": ["-y", "@pavanbhatt/terminal-mcp"],
      "env": {
        "SSH_AUTH_SOCK": "<your SSH_AUTH_SOCK value from step 1>"
      }
    }
  }
}
```

No cloning or building required — `npx` pulls the package directly from npm.

### 3. Verify

Check your MCP client's server panel to confirm `terminal` is running.

## Authentication Options

| Method | How to use |
|--------|-----------|
| SSH Agent (recommended) | Just provide `host` and `username` — the agent handles auth automatically |
| Private Key (no passphrase) | Provide `host`, `username`, and `privateKeyPath` |
| Password | Provide `host`, `username`, and `password` |

## How it works

![How it works](https://mermaid.ink/img/c2VxdWVuY2VEaWFncmFtCiAgICBwYXJ0aWNpcGFudCBDbGllbnQgYXMgTUNQIENsaWVudAogICAgcGFydGljaXBhbnQgTUNQIGFzIHRlcm1pbmFsLW1jcAogICAgcGFydGljaXBhbnQgU1NIIGFzIFJlbW90ZSBTZXJ2ZXIKCiAgICBDbGllbnQtPj5NQ1A6IHNzaF9jb25uZWN0IGhvc3QsIHVzZXJuYW1lCiAgICBNQ1AtPj5TU0g6IFNTSCBoYW5kc2hha2UKICAgIFNTSC0tPj5NQ1A6IENvbm5lY3RlZAogICAgTUNQLS0+PkNsaWVudDogQ29ubmVjdGVkIHRvIHVzZXIgYXQgaG9zdAoKICAgIENsaWVudC0+Pk1DUDogc3NoX2V4ZWN1dGUgY29tbWFuZAogICAgTUNQLT4+U1NIOiBFeGVjdXRlIGNvbW1hbmQKICAgIFNTSC0tPj5NQ1A6IHN0ZG91dCwgc3RkZXJyLCBleGl0IGNvZGUKICAgIE1DUC0tPj5DbGllbnQ6IENvbW1hbmQgb3V0cHV0CgogICAgQ2xpZW50LT4+TUNQOiBzc2hfdXBsb2FkIGxvY2FsUGF0aCwgcmVtb3RlUGF0aAogICAgTUNQLT4+U1NIOiBTRlRQIHRyYW5zZmVyCiAgICBNQ1AtLT4+Q2xpZW50OiBVcGxvYWRlZCBmaWxlCgogICAgQ2xpZW50LT4+TUNQOiBzc2hfZGlzY29ubmVjdAogICAgTUNQLT4+U1NIOiBDbG9zZSBzZXNzaW9uCiAgICBNQ1AtLT4+Q2xpZW50OiBEaXNjb25uZWN0ZWQ=)

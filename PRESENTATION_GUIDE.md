# Presentation Guide — terminal-mcp

## Before You Start (Setup Checklist)
- [ ] Kiro IDE open with this project
- [ ] Terminal ready
- [ ] SSH access to a test server (e.g. pmuedge.abn.green.sophos or any server you can demo)
- [ ] MCP config already set up in Kiro (`~/.kiro/settings/mcp.json`)
- [ ] Project built: `npm run build`

---

## Opening (2 min)

**What to say:**

> "I built an MCP server called terminal-mcp. It lets AI assistants like Kiro, Claude, or Cursor SSH into remote servers, run commands, transfer files, and set up port forwarding — all through natural language conversation."

> "I'll be honest — I'm not a TypeScript developer. I built this entire project using Kiro as my AI coding partner. But I understand every line of it end to end, and I'll walk you through the architecture, the code, and a live demo."

---

## Part 1: The Problem (2 min)

**What to say:**

> "When you're managing servers, you're constantly switching between your IDE and terminal — SSH in, run commands, copy files, check logs, come back to the IDE. It breaks your flow."

> "What if the AI assistant in your IDE could directly SSH into servers and do all of that for you? That's what terminal-mcp does."

---

## Part 2: Architecture Overview (3 min)

**Show:** Open `README.md` and scroll to the architecture diagram.

**What to say:**

> "The architecture is simple. Three layers:"

> "1. **MCP Client** — that's Kiro, Claude Desktop, Cursor, or any MCP-compatible client"
> "2. **terminal-mcp server** — my Node.js server that speaks MCP protocol on one side and SSH on the other"
> "3. **Remote servers** — any server you can SSH into"

> "The MCP client sends tool calls like 'connect to this server' or 'run this command'. My server translates those into SSH operations using the ssh2 library. It supports multiple concurrent connections, so you can be connected to 5 servers at once."

**Key points to mention:**
- Communication with MCP client: stdio (stdin/stdout)
- Communication with servers: SSH/SFTP
- Published on npm: `@pavanbhatt/terminal-mcp`
- Works with any MCP client, not just Kiro

---

## Part 3: Code Walkthrough (5 min)

### 3.1 — Project Structure

**Show:** File tree in Kiro

> "The project is minimal — just two source files:"
> - `src/index.ts` — the MCP server, tool definitions, and request handling
> - `src/ssh-manager.ts` — all SSH logic: connect, execute, upload, download, port forward

### 3.2 — index.ts (The MCP Server)

**Open `src/index.ts`**

**Walk through these sections:**

1. **Security helpers** (lines 14-26)
   > "First thing — security. Private keys must be within `~/.ssh/`. Path traversal like `../../etc/passwd` is blocked. These are simple but important guards."

2. **Server initialization** (lines 30-33)
   > "We create an MCP server using the official SDK. It communicates over stdio — the MCP client pipes JSON messages in and out."

3. **Tool definitions** (lines 37-140)
   > "These are the 8 tools we expose. Each tool has a name, description, and a JSON Schema for its inputs. The MCP client reads these to know what it can call."
   
   **List the tools:**
   - `ssh_connect` — connect with password, key, or ssh-agent
   - `ssh_execute` — run any command
   - `ssh_upload` / `ssh_download` — SFTP file transfer
   - `ssh_port_forward` — SSH tunneling
   - `ssh_reconnect` — reconnect using stored credentials
   - `ssh_disconnect` / `ssh_list_connections` — session management

4. **Request handlers** (lines 144-220)
   > "When the MCP client calls a tool, it hits this switch statement. Each case extracts the arguments, calls the SSH manager, and returns the result as text content."

5. **Startup** (lines 224-232)
   > "The server starts on stdio transport. That's it — no HTTP, no ports. The MCP client spawns this as a child process."

### 3.3 — ssh-manager.ts (The SSH Engine)

**Open `src/ssh-manager.ts`**

**Walk through these sections:**

1. **SSH Agent discovery** (lines 3-30)
   > "This is clever — it auto-discovers the SSH agent socket. First checks `SSH_AUTH_SOCK` env var, then looks for macOS launchd sockets, then Linux `/tmp/ssh-*` sockets. So if you have ssh-agent running, it just works."

2. **Connection management** (lines 55-130)
   > "Connections are stored in a Map keyed by `user@host:port`. When you connect, it first checks if there's already a connection and pings it. If the ping fails, it cleans up the stale connection and reconnects."
   
   > "Auth priority: ssh-agent first, then password, then private key. The first connection becomes the default."

3. **Command execution** (lines 155-195)
   > "Execute runs a command over the SSH channel. It collects stdout and stderr separately, has a configurable timeout, and detects dropped connections so it can tell you to reconnect."

4. **SFTP operations** (lines 205-240)
   > "Upload and download use SFTP under the hood. The ssh2 library gives us `fastPut` and `fastGet` which handle the streaming."

5. **Port forwarding** (lines 242-275)
   > "This creates a local TCP server that tunnels traffic through the SSH connection. So you can access a remote database on localhost. It uses Node's `net` module to create the local listener."

---

## Part 4: Live Demo (8 min)

### Demo 1: Connect and run commands

**In Kiro chat, type:**

```
connect ssh -i ~/.ssh/id_rsa pavanbhatt@pmuedge.abn.green.sophos
```

**What to say:**
> "I just asked Kiro to connect to a remote server. Behind the scenes, Kiro called the `ssh_connect` tool on my MCP server, which established an SSH connection using my key via ssh-agent."

**Then type:**
```
check disk space and memory usage
```

**What to say:**
> "Now I'm asking in plain English. Kiro figures out it needs to run `df -h` and `free -m`, calls `ssh_execute`, and shows me the results. I didn't write any commands — the AI did."

### Demo 2: File transfer

**Type:**
```
upload a file from my local machine to the server
```
or prepare a small test file and say:
```
upload /tmp/test.txt to /tmp/test.txt on the server
```

**What to say:**
> "This uses SFTP under the hood. The `ssh_upload` tool streams the file from my machine to the remote server."

### Demo 3: Multiple connections

**Type:**
```
list all active connections
```

**What to say:**
> "The server tracks all connections. You can be connected to multiple servers at once and switch between them. Each connection is identified by `user@host:port`."

### Demo 4: Real-world use case

**What to say:**
> "Let me show you a real use case. Earlier today, I used this tool to renew an SSL certificate on a production server. I asked Kiro to check the cert, generate a CSR, upload the new cert, and reload Apache — all through conversation. No manual SSH sessions."

**If time permits, show the SSL_CERT_RENEWAL_PMUEDGE.md file as evidence.**

### Demo 5: Disconnect

**Type:**
```
disconnect from the server
```

---

## Part 5: How to Install (2 min)

**Show:** README.md setup section

**What to say:**

> "Installing is one command: `npm install -g @pavanbhatt/terminal-mcp`"

> "Then you add a few lines to your MCP client config — here's the JSON for Kiro, Claude Desktop, and Cursor."

> "If you use npx, you don't even need to install — it runs directly."

---

## Part 6: Security (1 min)

**What to say:**

> "A few security points:"
> - "Private keys must be within `~/.ssh/` — the server rejects anything outside that directory"
> - "Path traversal is blocked on file transfers — no `../../` tricks"
> - "Credentials are stored in memory only, never written to disk"
> - "SSH agent is preferred over raw keys — your passphrase-protected keys stay protected"

---

## Part 7: What I Learned / Closing (2 min)

**What to say:**

> "I built this without knowing TypeScript. I used Kiro as my coding partner — it wrote the code, I guided the architecture and made the decisions. But through that process, I now understand every piece of it."

> "Key takeaways:"
> - "MCP is a powerful protocol — it lets AI assistants use tools in a standardized way"
> - "You don't need to be an expert in a language to build something useful — AI-assisted development is real"
> - "This tool saves me real time every day — server management through conversation instead of terminal switching"

> "It's published on npm, it's open source, and it works with any MCP client. Try it out."

---

## Tough Questions You Might Get (and Answers)

**Q: Why not just use the terminal?**
> "You can. But this lets the AI chain multiple operations together intelligently. Instead of you running 10 commands, you describe what you want and the AI figures out the steps. It's about flow, not replacing the terminal."

**Q: Is it secure?**
> "It uses standard SSH — same encryption, same auth. Keys must be in ~/.ssh/, path traversal is blocked, and credentials stay in memory. It's as secure as your SSH setup."

**Q: Why TypeScript?**
> "MCP SDK is in TypeScript, and it's the most common language for MCP servers. The ssh2 library is mature and well-maintained in the Node.js ecosystem."

**Q: Can it handle production servers?**
> "Yes — I used it today to renew an SSL cert on a production server. It supports connection timeouts, stale connection detection, and auto-reconnect."

**Q: What if the connection drops?**
> "The server detects stale connections via ping. If a connection drops, it tells you and you can reconnect with stored credentials — no need to re-enter everything."

**Q: How is this different from other SSH tools?**
> "Most SSH tools are standalone. This is an MCP server — it plugs into any AI assistant. The AI decides when and how to use SSH based on your natural language request. It's the bridge between AI and your infrastructure."

---

## Timing Summary

| Section | Duration |
|---------|----------|
| Opening | 2 min |
| The Problem | 2 min |
| Architecture | 3 min |
| Code Walkthrough | 5 min |
| Live Demo | 8 min |
| Installation | 2 min |
| Security | 1 min |
| Closing | 2 min |
| **Total** | **~25 min** |

---

## Tips

- Keep the demo conversational — talk while Kiro is working
- If something fails in the demo, that's fine — show the reconnect/error handling
- Don't read code line by line — explain the concept, point at the relevant section
- The SSL cert renewal story is your strongest real-world proof point — use it
- Be confident about not knowing TypeScript — it shows the power of AI-assisted development

#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SSHManager } from "./ssh-manager.js";
import { readFileSync } from "fs";
import { resolve, normalize } from "path";
import { homedir } from "os";

// --- Security helpers ---

function validatePrivateKeyPath(keyPath: string): string {
  const sshDir = resolve(homedir(), ".ssh");
  const resolved = resolve(keyPath.replace(/^~\//, homedir() + "/"));
  if (!resolved.startsWith(sshDir)) {
    throw new Error(`privateKeyPath must be within ~/.ssh/ directory. Got: ${keyPath}`);
  }
  return resolved;
}

function validateNoTraversal(filePath: string, label: string): void {
  const normalized = normalize(filePath);
  if (normalized.includes("..")) {
    throw new Error(`Path traversal detected in ${label}: ${filePath}`);
  }
}

const ssh = new SSHManager();

const server = new Server(
  { name: "terminal-mcp", version: "1.2.3" },
  { capabilities: { tools: {} } }
);

// --- Tool definitions (raw JSON Schema) ---

const tools = [
  {
    name: "ssh_connect",
    description: "Connect to a remote server via SSH",
    inputSchema: {
      type: "object" as const,
      properties: {
        host: { type: "string", description: "Hostname or IP of the target server" },
        port: { type: "number", description: "SSH port", default: 22 },
        username: { type: "string", description: "SSH username" },
        password: { type: "string", description: "SSH password" },
        privateKeyPath: { type: "string", description: "Path to SSH private key file" },
        useAgent: { type: "boolean", description: "Use SSH agent for authentication (defaults to true)", default: true },
        connectTimeout: { type: "number", description: "Connection timeout in milliseconds", default: 15000 },
      },
      required: ["host", "username"],
    },
  },
  {
    name: "ssh_execute",
    description: "Execute a command on a connected remote server",
    inputSchema: {
      type: "object" as const,
      properties: {
        host: { type: "string", description: "Hostname or IP of the target server" },
        username: { type: "string", description: "SSH username" },
        port: { type: "number", description: "SSH port", default: 22 },
        command: { type: "string", description: "Command to execute on the remote server" },
        timeout: { type: "number", description: "Command timeout in milliseconds", default: 30000 },
      },
      required: ["host", "username", "command"],
    },
  },
  {
    name: "ssh_upload",
    description: "Upload a local file to the remote server via SFTP",
    inputSchema: {
      type: "object" as const,
      properties: {
        host: { type: "string", description: "Hostname or IP of the target server" },
        username: { type: "string", description: "SSH username" },
        port: { type: "number", description: "SSH port", default: 22 },
        localPath: { type: "string", description: "Local file path to upload" },
        remotePath: { type: "string", description: "Destination path on the remote server" },
      },
      required: ["host", "username", "localPath", "remotePath"],
    },
  },
  {
    name: "ssh_download",
    description: "Download a file from the remote server via SFTP",
    inputSchema: {
      type: "object" as const,
      properties: {
        host: { type: "string", description: "Hostname or IP of the target server" },
        username: { type: "string", description: "SSH username" },
        port: { type: "number", description: "SSH port", default: 22 },
        remotePath: { type: "string", description: "File path on the remote server" },
        localPath: { type: "string", description: "Local destination path" },
      },
      required: ["host", "username", "remotePath", "localPath"],
    },
  },
  {
    name: "ssh_port_forward",
    description: "Forward a remote port to a local port via SSH tunnel",
    inputSchema: {
      type: "object" as const,
      properties: {
        host: { type: "string", description: "Hostname or IP of the SSH server" },
        username: { type: "string", description: "SSH username" },
        port: { type: "number", description: "SSH port", default: 22 },
        remoteHost: { type: "string", description: "Remote host to forward (e.g. 127.0.0.1)" },
        remotePort: { type: "number", description: "Remote port to forward (e.g. 5432 for PostgreSQL)" },
        localPort: { type: "number", description: "Local port to listen on" },
      },
      required: ["host", "username", "remoteHost", "remotePort", "localPort"],
    },
  },
  {
    name: "ssh_reconnect",
    description: "Reconnect to a previously connected server using stored credentials",
    inputSchema: {
      type: "object" as const,
      properties: {
        host: { type: "string", description: "Hostname or IP of the target server" },
        username: { type: "string", description: "SSH username" },
        port: { type: "number", description: "SSH port", default: 22 },
      },
      required: ["host", "username"],
    },
  },
  {
    name: "ssh_disconnect",
    description: "Disconnect from a remote server",
    inputSchema: {
      type: "object" as const,
      properties: {
        host: { type: "string", description: "Hostname or IP of the target server" },
        username: { type: "string", description: "SSH username" },
        port: { type: "number", description: "SSH port", default: 22 },
      },
      required: ["host", "username"],
    },
  },
  {
    name: "ssh_list_connections",
    description: "List all active SSH connections",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// --- Handlers ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "ssh_connect": {
        const { host, port = 22, username, password, privateKeyPath, useAgent = true, connectTimeout = 15000 } = args as any;
        let privateKey: string | undefined;

        // Only read the key file if NOT using agent auth
        // Encrypted keys can't be parsed by ssh2 directly
        if (privateKeyPath && !useAgent) {
          try {
            const safePath = validatePrivateKeyPath(privateKeyPath);
            privateKey = readFileSync(safePath, "utf-8");
          } catch (e: any) {
            return { content: [{ type: "text", text: `Failed to read key file: ${e.message}` }], isError: true };
          }
        }

        const result = await ssh.connect({ host, port, username, password, privateKey, useAgent, connectTimeout });
        return { content: [{ type: "text", text: result }] };
      }

      case "ssh_execute": {
        const { host, username, port = 22, command, timeout = 30000 } = args as any;
        const result = await ssh.execute(host, username, command, port, timeout);
        const parts: string[] = [];
        if (result.stdout) parts.push(`STDOUT:\n${result.stdout}`);
        if (result.stderr) parts.push(`STDERR:\n${result.stderr}`);
        parts.push(`Exit code: ${result.code}`);
        return { content: [{ type: "text", text: parts.join("\n\n") }] };
      }

      case "ssh_upload": {
        const { host, username, port = 22, localPath, remotePath } = args as any;
        validateNoTraversal(localPath, "localPath");
        validateNoTraversal(remotePath, "remotePath");
        const result = await ssh.upload(host, username, localPath, remotePath, port);
        return { content: [{ type: "text", text: result }] };
      }

      case "ssh_download": {
        const { host, username, port = 22, remotePath, localPath } = args as any;
        validateNoTraversal(remotePath, "remotePath");
        validateNoTraversal(localPath, "localPath");
        const result = await ssh.download(host, username, remotePath, localPath, port);
        return { content: [{ type: "text", text: result }] };
      }

      case "ssh_port_forward": {
        const { host, username, port = 22, remoteHost, remotePort, localPort } = args as any;
        const result = await ssh.portForward(host, username, remoteHost, remotePort, localPort, port);
        return { content: [{ type: "text", text: result }] };
      }

      case "ssh_reconnect": {
        const { host, username, port = 22 } = args as any;
        const result = await ssh.reconnect(host, username, port);
        return { content: [{ type: "text", text: result }] };
      }

      case "ssh_disconnect": {
        const { host, username, port = 22 } = args as any;
        const result = ssh.disconnect(host, username, port);
        return { content: [{ type: "text", text: result }] };
      }

      case "ssh_list_connections": {
        const connections = ssh.listConnections();
        if (connections.length === 0) {
          return { content: [{ type: "text", text: "No active connections" }] };
        }
        const lines = connections.map((c) => `${c.id}${c.isDefault ? " (default)" : ""}`);
        return { content: [{ type: "text", text: `Active connections:\n${lines.join("\n")}` }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err: any) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("terminal-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SSHManager } from "./ssh-manager.js";
import { readFileSync } from "fs";

const ssh = new SSHManager();

const server = new McpServer({
  name: "terminal-mcp",
  version: "1.1.0",
});

// --- Tools ---

server.tool(
  "ssh_connect",
  "Connect to a remote server via SSH",
  {
    host: z.string().describe("Hostname or IP of the target server"),
    port: z.number().optional().default(22).describe("SSH port"),
    username: z.string().describe("SSH username"),
    password: z.string().optional().describe("SSH password"),
    privateKeyPath: z.string().optional().describe("Path to SSH private key file"),
    useAgent: z.boolean().optional().default(true).describe("Use SSH agent for authentication (defaults to true, uses SSH_AUTH_SOCK)"),
    connectTimeout: z.number().optional().default(15000).describe("Connection timeout in milliseconds"),
  },
  async ({ host, port, username, password, privateKeyPath, useAgent, connectTimeout }) => {
    try {
      let privateKey: string | undefined;
      if (privateKeyPath) {
        privateKey = readFileSync(privateKeyPath, "utf-8");
      }
      const result = await ssh.connect({
        host, port, username, password, privateKey, useAgent, connectTimeout,
      });
      return { content: [{ type: "text", text: result }] };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Connection failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "ssh_execute",
  "Execute a command on a connected remote server",
  {
    host: z.string().describe("Hostname or IP of the target server"),
    username: z.string().describe("SSH username"),
    port: z.number().optional().default(22).describe("SSH port"),
    command: z.string().describe("Command to execute on the remote server"),
    timeout: z.number().optional().default(30000).describe("Command timeout in milliseconds"),
  },
  async ({ host, username, port, command, timeout }) => {
    try {
      const result = await ssh.execute(host, username, command, port, timeout);
      const parts: string[] = [];
      if (result.stdout) parts.push(`STDOUT:\n${result.stdout}`);
      if (result.stderr) parts.push(`STDERR:\n${result.stderr}`);
      parts.push(`Exit code: ${result.code}`);
      return { content: [{ type: "text", text: parts.join("\n\n") }] };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Execution failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "ssh_upload",
  "Upload a local file to the remote server via SFTP",
  {
    host: z.string().describe("Hostname or IP of the target server"),
    username: z.string().describe("SSH username"),
    port: z.number().optional().default(22).describe("SSH port"),
    localPath: z.string().describe("Local file path to upload"),
    remotePath: z.string().describe("Destination path on the remote server"),
  },
  async ({ host, username, port, localPath, remotePath }) => {
    try {
      const result = await ssh.upload(host, username, localPath, remotePath, port);
      return { content: [{ type: "text", text: result }] };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Upload failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "ssh_download",
  "Download a file from the remote server via SFTP",
  {
    host: z.string().describe("Hostname or IP of the target server"),
    username: z.string().describe("SSH username"),
    port: z.number().optional().default(22).describe("SSH port"),
    remotePath: z.string().describe("File path on the remote server"),
    localPath: z.string().describe("Local destination path"),
  },
  async ({ host, username, port, remotePath, localPath }) => {
    try {
      const result = await ssh.download(host, username, remotePath, localPath, port);
      return { content: [{ type: "text", text: result }] };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Download failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "ssh_port_forward",
  "Forward a remote port to a local port via SSH tunnel",
  {
    host: z.string().describe("Hostname or IP of the SSH server"),
    username: z.string().describe("SSH username"),
    port: z.number().optional().default(22).describe("SSH port"),
    remoteHost: z.string().describe("Remote host to forward (e.g. 127.0.0.1 or a database host)"),
    remotePort: z.number().describe("Remote port to forward (e.g. 5432 for PostgreSQL)"),
    localPort: z.number().describe("Local port to listen on"),
  },
  async ({ host, username, port, remoteHost, remotePort, localPort }) => {
    try {
      const result = await ssh.portForward(host, username, remoteHost, remotePort, localPort, port);
      return { content: [{ type: "text", text: result }] };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Port forward failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "ssh_reconnect",
  "Reconnect to a previously connected server using stored credentials",
  {
    host: z.string().describe("Hostname or IP of the target server"),
    username: z.string().describe("SSH username"),
    port: z.number().optional().default(22).describe("SSH port"),
  },
  async ({ host, username, port }) => {
    try {
      const result = await ssh.reconnect(host, username, port);
      return { content: [{ type: "text", text: result }] };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Reconnect failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "ssh_disconnect",
  "Disconnect from a remote server",
  {
    host: z.string().describe("Hostname or IP of the target server"),
    username: z.string().describe("SSH username"),
    port: z.number().optional().default(22).describe("SSH port"),
  },
  async ({ host, username, port }) => {
    const result = ssh.disconnect(host, username, port);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "ssh_list_connections",
  "List all active SSH connections",
  {},
  async () => {
    const connections = ssh.listConnections();
    if (connections.length === 0) {
      return { content: [{ type: "text", text: "No active connections" }] };
    }
    const lines = connections.map(
      (c) => `${c.id}${c.isDefault ? " (default)" : ""}`
    );
    return {
      content: [{ type: "text", text: `Active connections:\n${lines.join("\n")}` }],
    };
  }
);

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

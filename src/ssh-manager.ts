import { Client, SFTPWrapper, ConnectConfig } from "ssh2";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

function findAgentSocket(): string | undefined {
  // 1. Check SSH_AUTH_SOCK env var
  const envSock = process.env.SSH_AUTH_SOCK;
  if (envSock && existsSync(envSock)) {
    return envSock;
  }

  // 2. macOS: check launchd sockets
  try {
    const launchdDir = "/var/run/com.apple.launchd.";
    const tmpDirs = readdirSync("/var/run/")
      .filter((d) => d.startsWith("com.apple.launchd."))
      .map((d) => join("/var/run/", d));
    for (const dir of tmpDirs) {
      const sock = join(dir, "Listeners");
      if (existsSync(sock)) return sock;
    }
  } catch {}

  // 3. Linux: check /tmp for ssh-agent sockets
  try {
    const tmpDirs = readdirSync("/tmp/")
      .filter((d) => d.startsWith("ssh-"))
      .map((d) => join("/tmp/", d));
    for (const dir of tmpDirs) {
      const files = readdirSync(dir).filter((f) => f.startsWith("agent."));
      if (files.length > 0) return join(dir, files[0]);
    }
  } catch {}

  return undefined;
}

export interface ConnectionConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  useAgent?: boolean;
  connectTimeout?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export class SSHManager {
  private connections = new Map<string, Client>();
  private configs = new Map<string, ConnectionConfig>();
  private defaultConnection: string | null = null;

  private key(cfg: ConnectionConfig): string {
    return `${cfg.username}@${cfg.host}:${cfg.port ?? 22}`;
  }

  private keyFromParts(host: string, username: string, port = 22): string {
    return `${username}@${host}:${port}`;
  }

  async connect(cfg: ConnectionConfig): Promise<string> {
    const id = this.key(cfg);

    // If already connected, verify the connection is alive
    if (this.connections.has(id)) {
      const existing = this.connections.get(id)!;
      try {
        await this.ping(existing);
        return `Already connected to ${id}`;
      } catch {
        // Connection is stale, clean up and reconnect
        existing.end();
        this.connections.delete(id);
        this.configs.delete(id);
      }
    }

    const client = new Client();
    const timeout = cfg.connectTimeout ?? 15000;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.end();
        reject(new Error(`Connection to ${id} timed out after ${timeout}ms`));
      }, timeout);

      const connectOpts: ConnectConfig = {
        host: cfg.host,
        port: cfg.port ?? 22,
        username: cfg.username,
        readyTimeout: timeout,
      };

      // Auth priority: agent > password > privateKey
      if (cfg.useAgent || (!cfg.password && !cfg.privateKey)) {
        const agentSock = findAgentSocket();
        if (agentSock) {
          connectOpts.agent = agentSock;
          // Don't pass privateKey when using agent — ssh2 will try to parse it
          // and fail on encrypted keys
        } else if (cfg.privateKey) {
          connectOpts.privateKey = cfg.privateKey;
        } else if (cfg.password) {
          connectOpts.password = cfg.password;
        }
      } else if (cfg.privateKey) {
        connectOpts.privateKey = cfg.privateKey;
      } else if (cfg.password) {
        connectOpts.password = cfg.password;
      }

      client
        .on("ready", () => {
          clearTimeout(timer);
          resolve();
        })
        .on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        })
        .connect(connectOpts);
    });

    // Set up auto-reconnect on unexpected close
    client.on("close", () => {
      if (this.connections.has(id)) {
        this.connections.delete(id);
        // Keep config for potential reconnect
        console.error(`Connection to ${id} closed unexpectedly. Use connect to reconnect.`);
      }
    });

    this.connections.set(id, client);
    this.configs.set(id, cfg);

    // Set as default if it's the first connection
    if (this.defaultConnection === null) {
      this.defaultConnection = id;
    }

    return `Connected to ${id}`;
  }

  async reconnect(host: string, username: string, port = 22): Promise<string> {
    const id = this.keyFromParts(host, username, port);
    const cfg = this.configs.get(id);
    if (!cfg) {
      throw new Error(`No previous connection config for ${id}. Use connect first.`);
    }

    // Clean up existing connection if any
    const existing = this.connections.get(id);
    if (existing) {
      existing.end();
      this.connections.delete(id);
    }

    return this.connect(cfg);
  }

  private ping(client: Client): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Ping timeout")), 5000);
      client.exec("echo ok", (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return reject(err);
        }
        stream.on("close", () => {
          clearTimeout(timer);
          resolve();
        });
        stream.resume();
      });
    });
  }

  private getClient(host: string, username: string, port = 22): Client {
    const id = this.keyFromParts(host, username, port);
    const client = this.connections.get(id);
    if (!client) {
      throw new Error(`No active connection to ${id}. Call connect first.`);
    }
    return client;
  }

  async execute(
    host: string,
    username: string,
    command: string,
    port = 22,
    timeout = 30000
  ): Promise<ExecResult> {
    const client = this.getClient(host, username, port);

    return new Promise<ExecResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          // Check if connection dropped
          if (err.message.includes("Not connected") || err.message.includes("Channel open")) {
            const id = this.keyFromParts(host, username, port);
            this.connections.delete(id);
            return reject(new Error(`Connection to ${id} lost. Use reconnect or connect again.`));
          }
          return reject(err);
        }

        let stdout = "";
        let stderr = "";

        stream
          .on("close", (code: number | null) => {
            clearTimeout(timer);
            resolve({ stdout, stderr, code });
          })
          .on("data", (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });
      });
    });
  }

  private getSftp(host: string, username: string, port = 22): Promise<SFTPWrapper> {
    const client = this.getClient(host, username, port);
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) reject(err);
        else resolve(sftp);
      });
    });
  }

  async upload(
    host: string,
    username: string,
    localPath: string,
    remotePath: string,
    port = 22
  ): Promise<string> {
    const sftp = await this.getSftp(host, username, port);
    return new Promise((resolve, reject) => {
      sftp.fastPut(localPath, remotePath, (err) => {
        if (err) reject(err);
        else resolve(`Uploaded ${localPath} -> ${remotePath}`);
      });
    });
  }

  async download(
    host: string,
    username: string,
    remotePath: string,
    localPath: string,
    port = 22
  ): Promise<string> {
    const sftp = await this.getSftp(host, username, port);
    return new Promise((resolve, reject) => {
      sftp.fastGet(remotePath, localPath, (err) => {
        if (err) reject(err);
        else resolve(`Downloaded ${remotePath} -> ${localPath}`);
      });
    });
  }

  async portForward(
    host: string,
    username: string,
    remoteHost: string,
    remotePort: number,
    localPort: number,
    port = 22
  ): Promise<string> {
    const client = this.getClient(host, username, port);
    const net = await import("net");

    return new Promise((resolve, reject) => {
      const server = net.createServer((sock) => {
        client.forwardOut(
          "127.0.0.1",
          localPort,
          remoteHost,
          remotePort,
          (err, stream) => {
            if (err) {
              sock.end();
              return;
            }
            sock.pipe(stream).pipe(sock);
          }
        );
      });

      server.listen(localPort, "127.0.0.1", () => {
        resolve(
          `Port forward active: localhost:${localPort} -> ${remoteHost}:${remotePort} (via ${host})`
        );
      });

      server.on("error", (err) => {
        reject(new Error(`Port forward failed: ${err.message}`));
      });
    });
  }

  disconnect(host: string, username: string, port = 22): string {
    const id = this.keyFromParts(host, username, port);
    const client = this.connections.get(id);
    if (!client) {
      return `No active connection to ${id}`;
    }
    client.end();
    this.connections.delete(id);
    this.configs.delete(id);
    if (this.defaultConnection === id) {
      const remaining = Array.from(this.connections.keys());
      this.defaultConnection = remaining.length > 0 ? remaining[0] : null;
    }
    return `Disconnected from ${id}`;
  }

  setDefault(host: string, username: string, port = 22): string {
    const id = this.keyFromParts(host, username, port);
    if (!this.connections.has(id)) {
      throw new Error(`No active connection to ${id}`);
    }
    this.defaultConnection = id;
    return `Default connection set to ${id}`;
  }

  getDefault(): string | null {
    return this.defaultConnection;
  }

  listConnections(): { id: string; isDefault: boolean }[] {
    return Array.from(this.connections.keys()).map((id) => ({
      id,
      isDefault: id === this.defaultConnection,
    }));
  }

  disconnectAll(): void {
    for (const [, client] of this.connections) {
      client.end();
    }
    this.connections.clear();
    this.configs.clear();
    this.defaultConnection = null;
  }
}

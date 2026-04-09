import { Client, SFTPWrapper } from "ssh2";
import { createConnection } from "net";

export interface ConnectionConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  useAgent?: boolean;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export class SSHManager {
  private connections = new Map<string, Client>();

  private key(cfg: ConnectionConfig): string {
    return `${cfg.username}@${cfg.host}:${cfg.port ?? 22}`;
  }

  async connect(cfg: ConnectionConfig): Promise<string> {
    const id = this.key(cfg);
    if (this.connections.has(id)) {
      return `Already connected to ${id}`;
    }

    const client = new Client();

    await new Promise<void>((resolve, reject) => {
      const connectOpts: any = {
        host: cfg.host,
        port: cfg.port ?? 22,
        username: cfg.username,
        password: cfg.password,
        privateKey: cfg.privateKey,
      };

      // Use SSH agent if requested or if no other auth method provided
      if (cfg.useAgent || (!cfg.password && !cfg.privateKey)) {
        const agentSock = process.env.SSH_AUTH_SOCK;
        if (agentSock) {
          connectOpts.agent = agentSock;
        }
      }

      client
        .on("ready", () => resolve())
        .on("error", (err) => reject(err))
        .connect(connectOpts);
    });

    this.connections.set(id, client);
    return `Connected to ${id}`;
  }

  async execute(
    host: string,
    username: string,
    command: string,
    port = 22,
    timeout = 30000
  ): Promise<ExecResult> {
    const id = `${username}@${host}:${port}`;
    const client = this.connections.get(id);
    if (!client) {
      throw new Error(`No active connection to ${id}. Call connect first.`);
    }

    return new Promise<ExecResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
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

  private getSftp(id: string): Promise<SFTPWrapper> {
    const client = this.connections.get(id);
    if (!client) {
      throw new Error(`No active connection to ${id}. Call connect first.`);
    }
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
    const id = `${username}@${host}:${port}`;
    const sftp = await this.getSftp(id);
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
    const id = `${username}@${host}:${port}`;
    const sftp = await this.getSftp(id);
    return new Promise((resolve, reject) => {
      sftp.fastGet(remotePath, localPath, (err) => {
        if (err) reject(err);
        else resolve(`Downloaded ${remotePath} -> ${localPath}`);
      });
    });
  }

  disconnect(host: string, username: string, port = 22): string {
    const id = `${username}@${host}:${port}`;
    const client = this.connections.get(id);
    if (!client) {
      return `No active connection to ${id}`;
    }
    client.end();
    this.connections.delete(id);
    return `Disconnected from ${id}`;
  }

  listConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  disconnectAll(): void {
    for (const [id, client] of this.connections) {
      client.end();
      this.connections.delete(id);
    }
  }
}

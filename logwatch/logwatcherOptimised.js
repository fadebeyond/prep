const fs = require("fs");
const http = require("http");
const WebSocket = require("ws");

class LogWatcher {
  constructor(logFilePath) {
    this.logFilePath = logFilePath;
    this.lastPosition = 0;
    this.watcher = null;
  }

  async watchLog(ws) {
    // Send last 10 lines initially
    const initialContent = await this.getLastNLines();
    ws.send(initialContent);

    // Set up file watcher
    this.watcher = fs.watch(this.logFilePath, async (eventType) => {
      if (eventType === "change") {
        try {
          const newContent = await this.readNewContent();
          if (newContent) {
            ws.send(newContent);
          }
        } catch (error) {
          console.error(`Error reading file: ${this.logFilePath}`, error);
        }
      }
    });

    // Handle WebSocket close
    ws.on("close", () => {
      this.stopWatching();
    });
  }

  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  async readNewContent() {
    return new Promise((resolve, reject) => {
      fs.stat(this.logFilePath, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        if (stats.size < this.lastPosition) {
          this.lastPosition = 0; // File was truncated, reset position
        }

        const stream = fs.createReadStream(this.logFilePath, {
          start: this.lastPosition,
        });
        let newContent = "";

        stream.on("data", (chunk) => {
          newContent += chunk.toString();
        });

        stream.on("end", () => {
          this.lastPosition = stats.size;
          // Split the new content into lines and get the last 10
          const lines = newContent
            .split("\n")
            .filter((line) => line.trim() !== "");
          const lastTenLines = lines.slice(-10).join("\n");
          resolve(lastTenLines);
        });

        stream.on("error", reject);
      });
    });
  }

  async getLastNLines(n = 10) {
    return new Promise((resolve, reject) => {
      fs.stat(this.logFilePath, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        const fileSize = stats.size;
        const stream = fs.createReadStream(this.logFilePath, {
          start: Math.max(0, fileSize - 8192), // Start reading from the last 8KB of the file
          end: fileSize,
        });

        let data = "";
        stream.on("data", (chunk) => {
          data = chunk.toString() + data;
        });

        stream.on("end", () => {
          const lines = data.split("\n").filter((line) => line.trim() !== "");
          resolve(lines.slice(-n).join("\n"));
        });

        stream.on("error", reject);
      });
    });
  }
}

const logWatcher = new LogWatcher("log.txt");

const server = http.createServer(async (req, res) => {
  if (req.url === "/log") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(await fs.promises.readFile("index.html"));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Client connected");
  logWatcher.watchLog(ws);

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

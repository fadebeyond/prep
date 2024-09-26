const http = require("http");
const fs = require("fs");
const WebSocket = require("ws");
const PORT = 3000;
const LOG_FILE_PATH = "./log.txt"; // Path to your log file
// Serve the HTML file to the client
const server = http.createServer((req, res) => {
  if (req.url === "/log") {
    fs.readFile("./index.html", (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
      }
    });
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});
// Create a WebSocket server
const wss = new WebSocket.Server({ server });
// Utility function to get the last N lines of a file
const getLastNLines = (n, filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf-8", (err, data) => {
      if (err) {
        return reject(err);
      }

      const lines = data.split("\n").filter(Boolean); // Ensure no empty lines
      const lastLines = lines.slice(-n); // Get the last N lines
      resolve(lastLines);
    });
  });
};
// Monitor the log file for changes
let logFileSize = fs.statSync(LOG_FILE_PATH).size; // Keep track of the file size
fs.watch(LOG_FILE_PATH, (eventType, filename) => {
  if (filename && eventType === "change") {
    const newSize = fs.statSync(LOG_FILE_PATH).size;
    if (newSize > logFileSize) {
      logFileSize = newSize; // Update file size immediately
      // Fetch the last 10 lines again (after the file is updated)
      getLastNLines(10, LOG_FILE_PATH)
        .then((lastLines) => {
          const last10Lines = lastLines.join("\n");
          // Send the last 10 lines to all connected clients
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(last10Lines); // Send the last 10 lines
            }
          });
        })
        .catch((err) => {
          console.error("Error reading file:", err);
        });
    }
  }
});
// Handle WebSocket connections
wss.on("connection", async (ws) => {
  // Send the last 10 lines when a client connects
  const lastLines = await getLastNLines(10, LOG_FILE_PATH);
  ws.send(lastLines.join("\n"));
});
// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}/log`);
});

const http = require("http");
const { exec } = require("child_process");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("node:path");
// Step 1: Launch Chrome with remote debugging enabled
const dirname = "C:\\'Program Files'\\Google\\Chrome\\Application\\chrome.exe";
exec(
  "C:/Program Files/Google/Chrome/Application/chrome.exe --remote-debugging-port=9222 --headless --disable-gpu --start-maximized",
  (err) => {
    if (err) {
      console.error("Error launching Chrome:", err);
      return;
    }
    console.log("Chrome launched with remote debugging enabled.");
    // Step 2: Get the WebSocket Debugging URL from Chrome
    http
      .get("http://localhost:9222/json", (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const tabs = JSON.parse(data);
          const wsURL = tabs[0].webSocketDebuggerUrl;
          // Step 3: Connect to Chrome's DevTools Protocol via WebSocket
          const ws = new WebSocket(wsURL);
          ws.on("open", () => {
            console.log("Connected to Chrome DevTools Protocol");
            // Step 4: Send a command to take a screenshot
            const message = JSON.stringify({
              id: 1,
              method: "Page.captureScreenshot",
              params: {
                format: "png",
              },
            });
            ws.send(message);
          });
          ws.on("message", (data) => {
            const response = JSON.parse(data);
            if (response.id === 1) {
              // Step 5: Save the screenshot
              const screenshot = Buffer.from(response.result.data, "base64");
              fs.writeFileSync("screenshot.png", screenshot);
              console.log("Screenshot saved as screenshot.png");
              // Close the WebSocket connection
              ws.close();
            }
          });
          ws.on("close", () => {
            console.log("Connection to Chrome DevTools Protocol closed.");
          });
        });
      })
      .on("error", (err) => {
        console.error("Error fetching Chrome DevTools information:", err);
      });
  }
);

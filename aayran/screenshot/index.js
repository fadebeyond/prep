const { exec } = require("child_process"); // Import exec function from child_process module to run shell commands
const WebSocket = require("ws"); // Import WebSocket module for WebSocket communication
const fs = require("fs"); // Import fs module for file system operations
const path = require("path"); // Import path module for handling file paths
const http = require("http"); // Import http module for making HTTP requests

let activeTabId = null; // Variable to store the ID of the active tab
let lastScreenshotPath = null; // Variable to store the path of the last screenshot

function findChrome() {
  // Function to find the Chrome executable
  const possiblePaths = [
    // Array of possible paths where Chrome might be installed
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  ];

  for (const chromePath of possiblePaths) {
    // Loop through each possible path
    if (fs.existsSync(chromePath)) return chromePath; // If Chrome is found, return the path
  }
  throw new Error("Chrome executable not found."); // If Chrome is not found, throw an error
}

function launchChromeWithProfile(profileName) {
  // Function to launch Chrome with a specific profile
  const chromePath = findChrome(); // Find the Chrome executable
  const command = `"${chromePath}" --remote-debugging-port=9223 --disable-gpu --window-size=1920,1080 --profile-directory="${profileName}" about:blank`; // Command to launch Chrome with remote debugging
  exec(command); // Execute the command to launch Chrome
  setTimeout(() => pollForActiveTab(9223), 5000); // Wait 5 seconds and then start polling for the active tab
}

function pollForActiveTab(port) {
  // Function to poll for the active tab
  const interval = setInterval(() => {
    // Set an interval to poll every 5 seconds
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      // Make an HTTP GET request to the Chrome debugging endpoint
      let data = ""; // Variable to store the response data
      res.on("data", (chunk) => (data += chunk)); // Append data chunks to the data variable
      res.on("end", () => {
        // When the response ends
        const tabs = JSON.parse(data); // Parse the response data as JSON
        if (tabs.length === 0) {
          // If no tabs are found
          clearInterval(interval); // Clear the interval
          return; // Exit the function
        }

        const lastTab = tabs.find(
          // Find the last tab that is not the active tab, is a page, and is not a chrome:// URL
          (tab) =>
            tab.id !== activeTabId &&
            tab.type === "page" &&
            !tab.url.startsWith("chrome://")
        );
        if (lastTab) {
          // If a valid tab is found
          activeTabId = lastTab.id; // Set the active tab ID
          captureScreenshot(lastTab.webSocketDebuggerUrl); // Capture a screenshot of the tab
        }
      });
    });
  }, 5000); // Poll every 5 seconds
}

function captureScreenshot(wsURL) {
  // Function to capture a screenshot
  const ws = new WebSocket(wsURL); // Create a new WebSocket connection

  ws.on("open", () => {
    // When the WebSocket connection opens
    ws.send(JSON.stringify({ id: 1, method: "Page.enable" })); // Send a message to enable the Page domain
  });

  ws.on("message", (data) => {
    // When a message is received
    const response = JSON.parse(data); // Parse the message as JSON
    if (response.id === 1) {
      // If the response is for the Page.enable message
      ws.send(
        // Send a message to capture a screenshot
        JSON.stringify({
          id: 2,
          method: "Page.captureScreenshot",
          params: { format: "png", captureBeyondViewport: true },
        })
      );
    } else if (response.id === 2 && response.result?.data) {
      // If the response is for the captureScreenshot message and contains data
      const screenshotPath = path.join(
        // Create the path for the screenshot
        "c:\\screenshots",
        `latest_screenshot.png`
      );
      if (!fs.existsSync("c:\\screenshots")) fs.mkdirSync("c:\\screenshots"); // Create the screenshots directory if it doesn't exist

      fs.writeFileSync(
        // Write the screenshot data to a file
        screenshotPath,
        Buffer.from(response.result.data, "base64")
      );
      lastScreenshotPath = screenshotPath; // Set the last screenshot path

      ws.close(); // Close the WebSocket connection
    }
  });

  ws.on("error", (err) => console.error("WebSocket error:", err)); // Log any WebSocket errors
}

function returnLastScreenshot() {
  // Function to return the last screenshot path
  console.log(
    // Log the last screenshot path or a message if no screenshots were captured
    lastScreenshotPath
      ? `Last screenshot: ${lastScreenshotPath}`
      : "No screenshots captured."
  );
}

launchChromeWithProfile("main"); // Launch Chrome with the "main" profile

process.on("exit", returnLastScreenshot); // When the process exits, return the last screenshot path

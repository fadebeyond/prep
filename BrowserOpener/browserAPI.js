const express = require("express");
const puppeteer = require("puppeteer");
const app = express();
app.use(express.json());
let browserInstance = null;
let currentBrowser = null;
let activePage = null;
// Start the browser with a given URL
app.post("/start", async (req, res) => {
  const { browser, url } = req.body;
  try {
    if (browserInstance) {
      return res.status(400).send("Browser is already running.");
    }
    if (browser === "chrome") {
      browserInstance = await puppeteer.launch({
        headless: false, // Launch Chrome in visible mode
        defaultViewport: null, // Adjust viewport to user's screen size
        args: ["--no-first-run", "--no-default-browser-check"],
      });
    } else if (browser === "firefox") {
      browserInstance = await puppeteer.launch({
        browser: "firefox",
        headless: false, // Visible mode
        defaultViewport: null, // Adjust viewport to user's screen size
        args: ["--no-first-run", "--no-default-browser-check"],
      });
    } else {
      return res.status(400).send("Unsupported browser.");
    }
    activePage = await browserInstance.newPage();
    await activePage.goto(url);
    currentBrowser = browser;
    res.send(`Started ${browser} and opened ${url}`);
  } catch (error) {
    res.status(500).send("Failed to start browser: " + error.message);
  }
});
// Stop the browser
app.post("/stop", async (req, res) => {
  if (!browserInstance) {
    return res.status(400).send("No browser is running.");
  }
  try {
    await browserInstance.close();
    browserInstance = null;
    currentBrowser = null;
    res.send("Browser stopped successfully.");
  } catch (error) {
    res.status(500).send("Failed to stop the browser: " + error.message);
  }
});
// Clean up the browser data (cookies, cache, session, history, downloads)
app.post("/cleanup", async (req, res) => {
  if (!activePage) {
    return res.status(400).send("No active browser to clean up.");
  }
  try {
    const client = await activePage.target().createCDPSession();
    await client.send("Storage.clearDataForOrigin", {
      origin: activePage.url(),
      storageTypes: "cookies,local_storage,cache_storage,indexeddb,websql",
    });
    res.send("Cleaned up browser data.");
  } catch (error) {
    res.status(500).send("Failed to clean up browser data: " + error.message);
  }
});
// Get the current URL of the active tab
app.get("/geturl", async (req, res) => {
  if (!activePage) {
    return res.status(400).send("No active browser tab.");
  }
  try {
    const url = await activePage.url();
    res.send(`Current active tab URL: ${url}`);
  } catch (error) {
    res.status(500).send("Failed to get URL: " + error.message);
  }
});
const port = 3000;
app.listen(port, () => {
  console.log(`Web service running on port ${port}`);
});

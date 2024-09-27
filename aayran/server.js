const fs = require("fs");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const logFilePath = path.join(__dirname, "log.txt");

// Create the HTTP server
const server = http.createServer((req, res) => {
  if (req.url === "/log") {
    // Serve the HTML page when the client requests "/log"
    fs.readFile(path.join(__dirname, "index.html"), (err, data) => {
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

// Set up the WebSocket server
const wss = new WebSocket.Server({ server });

// wss.on(EVENT, FUNCTION);

wss.on("connection", (ws) => {
  console.log("Client connected");

  // Send the last 10 lines when the client connects
  sendLastTenLines(ws, logFilePath).then((lastReadPosition) => {
    // Watch for updates in the log file and stream new lines to client
    watchForFileChanges(ws, logFilePath, lastReadPosition);
  });

  ws.on("close", () => {
    //TODO: Close the websocket connection?
    console.log("Client disconnected");
  });
});

// Start the server
server.listen(3000, () => {
  console.log("Server is running on http://localhost:3000/log");
});

// Helper function to send the last 10 lines of the log file efficiently
function sendLastTenLines(ws, filePath) {
  return new Promise((resolve, reject) => {
    const chunkSize = 4096; // Read in chunks of 4KB, so that we dont have to load the entire file in memory
    let buffer = ""; // is a string that temporarily stores the chunks of file content as we read them. We'll keep adding to this buffer as we read more chunks from the file.

    let lines = []; //This is an array that will store the individual log lines as we split the file content by newline character

    fs.stat(filePath, (err, stats) => {
      if (err) {
        console.error("Error accessing log file:", err);
        return reject(err);
      }

      const fileSize = stats.size;
      let currentPosition = fileSize; //nitially, this is set to the end of the file (the file size), so we can start reading from the last part of the file and work backwards.

      //100KB -> log.txt
      //currentPosition = 100KB

      const readNextChunk = () => {
        const start = Math.max(0, currentPosition - chunkSize); //start = 96KB || 0
        const end = currentPosition; //end = 100KB || 3KB

        if (start === end) {
          // We've reached the start of the file
          console.log("Sending last 10 lines to client:", lines.join("\n"));
          ws.send(lines.join("\n"));
          return resolve(fileSize);
        }

        const stream = fs.createReadStream(filePath, { start, end: end - 1 }); // In JavaScript, file reading is inclusive of the start but exclusive of the end. So, if you want to read up to the current position (end), you need to stop just before it (end - 1).
        //A "readable stream" in Node.js is an abstraction for a source of data that you can read from. It allows you to handle data that is being read from a source (like a file, network socket, or another input) in a continuous, efficient manner without having to load the entire data into memory at once.
        //jab stream bani to vo automatically data read karna shuru kar deta hai in the form of "chunks" -> which releeases the "data" event and we pass the chunk in the cb
        stream.on("data", (chunk) => {
          //attaches an event listener to "data" -> name of the event to listen to.  The "data" event is emitted whenever a chunk of data is available to be read from the stream.
          buffer = chunk.toString() + buffer;
          lines = buffer.trim().split("\n"); // Trim to avoid counting empty line
          //a\nb\n -> [a, b]

          if (lines.length >= 10) {
            // We have enough lines, so stop reading
            // console.log(
            //   "Sending last 10 lines to client:",
            //   lines.slice(-10).join("\n") //get last 10 elems and unko string me convert kardo with delimeter = \n
            // );
            ws.send(lines.slice(-10).join("\n")); //sending value to UI -> 5\n6\n7\n...
            resolve(fileSize); //100KB
            stream.close(); // Stop the stream
          }
        });

        stream.on("end", () => {
          //end is the "event" emitted with there is no more data to be read from the chunk, released by line 77
          //After 1st loop
          //currentPosition ->100KB
          //start -> 96KB
          //end ->100KB

          currentPosition = start; //96KB

          if (lines.length < 10) {
            // If we still don't have enough lines, keep reading
            readNextChunk();
          }
        });

        stream.on("error", (err) => {
          console.error("Error reading the log file:", err);
          reject(err);
        });
      };

      // Start reading backwards from the end of the file
      readNextChunk();
    });
  });
}

//Debouncing function to avoid multiple triggers in quick succession
//Debouncing is a programming technique used to limit the number of times a function gets called. It's particularly useful when you have events that trigger many times in a short period (e.g., window resizing, key presses, or file changes), and you only want to execute the function once after the event has "settled down."
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
// 0s -> f(): f will get called. -> timer = 10s. 9s ->f() ->timer will restart -> 10s

// Helper function to watch the file for changes and send new lines to the client
function watchForFileChanges(ws, filePath, lastReadPosition) {
  const debouncedSendNewLines = debounce(() => {
    fs.stat(filePath, (err, stats) => {
      if (err) return console.error(err);

      if (stats.size > lastReadPosition) {
        const stream = fs.createReadStream(filePath, {
          start: lastReadPosition, //100KB
          end: stats.size, //101KB
        });

        let newData = "";
        stream.on("data", (chunk) => {
          newData += chunk.toString();
        });

        stream.on("end", () => {
          console.log("Sending new data to client:", newData.trim());
          ws.send(newData.trim()); //sends to the UI
          lastReadPosition = stats.size; // Update the position for the next read 101KB
        });

        stream.on("error", (err) => {
          console.error("Error reading the log file:", err);
        });
      }
    });
  }, 100); // Debounce for 100ms to avoid multiple triggers

  fs.watch(filePath, (eventType) => {
    if (eventType === "change") {
      debouncedSendNewLines(); // Call the debounced function
    }
  });
}

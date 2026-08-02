import http from "node:http";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8080);
const app = createApp();
const server = http.createServer(app);
const webSocketServer = new WebSocketServer({ server });

webSocketServer.on("connection", (socket) => {
  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      return;
    }

    const text = typeof data === "string" ? data : data.toString("utf8");
    socket.send(text);
  });
});

server.listen(port, () => {
  console.log(`realtime gateway listening on port ${port}`);
});
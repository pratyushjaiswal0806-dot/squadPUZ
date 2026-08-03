import http from "node:http";
import { createApp } from "./app.js";
import { RealtimeGatewayServer } from "./services/realtimeGateway.js";

const port = Number(process.env.PORT ?? 8080);
const app = createApp();
const server = http.createServer(app);

const gatewayServer = new RealtimeGatewayServer();
gatewayServer.attachToHttpServer(server);

server.listen(port, () => {
  console.log(`realtime gateway listening on port ${port}`);
});
import http from "node:http";
import { createApp } from "./app.js";
import { attachSonicGateway } from "./sonicGateway.js";

const port = Number(process.env.PORT || 8080);
const app = createApp();
const server = http.createServer(app);
attachSonicGateway(server);

server.listen(port, () => {
  console.log(`[nova-agent] Listening on http://127.0.0.1:${port}`);
});

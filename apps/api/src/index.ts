import serverless from "serverless-http";
import { createApp } from "./app.js";

const app = createApp();

export default serverless(app);
export { app };
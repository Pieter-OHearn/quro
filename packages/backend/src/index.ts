import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors";
import { errorHandler } from "./middleware/errorHandler";
import { requireAuth } from "./middleware/auth";
import auth from "./routes/auth";
import savings from "./routes/savings";
import investments from "./routes/investments";
import pensions from "./routes/pensions";
import mortgages from "./routes/mortgages";
import salary from "./routes/salary";
import goals from "./routes/goals";
import budget from "./routes/budget";
import dashboard from "./routes/dashboard";
import currency from "./routes/currency";

const app = new Hono();

app.use("*", corsMiddleware);
app.onError(errorHandler);

// Public routes
app.route("/api/auth", auth);
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Protected routes
app.use("/api/savings/*", requireAuth);
app.use("/api/investments/*", requireAuth);
app.use("/api/pensions/*", requireAuth);
app.use("/api/mortgages/*", requireAuth);
app.use("/api/salary/*", requireAuth);
app.use("/api/goals/*", requireAuth);
app.use("/api/budget/*", requireAuth);
app.use("/api/dashboard/*", requireAuth);
app.use("/api/currency/*", requireAuth);

app.route("/api/savings", savings);
app.route("/api/investments", investments);
app.route("/api/pensions", pensions);
app.route("/api/mortgages", mortgages);
app.route("/api/salary", salary);
app.route("/api/goals", goals);
app.route("/api/budget", budget);
app.route("/api/dashboard", dashboard);
app.route("/api/currency", currency);

export default {
  port: parseInt(process.env.PORT || "3000"),
  fetch: app.fetch,
};

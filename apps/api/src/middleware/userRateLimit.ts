import rateLimit from "express-rate-limit";
import { config } from "../config.js";

export const authenticatedRateLimit = rateLimit({
  windowMs: 60_000, limit: config.API_RATE_LIMIT_PER_MINUTE, keyGenerator: req => req.auth!.id,
  standardHeaders: "draft-7", legacyHeaders: false,
  message: { message: "Quá nhiều yêu cầu. Vui lòng thử lại sau một phút." }
});

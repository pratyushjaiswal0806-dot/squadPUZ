import { Router } from "express";
import { AppError } from "../errors.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const uploadRouter = Router();

uploadRouter.post(
  "/upload",
  createRateLimiter("upload", 5),
  (req, _res, next) => {
    const contentType = req.headers["content-type"] || "";
    
    // Verify multipart presence per TRD spec
    if (!contentType.includes("multipart/form-data")) {
      return next(
        new AppError("INVALID_UPLOAD", "Upload request must be multipart/form-data", {
          statusCode: 400
        })
      );
    }

    // Stub endpoint returns 501 NOT_IMPLEMENTED per Phase 1 specs
    next(
      new AppError("NOT_IMPLEMENTED", "Image upload service is stubbed in Phase 1 (real implementation in Phase 2)", {
        statusCode: 501,
        retryable: false
      })
    );
  }
);

export default uploadRouter;

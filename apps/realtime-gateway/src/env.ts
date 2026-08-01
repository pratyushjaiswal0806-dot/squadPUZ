const monitoredEnvVars = [
  "MONGODB_URI",
  "UPSTASH_REDIS_URL",
  "UPSTASH_REDIS_TOKEN",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "SESSION_TOKEN_SECRET",
  "ASSET_HMAC_SECRET",
  "CDN_BASE_URL",
  "REALTIME_WS_URL",
  "ALLOWED_ORIGIN"
];

export function warnMissingEnvVars(scope: string): void {
  const missing = monitoredEnvVars.filter((name) => !(process.env[name]?.trim() ?? ""));

  if (missing.length > 0) {
    console.warn(`[${scope}] missing optional environment variables: ${missing.join(", ")}`);
  }
}
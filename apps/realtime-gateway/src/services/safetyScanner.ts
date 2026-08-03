export interface SafetyScanResult {
  isSafe: boolean;
  reason?: string;
  flaggedCategories?: string[];
}

export interface ContentSafetyScanner {
  scanImage(imageBuffer: Buffer, mimeType: string): Promise<SafetyScanResult>;
}

export class HttpContentSafetyScanner implements ContentSafetyScanner {
  private apiUrl: string;
  private apiKey?: string;
  private apiUser?: string;
  private apiSecret?: string;

  constructor(options?: { apiUrl?: string; apiKey?: string; apiUser?: string; apiSecret?: string }) {
    this.apiUrl = options?.apiUrl || process.env.SAFETY_SCAN_API_URL || "";
    this.apiKey = options?.apiKey || process.env.SAFETY_SCAN_API_KEY;
    this.apiUser = options?.apiUser || process.env.SAFETY_SCAN_API_USER;
    this.apiSecret = options?.apiSecret || process.env.SAFETY_SCAN_API_SECRET;
  }

  async scanImage(imageBuffer: Buffer, mimeType: string): Promise<SafetyScanResult> {
    if (!this.apiUrl && !this.apiKey && !this.apiUser) {
      return { isSafe: true };
    }

    try {
      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: mimeType });
      formData.append("media", blob, "upload.bin");
      if (this.apiUser) formData.append("api_user", this.apiUser);
      if (this.apiSecret) formData.append("api_secret", this.apiSecret);

      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
        headers["x-api-key"] = this.apiKey;
      }

      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers,
        body: formData
      });

      if (!res.ok) {
        console.warn(`[ContentSafetyScanner] Vendor API responded with status ${res.status}`);
        return { isSafe: true };
      }

      const json = (await res.json()) as Record<string, unknown>;
      if (json.status === "failure" || json.is_safe === false || json.unsafe === true) {
        return {
          isSafe: false,
          reason: typeof json.reason === "string" ? json.reason : "Image flagged by content safety scanner",
          flaggedCategories: Array.isArray(json.categories) ? (json.categories as string[]) : ["unsafe"]
        };
      }

      return { isSafe: true };
    } catch (err) {
      console.error("[ContentSafetyScanner] Failed to complete safety scan request:", err);
      return { isSafe: true };
    }
  }
}

export class MockContentSafetyScanner implements ContentSafetyScanner {
  private shouldPass: boolean;
  private rejectionReason: string;

  constructor(shouldPass = true, rejectionReason = "Flagged by mock safety scanner") {
    this.shouldPass = shouldPass;
    this.rejectionReason = rejectionReason;
  }

  setShouldPass(pass: boolean, reason?: string): void {
    this.shouldPass = pass;
    if (reason) this.rejectionReason = reason;
  }

  async scanImage(_imageBuffer: Buffer, _mimeType: string): Promise<SafetyScanResult> {
    if (!this.shouldPass) {
      return {
        isSafe: false,
        reason: this.rejectionReason,
        flaggedCategories: ["mock_flag"]
      };
    }
    return { isSafe: true };
  }
}

type TelemetryEvent = {
    ts: string;               // ISO time
    route: "qa" | "review";
    state?: string;
    docType?: string;
    jurisdiction?: string;    // qa only
    confidence?: number;
    flags?: string[];
    sources_restricted?: boolean;
    fallback_used?: boolean;        // qa
    fallback_offered?: "federal"|"none"; // review
    ok: boolean;
    err?: string;
  };
  
  export function logEvent(ev: TelemetryEvent) {
    try {
      const line = JSON.stringify(ev);
      // For local dev, console is fine. You can later pipe to a file or a SaaS collector.
      // Example to file: fs.appendFileSync("./.logs/telemetry.ndjson", line + "\n");
      console.log("[telemetry]", line);
    } catch (e) {
      // no-op; logging must never crash the app
    }
  }
  
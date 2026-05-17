/**
 * Frameworks supported by the Moduna OpenTelemetry SDK.
 */
export type ModunaOTELFramework = "langchain" | "vercel-ai-sdk";

/**
 * Deprecated alias kept for existing consumers that still pass sdkIntegration.
 */
export type ModunaOTELSDKIntegration = ModunaOTELFramework;

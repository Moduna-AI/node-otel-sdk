/**
 * Defines the ModunaOTELSDKIntegration type, which is a union of string literals representing the supported SDK integrations for the ModunaOTEL tracing service. 
 * This type is used to specify which SDK integration (e.g., "langchain" or "vercel-ai-sdk") is being used when instrumenting code with ModunaOTEL, allowing for better categorization and filtering of traces based on the SDK integration in use.
 */
export type ModunaOTELSDKIntegration = "langchain" | "vercel-ai-sdk";
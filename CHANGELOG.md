# Changelog

All notable changes to `@moduna/otel` will be documented in this file.

## 1.2.12

- replace the previous SDK implementation with a strictly typed OpenLLMetry wrapper
- add Moduna conversation propagation, automatic ULIDs, and deterministic trace flushing
- add LangChain Google Gemini end-to-end tracing coverage
- use the Moduna OTLP collector by default with environment override support
- update CI and publishing workflows for Node.js 22 and pnpm 11

## 0.1.0

- initial typed Moduna SDK package
- configuration validation and collector defaults
- conversation helpers and decorator support
- Vitest test suite and GitHub Actions CI/CD workflows

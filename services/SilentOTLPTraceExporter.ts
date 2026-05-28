import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

type OTLPTraceExporterConfig = ConstructorParameters<
	typeof OTLPTraceExporter
>[0];
type OTLPTraceExportArgs = Parameters<OTLPTraceExporter["export"]>;
type OTLPTraceExportResult = Parameters<OTLPTraceExportArgs[1]>[0];

/**
 * OTLP exporter that reports failures without breaking user code.
 */
export class SilentOTLPTraceExporter extends OTLPTraceExporter {
	private readonly onFailure: (error: unknown) => void;

	/**
	 * Creates an OTLP exporter with a failure reporter.
	 *
	 * @param config OTLP HTTP exporter configuration.
	 * @param onFailure Callback invoked when export fails.
	 */
	public constructor(
		config: OTLPTraceExporterConfig,
		onFailure: (error: unknown) => void,
	) {
		super(config);
		this.onFailure = onFailure;
	}

	/**
	 * Exports spans and converts synchronous exporter failures into callback results.
	 *
	 * @param spans Readable spans from the OpenTelemetry processor.
	 * @param resultCallback OpenTelemetry export completion callback.
	 */
	public override export(
		spans: OTLPTraceExportArgs[0],
		resultCallback: OTLPTraceExportArgs[1],
	): ReturnType<OTLPTraceExporter["export"]> {
		try {
			return super.export(spans, (result) => {
				if (result.error || result.code !== 0) {
					this.onFailure(
						result.error ??
							new Error(
								`Moduna OTEL exporter failed with code ${result.code}.`,
							),
					);
				}

				resultCallback(result);
			});
		} catch (error) {
			this.onFailure(error);
			resultCallback(this.createFailureResult(error));
		}
	}

	private createFailureResult(error: unknown): OTLPTraceExportResult {
		return {
			code: 1,
			error: error instanceof Error ? error : new Error(String(error)),
		};
	}
}

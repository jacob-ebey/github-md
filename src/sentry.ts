import { Toucan } from "toucan-js";
import type { Options } from "toucan-js";

export function initSentry(
	request: Request,
	context: ExecutionContext,
	SENTRY_DSN: string | undefined,
	additionalOptions: Partial<Options> = {},
) {
	const sentry = new Toucan({
		dsn: SENTRY_DSN,
		context,
		request,
		...additionalOptions,
	});
	const cfRequest = request as { cf?: IncomingRequestCfProperties };
	const colo = cfRequest.cf?.colo ? cfRequest.cf.colo : "UNKNOWN";
	sentry.setTag("colo", colo);

	// cf-connecting-ip should always be present, but if not we can fallback to XFF.
	const ipAddress =
		request.headers.get("cf-connecting-ip") ||
		request.headers.get("x-forwarded-for");
	const userAgent = request.headers.get("user-agent") || "";
	sentry.setUser({ ip: ipAddress, userAgent: userAgent, colo: colo });
	return sentry;
}

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRetryableError, withModelFallback } from "../model-fallback.ts";
import type { FallbackResult, FallbackAttempt } from "../model-fallback.ts";

describe("model-fallback", () => {
	describe("isRetryableError", () => {
		it("detects rate limit errors", () => {
			assert.equal(isRetryableError("rate limit exceeded"), true);
			assert.equal(isRetryableError("Rate Limit"), true);
			assert.equal(isRetryableError("rate_limit_error"), true);
		});

		it("detects too many requests (429)", () => {
			assert.equal(isRetryableError("429 Too Many Requests"), true);
			assert.equal(isRetryableError("HTTP 429"), true);
		});

		it("detects overloaded errors", () => {
			assert.equal(isRetryableError("model is overloaded"), true);
			assert.equal(isRetryableError("server overloaded, try again"), true);
		});

		it("detects 503 errors", () => {
			assert.equal(isRetryableError("503 Service Unavailable"), true);
		});

		it("detects capacity errors", () => {
			assert.equal(isRetryableError("insufficient capacity"), true);
		});

		it("detects quota errors", () => {
			assert.equal(isRetryableError("quota exceeded"), true);
		});

		it("detects temporarily unavailable", () => {
			assert.equal(isRetryableError("model temporarily unavailable"), true);
		});

		it("detects ECONNRESET", () => {
			assert.equal(isRetryableError("Error: read ECONNRESET"), true);
		});

		it("detects ETIMEDOUT", () => {
			assert.equal(isRetryableError("connect ETIMEDOUT 1.2.3.4:443"), true);
		});

		it("detects ECONNREFUSED", () => {
			assert.equal(isRetryableError("connect ECONNREFUSED 127.0.0.1:8080"), true);
		});

		it("detects socket hang up", () => {
			assert.equal(isRetryableError("socket hang up"), true);
			assert.equal(isRetryableError("Socket Hang Up"), true);
		});

		it("detects network error", () => {
			assert.equal(isRetryableError("NetworkError when attempting to fetch"), true);
			assert.equal(isRetryableError("network error occurred"), true);
		});

		it("detects fetch failed", () => {
			assert.equal(isRetryableError("TypeError: fetch failed"), true);
			assert.equal(isRetryableError("FetchFailed: connection reset"), true);
		});

		it("returns false for non-retryable errors", () => {
			assert.equal(isRetryableError("invalid API key"), false);
			assert.equal(isRetryableError("model not found"), false);
			assert.equal(isRetryableError("context length exceeded"), false);
			assert.equal(isRetryableError(""), false);
		});

		it("checks errorMessage parameter", () => {
			assert.equal(isRetryableError("", "rate limit reached"), true);
		});

		it("checks stopReason parameter", () => {
			assert.equal(isRetryableError("", undefined, "overloaded"), true);
		});

		it("returns false when all params are empty/undefined", () => {
			assert.equal(isRetryableError("", undefined, undefined), false);
		});
	});

	describe("withModelFallback", () => {
		const success = (model?: string): FallbackResult => ({
			exitCode: 0,
			stderr: "",
			stopReason: "end_turn",
		});

		const retryableError = (model?: string): FallbackResult => ({
			exitCode: 1,
			stderr: "429 rate limit exceeded",
			stopReason: "error",
		});

		const nonRetryableError = (model?: string): FallbackResult => ({
			exitCode: 1,
			stderr: "invalid API key",
			stopReason: "error",
		});

		it("returns result on success without trying fallbacks", async () => {
			const calls: (string | undefined)[] = [];
			const result = await withModelFallback(
				async (model) => { calls.push(model); return success(model); },
				["fallback-1"],
			);
			assert.equal(result.exitCode, 0);
			assert.deepEqual(calls, [undefined]); // only primary called
		});

		it("returns original error on non-retryable failure", async () => {
			const calls: (string | undefined)[] = [];
			const result = await withModelFallback(
				async (model) => { calls.push(model); return nonRetryableError(model); },
				["fallback-1"],
			);
			assert.equal(result.exitCode, 1);
			assert.deepEqual(calls, [undefined]); // no fallback attempted
		});

		it("tries fallback models on retryable error", async () => {
			const calls: (string | undefined)[] = [];
			const result = await withModelFallback(
				async (model) => {
					calls.push(model);
					return model === "fallback-1" ? success(model) : retryableError(model);
				},
				["fallback-1", "fallback-2"],
			);
			assert.equal(result.exitCode, 0);
			assert.deepEqual(calls, [undefined, "fallback-1"]);
		});

		it("tries all fallback models in order", async () => {
			const calls: (string | undefined)[] = [];
			const result = await withModelFallback(
				async (model) => {
					calls.push(model);
					return model === "fallback-2" ? success(model) : retryableError(model);
				},
				["fallback-1", "fallback-2"],
			);
			assert.equal(result.exitCode, 0);
			assert.deepEqual(calls, [undefined, "fallback-1", "fallback-2"]);
		});

		it("returns original error when all fallbacks exhausted", async () => {
			const calls: (string | undefined)[] = [];
			const result = await withModelFallback(
				async (model) => { calls.push(model); return retryableError(model); },
				["fallback-1", "fallback-2"],
			);
			assert.equal(result.exitCode, 1);
			assert.equal(result.stderr, "429 rate limit exceeded"); // original error
			assert.deepEqual(calls, [undefined, "fallback-1", "fallback-2"]);
		});

		it("returns original error when no fallback models configured", async () => {
			const result = await withModelFallback(
				async () => retryableError(),
				undefined,
			);
			assert.equal(result.exitCode, 1);
		});

		it("returns original error when fallback models is empty array", async () => {
			const result = await withModelFallback(
				async () => retryableError(),
				[],
			);
			assert.equal(result.exitCode, 1);
		});

		it("stops on first non-retryable fallback error", async () => {
			const calls: (string | undefined)[] = [];
			const result = await withModelFallback(
				async (model) => {
					calls.push(model);
					if (model === undefined) return retryableError(model);
					if (model === "fallback-1") return nonRetryableError(model);
					return success(model); // fallback-2 would succeed but shouldn't be reached
				},
				["fallback-1", "fallback-2"],
			);
			assert.equal(result.exitCode, 1);
			assert.equal(result.stderr, "invalid API key"); // non-retryable error from fallback-1
			assert.deepEqual(calls, [undefined, "fallback-1"]); // fallback-2 not tried
		});

		it("populates modelAttempts on success (single attempt)", async () => {
			const result = await withModelFallback(
				async (model) => success(model),
				["fallback-1"],
			);
			assert.ok(result.modelAttempts);
			assert.equal(result.modelAttempts!.length, 1);
			assert.deepEqual(result.modelAttempts![0], {
				model: undefined,
				failed: false,
				retryable: false,
			});
		});

		it("populates modelAttempts on fallback (multiple attempts)", async () => {
			const result = await withModelFallback(
				async (model) => {
					return model === "fallback-1" ? success(model) : retryableError(model);
				},
				["fallback-1", "fallback-2"],
			);
			assert.ok(result.modelAttempts);
			assert.equal(result.modelAttempts!.length, 2);
			assert.deepEqual(result.modelAttempts![0], {
				model: undefined,
				failed: true,
				retryable: true,
			});
			assert.deepEqual(result.modelAttempts![1], {
				model: "fallback-1",
				failed: false,
				retryable: false,
			});
		});

		it("populates modelAttempts when all fallbacks exhausted", async () => {
			const result = await withModelFallback(
				async (model) => retryableError(model),
				["fallback-1", "fallback-2"],
			);
			assert.ok(result.modelAttempts);
			assert.equal(result.modelAttempts!.length, 3);
			assert.deepEqual(result.modelAttempts![0], {
				model: undefined,
				failed: true,
				retryable: true,
			});
			assert.deepEqual(result.modelAttempts![1], {
				model: "fallback-1",
				failed: true,
				retryable: true,
			});
			assert.deepEqual(result.modelAttempts![2], {
				model: "fallback-2",
				failed: true,
				retryable: true,
			});
		});
	});
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRetryableError } from "../model-fallback.ts";

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
});

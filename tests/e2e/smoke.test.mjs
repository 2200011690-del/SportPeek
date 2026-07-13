import assert from "node:assert/strict";
import test from "node:test";
const base = process.env.E2E_BASE_URL;
test("SportPeek critical routes render", { skip: !base && "Set E2E_BASE_URL to a running SportPeek instance" }, async () => { for (const route of ["/","/search","/news/arsenal-hoan-tat-buoi-tap-chien-thuat","/login","/for-you","/admin"]) { const response=await fetch(`${base}${route}`); assert.equal(response.status,200,route); const html=await response.text(); assert.match(html,/SportPeek|SPORTPEEK/i); } });

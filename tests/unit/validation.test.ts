import assert from "node:assert/strict";
import test from "node:test";
import { bookmarkSchema, followSchema, searchSchema, slugify } from "../../lib/validation/index";

test("slugify handles Vietnamese characters", () => { assert.equal(slugify("Thể Công Viettel & Hà Nội"), "the-cong-viettel-ha-noi"); });
test("zod schemas reject malformed input", () => { assert.equal(searchSchema.safeParse({q:"a",type:"all"}).success,false); assert.equal(bookmarkSchema.safeParse({newsClusterId:"n1",action:"save"}).success,true); assert.equal(followSchema.safeParse({entityType:"team",entityId:"t1",action:"follow"}).success,true); });

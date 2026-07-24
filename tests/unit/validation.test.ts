import assert from "node:assert/strict";
import test from "node:test";
import { bookmarkSchema, followSchema, searchSchema, slugify } from "../../lib/validation/index";

test("slugify handles Vietnamese characters", () => { assert.equal(slugify("Thể Công Viettel & Hà Nội"), "the-cong-viettel-ha-noi"); });
test("zod schemas reject malformed input and require internal UUIDs", () => { const id = "11111111-1111-4111-8111-111111111111"; assert.equal(searchSchema.safeParse({q:"a",type:"all"}).success,false); assert.equal(bookmarkSchema.safeParse({newsClusterId:id,action:"save"}).success,true); assert.equal(bookmarkSchema.safeParse({newsClusterId:"demo-id",action:"save"}).success,false); assert.equal(followSchema.safeParse({entityType:"source",entityId:id,action:"follow"}).success,true); assert.equal(followSchema.safeParse({entityType:"team",entityId:id,action:"follow"}).success,false); });

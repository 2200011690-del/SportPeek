import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSearchText } from "@/lib/ui-logic";

test("search text normalization converts Vietnamese accents and diacritics", () => {
  const input1 = "Thủ tướng";
  const input2 = "Thu tuong";
  const input3 = "THỦ TƯỚNG CHÍNH PHỦ";
  
  assert.equal(normalizeSearchText(input1), "thu tuong");
  assert.equal(normalizeSearchText(input2), "thu tuong");
  assert.equal(normalizeSearchText(input3), "thu tuong chinh phu");
  assert.equal(normalizeSearchText(input1), normalizeSearchText(input2));
});

test("search text normalization handles mixed punctuation and special characters", () => {
  const text = "Sự kiện: Apple ra mắt iPhone 16 Pro Max!";
  assert.equal(normalizeSearchText(text), "su kien apple ra mat iphone 16 pro max");
});

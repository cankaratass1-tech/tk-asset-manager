import test from "node:test";
import assert from "node:assert/strict";
import { ownerTitleOf } from "./ownerName.js";

test("iç içe parantezli unvan korunur", () => {
  assert.equal(ownerTitleOf("Ali Yılmaz (Son Kullanici (Yurtici) Takimi)"), "Son Kullanici (Yurtici) Takimi");
});
test("tek parantezli unvan", () => {
  assert.equal(ownerTitleOf("Ayşe Kaya (Bilgi Teknolojileri)"), "Bilgi Teknolojileri");
});
test("unvan yoksa boş döner", () => {
  assert.equal(ownerTitleOf("Ali Yılmaz"), "");
  assert.equal(ownerTitleOf(""), "");
  assert.equal(ownerTitleOf(undefined), "");
  assert.equal(ownerTitleOf("—"), "");
});

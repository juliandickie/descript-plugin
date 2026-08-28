import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentForCode, knownLanguageCodes, unknownCodeHint } from "../../src/workflows/languageNames.js";

test("vocabulary holds English plus the 64 translation languages", () => {
  assert.equal(knownLanguageCodes().length, 65);
});

test("lookup is case-insensitive", () => {
  assert.equal(segmentForCode("fr-CA"), "FR-CA French Canada");
  assert.equal(segmentForCode("FR-CA"), "FR-CA French Canada");
  assert.equal(segmentForCode("fr-ca"), "FR-CA French Canada");
  assert.equal(segmentForCode(" fr-ca "), "FR-CA French Canada");
});

test("Latin American Spanish keys as es-419 but writes plain ES (the locked standard)", () => {
  assert.equal(segmentForCode("es-419"), "ES Spanish Latino");
  assert.equal(segmentForCode("ES-419"), "ES Spanish Latino");
  assert.equal(segmentForCode("es-ES"), "ES-ES Spanish Spain");
});

test("English is a language file too", () => {
  assert.equal(segmentForCode("en"), "EN English");
});

test("regional and script segments are bracket-free simplified names", () => {
  assert.equal(segmentForCode("zh-Hans"), "ZH-Hans Chinese Simplified");
  assert.equal(segmentForCode("zh-Hant"), "ZH-Hant Chinese Traditional");
  assert.equal(segmentForCode("pt-BR"), "PT-BR Portuguese Brazil");
  assert.equal(segmentForCode("sr-Latn"), "SR-Latn Serbian Latin");
});

test("bare es is deliberately absent and the hint disambiguates", () => {
  assert.equal(segmentForCode("es"), undefined);
  assert.match(unknownCodeHint("es"), /es-419/);
  assert.match(unknownCodeHint("es"), /es-ES/);
});

test("unknown codes return undefined and the hint lists known codes", () => {
  assert.equal(segmentForCode("xx"), undefined);
  assert.match(unknownCodeHint("xx"), /fr-CA/);
});

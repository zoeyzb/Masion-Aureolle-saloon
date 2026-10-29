import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

function reviewSource() {
  const match = script.match(/const reviews = \[([\s\S]*?)\n\];/);
  assert.ok(match, 'the review carousel has a review data set');
  return match[1];
}

test('editorial imagery stays local and avoids the empty-chair hero and remote booking image', () => {
  assert.match(html, /src="assets\/editorial-0\.jpg"/);
  assert.match(html, /src="assets\/editorial-1\.jpg"/);
  assert.match(html, /src="assets\/salon-interior\.jpg"/);
  assert.doesNotMatch(html, /images\.unsplash\.com/);
});

test('review carousel presents five distinct portrait-led client reviews', () => {
  const source = reviewSource();
  const entries = [...source.matchAll(/text:\s*'[^']*',\s*name:\s*'[^']*',\s*service:\s*'[^']*',\s*image:\s*'([^']+)'/g)];
  assert.equal(entries.length, 5, 'five review entries should be available');
  assert.equal(new Set(entries.map((entry) => entry[1])).size, 5, 'each review should use a distinct portrait');
  assert.match(html, /id="quoteIndex"/, 'the current review position should be visible');
  assert.match(html, /class="quote-person"/, 'reviewer details should have their own column');
  assert.match(html, /Our clients[’'][\s\S]{0,40}words|In their words/i, 'the section should read as a review section');
  assert.doesNotMatch(source, /sample|placeholder/i, 'review copy should not be labeled as sample content');
});

test('the closing section has a clear booking invitation and local portrait', () => {
  assert.match(html, /Ready when you are|Your next look/i);
  assert.match(html, /id="openBooking"/);
  const visit = html.match(/<section class="visit"[\s\S]*?<\/section>/);
  assert.ok(visit, 'the closing booking section exists');
  assert.match(visit[0], /src="assets\/booking-ritual\.jpg"/);
  assert.doesNotMatch(visit[0], /images\.unsplash\.com/);
});

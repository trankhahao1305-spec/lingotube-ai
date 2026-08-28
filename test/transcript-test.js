/**
 * Unit & Integration Tests for LingoTube AI Transcript Engine
 */

const assert = require('assert');

// 1. Re-import or test deduplication logic directly
function decodeHTMLEntities(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSegmentText(text) {
  if (!text) return '';
  let cleaned = decodeHTMLEntities(text);
  cleaned = cleaned.replace(/\[[^\]]+\]/g, ' ');
  cleaned = cleaned.replace(/\([^\)]+\)/g, ' ');
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

function deduplicateRollingCaptions(rawSegments) {
  const result = [];

  for (let i = 0; i < rawSegments.length; i++) {
    let currentText = cleanSegmentText(rawSegments[i].text);
    if (!currentText) continue;

    if (result.length > 0) {
      const prevText = result[result.length - 1].text;
      const prevWords = prevText.split(/\s+/).filter(Boolean);
      const currWords = currentText.split(/\s+/).filter(Boolean);

      let maxOverlap = 0;
      const maxCheck = Math.min(6, prevWords.length, currWords.length);

      for (let n = maxCheck; n >= 1; n--) {
        const prevTail = prevWords
          .slice(-n)
          .map(w => w.toLowerCase().replace(/[^a-z0-9']/g, ''))
          .join(' ');
        const currHead = currWords
          .slice(0, n)
          .map(w => w.toLowerCase().replace(/[^a-z0-9']/g, ''))
          .join(' ');

        if (prevTail && currHead && prevTail === currHead) {
          maxOverlap = n;
          break;
        }
      }

      if (maxOverlap > 0) {
        const remaining = currWords.slice(maxOverlap);
        currentText = remaining.join(' ');
      }
    }

    currentText = currentText.trim();
    if (currentText.length > 0) {
      const start = Number((rawSegments[i].startTime || 0).toFixed(2));
      let end = Number((rawSegments[i].endTime || (start + 2)).toFixed(2));
      if (end <= start) end = Number((start + 1.5).toFixed(2));

      result.push({
        startTime: start,
        endTime: end,
        text: currentText
      });
    }
  }

  return result;
}

console.log('--- Starting LingoTube AI Caption Deduplication Unit Tests ---');

// Test 1: Standard 2-word rolling caption overlap
const raw1 = [
  { startTime: 0.0, endTime: 2.5, text: "I am honored to be with you" },
  { startTime: 2.5, endTime: 5.0, text: "with you today for your commencement" }
];
const res1 = deduplicateRollingCaptions(raw1);
console.log('Test 1 (2-word overlap):', res1.map(r => r.text));
assert.strictEqual(res1[1].text, "today for your commencement", "Failed to strip 2-word overlap");

// Test 2: 4-word overlap with punctuation differences
const raw2 = [
  { startTime: 0.0, endTime: 3.0, text: "Truth is, I never graduated from college." },
  { startTime: 3.0, endTime: 6.0, text: "never graduated from college and this is the closest" }
];
const res2 = deduplicateRollingCaptions(raw2);
console.log('Test 2 (4-word overlap + punctuation):', res2.map(r => r.text));
assert.strictEqual(res2[1].text, "and this is the closest", "Failed to strip 4-word overlap");

// Test 3: Sound cues removal & HTML entities
const raw3 = [
  { startTime: 0.0, endTime: 2.0, text: "[Music] Welcome &amp; hello everybody! (Applause)" },
  { startTime: 2.0, endTime: 4.0, text: "everybody! It&#39;s great to see you." }
];
const res3 = deduplicateRollingCaptions(raw3);
console.log('Test 3 (Sound cues + entity decoding):', res3.map(r => r.text));
assert.strictEqual(res3[0].text, "Welcome & hello everybody!", "Failed to clean sound cues or HTML entities in segment 0");
assert.strictEqual(res3[1].text, "It's great to see you.", "Failed to strip 1-word overlap or entity in segment 1");

// Test 4: Maximum 6-word overlap
const raw4 = [
  { startTime: 0.0, endTime: 3.0, text: "one two three four five six" },
  { startTime: 3.0, endTime: 6.0, text: "one two three four five six seven eight nine" }
];
const res4 = deduplicateRollingCaptions(raw4);
console.log('Test 4 (6-word overlap):', res4.map(r => r.text));
assert.strictEqual(res4[1].text, "seven eight nine", "Failed 6-word overlap trimming");

console.log('✅ All Deduplication Unit Tests Passed Successfully!');

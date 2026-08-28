# 📘 LingoTube AI — System Specification & Feature Documentation

> **LingoTube AI** is an English listening practice web application built around YouTube videos. It empowers learners to study real-world English with precision clip trimming, intelligent caption deduplication, lexical chunking ("Vạch lá tìm sâu"), native accent cross-referencing (YouGlish), AI-assisted shadowing, and spaced vocabulary flashcards.

---

## 1. Feature Specification: Vạch lá tìm sâu (Deep Lexical Chunking & Analysis)
* **Sentence Splitting via Grammatical Inference**: Parses selected transcript segments into logically coherent sentences rather than raw caption fragments.
* **Natural Vietnamese Translation**: Generates nuanced, context-aware Vietnamese translation reflecting colloquial and conversational meaning.
* **Full IPA Transcription**: Provides accurate International Phonetic Alphabet (IPA) transcription for the entire sentence.
* **Manual Phrase-Selection & Chunk Highlighting**: Identifies 2–4 word lexical chunks/collocations with click-to-pin tooltips explaining grammar, meaning in context, and usage examples.
* **Caching Engine**: Keys cache items by `hash(inputSegment + videoId)` in IndexedDB/Firestore to minimize redundant Gemini API calls.
* **Per-Video History**: Preserves previous analyses for easy revision and continuation across sessions.

---

## 2. Feature Specification: Tam sao thất bản (YouGlish Multi-Accent Discovery)
* **Accent Search**: Direct search of selected phrases/words across thousands of real YouTube videos spoken by native speakers (US, UK, AUS).
* **Safe External Navigation**: Always opens YouGlish in a new browser tab via `window.open('https://youglish.com/pronounce/' + encodeURIComponent(phrase) + '/english', '_blank', 'noopener,noreferrer')` to strictly respect embedding guidelines and avoid iframe restrictions.

---

## 3. Feature Specification: Shadowing (Voice Recording & AI Feedback)
* **Reference Script**: Pulls verified text and IPA directly from the saved "Vạch lá tìm sâu" analysis for the active clip.
* **In-Browser Audio Recording Room**: Captures user voice via Web MediaStream Recording API (`audio/webm` or `audio/wav`).
* **Gemini Qualitative Feedback**: Transcribes and analyzes user audio against the reference transcript, delivering constructive feedback on:
  - Pronunciation & Intonation
  - Word stress and linking (liaisons)
  - Fluency & speech pace comparison

---

## 4. Feature Specification: Từ vựng (Smart Vocabulary & Flashcards)
* **1-Click Save**: Instant addition of words or lexical chunks discovered during practice.
* **AI Card Generation**: Gemini automatically fills context sentence, IPA, definition, example, and part of speech.
* **Interactive Flip-Card UI**: Spaced review system with flip animation, audio pronunciation, and mastery status.

---

## 5. Core Engine: Transcript Fetching & Deduplication
### 5.1 Server-side Fetching (`GET /api/transcript?videoId=xxx`)
1. **Consent-Wall Bypass**: Fetches the YouTube watch page (`https://www.youtube.com/watch?v={videoId}`) using a standard desktop `User-Agent` and the cookie header `CONSENT=YES+cb.20210328-17-p0.en+FX+100`.
2. **Player Response Parsing**: Extracts `ytInitialPlayerResponse` from the page script tags.
3. **Regex & InnerTube Fallbacks**: If not found in page payload, falls back to regex matching or the YouTube InnerTube API endpoint (`https://www.youtube.com/youtubei/v1/player`).
4. **Caption Track Selection**:
   - Searches `captionTracks` in `captions.playerCaptionsTracklistRenderer`.
   - **Preference order**: Manual English track (`languageCode: "en"`, `vssId: ".en"`) > Auto-generated English (`kind: "asr"` or `vssId: "a.en"`).
5. **Multi-Format Caption Parser**:
   - Supports both `fmt=json3` format (events with `tStartMs`, `dDurationMs`, `segs`) and XML/timedtext format (`<text start="1.5" dur="2.1">...</text>`).
6. **Rolling Caption Deduplication Algorithm**:
   - YouTube auto-generated captions often repeat 1 to 6 trailing words from `segment[i-1]` at the beginning of `segment[i]`.
   - The server compares the last $N$ words of segment $i-1$ with the first $N$ words of segment $i$ ($N \in [1..6]$) case-insensitively and strips duplicate prefixes.
   - Cleans HTML entities (`&amp;`, `&#39;`, `&quot;`) and removes music cues like `[Music]`, `(applause)`.
7. **Output Contract**:
   - Success: `[{ "startTime": 12.34, "endTime": 15.67, "text": "Cleaned sentence text" }, ...]`
   - No captions found: `{ "error": "no_captions", "message": "No English captions available for this video." }`

### 5.2 Manual Transcript Editing, Merging & Splitting
1. **In-place Text Editing**: Click the edit button on any sentence row to edit spelling or punctuation errors in an editable textarea.
2. **Sentence Merging**: Merge any sentence with the next one (`[🔗 Gộp dòng dưới]`) to combine short fragments into complete sentences, unifying timestamps (`startTime` of row 1 to `endTime` of row 2).
3. **Proportional Sentence Splitting**: Split run-on sentences (`[✂️ Tách câu]`) by selecting any cut word. Divides the time range proportionally by word count with manual timestamp fine-tuning.
4. **Load Priority & Persistence**: Saved to `users/{userId}/editedTranscripts/{videoId}` and `localStorage['lingotube_edited_transcript_' + videoId]`. When loading a video, the system always prioritizes the edited transcript over raw YouTube captions for all downstream tabs (Listen, Vạch lá tìm sâu, YouGlish, Shadowing, Flashcards).
5. **Revert & Reset**: Restore the original auto-generated transcript at any time with 1 click (`[🔄 Khôi phục gốc]`).

---

## 6. Data Architecture & Firestore Schema
```
users/
  {userId}/
    editedTranscripts/
      {videoId}/
        sentences: Array<{ startTime: number, endTime: number, text: string }>
        updatedAt: timestamp
    clips/
      {clipId}/
        videoId: string
        videoTitle: string
        channelName: string
        thumbnailUrl: string
        startTime: number (seconds)
        endTime: number (seconds)
        transcriptSegment: Array<{ startTime: number, endTime: number, text: string }>
        createdAt: timestamp
        lastPracticedAt: timestamp
        modesCompleted: {
          listen: boolean,
          vachLaTimSau: boolean,
          tamSaoThatBan: boolean,
          shadowing: boolean,
          tuVung: boolean
        }
```

### Firestore Security Rules
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 7. Implementation Roadmap & Phases
* **Phase 1 (Foundation)**: Video import, YouTube IFrame Player embed, Node.js `/api/transcript` endpoint with deduplication, interactive Clip Trimmer UI, and Firestore save.
* **Phase 2**: "Listen" Tab (A-B loop, playback speed, fine scrubber, replay controls).
* **Phase 3**: "Vạch lá tìm sâu" Tab (Sentence splitting, IPA, translation, phrase highlights & pin-tooltips).
* **Phase 4**: "Tam sao thất bản" Tab (YouGlish accent finder in external tabs).
* **Phase 5**: "Shadowing" Tab (Recording room + Gemini pronunciation critique).
* **Phase 6**: "Từ vựng" Tab (Flashcards, spaced review, Gemini word cards).

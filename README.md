# 🎬 LingoTube AI — English Listening Practice & Clip Trimmer

**LingoTube AI** is an intelligent English listening practice web app powered by YouTube videos, server-side transcript extraction with rolling-caption deduplication, precision clip trimming, and AI learning modules.

---

## 🚀 Phase 1 Features Built & Ready

1. **Video Import & YouTube IFrame Player**:
   - Accepts any YouTube URL (`youtube.com/watch?v=...`, `youtu.be/...`, `shorts/...`) or 11-character video ID.
   - Embeds the official YouTube IFrame Player API with synchronized playback, time indicators, and custom controls.
   - Quick 1-click sample video chips for instant testing (Steve Jobs Stanford Speech, TED Talk, BBC Learning English).

2. **Server-Side Transcript Engine (`GET /api/transcript?videoId=xxx`)**:
   - Uses desktop User-Agent and consent cookie (`CONSENT=YES+cb.20210328-17-p0.en+FX+100`) to bypass YouTube's consent wall.
   - Extracts player response and selects the optimal English caption track (preferring manual English over auto-generated `asr`).
   - Supports both `JSON3` and `TimedText XML` caption formats.
   - **Rolling Caption Deduplication**: Compares the last 1 to 6 trailing words of segment $i-1$ with the leading words of segment $i$ (case-insensitive and punctuation-normalized) and strips duplicated text.
   - Cleans HTML entities and removes background sound cues (`[Music]`, `(Applause)`).
   - Graceful fallback returning `{ error: "no_captions" }` when subtitles are unavailable.

3. **Interactive Clip Trimmer**:
   - Scrollable transcript list with timestamp badges (`00:14 - 00:18`) and sentence indices (`#1`, `#2`).
   - **Tap-to-Trim**: Click `[Set Start]` and `[Set End]` directly on any sentence row.
   - **Visual Highlighting**: In-range sentences highlight with emerald/mint hues; active spoken sentence glows during playback.
   - **Fine-Tuning Controls**: Dual time sliders with $\pm 0.5\text{s}$ surgical nudge buttons.
   - **A-B Loop Preview**: Loops playback automatically between start and end timestamps.

4. **Persistence & Data Schema (Firestore + Guest Mode)**:
   - **Firestore Schema**: Stored under `users/{userId}/clips/{clipId}` with `{ videoId, videoTitle, channelName, startTime, endTime, transcriptSegment, createdAt, lastPracticedAt, modesCompleted: { listen, vachLaTimSau, tamSaoThatBan, shadowing, tuVung } }`.
   - **Firestore Security Rules**: Configured in `firestore.rules` enforcing `request.auth.uid == userId`.
   - **Guest / Local Mode**: Works immediately out-of-the-box using local storage fallback.
   - **Saved Clips Drawer**: Displays saved clips library with 1-click reload and practice mode indicators.

---

## 🛠️ How to Run & Test Locally

### 1. Start the Server
In the project directory (`C:\Users\Admin\.gemini\antigravity\scratch\lingotube-ai`):
```bash
npm install
npm start
```
The server will start on `http://localhost:3000`.

### 3. Verify Phase 2 Functionality (Tab "Listen")
1. After trimming or loading any clip, click the **"2. Listen (A-B Loop)"** tab in the top navigation bar (or click "Go to Listen Tab").
2. Observe the dedicated practice room:
   - Video automatically plays and loops precisely between Point A and Point B.
   - **Clip Scrubber**: Drag or click along the clip progress bar to jump inside the clip.
   - **Replay (A)**: Click "Replay (A)" to instantly restart the clip from the beginning.
   - **Speed Control**: Switch between `0.5x`, `0.75x` (Slow & Clear), `1.0x` (Normal), `1.25x` (Challenging), `1.5x`.
   - **Tắt mắt, mở tai (Audio Focus)**: Click the "Tắt mắt mở tai" button to black out the video and focus 100% on listening with animated sound waves.
   - **Subtitle Masking Modes**:
     - *Hiện đầy đủ (Reveal)*: Live synchronized subtitles with speaking sentence highlight.
     - *Smart Blur*: Subtitles are softly blurred — hover or tap any sentence to peek.
     - *Khóa ẩn 100% (Hidden)*: Conceals subtitles completely for pure ear training.
   - **Loop Counter**: Tracks how many times you have listened to the clip.
   - Click **"Hoàn thành bước 'Nghe sâu'"** to record your practice session completion!

### 4. Verify Phase 3 Functionality (Tab "Vạch lá tìm sâu")
1. In the top navigation bar, click the **"3. Vạch lá tìm sâu"** tab.
2. Click **"Bắt đầu phân tích AI cho đoạn clip này"** (or "Phân tích lại AI").
3. Observe:
   - **Grammatical Sentence Inference**: Fragments are seamlessly parsed into complete sentences.
   - **Full IPA Transcription**: Displays complete IPA transcriptions with copy & slow audio playback buttons.
   - **Natural Vietnamese Translation**: Context-aware Vietnamese translations.
   - **Lexical Chunks / Collocations Breakdown**: 2–4 word key phrases with grammar role, meaning, and practical example.
   - **Action Buttons**:
     - 💾 **"Lưu Từ Vựng"**: Instantly saves chunk to your vocabulary flashcard collection.
     - 🌐 **"YouGlish"**: 1-click opens native speaker pronunciation videos on YouGlish in a new tab.
   - **Smart Caching**: Subsequent visits load instantaneously from local hash cache without extra API latency.
   - Click **"Hoàn thành bước 'Vạch lá tìm sâu'"** to mark progress.

### 5. Verify Phase 4 Functionality (Tab "Tam sao thất bản" — YouGlish Multi-Accent Discovery)
1. In the top navigation bar, click the **"4. Tam sao thất bản"** tab.
2. Observe:
   - **Accent Selector**: Choose among `🌐 Tất cả`, `🇺🇸 US`, `🇬🇧 UK`, `🇦🇺 AUS`.
   - **Custom Search Bar**: Enter any word or phrase and hit Enter or click "Xem trên YouGlish".
   - **Active Clip Phrase Cards**: Automatically lists all key lexical chunks and collocations from the active trimmed clip with IPA and nuance explanations.
   - **1-Click Actions on each card**:
     - `🌐 Xem trên YouGlish`: Opens YouGlish in a new tab with the chosen accent variation.
     - `🔊 Phát âm`: Pronounces the phrase using Web Speech API.
     - `💾 Lưu`: Saves the phrase directly to your vocabulary flashcards.
    - Click **"Hoàn thành bước 'Tam sao thất bản'"** to mark practice progress.

### 6. Verify Phase 5 Functionality (Tab "Shadowing" — Voice Recording & AI Pronunciation Feedback)
1. In the top navigation bar, click the **"5. Shadowing"** tab.
2. Observe:
   - **Sentence Stepper**: Navigate across trimmed clip sentences (`Câu 1 / X`).
   - **Target Reference Card**: Displays the original English sentence, natural Vietnamese translation, and full IPA with native audio playback (`🔊 Nghe mẫu`) and video timestamp jumping (`▶ Xem video`).
   - **Microphone Recording Room**:
     - Click the large glowing circular Mic button (`🎙️`) to start recording.
     - Speak the English sentence aloud — observe real-time speech recognition transcription via Web Speech API and live animated sound visualizer.
     - Click again (`⏹️`) to stop recording.
     - Listen back to your recorded voice using the embedded audio player.
   - **AI Scoring & Qualitative Feedback**:
     - Click **"Chấm điểm & Nhận xét phát âm bằng AI"**.
     - Review your Overall Score (e.g. `88/100`), word-by-word accuracy badges with phonetic pronunciation tips, and detailed AI feedback across 3 pillars:
       1. 🎯 *Phát âm & Trọng âm (Pronunciation & Stress)*
       2. 🌊 *Ngữ điệu & Nối âm (Intonation & Liaisons)*
       3. ⚡ *Tốc độ & Lưu loát (Pace & Fluency)*
   - Click **"Hoàn thành bước 'Shadowing'"** to record your progress.

### 7. Verify Manual Transcript Editing (Edit Text, Merge, Split, Save & Restore)
1. In the **"1. Trimmer"** tab, look at the **Full Video Transcript** panel:
   - **Edit Text**: Click the `✏️` icon on any sentence $\rightarrow$ text becomes an editable textarea $\rightarrow$ edit words $\rightarrow$ click `[💾 Lưu]` or press `Enter`.
   - **Merge with Next (Gộp dòng dưới)**: Click `[🔗]` on any row $\rightarrow$ combines text and spans time from this sentence's start to the next sentence's end.
   - **Split Sentence (Tách câu)**: Click `[✂️]` on any row $\rightarrow$ open the interactive split modal $\rightarrow$ click any word to choose the cut point $\rightarrow$ review live previews $\rightarrow$ click `[✂️ Xác nhận tách câu]`.
   - **Save Edited Version (Lưu bản sửa)**: Click `[💾 Lưu bản sửa]` in the top header $\rightarrow$ persists to `users/{userId}/editedTranscripts/{videoId}` and local storage with status badge `[✏️ Đã chỉnh sửa]`.
   - **Load Priority**: Switch to Tab 2 (Listen), Tab 3 (Vạch lá tìm sâu), Tab 4 (YouGlish), or Tab 5 (Shadowing) $\rightarrow$ all features automatically use your edited sentences!
   - **Restore Original (Khôi phục gốc)**: Click `[🔄 Khôi phục gốc]` $\rightarrow$ reverts to the original auto-generated transcript.

### 8. Verify Phase 6 Functionality (Tab "6. Từ vựng" — Smart Vocabulary & 3D Flashcards)
1. In the top navigation bar, click the **"6. Từ vựng & Flashcards"** tab.
2. Observe:
   - **Real-time Statistics Chips**: Total cards, Learning (`⏳ Đang học`), and Mastered (`✅ Đã thành thạo`).
   - **View Switcher**:
     - `🗂️ Lật thẻ 3D` (Interactive 3D Flip Flashcard Player)
     - `📋 Danh sách` (Full Vocabulary Search & List Table)
   - **3D Flashcard Room Interaction**:
     - Click the card to flip $\rightarrow$ smooth 3D rotation reveals Vietnamese translation, nuance explanation `🎭 Sắc thái`, context sentence from video, and YouGlish link.
     - Click `[🔊 Nghe phát âm]` to pronounce the English phrase.
     - Click `[✅ Đã thuộc]` or `[❌ Chưa thuộc]` $\rightarrow$ updates spaced repetition progress and automatically transitions to the next card.
     - Click `[🔀 Đảo thẻ]` to randomize the deck order.
   - **Custom Card Addition**: Click `[➕ Thêm từ]` $\rightarrow$ modal with auto-generated IPA and Vietnamese translation.
   - Click **"Hoàn thành bước 'Từ vựng'"** to celebrate completing all 6 phases of LingoTube AI!


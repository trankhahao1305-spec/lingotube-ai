# 🗺️ LINGOTUBE AI - CODEBASE ARCHITECTURE & FUNCTION MAP

Tài liệu này đóng vai trò như một **Bản đồ chỉ mục (Index Map)** giúp AI và lập trình viên tra cứu tức thì vị trí chính xác của từng module, tính năng và giao diện mà không cần quét toàn bộ file lớn, giúp **tiết kiệm 90% token**.

---

## 📁 1. CẤU TRÚC THƯ MỤC DỰ ÁN
```text
lingotube-ai/
├── public/
│   ├── index.html        # Giao diện toàn bộ ứng dụng (SPA 6 bước + các Modal)
│   ├── js/
│   │   └── app.js        # Logic điều khiển toàn bộ ứng dụng (Class LingoTubeApp)
│   └── css/
├── server.js             # Backend Express (YouTube Transcript API, Audio Downloader, Gemini API Proxy)
├── Dockerfile            # Cấu hình đóng gói container cho Google Cloud Run (Port 8080)
├── package.json          # Dependencies: express, cors, youtube-transcript
└── docs/
    └── CODEBASE_MAP.md   # Bản đồ kiến trúc này
```

---

## 🧭 2. BẢN ĐỒ CÁC BƯỚC HỌC (WORKFLOW 6 BƯỚC) TRONG `app.js`

| Bước / Module | Tên Tab / Giao diện | Vị trí hàm chính trong `app.js` | Các hàm trọng tâm |
| :--- | :--- | :--- | :--- |
| **Bước 1** | **Trimmer (Cắt Clip)** | `setupTrimmer()`, `setClipBounds()`, `renderTranscriptList()` | `setStartFromSentence()`, `setEndFromSentence()`, `mergeTranscriptWithNext()`, `openSplitSentenceModal()` |
| **Bước 2** | **Vạch Lá Tìm Sâu** | `setupVachLaWorkspace()` | `openVachLaAiSyncModal()`, `applyAiVachLaSync()`, `toggleVachLaCardFlip()`, `openCustomWordsModal()`, `applyCustomWordsAiSync()` |
| **Bước 3** | **Tam Sao Thất Bản** | `setupTamSaoWorkspace()` | `openYouGlish()`, `setAccentFilter()`, `saveVocabCard()` |
| **Bước 4** | **Luyện Nghe Sâu** | `setupListenPracticeRoom()` | `listenTogglePlay()`, `listenReplayFromStart()`, `incrementListenReplayCount()`, `setSubtitleMaskMode()`, `completeListenMode()` |
| **Bước 5** | **Shadowing Studio** | `setupShadowingStudio()` | `startShadowingRecording()`, `stopShadowingRecording()`, `evaluateShadowingPerformance()`, `renderShadowingEvaluation()` |
| **Bước 6** | **Sổ Từ Vựng 3D** | `setupTuVungWorkspace()` | `renderTuVungFlashcards()`, `flipVocabCard()`, `rateVocabCard()`, `deleteVocabCard()`, `openAddVocabModal()` |

---

## 🎛️ 3. CÁC MODULE CHUNG TRỌNG TÂM TRONG `app.js`

| Module | Chức năng | Các hàm chính |
| :--- | :--- | :--- |
| **Player Controller** | Điều khiển YouTube iframe, thời gian, A-B loop | `initOrLoadPlayer()`, `createYTPlayer()`, `onPlayerStateChange()`, `startTimeTracker()`, `togglePlayPause()`, `seekTo()` |
| **Data & Storage** | Lưu trữ LocalStorage / Firebase Firestore | `saveRecentVideo()`, `saveEditedTranscript()`, `saveVocabCard()`, `resolveSyncConflict()` |
| **Daily Streak & EXP** | Điểm danh hằng ngày, chuỗi ngày học, cấp độ EXP | `checkDailyStreak()`, `performDailyCheckIn()`, `addExpPoints()`, `renderStreakUI()` |
| **AI Subtitle Sync** | Đồng bộ toàn bộ phụ đề video từ Gemini / AI | `openFullTranscriptSyncModal()`, `copyFullSyncPrompt()`, `applyAiFullTranscriptSync()` |
| **Audio & Podcast** | Chế độ Podcast siêu nhẹ, xuất audio | `togglePodcastMode()`, `toggleFocusMode()`, `openExportAudioModal()` |

---

## 🖥️ 4. BẢN ĐỒ CÁC MODAL TRONG `public/index.html`

* `#videoImportModal`: Nhập link YouTube / Chọn video mẫu.
* `#fullTranscriptSyncModal`: Đồng bộ toàn bộ phụ đề AI (Full Transcript Sync).
* `#vachLaAiSyncModal`: Bảng phân tích AI Bước 2 (Vạch Lá Tìm Sâu).
* `#customWordsModal`: Bổ sung tra từ chưa hiểu trong Bước 2.
* `#sentenceGuideModal`: Hướng dẫn prompt & mẹo chia câu AI.
* `#exportAudioModal`: Cổng xuất tải MP3 & mở Chế độ Podcast.
* `#splitSentenceModal`: Hộp thoại tách câu phụ đề trực quan.
* `#addCustomVocabModal`: Thêm thẻ từ vựng thủ công vào Sổ từ.
* `#authModal`: Đăng nhập / Đăng ký tài khoản đồng bộ Cloud.
* `#dailyWelcomeModal` & `#dailyCheckInModal`: Điểm danh nhận thưởng EXP & Streak.
* `#videoGraduationModal`: Popup vinh danh tốt nghiệp video (+500 EXP).

---

## 💡 MẸO GỬI YÊU CẦU ĐỂ TIẾT KIỆM TOKEN TỐI ĐA:
Khi cần sửa hoặc thêm tính năng, bạn chỉ cần nêu kèm **Tên bước** hoặc **Tên Modal**:
* *Ví dụ tốt*: *"Sửa nút phát lại ở Bước 4 Nghe sâu"* ➔ AI nhảy thẳng tới hàm `listenReplayFromStart` (tốn cực ít token).
* *Ví dụ tốt*: *"Thêm trường nhập nghĩa trong Modal Thêm từ vựng mới"* ➔ AI nhảy thẳng tới `#addCustomVocabModal`.

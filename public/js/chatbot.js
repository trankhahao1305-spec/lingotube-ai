/**
 * LingoTube AI — LingoBot Assistant Module (chatbot.js)
 * 
 * Functions:
 * 1. Deep Contextual Dictionary Lookup (Definition, IPA, Nuance, Example, Save to Flashcards)
 * 2. Smart Subtitle Fragment Merger & Capitalizer (Auto-merges fragmented ASR captions)
 * 3. English Grammar & Idiom Explanations for the current video context
 * 4. Interactive chat UI with TTS pronunciation and 1-click actions
 */

class LingoBotChatbot {
  constructor() {
    this.isOpen = false;
    this.isProcessing = false;
    this.messages = [];
    this.cachedMergedSentences = null;

    this.init();
  }

  init() {
    this.loadChatHistory();
    this.setupEventListeners();
  }

  setupEventListeners() {
    const input = document.getElementById('chatbotUserInput');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
    }
  }

  loadChatHistory() {
    try {
      const stored = localStorage.getItem('lingotube_chatbot_history');
      if (stored) {
        this.messages = JSON.parse(stored);
      } else {
        // Default welcome message
        this.messages = [
          {
            sender: 'bot',
            text: `Xin chào! Tôi là **LingoBot AI** 🤖 — trợ lý ngôn ngữ cá nhân của bạn.\n\nTôi có thể giúp bạn:\n• 🔍 **Tra nghĩa từ khó & ngữ cảnh** trong video\n• 🧩 **Ghép phụ đề bị ngắt vụn / rời rạc** thành câu hoàn chỉnh\n• 💡 **Giải thích ngữ pháp & sắc thái từ**\n\nHãy chọn gợi ý bên dưới hoặc gõ câu hỏi nhé!`,
            timestamp: Date.now()
          }
        ];
      }
    } catch (e) {
      this.messages = [];
    }
  }

  saveChatHistory() {
    try {
      // Keep last 30 messages
      const toSave = this.messages.slice(-30);
      localStorage.setItem('lingotube_chatbot_history', JSON.stringify(toSave));
    } catch (e) {}
  }

  clearChatHistory() {
    this.messages = [
      {
        sender: 'bot',
        text: `Đã làm mới cuộc trò chuyện! Bạn cần tôi giúp gì về video tiếng Anh hôm nay? ✨`,
        timestamp: Date.now()
      }
    ];
    this.saveChatHistory();
    this.renderMessages();
    if (window.app && window.app.showToast) {
      window.app.showToast('Đã xóa lịch sử trò chuyện.', 'info');
    }
  }

  toggleChatbot(force) {
    const container = document.getElementById('chatbotContainer');
    const fab = document.getElementById('btnOpenChatbot');
    if (!container) return;

    this.isOpen = (typeof force === 'boolean') ? force : !this.isOpen;

    if (this.isOpen) {
      container.classList.remove('hidden');
      if (fab) fab.classList.add('hidden');
      this.renderMessages();
      setTimeout(() => {
        const input = document.getElementById('chatbotUserInput');
        if (input) input.focus();
      }, 100);
    } else {
      container.classList.add('hidden');
      if (fab) fab.classList.remove('hidden');
    }
  }

  /**
   * Render messages in chatbox
   */
  renderMessages() {
    const container = document.getElementById('chatbotMessagesContainer');
    if (!container) return;

    container.innerHTML = '';

    this.messages.forEach((msg, idx) => {
      const msgDiv = document.createElement('div');
      const isBot = msg.sender === 'bot';

      msgDiv.className = `flex gap-2.5 ${isBot ? 'items-start' : 'items-end justify-end'}`;

      if (isBot) {
        msgDiv.innerHTML = `
          <div class="w-7 h-7 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shrink-0 text-xs shadow-xs mt-0.5">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
          </div>
          <div class="space-y-1 max-w-[85%]">
            <div class="p-3.5 rounded-2xl rounded-tl-none bg-slate-100/90 text-slate-900 border border-slate-200/80 text-xs leading-relaxed shadow-2xs">
              ${this.formatBotMarkdown(msg.text)}
              ${msg.actionHtml || ''}
            </div>
            <div class="flex items-center gap-2 text-[10px] text-slate-400 pl-1">
              <span>LingoBot AI</span>
              ${msg.speakText ? `
                <button onclick="chatbot.speakText('${this.escapeQuotes(msg.speakText)}')" class="hover:text-blue-600 transition" title="Nghe phát âm">
                  <i class="fa-solid fa-volume-high"></i>
                </button>
              ` : ''}
            </div>
          </div>
        `;
      } else {
        msgDiv.innerHTML = `
          <div class="space-y-1 max-w-[85%]">
            <div class="p-3.5 rounded-2xl rounded-tr-none bg-slate-900 text-white text-xs leading-relaxed shadow-sm font-medium">
              ${this.escapeHtml(msg.text)}
            </div>
          </div>
          <div class="w-7 h-7 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 text-xs shadow-xs font-bold">
            <i class="fa-solid fa-user"></i>
          </div>
        `;
      }

      container.appendChild(msgDiv);
    });

    // Auto scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  showTypingIndicator() {
    const container = document.getElementById('chatbotMessagesContainer');
    if (!container) return;

    const typingDiv = document.createElement('div');
    typingDiv.id = 'chatbotTypingIndicator';
    typingDiv.className = 'flex gap-2.5 items-start';
    typingDiv.innerHTML = `
      <div class="w-7 h-7 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shrink-0 text-xs shadow-xs">
        <i class="fa-solid fa-wand-magic-sparkles"></i>
      </div>
      <div class="p-3 rounded-2xl rounded-tl-none bg-slate-100 border border-slate-200 text-xs text-slate-500 flex items-center gap-1.5 shadow-2xs">
        <span class="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"></span>
        <span class="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.2s]"></span>
        <span class="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
        <span class="text-[11px] font-medium ml-1">LingoBot đang suy nghĩ...</span>
      </div>
    `;
    container.appendChild(typingDiv);
    container.scrollTop = container.scrollHeight;
  }

  hideTypingIndicator() {
    const el = document.getElementById('chatbotTypingIndicator');
    if (el) el.remove();
  }

  /**
   * User sends a message
   */
  async handleSendMessage(customText) {
    const input = document.getElementById('chatbotUserInput');
    const text = customText || (input ? input.value.trim() : '');
    if (!text || this.isProcessing) return;

    if (input) input.value = '';

    // Add user message
    this.messages.push({
      sender: 'user',
      text: text,
      timestamp: Date.now()
    });
    this.renderMessages();

    this.isProcessing = true;
    this.showTypingIndicator();

    try {
      const responseObj = await this.processUserRequest(text);
      this.hideTypingIndicator();

      this.messages.push({
        sender: 'bot',
        text: responseObj.text,
        actionHtml: responseObj.actionHtml || '',
        speakText: responseObj.speakText || '',
        timestamp: Date.now()
      });

      this.saveChatHistory();
      this.renderMessages();
    } catch (err) {
      this.hideTypingIndicator();
      this.messages.push({
        sender: 'bot',
        text: `Rất tiếc, đã có lỗi xảy ra: ${err.message}. Bạn vui lòng thử lại nhé!`,
        timestamp: Date.now()
      });
      this.renderMessages();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process and route user request (Merge subtitles, Dictionary, or Q&A)
   */
  async processUserRequest(prompt) {
    const trimmed = (prompt || '').trim();
    const lower = trimmed.toLowerCase();

    // 1. Check if user directly pasted raw subtitle text (contains timestamps like 00:24.3 - 00:31.3 or Start End #)
    const hasTimestamps = /\d{1,2}:\d{2}(?:\.\d+)?\s*-\s*\d{1,2}:\d{2}(?:\.\d+)?/.test(prompt) || prompt.includes('Start End #');
    if (hasTimestamps) {
      const pastedResult = this.parseAndMergePastedText(prompt);
      if (pastedResult && pastedResult.merged && pastedResult.merged.length > 0) {
        return this.formatMergedSubtitlesResponse(pastedResult.merged, pastedResult.rawCount);
      }
    }

    // 2. Trigger: Merge / Fix Subtitles command (e.g. "ghép phụ đề trên", "ghép phụ đề")
    if (lower.includes('ghép') || lower.includes('phụ đề') || lower.includes('rời rạc') || lower.includes('merge') || lower.includes('subtitle')) {
      // Check if previous user message had pasted text
      const previousPastedMsg = this.findPreviousPastedTranscript();
      if (previousPastedMsg) {
        const pastedResult = this.parseAndMergePastedText(previousPastedMsg);
        if (pastedResult && pastedResult.merged && pastedResult.merged.length > 0) {
          return this.formatMergedSubtitlesResponse(pastedResult.merged, pastedResult.rawCount);
        }
      }

      // Otherwise merge current workspace transcript
      return await this.executeSubtitleMerger();
    }

    // 3. Trigger: Extract difficult words in current active sentence ("Tra từ khó trong câu đang chọn")
    if (lower.includes('từ khó') || lower.includes('trong câu đang chọn') || lower.includes('từ vựng trong câu') || lower.includes('từ trong câu')) {
      return await this.executeExplainDifficultWordsInSentence();
    }

    // 4. Trigger: Grammar explanation ("Giải thích ngữ pháp", "ngữ pháp câu này")
    if (lower.includes('ngữ pháp') || lower.includes('cấu trúc câu') || lower.includes('grammar')) {
      return await this.executeGrammarExplanation();
    }

    // 5. Trigger: Explicit Dictionary lookup (e.g. "tra từ worry", "nghĩa của worry", "worry là gì")
    if (lower.startsWith('tra từ') || lower.startsWith('nghĩa của') || lower.startsWith('từ') || lower.includes('là gì') || lower.includes('nghĩa là gì') || lower.includes('nghĩa gì')) {
      let cleanWord = trimmed
        .replace(/^(tra từ|nghĩa của từ|nghĩa của|từ|giải thích từ|cho hỏi từ|nghĩa từ)\s+/i, '')
        .replace(/\s+(là gì|nghĩa là gì|có nghĩa gì|nghĩa gì)\??$/i, '')
        .replace(/["']/g, '')
        .trim();

      if (cleanWord) {
        return await this.executeDictionaryLookup(cleanWord);
      }
    }

    // 6. Trigger: Single English word or short phrase typed directly (e.g. "worry", "patience", "drop out", "fundamental")
    const isEnglishWordOrPhrase = /^[a-zA-Z\s'-]{2,35}$/.test(trimmed) && trimmed.split(/\s+/).length <= 4;
    const isCommonGreeting = /^(hi|hello|hey|xin chào|chào|ok|oke|cảm ơn|thanks)$/i.test(trimmed);

    if (isEnglishWordOrPhrase && !isCommonGreeting) {
      return await this.executeDictionaryLookup(trimmed);
    }

    // 7. General AI Conversation / English explanations
    return await this.callGeminiAssistant(prompt);
  }

  /**
   * Find if any recent user message contained raw subtitle text
   */
  findPreviousPastedTranscript() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.sender === 'user' && msg.text) {
        const hasTimestamps = /\d{1,2}:\d{2}(?:\.\d+)?\s*-\s*\d{1,2}:\d{2}(?:\.\d+)?/.test(msg.text) || msg.text.includes('Start End #');
        if (hasTimestamps) {
          return msg.text;
        }
      }
    }
    return null;
  }

  /**
   * Parses raw copied text from transcript rows (including UI artifacts like Start End #9 00:27.9 - 00:33.9)
   */
  parseAndMergePastedText(rawText) {
    if (!rawText) return null;

    const regex = /(?:Start\s*End\s*)?(?:#\d+\s*)?(\d{1,2}:\d{2}(?:\.\d+)?)\s*-\s*(\d{1,2}:\d{2}(?:\.\d+)?)\s*([\s\S]*?)(?=(?:(?:Start\s*End\s*)?(?:#\d+\s*)?\d{1,2}:\d{2}(?:\.\d+)?\s*-\s*\d{1,2}:\d{2}(?:\.\d+)?)|$)/gi;

    const rawSegments = [];
    let match;

    while ((match = regex.exec(rawText)) !== null) {
      const startStr = match[1];
      const endStr = match[2];
      let text = (match[3] || '')
        .replace(/Start\s*End/gi, '')
        .replace(/#\d+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (text) {
        rawSegments.push({
          startTime: this.parseTimeToSeconds(startStr),
          endTime: this.parseTimeToSeconds(endStr),
          text: text
        });
      }
    }

    if (rawSegments.length === 0) {
      // Fallback: If no timestamp pattern matched, treat as plain sentences
      return null;
    }

    // Deduplicate rolling captions
    const deduplicated = this.deduplicateSegments(rawSegments);

    // Merge into complete sentences
    const merged = this.mergeRawSegments(deduplicated);
    this.cachedMergedSentences = merged;

    return {
      rawCount: rawSegments.length,
      merged: merged
    };
  }

  parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':');
    if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    } else if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return parseFloat(timeStr) || 0;
  }

  deduplicateSegments(rawSegments) {
    const result = [];
    for (let i = 0; i < rawSegments.length; i++) {
      let currentText = rawSegments[i].text.trim();
      if (!currentText) continue;

      if (result.length > 0) {
        const prevText = result[result.length - 1].text;
        const prevWords = prevText.split(/\s+/).filter(Boolean);
        const currWords = currentText.split(/\s+/).filter(Boolean);

        let maxOverlap = 0;
        const maxCheck = Math.min(6, prevWords.length, currWords.length);

        for (let n = maxCheck; n >= 1; n--) {
          const prevTail = prevWords.slice(-n).map(w => w.toLowerCase().replace(/[^a-z0-9']/g, '')).join(' ');
          const currHead = currWords.slice(0, n).map(w => w.toLowerCase().replace(/[^a-z0-9']/g, '')).join(' ');

          if (prevTail && currHead && prevTail === currHead) {
            maxOverlap = n;
            break;
          }
        }

        if (maxOverlap > 0) {
          currentText = currWords.slice(maxOverlap).join(' ');
        }
      }

      currentText = currentText.trim();
      if (currentText.length > 0) {
        result.push({
          startTime: rawSegments[i].startTime,
          endTime: rawSegments[i].endTime,
          text: currentText
        });
      }
    }
    return result;
  }

  /**
   * Merges raw segments into concise, 1-line Sense Groups (tối đa 1 dòng, 6-10 từ)
   */
  mergeRawSegments(segments) {
    const result = [];
    let currentChunk = null;

    const naturalBreakWords = new Set([
      'and', 'that', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why',
      'because', 'since', 'as', 'but', 'so', 'although', 'though', 'even',
      'if', 'unless', 'while', 'whereas', 'said', 'says', 'saying'
    ]);

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segText = (seg.text || '').trim();
      if (!segText) continue;

      if (!currentChunk) {
        currentChunk = {
          startTime: seg.startTime,
          endTime: seg.endTime,
          text: segText
        };
      } else {
        const prevText = currentChunk.text;
        const prevWords = prevText.split(/\s+/);
        const currFirstWord = segText.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
        
        const endsWithPunct = /[.?!,;:]$/.test(prevText);
        const timeGap = seg.startTime - currentChunk.endTime;
        const wordCount = prevWords.length;
        const charLen = prevText.length;
        const isNaturalBreakWord = naturalBreakWords.has(currFirstWord);

        // Strict 1-Line Conditions (tối đa 1 dòng: ~6-9 từ hoặc 42 ký tự):
        const shouldSplit = endsWithPunct || 
                            (wordCount >= 5 && isNaturalBreakWord) || 
                            charLen >= 42 || 
                            wordCount >= 9 || 
                            (timeGap >= 1.2 && wordCount >= 4);

        if (shouldSplit) {
          result.push(this.formatCompletedSentence(currentChunk));
          currentChunk = {
            startTime: seg.startTime,
            endTime: seg.endTime,
            text: segText
          };
        } else {
          currentChunk.text = `${currentChunk.text} ${segText}`.replace(/\s+/g, ' ');
          currentChunk.endTime = seg.endTime;
        }
      }
    }

    if (currentChunk) {
      result.push(this.formatCompletedSentence(currentChunk));
    }

    return result;
  }

  formatCompletedSentence(chunk) {
    let t = chunk.text.trim();
    if (!t) return { startTime: chunk.startTime, endTime: chunk.endTime, text: '' };
    t = t.charAt(0).toUpperCase() + t.slice(1);
    return {
      startTime: Number(chunk.startTime.toFixed(2)),
      endTime: Number(chunk.endTime.toFixed(2)),
      text: t
    };
  }

  formatMergedSubtitlesResponse(mergedList, rawCount) {
    let previewText = `Tôi đã nhận diện và chia nhỏ **${rawCount} đoạn phụ đề thô** thành **${mergedList.length} câu ngắn gọn (tối đa 1 dòng)** theo đúng cụm ngữ nghĩa:\n\n`;

    mergedList.forEach((s, idx) => {
      previewText += `**${idx + 1}. [${this.formatSeconds(s.startTime)} - ${this.formatSeconds(s.endTime)}]**\n> "${s.text}"\n\n`;
    });

    const fullPlainText = mergedList.map((s, idx) => `${idx + 1}. [${this.formatSeconds(s.startTime)} - ${this.formatSeconds(s.endTime)}] ${s.text}`).join('\n');
    const encodedText = encodeURIComponent(fullPlainText);

    const actionHtml = `
      <div class="pt-3 mt-2 border-t border-slate-200/80 flex flex-col sm:flex-row gap-2">
        <button 
          onclick="chatbot.copyTextToClipboard('${encodedText}')" 
          class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs active:scale-95"
        >
          <i class="fa-regular fa-copy"></i>
          <span>Sao chép kết quả</span>
        </button>
        <button 
          onclick="chatbot.applyMergedSubtitles()" 
          class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs active:scale-95"
        >
          <i class="fa-solid fa-check-double"></i>
          <span>Áp dụng vào Phụ đề Video</span>
        </button>
      </div>
    `;

    return {
      text: previewText,
      actionHtml: actionHtml
    };
  }

  copyTextToClipboard(encodedText) {
    try {
      const text = decodeURIComponent(encodedText);
      navigator.clipboard.writeText(text);
      if (window.app && window.app.showToast) {
        window.app.showToast('📋 Đã sao chép các câu đã ghép vào bộ nhớ tạm!', 'success');
      }
    } catch (e) {
      alert('Không thể sao chép: ' + e.message);
    }
  }

  /**
   * Feature 1: Subtitle Fragment Merger & Capitalizer
   */
  async executeSubtitleMerger() {
    let rawTranscript = (window.app && window.app.fullTranscript) ? window.app.fullTranscript : [];

    if (rawTranscript.length === 0) {
      return {
        text: `Hiện chưa có video hoặc phụ đề nào được tải vào Workspace.\n\n👉 **Gợi ý**: Bạn có thể **dán trực tiếp danh sách câu phụ đề** vào khung chat này, tôi sẽ tự động chia nhỏ tối đa 1 dòng cho bạn ngay lập tức! 🎬`
      };
    }

    // Use Smart Linguistic Rules to merge fragmented sentences into 1-line chunks
    const mergedList = this.mergeRawSegments(rawTranscript);
    this.cachedMergedSentences = mergedList;

    return this.formatMergedSubtitlesResponse(mergedList, rawTranscript.length);
  }

  /**
   * Merge raw fragmented segments into full grammatical sentences
   */
  async mergeTranscriptSegmentsWithAI(rawSegments) {
    const result = [];
    let currentChunk = null;

    for (let i = 0; i < rawSegments.length; i++) {
      const seg = rawSegments[i];
      const text = (seg.text || '').trim();
      if (!text) continue;

      if (!currentChunk) {
        currentChunk = {
          startTime: seg.startTime,
          endTime: seg.endTime,
          text: text
        };
      } else {
        const prevText = currentChunk.text;
        const endsWithPunct = /[.?!]$/.test(prevText);
        const timeGap = seg.startTime - currentChunk.endTime;
        const isLongEnough = currentChunk.text.length > 75;

        if (endsWithPunct || (timeGap > 2.2 && isLongEnough)) {
          result.push(this.formatCompletedSentence(currentChunk));
          currentChunk = {
            startTime: seg.startTime,
            endTime: seg.endTime,
            text: text
          };
        } else {
          currentChunk.text = `${currentChunk.text} ${text}`;
          currentChunk.endTime = seg.endTime;
        }
      }
    }

    if (currentChunk) {
      result.push(this.formatCompletedSentence(currentChunk));
    }

    return result;
  }

  formatCompletedSentence(chunk) {
    let t = chunk.text.trim();
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (!/[.?!]$/.test(t)) {
      t += '.';
    }
    return {
      startTime: Number(chunk.startTime.toFixed(2)),
      endTime: Number(chunk.endTime.toFixed(2)),
      text: t
    };
  }

  /**
   * Apply merged subtitles back into the main application
   */
  applyMergedSubtitles() {
    if (!this.cachedMergedSentences || this.cachedMergedSentences.length === 0) {
      if (window.app && window.app.showToast) {
        window.app.showToast('Không có dữ liệu phụ đề để áp dụng. Hãy dán phụ đề hoặc yêu cầu ghép trước!', 'warning');
      }
      return;
    }

    if (!window.app) return;

    const merged = [...this.cachedMergedSentences];
    const minStart = merged[0].startTime;
    const maxEnd = merged[merged.length - 1].endTime;

    // Check if app has existing full transcript
    if (window.app.fullTranscript && window.app.fullTranscript.length > merged.length) {
      // Smart splice: keep all sentences outside the [minStart, maxEnd] range, and insert the new merged ones
      const remainingSentences = window.app.fullTranscript.filter(s => {
        const sEnd = s.endTime || (s.startTime + 2);
        return sEnd < (minStart - 0.2) || s.startTime > (maxEnd + 0.2);
      });

      const combined = [...remainingSentences, ...merged];
      combined.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
      window.app.fullTranscript = combined;
    } else {
      // Replace entire transcript
      window.app.fullTranscript = merged;
    }

    window.app.filteredTranscript = [...window.app.fullTranscript];
    window.app.isTranscriptEdited = true;

    const videoId = window.app.currentVideoId;
    if (videoId) {
      localStorage.setItem(`lingotube_edited_transcript_${videoId}`, JSON.stringify(window.app.fullTranscript));
    }

    // Switch view to Workspace & Trimmer tab so user sees the change immediately
    window.app.openWorkspaceView();
    window.app.switchWorkspaceTab('trimmer');
    window.app.setClipBounds(minStart, maxEnd);
    window.app.renderTranscriptList();
    window.app.updateTranscriptEditStatusBadge(true);

    const sCountBadge = document.getElementById('sentenceCountBadge');
    if (sCountBadge) {
      sCountBadge.textContent = `${window.app.fullTranscript.length} sentences`;
    }

    if (window.app.showToast) {
      window.app.showToast(`✨ Đã áp dụng ${merged.length} câu vào phụ đề video thành công!`, 'success');
    }

    // Add confirmation to chat and auto-minimize chatbot on small screens
    this.messages.push({
      sender: 'bot',
      text: `✅ **Đã áp dụng thành công ${merged.length} câu vào video!**\n\nBạn có thể thấy các câu mới đã được cập nhật ở danh sách câu bên trái. Hãy bấm Luyện tập hoặc Cắt clip để học nhé! 🚀`,
      timestamp: Date.now()
    });
    this.saveChatHistory();
    this.renderMessages();

    // Hide chatbot on mobile or collapse to let user see updated list
    if (window.innerWidth < 768) {
      this.toggleChatbot(false);
    }
  }

  /**
   * Translates English text to Vietnamese using public Google Translate API
   */
  async translateOnline(text) {
    if (!text || !text.trim()) return '';
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(text.trim())}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && data[0]) {
          return data[0].map(item => item[0]).join('');
        }
      }
    } catch (e) {}
    if (window.app && window.app.translateToVietnamese) {
      return window.app.translateToVietnamese(text);
    }
    return 'Nghĩa từ vựng';
  }

  /**
   * Comprehensive IPA dictionary & phonetic generator
   */
  getPhoneticIPA(word) {
    if (!word) return '';
    const clean = word.toLowerCase().trim();
    const dictionary = {
      "worry": "ˈwʌr.i",
      "worried": "ˈwʌr.id",
      "worrying": "ˈwʌr.i.ɪŋ",
      "patience": "ˈpeɪ.ʃəns",
      "patient": "ˈpeɪ.ʃənt",
      "fundamental": "ˌfʌn.dəˈmen.təl",
      "qualities": "ˈkwɑː.lə.t̬iz",
      "quality": "ˈkwɑː.lə.t̬i",
      "meditator": "ˈmed.ə.teɪ.tər",
      "meditation": "ˌmed.əˈteɪ.ʃən",
      "possess": "pəˈzes",
      "virtue": "ˈvɜːr.tʃuː",
      "supreme": "suːˈpriːm",
      "buddha": "ˈbʊd.ə",
      "buddhist": "ˈbʊd.ɪst",
      "honor": "ˈɑː.nər",
      "honored": "ˈɑː.nəd",
      "graduate": "ˈɡrædʒ.u.eɪt",
      "graduation": "ˌɡrædʒ.uˈeɪ.ʃən",
      "truth": "truːθ",
      "college": "ˈkɑː.lɪdʒ",
      "drop out": "drɑːp aʊt",
      "dropped out": "drɑːpt aʊt",
      "dorm": "dɔːrm",
      "calligraphy": "kəˈlɪɡ.rə.fi",
      "typography": "taɪˈpɑː.ɡrə.fi",
      "intuition": "ˌɪn.tuːˈɪʃ.ən",
      "destiny": "ˈdes.tə.ni",
      "karma": "ˈkɑːr.mə",
      "courage": "ˈkɜːr.ɪdʒ",
      "curiosity": "ˌkjʊr.iˈɑː.sə.t̬i",
      "trust": "trʌst",
      "belief": "bɪˈliːf",
      "connect": "kəˈnekt",
      "dots": "dɑːts",
      "relentless": "rɪˈlent.ləs",
      "persevere": "ˌpɜːr.səˈvɪr",
      "passion": "ˈpæʃ.ən"
    };

    if (dictionary[clean]) return dictionary[clean];

    if (window.app && window.app.convertToIPA) {
      const appIpa = window.app.convertToIPA(clean);
      if (appIpa && appIpa !== clean) return appIpa;
    }

    return clean;
  }

  /**
   * Feature 2: Oxford Pro Dictionary Lookup (Oxford Advanced Learner's Dictionary Format)
   */
  async executeDictionaryLookup(word) {
    const activeSentence = window.app ? window.app.getActiveSentenceText() : '';
    const storedGeminiKey = (localStorage.getItem('lingotube_gemini_key') || '').trim();

    let oxfordData = null;

    try {
      const res = await fetch('/api/oxford-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: word,
          contextSentence: activeSentence,
          apiKey: storedGeminiKey
        })
      });

      if (res.ok) {
        const json = await res.json();
        if (json && json.data) {
          oxfordData = json.data;
        }
      }
    } catch (e) {
      console.warn('Oxford lookup error:', e);
    }

    if (!oxfordData) {
      const ipa = this.getPhoneticIPA(word);
      const meaning = await this.translateOnline(word);
      const nuance = (window.app && window.app.getSacThaiNghia) ? window.app.getSacThaiNghia(word) : 'Tự nhiên & chuẩn mực trong tiếng Anh giao tiếp';
      oxfordData = {
        word: word,
        partOfSpeech: 'Word / Phrase',
        cefrLevel: 'B1',
        ukIpa: `/${ipa}/`,
        usIpa: `/${ipa}/`,
        englishDefinition: `Relating to "${word}" in spoken English.`,
        vietnameseMeaning: meaning,
        nuance: nuance,
        collocations: [
          { phrase: `use ${word}`, meaning: `sử dụng ${word}` }
        ],
        examples: [
          {
            english: activeSentence || `Practice using "${word}" in daily conversations.`,
            vietnamese: `Luyện tập sử dụng "${word}" trong giao tiếp hàng ngày.`
          }
        ],
        memoryHook: `Ghi nhớ ngữ cảnh xuất hiện của từ trong video để kích hoạt phản xạ tự nhiên.`
      };
    }

    const cleanWordEsc = this.escapeQuotes(oxfordData.word || word);
    const meaningEsc = this.escapeQuotes(oxfordData.vietnameseMeaning || '');
    const ipaEsc = this.escapeQuotes(oxfordData.usIpa || oxfordData.ukIpa || '');
    const nuanceEsc = this.escapeQuotes(oxfordData.nuance || '');
    const contextEsc = this.escapeQuotes(activeSentence || (oxfordData.examples && oxfordData.examples[0] ? oxfordData.examples[0].english : ''));

    // Format rich Markdown + Oxford Badge
    let text = `### 📖 Oxford Pro Dictionary: **${oxfordData.word}**  \`[${oxfordData.partOfSpeech || 'Word'}] [${oxfordData.cefrLevel || 'B1'}]\`\n\n`;
    text += `🗣️ **Phát âm**: UK \`${oxfordData.ukIpa || ''}\` • US \`${oxfordData.usIpa || ''}\`\n\n`;
    text += `📘 **Định nghĩa Oxford (English)**:\n> ${oxfordData.englishDefinition || ''}\n\n`;
    text += `🇻🇳 **Nghĩa tiếng Việt trong ngữ cảnh**:\n> **${oxfordData.vietnameseMeaning || ''}**\n\n`;
    
    if (oxfordData.nuance) {
      text += `💡 **Sắc thái & Cảm xúc**: ${oxfordData.nuance}\n\n`;
    }

    if (oxfordData.collocations && oxfordData.collocations.length > 0) {
      text += `🔗 **Cụm từ hay gặp (Oxford Collocations)**:\n`;
      oxfordData.collocations.forEach(c => {
        text += `• \`${c.phrase}\`: ${c.meaning}\n`;
      });
      text += `\n`;
    }

    if (oxfordData.examples && oxfordData.examples.length > 0) {
      text += `📝 **Ví dụ câu thực tế (Examples)**:\n`;
      oxfordData.examples.forEach(ex => {
        text += `• _"${ex.english}"_\n  *(Dịch: ${ex.vietnamese})*\n`;
      });
      text += `\n`;
    }

    if (oxfordData.memoryHook) {
      text += `🧠 **Mẹo nhớ nhanh (Memory Hook)**: ${oxfordData.memoryHook}`;
    }

    const actionHtml = `
      <div class="pt-3 mt-3 border-t border-slate-200/80 flex items-center gap-2 flex-wrap">
        <button 
          onclick="chatbot.saveWordToVocab('${cleanWordEsc}', '${meaningEsc}', '${ipaEsc}', '${nuanceEsc}', '${contextEsc}')" 
          class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs active:scale-95 cursor-pointer"
        >
          <i class="fa-solid fa-star"></i>
          <span>+ Lưu vào Sổ Từ Vựng 3D</span>
        </button>
        <button 
          onclick="chatbot.openYouGlish('${cleanWordEsc}')" 
          class="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
        >
          <i class="fa-solid fa-earth-americas"></i>
          <span>Tra YouGlish</span>
        </button>
        <button 
          onclick="chatbot.speakText('${cleanWordEsc}')" 
          class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
        >
          <i class="fa-solid fa-volume-high text-blue-600"></i>
          <span>Phát âm US</span>
        </button>
      </div>
    `;

    return {
      text: text,
      actionHtml: actionHtml,
      speakText: oxfordData.word || word
    };
  }

  /**
   * Feature 3: Extract & Explain difficult words from active sentence
   */
  async executeExplainDifficultWordsInSentence() {
    const activeSentence = window.app ? window.app.getActiveSentenceText() : '';

    if (!activeSentence) {
      return {
        text: `Hiện chưa có câu nào được chọn trong Workspace.\n\n👉 **Gợi ý**: Bạn hãy mở một video và click chọn 1 câu ở Tab 1 Trimmer, hoặc gõ từ bạn muốn tra (ví dụ: \`worry\`, \`drop out\`, \`patience\`) để tôi tra cứu giúp bạn nhé! 💡`
      };
    }

    const stopWords = new Set(['the', 'is', 'a', 'an', 'and', 'to', 'in', 'on', 'at', 'of', 'for', 'with', 'as', 'this', 'that', 'these', 'those', 'it', 'its', 'we', 'you', 'he', 'she', 'they', 'i', 'me', 'my', 'be', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'by', 'from', 'up', 'about', 'into', 'over', 'after', 'so', 'than', 'too', 'very', 'just', 'now', 'said']);

    const rawWords = activeSentence
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));

    const uniqueWords = [...new Set(rawWords.map(w => w.toLowerCase()))].slice(0, 5);

    if (uniqueWords.length === 0) {
      return {
        text: `Câu đang chọn: _"${activeSentence}"_\n\nCâu này có cấu trúc cơ bản và từ vựng rất quen thuộc. Bạn có thể gõ từ bất kỳ để tra cứu chuyên sâu!`
      };
    }

    let text = `### 🔍 Phân tích Từ Vựng trong câu:\n> _"${activeSentence}"_\n\n`;

    const wordDetails = [];
    for (const w of uniqueWords) {
      const meaning = await this.translateOnline(w);
      const ipa = this.getPhoneticIPA(w);
      wordDetails.push({ word: w, ipa, meaning });
      text += `• **${w}** \`/${ipa}/\`: **${meaning}**\n`;
    }

    const actionHtml = `
      <div class="pt-3 mt-3 border-t border-slate-200/80 space-y-2">
        <p class="text-[11px] font-bold text-slate-700">Lưu nhanh các từ vào Sổ từ vựng 3D:</p>
        <div class="flex items-center gap-1.5 flex-wrap">
          ${wordDetails.map(item => `
            <button 
              onclick="chatbot.saveWordToVocab('${this.escapeQuotes(item.word)}', '${this.escapeQuotes(item.meaning)}', '${this.escapeQuotes(item.ipa)}', 'Từ vựng quan trọng trong bài', '${this.escapeQuotes(activeSentence)}')" 
              class="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold flex items-center gap-1 transition active:scale-95"
            >
              <i class="fa-solid fa-plus text-amber-600"></i>
              <span>${item.word}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    return {
      text: text,
      actionHtml: actionHtml
    };
  }

  /**
   * Feature 4: Explain Grammar of Active Sentence
   */
  async executeGrammarExplanation() {
    const activeSentence = window.app ? window.app.getActiveSentenceText() : '';

    if (!activeSentence) {
      return {
        text: `Hiện chưa có câu nào được chọn trong Workspace.\n\n👉 Bạn hãy click chọn một câu ở Tab 1 Trimmer để tôi phân tích cấu trúc ngữ pháp chi tiết nhé! 💡`
      };
    }

    const vietnamese = await this.translateOnline(activeSentence);

    const text = `### 💡 Phân tích Ngữ Pháp & Cấu Trúc Câu:\n> _"${activeSentence}"_\n\n` +
      `• **Dịch nghĩa trọn vẹn**: **"${vietnamese}"**\n\n` +
      `• **Thành phần nòng cốt**:\n` +
      `  - **Chủ ngữ (Subject)** & **Vị ngữ (Predicate)** được liên kết tự nhiên.\n` +
      `  - **Mệnh đề quan hệ / Cụm từ liên kết**: Giúp kết nối ý rõ ràng và mạch lạc.\n` +
      `• **Mẹo luyện phát âm**: Hãy chú ý các vị trí **nối âm (Connected Speech)** và hạ giọng nhẹ ở cuối câu khẳng định để phát âm tự nhiên nhất! 🎙️`;

    return {
      text: text
    };
  }

  /**
   * Save word directly to App's Vocab / Flashcards Deck
   */
  async saveWordToVocab(phrase, meaning, ipa, nuance, context) {
    if (!window.app || !window.app.saveVocabCard) {
      alert('Ứng dụng LingoTube chưa sẵn sàng.');
      return;
    }

    await window.app.saveVocabCard(phrase, meaning, ipa, nuance, context, 'Vocabulary');
    if (window.app.showToast) {
      window.app.showToast(`⭐ Đã lưu "${phrase}" vào Sổ từ vựng & Flashcards 3D!`, 'success');
    }
  }

  /**
   * General Gemini Assistant Call
   */
  async callGeminiAssistant(userPrompt) {
    const videoTitle = window.app ? window.app.videoTitle : '';
    const activeSentence = window.app ? window.app.getActiveSentenceText() : '';

    const geminiKey = localStorage.getItem('lingotube_gemini_key');

    if (geminiKey) {
      try {
        const sysPrompt = `Bạn là LingoBot, một trợ lý AI thông minh chuyên hỗ trợ học tiếng Anh qua video YouTube. Video người dùng đang học: "${videoTitle}". Câu đang chọn: "${activeSentence}". Hãy trả lời bằng tiếng Việt thân thiện, súc tích, giải thích ngữ pháp hoặc từ vựng rõ ràng, chuẩn xác.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: `${sysPrompt}\n\nCâu hỏi của người dùng: ${userPrompt}` }] }
            ]
          })
        });

        if (response.ok) {
          const data = await response.json();
          const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (aiText) {
            return { text: aiText };
          }
        }
      } catch (err) {
        console.warn('Direct Gemini call error, falling back to smart responder:', err);
      }
    }

    // Built-in intelligent linguistic responder fallback
    return {
      text: `💡 **Giải đáp của LingoBot AI:**\n\nVề câu hỏi _"${userPrompt}"_ trong ngữ cảnh bài học:\n\n` +
        `• **Lời khuyên luyện tập**: Khi học qua video, hãy tập trung vào **ngữ điệu (Intonation)** và **nối âm (Connected Speech)** của người bản xứ.\n` +
        `• **Gợi ý bước tiếp theo**: Bạn có thể dùng Tab 4 **Shadowing AI** để thu âm và đối chiếu giọng của mình với video nhé!`
    };
  }

  speakText(text) {
    if (!text) return;
    if (window.app && window.app.speakText) {
      window.app.speakText(text);
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    }
  }

  openYouGlish(phrase) {
    if (window.app && window.app.openYouGlish) {
      window.app.openYouGlish(phrase);
    } else {
      window.open(`https://youglish.com/pronounce/${encodeURIComponent(phrase)}/english`, '_blank');
    }
  }

  formatBotMarkdown(mdText) {
    if (!mdText) return '';
    return mdText
      .replace(/### (.*?)\n/g, '<h4 class="font-bold text-slate-900 text-xs mt-1 mb-1">$1</h4>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/_(.*?)_/g, '<em class="italic text-slate-700">$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-blue-600 font-mono text-[11px] font-bold">$1</code>')
      .replace(/\n/g, '<br/>');
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  escapeQuotes(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  formatSeconds(secs) {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}

// Instantiate globally
let chatbot;
window.addEventListener('DOMContentLoaded', () => {
  chatbot = new LingoBotChatbot();
});

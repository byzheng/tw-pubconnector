/*\
title: $:/plugins/bangyou/tw-pubconnector/script/highlight.js
type: application/javascript

Client-side highlight script injected into literature article pages.

Features:
  - Select text and highlight with one of five colours
  - Add a note to any highlight (new or existing)
  - Change colour or delete an existing highlight
  - Highlights are persisted to the server as JSON
  - Highlights are restored automatically on page load

\*/
(function () {
    'use strict';

    // -----------------------------------------------------------------
    // Configuration
    // -----------------------------------------------------------------

    var COLORS = [
        { name: 'Note',      value: '#fef08a' },
        { name: 'Evidence',  value: '#bbf7d0' },
        { name: 'Idea',      value: '#bae6fd' },
        { name: 'Critique',  value: '#fecdd3' },
        { name: 'Action',    value: '#fed7aa' }
    ];

    var API_BASE = '/literature/highlight';

    // Characters of surrounding context stored with each anchor
    var ANCHOR_CONTEXT = 64;

    // -----------------------------------------------------------------
    // State
    // -----------------------------------------------------------------

    var highlights       = [];   // [{id, anchor, color, note}]
    var toolbar          = null;
    var notePopup        = null;
    var noteColorRow     = null; // colour-swatch row inside notePopup
    var noteTooltip      = null; // hover note panel
    var fontControls     = null; // floating article font-size control
    var tooltipHideTimer = null;
    var pendingRange     = null; // cloned Range of the current text selection
    var pendingCX        = 0;    // clientX from the mouseup that set pendingRange
    var pendingCY        = 0;    // clientY from the mouseup that set pendingRange
    var renderCache      = {};   // {wikitext: renderedHtml}
    var fontScale        = 1;
    var activeNoteHighlight = null;
    var activeNoteMark = null;
    var fontControlsCollapseTimer = null;

    // -----------------------------------------------------------------
    // Tiddler name from URL
    // -----------------------------------------------------------------

    function getTiddlerName() {
        var m = window.location.pathname.match(/\/literature\/article\/(.+)$/);
        return m ? decodeURIComponent(m[1]) : null;
    }

    var tiddlerName = getTiddlerName();
    if (!tiddlerName) return; // not a literature article page

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function getColorName(colorValue) {
        for (var i = 0; i < COLORS.length; i++) {
            if (COLORS[i].value === colorValue) {
                return COLORS[i].name;
            }
        }
        return 'Note';
    }

    function getArticleRoots() {
        return Array.prototype.filter.call(document.body.children, function (el) {
            if (!el || !el.tagName) return false;
            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return false;
            return el.id !== 'tw-hl-toolbar' &&
                   el.id !== 'tw-hl-note-popup' &&
                   el.id !== 'tw-hl-note-tooltip' &&
                   el.id !== 'tw-hl-font-controls';
        });
    }

    function getArticleElements() {
        var elements = [];
        getArticleRoots().forEach(function (root) {
            elements.push(root);
            Array.prototype.forEach.call(root.querySelectorAll('*'), function (el) {
                elements.push(el);
            });
        });
        return elements;
    }

    function loadFontScale() {
        try {
            window.localStorage.removeItem('tw-hl-font-scale');
        } catch (e) {}
        return 1;
    }

    function saveFontScale() {
        return;
    }

    function applyFontScale() {
        getArticleElements().forEach(function (el) {
            var computed = window.getComputedStyle(el);
            var originalFontSize = el.getAttribute('data-tw-hl-font-size');
            var originalLineHeight = el.getAttribute('data-tw-hl-line-height');

            if (!originalFontSize) {
                originalFontSize = computed.fontSize;
                el.setAttribute('data-tw-hl-font-size', originalFontSize);
            }
            if (!originalLineHeight) {
                originalLineHeight = computed.lineHeight;
                el.setAttribute('data-tw-hl-line-height', originalLineHeight);
            }

            var originalFontPx = parseFloat(originalFontSize);
            if (!isNaN(originalFontPx)) {
                el.style.fontSize = (Math.round(originalFontPx * fontScale * 10) / 10) + 'px';
            }

            var originalLinePx = parseFloat(originalLineHeight);
            if (!isNaN(originalLinePx)) {
                el.style.lineHeight = (Math.round(originalLinePx * fontScale * 10) / 10) + 'px';
            } else if (originalLineHeight === 'normal' && !isNaN(originalFontPx)) {
                el.style.lineHeight = (Math.round(originalFontPx * 1.4 * fontScale * 10) / 10) + 'px';
            }
        });
        if (fontControls) {
            var label = fontControls.querySelector('.tw-hl-font-reset');
            if (label) {
                label.textContent = Math.round(fontScale * 100) + '%';
            }
        }
    }

    function setFontControlsInteractive(isInteractive) {
        if (!fontControls) return;
        fontControls.classList.toggle('tw-hl-is-passive', !isInteractive);
    }

    function setFontControlsExpanded(isExpanded) {
        if (!fontControls) return;
        fontControls.classList.toggle('tw-hl-is-collapsed', !isExpanded);
    }

    function scheduleFontControlsCollapse(delay) {
        clearTimeout(fontControlsCollapseTimer);
        fontControlsCollapseTimer = window.setTimeout(function () {
            setFontControlsExpanded(false);
        }, delay || 1600);
    }

    function changeFontScale(delta) {
        fontScale = Math.max(0.7, Math.min(2, Math.round((fontScale + delta) * 10) / 10));
        saveFontScale();
        applyFontScale();
    }

    function resetFontScale() {
        fontScale = 1;
        saveFontScale();
        applyFontScale();
    }

    function isInsideHighlightUi(target) {
        if (!target) return false;
        if (toolbar && toolbar.contains(target)) return true;
        if (notePopup && notePopup.contains(target)) return true;
        if (noteTooltip && noteTooltip.contains(target)) return true;
        if (fontControls && fontControls.contains(target)) return true;
        return false;
    }

    /** Return true if node is inside an a.tw-icon or a.tw-icon-tiny element. */
    function isInsideTwIcon(node) {
        var el = node.parentElement;
        while (el) {
            if (el.tagName === 'A' &&
                (el.classList.contains('tw-icon') || el.classList.contains('tw-icon-tiny'))) {
                return true;
            }
            el = el.parentElement;
        }
        return false;
    }

    /** Return all visible text nodes inside root, skipping SCRIPT/STYLE and a.tw-icon / a.tw-icon-tiny. */
    function getTextNodes(root) {
        var nodes = [];
        var walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function (node) {
                    var tag = node.parentElement && node.parentElement.tagName;
                    if (tag === 'SCRIPT' || tag === 'STYLE') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (isInsideTwIcon(node)) {
                        return NodeFilter.FILTER_SKIP;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );
        var node;
        while ((node = walker.nextNode())) {
            nodes.push(node);
        }
        return nodes;
    }

    /**
     * Build a text-quote anchor from a live Range.
     * Stores the exact selected text plus ANCHOR_CONTEXT chars of surrounding
     * context. Robust to DOM restructuring because restoration searches by
     * content, not by position.
     */
    function textAnchorFromRange(range) {
        var nodes = getTextNodes(document.body);
        var buf = '', startPos = -1, endPos = -1;
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (startPos === -1 && n === range.startContainer) {
                startPos = buf.length + range.startOffset;
            }
            if (n === range.endContainer) {
                endPos = buf.length + range.endOffset;
            }
            buf += n.textContent;
        }
        if (startPos === -1 || endPos === -1 || startPos >= endPos) return null;
        return {
            exact:  buf.slice(startPos, endPos),
            prefix: buf.slice(Math.max(0, startPos - ANCHOR_CONTEXT), startPos),
            suffix: buf.slice(endPos, endPos + ANCHOR_CONTEXT),
            start:  startPos,
            end:    endPos
        };
    }

    /**
     * Restore a live Range from a text-quote anchor.
     *
     * Finds every occurrence of anchor.exact in the full text, then scores each
     * candidate by how well the stored prefix and suffix match the surrounding
     * context. The highest-scoring candidate wins. Handles duplicate phrases.
     */
    function rangeFromTextAnchor(anchor) {
        var nodes = getTextNodes(document.body);
        var buf = '';
        for (var i = 0; i < nodes.length; i++) buf += nodes[i].textContent;

        var exact  = anchor.exact  || '';
        var prefix = anchor.prefix || '';
        var suffix = anchor.suffix || '';
        if (!exact) return null;

        // Collect all occurrence start positions
        var candidates = [];
        var search = 0;
        while (true) {
            var idx = buf.indexOf(exact, search);
            if (idx === -1) break;
            candidates.push(idx);
            search = idx + 1;
        }
        if (candidates.length === 0) return null;

        function scoreCandidate(startPos) {
            var score = 0;
            var actualPrefix = buf.slice(Math.max(0, startPos - prefix.length), startPos);
            for (var k = 0; k < actualPrefix.length && k < prefix.length; k++) {
                if (actualPrefix[actualPrefix.length - 1 - k] === prefix[prefix.length - 1 - k]) { score++; }
                else { break; }
            }
            var endPos = startPos + exact.length;
            var actualSuffix = buf.slice(endPos, endPos + suffix.length);
            for (var m = 0; m < actualSuffix.length && m < suffix.length; m++) {
                if (actualSuffix[m] === suffix[m]) { score++; }
                else { break; }
            }
            return score;
        }

        var bestPos = candidates[0], bestScore = -1;
        for (var c = 0; c < candidates.length; c++) {
            var s = scoreCandidate(candidates[c]);
            if (s > bestScore) { bestScore = s; bestPos = candidates[c]; }
        }

        return absToRange(bestPos, bestPos + exact.length, nodes);
    }

    /**
     * Legacy: convert stored absolute offsets to a Range.
     * Used only as fallback for highlights saved in the old format.
     */
    function rangeFromAbsoluteOffsets(start, end) {
        return absToRange(start, end, getTextNodes(document.body));
    }

    /** Internal: map [startPos, endPos) in concatenated text to a DOM Range. */
    function absToRange(startPos, endPos, nodes) {
        var count = 0, sNode = null, sOff = 0, eNode = null, eOff = 0;
        for (var j = 0; j < nodes.length; j++) {
            var nd = nodes[j], len = nd.textContent.length;
            if (!sNode && count + len > startPos)  { sNode = nd; sOff = startPos - count; }
            if (!eNode && count + len >= endPos)    { eNode = nd; eOff = endPos   - count; break; }
            count += len;
        }
        if (!sNode || !eNode) return null;
        var range = document.createRange();
        try {
            range.setStart(sNode, Math.min(sOff, sNode.textContent.length));
            range.setEnd(eNode,   Math.min(eOff, eNode.textContent.length));
        } catch (e) {
            console.warn('[tw-highlight] range creation failed:', e);
            return null;
        }
        return range;
    }

    // -----------------------------------------------------------------
    // Server API
    // -----------------------------------------------------------------

    /**
     * Render wikitext via the server route, calling callback(html).
     * Results are cached in memory so repeated hovers are instant.
     */
    function renderNoteHtml(text, callback) {
        if (!text) { callback(''); return; }
        if (renderCache[text] !== undefined) { callback(renderCache[text]); return; }
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/literature/highlight-render', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function () {
            if (xhr.status === 200) {
                try {
                    var html = JSON.parse(xhr.responseText).html || '';
                    renderCache[text] = html;
                    callback(html);
                    return;
                } catch (e) {}
            }
            // Fallback: plain text — do NOT cache so it retries next hover
            callback('');
        };
        xhr.onerror = function () { callback(''); };
        xhr.send(JSON.stringify({ text: text }));
    }

    function loadHighlights(callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', API_BASE + '/' + encodeURIComponent(tiddlerName), true);
        xhr.onload = function () {
            if (xhr.status === 200) {
                try { return callback(JSON.parse(xhr.responseText)); } catch (e) {}
            }
            callback([]);
        };
        xhr.onerror = function () { callback([]); };
        xhr.send();
    }

    function saveHighlights() {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', API_BASE + '/' + encodeURIComponent(tiddlerName), true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify(highlights));
    }

    function normalizeHighlightPositions(items) {
        var changed = false;

        items.forEach(function (h) {
            if (!h || !h.anchor) return;

            var hasAnchorStart = typeof h.anchor.start === 'number';
            var hasAnchorEnd = typeof h.anchor.end === 'number';

            if (typeof h.start === 'number' || typeof h.end === 'number') {
                delete h.start;
                delete h.end;
                changed = true;
            }

            if (hasAnchorStart && hasAnchorEnd) {
                return;
            }

            var range = rangeFromTextAnchor(h.anchor);
            if (!range) return;

            var normalizedAnchor = textAnchorFromRange(range);
            if (!normalizedAnchor) return;

            h.anchor.exact = normalizedAnchor.exact;
            h.anchor.prefix = normalizedAnchor.prefix;
            h.anchor.suffix = normalizedAnchor.suffix;
            h.anchor.start = normalizedAnchor.start;
            h.anchor.end = normalizedAnchor.end;
            changed = true;
        });

        return changed;
    }

    // -----------------------------------------------------------------
    // DOM highlight application
    // -----------------------------------------------------------------

    /** Wrap the given Range in a <mark> for highlight h, wiring the click handler. */
    function applyHighlightToDOM(h) {
        var range;
        if (h.anchor) {
            range = rangeFromTextAnchor(h.anchor);
        } else if (typeof h.start === 'number' && typeof h.end === 'number') {
            // Legacy format: absolute char offsets
            range = rangeFromAbsoluteOffsets(h.start, h.end);
        }
        if (!range) {
            console.warn('[tw-highlight] Cannot apply highlight:', h.id);
            return;
        }
        var mark = document.createElement('mark');
        mark.style.backgroundColor = h.color;
        mark.style.cursor = 'pointer';
        mark.setAttribute('data-highlight-id', h.id);
        mark.setAttribute('data-category', getColorName(h.color));
        if (h.note) mark.setAttribute('data-note', h.note);

        try {
            mark.appendChild(range.extractContents());
            range.insertNode(mark);
        } catch (e) {
            console.warn('[tw-highlight] Failed to wrap range:', h.id, e);
            return;
        }

        mark.addEventListener('click', function (e) {
            e.stopPropagation();
            if (h.note) {
                showNoteTooltip(mark, h);
            } else {
                showEditPopup(mark, h, e.clientX, e.clientY);
            }
        });
    }

    /** Apply all stored highlights. Order is irrelevant with text-quote anchors. */
    function restoreHighlights() {
        for (var i = 0; i < highlights.length; i++) {
            applyHighlightToDOM(highlights[i]);
        }
    }

    function getHashHighlightId() {
        var hash = window.location.hash || '';
        var match = hash.match(/^#hl-(.+)$/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    function focusHighlightFromHash() {
        var highlightId = getHashHighlightId();
        if (!highlightId) return;

        var selector = 'mark[data-highlight-id="' + highlightId.replace(/"/g, '\\"') + '"]';
        var mark = document.querySelector(selector);
        if (!mark) return;

        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var previousOutline = mark.style.outline;
        var previousOutlineOffset = mark.style.outlineOffset;
        mark.style.outline = '2px solid #2563eb';
        mark.style.outlineOffset = '2px';
        window.setTimeout(function () {
            mark.style.outline = previousOutline;
            mark.style.outlineOffset = previousOutlineOffset;
        }, 2000);
    }

    function scheduleNoteTooltipHide(delay) {
        clearTimeout(tooltipHideTimer);
        tooltipHideTimer = window.setTimeout(hideNoteTooltip, delay || 1000);
    }

    /** Remove highlight from the highlights array and unwrap its <mark> node. */
    function removeHighlight(id, markEl) {
        highlights = highlights.filter(function (h) { return h.id !== id; });
        if (markEl && markEl.parentNode) {
            var parent = markEl.parentNode;
            while (markEl.firstChild) { parent.insertBefore(markEl.firstChild, markEl); }
            parent.removeChild(markEl);
            parent.normalize();
        }
        saveHighlights();
    }

    // -----------------------------------------------------------------
    // Styles
    // -----------------------------------------------------------------

    function buildFontControls() {
        fontControls = document.createElement('div');
        fontControls.id = 'tw-hl-font-controls';
        fontControls.className = 'tw-hl-is-collapsed';

        var smallerBtn = document.createElement('button');
        smallerBtn.type = 'button';
        smallerBtn.className = 'tw-hl-font-step';
        smallerBtn.textContent = 'A-';
        smallerBtn.title = 'Smaller article font';
        smallerBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            setFontControlsExpanded(true);
            changeFontScale(-0.1);
            scheduleFontControlsCollapse();
        });

        var resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'tw-hl-font-reset';
        resetBtn.title = 'Reset article font to 100%';
        resetBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            setFontControlsExpanded(true);
            resetFontScale();
            scheduleFontControlsCollapse();
        });

        var largerBtn = document.createElement('button');
        largerBtn.type = 'button';
        largerBtn.className = 'tw-hl-font-step';
        largerBtn.textContent = 'A+';
        largerBtn.title = 'Larger article font';
        largerBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            setFontControlsExpanded(true);
            changeFontScale(0.1);
            scheduleFontControlsCollapse();
        });

        fontControls.appendChild(smallerBtn);
        fontControls.appendChild(resetBtn);
        fontControls.appendChild(largerBtn);

        fontControls.addEventListener('mouseenter', function () {
            clearTimeout(fontControlsCollapseTimer);
            setFontControlsExpanded(true);
        });

        fontControls.addEventListener('mouseleave', function () {
            scheduleFontControlsCollapse(900);
        });

        fontControls.addEventListener('focusin', function () {
            clearTimeout(fontControlsCollapseTimer);
            setFontControlsExpanded(true);
        });

        fontControls.addEventListener('focusout', function () {
            scheduleFontControlsCollapse(900);
        });

        fontControls.addEventListener('touchstart', function () {
            clearTimeout(fontControlsCollapseTimer);
            setFontControlsExpanded(true);
        }, { passive: true });

        document.body.appendChild(fontControls);
        applyFontScale();
        scheduleFontControlsCollapse(1400);
    }

    // -----------------------------------------------------------------
    // Note panel (right side of page)
    // -----------------------------------------------------------------

    function buildNoteTooltip() {
        noteTooltip = document.createElement('div');
        noteTooltip.id = 'tw-hl-note-tooltip';

        var labelEl = document.createElement('div');
        labelEl.className = 'tw-hl-nt-label';
        labelEl.textContent = 'Note';
        noteTooltip.appendChild(labelEl);

        var textEl = document.createElement('div');
        textEl.className = 'tw-hl-nt-text';
        noteTooltip.appendChild(textEl);

        var footerEl = document.createElement('div');
        footerEl.className = 'tw-hl-nt-footer';

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'tw-hl-nt-btn';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            hideNoteTooltip();
        });
        footerEl.appendChild(closeBtn);

        var editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'tw-hl-nt-btn tw-hl-nt-btn-primary';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!activeNoteHighlight || !activeNoteMark) return;
            var mark = activeNoteMark;
            var highlight = activeNoteHighlight;
            var rect = mark.getBoundingClientRect();
            hideNoteTooltip();
            showEditPopup(mark, highlight, rect.right, rect.top);
        });
        footerEl.appendChild(editBtn);

        noteTooltip.appendChild(footerEl);

        noteTooltip.addEventListener('mouseenter', function () {
            clearTimeout(tooltipHideTimer);
        });

        noteTooltip.addEventListener('mouseleave', function () {
            scheduleNoteTooltipHide(900);
        });

        document.body.appendChild(noteTooltip);
    }

    function showNoteTooltip(mark, h) {
        if (!noteTooltip || !mark || !h) return;

        clearTimeout(tooltipHideTimer);
        activeNoteHighlight = h;
        activeNoteMark = mark;

        var note = h.note || '';
        var category = mark.getAttribute('data-category') || getColorName(mark.style.backgroundColor);
        var textEl = noteTooltip.querySelector('.tw-hl-nt-text');
        var labelEl = noteTooltip.querySelector('.tw-hl-nt-label');
        var editBtn = noteTooltip.querySelector('.tw-hl-nt-btn-primary');

        noteTooltip.style.borderLeftColor = mark.style.backgroundColor || '#fef08a';
        if (labelEl) {
            labelEl.textContent = category || 'Note';
        }
        if (editBtn) {
            editBtn.textContent = note ? 'Edit' : 'Add note';
        }

        var rect = mark.getBoundingClientRect();
        var top = Math.max(8, Math.min(rect.top, window.innerHeight - 8));
        noteTooltip.style.top = top + 'px';
        noteTooltip.classList.add('visible');
        scheduleNoteTooltipHide(2200);
        requestAnimationFrame(function () {
            if (!noteTooltip || activeNoteHighlight !== h || activeNoteMark !== mark) return;
            var panelRect = noteTooltip.getBoundingClientRect();
            var clampedTop = Math.max(8, Math.min(top, window.innerHeight - panelRect.height - 8));
            noteTooltip.style.top = clampedTop + 'px';
        });

        if (!note) {
            textEl.innerHTML = '<div class="tw-hl-nt-empty">No note yet.</div>';
            return;
        }

        renderNoteHtml(note, function (html) {
            if (activeNoteHighlight !== h || activeNoteMark !== mark) return;
            if (html) {
                textEl.innerHTML = html;
                textEl.querySelectorAll('a.tc-tiddlylink').forEach(function (a) {
                    a.addEventListener('click', function (e) {
                        e.preventDefault();
                        var href = a.getAttribute('href') || '';
                        var title = href.startsWith('#') ? href.slice(1) : href;
                        if (!title) return;
                        title = decodeURIComponent(title);
                        var bridge = window.twLiveBridge;
                        if (bridge && bridge.openTiddler) {
                            bridge.openTiddler(title);
                        }
                    });
                });
            } else {
                textEl.textContent = note;
            }
        });
    }

    function hideNoteTooltip() {
        clearTimeout(tooltipHideTimer);
        activeNoteHighlight = null;
        activeNoteMark = null;
        if (noteTooltip) noteTooltip.classList.remove('visible');
    }

    // -----------------------------------------------------------------
    // Toolbar (new-selection mode)
    // -----------------------------------------------------------------

    function buildToolbar() {
        toolbar = document.createElement('div');
        toolbar.id = 'tw-hl-toolbar';
        toolbar.style.display = 'none';

        var noteBtn = document.createElement('button');
        noteBtn.className = 'tw-hl-icon-btn';
        noteBtn.title = 'Highlight with note';
        noteBtn.textContent = '\u270E'; // ✎
        noteBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (pendingRange) {
                showNewNotePopup(pendingCX, pendingCY, pendingRange);
            }
            hideToolbar();
        });
        toolbar.appendChild(noteBtn);

        var sep = document.createElement('div');
        sep.className = 'tw-hl-sep';
        toolbar.appendChild(sep);

        COLORS.forEach(function (c) {
            var btn = document.createElement('button');
            btn.className = 'tw-hl-swatch';
            btn.style.backgroundColor = c.value;
            btn.title = 'Highlight – ' + c.name;
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (pendingRange) {
                    createHighlightFromRange(pendingRange, c.value, '');
                    pendingRange = null;
                }
                hideToolbar();
            });
            toolbar.appendChild(btn);
        });

        document.body.appendChild(toolbar);
    }

    function showToolbar(cx, cy) {
        if (!toolbar) return;
        toolbar.style.display = 'flex';
        positionPopup(toolbar, cx, cy, -46);
    }

    function hideToolbar() {
        if (toolbar) toolbar.style.display = 'none';
    }

    // -----------------------------------------------------------------
    // Note popup (shared for new highlights and editing existing ones)
    // -----------------------------------------------------------------

    function buildNotePopup() {
        notePopup = document.createElement('div');
        notePopup.id = 'tw-hl-note-popup';
        notePopup.style.display = 'none';

        // colour row slot (filled dynamically)
        var colorLabel = document.createElement('span');
        colorLabel.className = 'tw-hl-popup-label';
        colorLabel.textContent = 'COLOUR';
        notePopup.appendChild(colorLabel);

        // noteColorRow is inserted after colorLabel by rebuildColorRow()

        var textarea = document.createElement('textarea');
        textarea.placeholder = 'Add a note\u2026 (optional)';
        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                var saveBtn = notePopup.querySelector('.tw-hl-btn-primary');
                if (saveBtn) saveBtn.click();
            }
        });
        notePopup.appendChild(textarea);

        var footer = document.createElement('div');
        footer.className = 'tw-hl-popup-footer';

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'tw-hl-btn tw-hl-btn-ghost';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            notePopup.style.display = 'none';
            pendingRange = null;
        });
        footer.appendChild(cancelBtn);

        var saveBtn = document.createElement('button');
        saveBtn.className = 'tw-hl-btn tw-hl-btn-primary';
        saveBtn.textContent = 'Save';
        footer.appendChild(saveBtn);

        notePopup.appendChild(footer);
        document.body.appendChild(notePopup);
    }

    /** Replace the colour swatch row, pre-selecting currentColor (or first colour). */
    function rebuildColorRow(currentColor) {
        if (noteColorRow && noteColorRow.parentNode) {
            noteColorRow.parentNode.removeChild(noteColorRow);
        }
        noteColorRow = document.createElement('div');
        noteColorRow.className = 'tw-hl-color-row';

        COLORS.forEach(function (c) {
            var option = document.createElement('div');
            option.className = 'tw-hl-color-option';

            var btn = document.createElement('button');
            btn.className = 'tw-hl-swatch' + (c.value === (currentColor || COLORS[0].value) ? ' active' : '');
            btn.style.backgroundColor = c.value;
            btn.title = c.name;
            btn.setAttribute('data-color', c.value);
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                noteColorRow.querySelectorAll('.tw-hl-swatch').forEach(function (b) {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
            });

            var name = document.createElement('div');
            name.className = 'tw-hl-color-name';
            name.textContent = c.name;

            option.appendChild(btn);
            option.appendChild(name);
            noteColorRow.appendChild(option);
        });

        // Insert after the "COLOUR" label (first child)
        var label = notePopup.querySelector('.tw-hl-popup-label');
        label.parentNode.insertBefore(noteColorRow, label.nextSibling);
    }

    function getSelectedColor() {
        if (!noteColorRow) return COLORS[0].value;
        var active = noteColorRow.querySelector('.tw-hl-swatch.active');
        return active ? active.getAttribute('data-color') : COLORS[0].value;
    }

    /** Replace the save button to detach stale event listeners. */
    function resetSaveBtn(newText) {
        var footer  = notePopup.querySelector('.tw-hl-popup-footer');
        var old     = footer.querySelector('.tw-hl-btn-primary');
        var fresh   = old.cloneNode(false);
        fresh.className = old.className;
        fresh.textContent = newText || 'Save';
        old.parentNode.replaceChild(fresh, old);
        return fresh;
    }

    /** Remove the delete button if present. */
    function removeDeleteBtn() {
        var footer = notePopup.querySelector('.tw-hl-popup-footer');
        var del    = footer.querySelector('.tw-hl-btn-danger');
        if (del) footer.removeChild(del);
    }

    /** Show note popup for a brand-new selection. */
    function showNewNotePopup(cx, cy, range) {
        rebuildColorRow(null);
        notePopup.querySelector('textarea').value = '';
        removeDeleteBtn();
        window.getSelection().removeAllRanges();

        var saveBtn = resetSaveBtn('Highlight & Save');
        saveBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var color = getSelectedColor();
            var note  = notePopup.querySelector('textarea').value.trim();
            createHighlightFromRange(range, color, note);
            pendingRange = null;
            notePopup.style.display = 'none';
        });

        notePopup.style.display = 'flex';
        positionPopup(notePopup, cx, cy, -190);
        notePopup.querySelector('textarea').focus();
    }

    /** Show note popup to edit an existing highlight. */
    function showEditPopup(markEl, h, cx, cy) {
        hideToolbar();
        rebuildColorRow(h.color);
        notePopup.querySelector('textarea').value = h.note || '';
        window.getSelection().removeAllRanges();

        // Ensure delete button exists
        var footer = notePopup.querySelector('.tw-hl-popup-footer');
        removeDeleteBtn();
        var delBtn = document.createElement('button');
        delBtn.className = 'tw-hl-btn tw-hl-btn-danger';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            removeHighlight(h.id, markEl);
            notePopup.style.display = 'none';
        });
        footer.insertBefore(delBtn, footer.querySelector('.tw-hl-btn-ghost'));

        var saveBtn = resetSaveBtn('Save');
        saveBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            h.color = getSelectedColor();
            h.note  = notePopup.querySelector('textarea').value.trim();
            markEl.style.backgroundColor = h.color;
            markEl.setAttribute('data-category', getColorName(h.color));
            if (h.note) {
                markEl.setAttribute('data-note', h.note);
            } else {
                markEl.removeAttribute('data-note');
                hideNoteTooltip();
            }
            saveHighlights();
            notePopup.style.display = 'none';
        });

        notePopup.style.display = 'flex';
        positionPopup(notePopup, cx, cy, -190);
        notePopup.querySelector('textarea').focus();
    }

    // -----------------------------------------------------------------
    // Popup positioning
    // -----------------------------------------------------------------

    /**
     * Place el so its bottom-right is near (cx, cy + yOffset) in viewport coords.
     * Clamps to viewport edges after the browser has rendered it.
     */
    function positionPopup(el, cx, cy, yOffset) {
        el.style.left = cx + 'px';
        el.style.top  = (cy + (yOffset || 0)) + 'px';
        requestAnimationFrame(function () {
            var r = el.getBoundingClientRect();
            var vw = window.innerWidth, vh = window.innerHeight;
            var left = parseFloat(el.style.left);
            var top  = parseFloat(el.style.top);
            if (r.right > vw - 8)  { el.style.left = Math.max(8, vw - r.width - 8) + 'px'; }
            if (r.left  < 8)       { el.style.left = '8px'; }
            if (r.top   < 8)       { el.style.top  = (cy + Math.abs(yOffset || 0) + 8) + 'px'; }
            if (r.bottom > vh - 8) { el.style.top  = Math.max(8, vh - r.height - 8) + 'px'; }
        });
    }

    // -----------------------------------------------------------------
    // Create a highlight from a cloned Range
    // -----------------------------------------------------------------

    function createHighlightFromRange(range, color, note) {
        var anchor = textAnchorFromRange(range);
        if (!anchor) return;

        var h = {
            id:     generateId(),
            anchor: anchor,
            color:  color,
            note:   note || ''
        };

        highlights.push(h);
        applyHighlightToDOM(h);
        saveHighlights();
        window.getSelection().removeAllRanges();
    }

    // -----------------------------------------------------------------
    // Event listeners
    // -----------------------------------------------------------------

    document.addEventListener('mouseup', function (e) {
        if (isInsideHighlightUi(e.target)) return;

        // Give the browser a tick to finalise the selection
        setTimeout(function () {
            var sel  = window.getSelection();
            var text = sel && sel.toString().trim();
            if (!text) {
                hideToolbar();
                pendingRange = null;
                setFontControlsInteractive(true);
                return;
            }
            if (!sel.rangeCount) {
                hideToolbar();
                pendingRange = null;
                setFontControlsInteractive(true);
                return;
            }
            pendingRange = sel.getRangeAt(0).cloneRange();
            pendingCX    = e.clientX;
            pendingCY    = e.clientY;
            showToolbar(e.clientX, e.clientY);
            setFontControlsInteractive(true);
        }, 10);
    });

    document.addEventListener('mousedown', function (e) {
        if (isInsideHighlightUi(e.target)) return;
        setFontControlsInteractive(false);
        hideToolbar();
        if (notePopup) notePopup.style.display = 'none';
        hideNoteTooltip();
    });

    // -----------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------

    function init() {
        fontScale = loadFontScale();
        buildToolbar();
        buildNotePopup();
        buildNoteTooltip();
        buildFontControls();
        loadHighlights(function (data) {
            highlights = Array.isArray(data) ? data : [];
            if (normalizeHighlightPositions(highlights)) {
                saveHighlights();
            }
            restoreHighlights();
            focusHighlightFromHash();
        });

        window.addEventListener('hashchange', focusHighlightFromHash);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

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
        { name: 'Yellow', value: '#fef08a' },
        { name: 'Green',  value: '#bbf7d0' },
        { name: 'Blue',   value: '#bae6fd' },
        { name: 'Pink',   value: '#fecdd3' },
        { name: 'Orange', value: '#fed7aa' }
    ];

    var API_BASE = '/literature/highlight';

    // -----------------------------------------------------------------
    // State
    // -----------------------------------------------------------------

    var highlights    = [];   // [{id, start, end, text, color, note}]
    var toolbar       = null;
    var notePopup     = null;
    var noteColorRow  = null; // colour-swatch row inside notePopup
    var pendingRange  = null; // cloned Range of the current text selection
    var pendingCX     = 0;    // clientX from the mouseup that set pendingRange
    var pendingCY     = 0;    // clientY from the mouseup that set pendingRange

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

    /** Return all visible text nodes inside root, skipping SCRIPT/STYLE. */
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
     * Convert a live Range to absolute character offsets within document.body.
     * Works correctly even when <mark> elements are already present because
     * getTextNodes visits text inside marks too (same total character count).
     */
    function rangeToAbsolute(range) {
        var nodes = getTextNodes(document.body);
        var startAbs = -1, endAbs = -1, count = 0;
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var len = n.textContent.length;
            if (startAbs === -1 && n === range.startContainer) {
                startAbs = count + range.startOffset;
            }
            if (n === range.endContainer) {
                endAbs = count + range.endOffset;
            }
            if (startAbs !== -1 && endAbs !== -1) break;
            count += len;
        }
        return { start: startAbs, end: endAbs };
    }

    /**
     * Convert stored absolute offsets back to a live Range.
     * Must be called before any later highlight has been applied at a lower
     * offset (i.e. restore highlights from END to START order).
     */
    function absoluteToRange(start, end) {
        var nodes = getTextNodes(document.body);
        var count = 0;
        var sNode = null, sOff = 0, eNode = null, eOff = 0;
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var len = n.textContent.length;
            if (!sNode && count + len > start) {
                sNode = n;
                sOff  = start - count;
            }
            if (!eNode && count + len >= end) {
                eNode = n;
                eOff  = end - count;
                break;
            }
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

    // -----------------------------------------------------------------
    // DOM highlight application
    // -----------------------------------------------------------------

    /** Wrap the given Range in a <mark> for highlight h, wiring the click handler. */
    function applyHighlightToDOM(h) {
        var range = absoluteToRange(h.start, h.end);
        if (!range) {
            console.warn('[tw-highlight] Cannot apply highlight:', h.id);
            return;
        }
        var mark = document.createElement('mark');
        mark.style.backgroundColor = h.color;
        mark.style.cursor = 'pointer';
        mark.setAttribute('data-highlight-id', h.id);
        if (h.note) mark.setAttribute('title', h.note);

        try {
            mark.appendChild(range.extractContents());
            range.insertNode(mark);
        } catch (e) {
            console.warn('[tw-highlight] Failed to wrap range:', h.id, e);
            return;
        }

        mark.addEventListener('click', function (e) {
            e.stopPropagation();
            showEditPopup(mark, h, e.clientX, e.clientY);
        });
    }

    /** Apply all stored highlights, processing END → START to preserve offsets. */
    function restoreHighlights() {
        var sorted = highlights.slice().sort(function (a, b) { return b.start - a.start; });
        for (var i = 0; i < sorted.length; i++) {
            applyHighlightToDOM(sorted[i]);
        }
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

    function injectStyles() {
        var css = [
            '#tw-hl-toolbar{',
            ' position:fixed;background:#1e293b;border-radius:10px;',
            ' padding:6px 10px;display:flex;gap:7px;align-items:center;',
            ' box-shadow:0 4px 18px rgba(0,0,0,.45);z-index:2147483646;',
            ' user-select:none;pointer-events:all;',
            '}',
            '.tw-hl-swatch{',
            ' width:22px;height:22px;border-radius:50%;border:2px solid transparent;',
            ' cursor:pointer;transition:transform .12s,border-color .12s;flex-shrink:0;background:none;padding:0;',
            '}',
            '.tw-hl-swatch:hover{transform:scale(1.25);border-color:#fff}',
            '.tw-hl-swatch.active{border-color:#fff;box-shadow:0 0 0 2px #3b82f6}',
            '.tw-hl-icon-btn{',
            ' background:none;border:none;color:#e2e8f0;cursor:pointer;',
            ' font-size:15px;padding:0 4px;line-height:1;opacity:.8;',
            '}',
            '.tw-hl-icon-btn:hover{opacity:1}',
            '.tw-hl-sep{width:1px;height:18px;background:#475569;flex-shrink:0}',
            '#tw-hl-note-popup{',
            ' position:fixed;background:#1e293b;border-radius:10px;padding:12px;',
            ' box-shadow:0 4px 18px rgba(0,0,0,.45);z-index:2147483647;',
            ' display:flex;flex-direction:column;gap:9px;min-width:260px;',
            ' pointer-events:all;',
            '}',
            '#tw-hl-note-popup textarea{',
            ' width:100%;box-sizing:border-box;height:78px;border-radius:6px;',
            ' border:1px solid #475569;background:#0f172a;color:#e2e8f0;',
            ' padding:7px;font-size:13px;resize:vertical;outline:none;font-family:inherit;',
            '}',
            '#tw-hl-note-popup textarea:focus{border-color:#3b82f6}',
            '#tw-hl-note-popup textarea::placeholder{color:#64748b}',
            '.tw-hl-popup-footer{display:flex;justify-content:flex-end;gap:6px;align-items:center}',
            '.tw-hl-btn{',
            ' border:none;border-radius:5px;padding:4px 14px;',
            ' cursor:pointer;font-size:13px;font-weight:500;',
            '}',
            '.tw-hl-btn-primary{background:#3b82f6;color:#fff}',
            '.tw-hl-btn-primary:hover{background:#2563eb}',
            '.tw-hl-btn-danger{background:#ef4444;color:#fff}',
            '.tw-hl-btn-danger:hover{background:#dc2626}',
            '.tw-hl-btn-ghost{background:#334155;color:#e2e8f0}',
            '.tw-hl-btn-ghost:hover{background:#475569}',
            '.tw-hl-color-row{display:flex;gap:6px;align-items:center}',
            '.tw-hl-popup-label{font-size:11px;color:#94a3b8;letter-spacing:.04em}'
        ].join('');
        var s = document.createElement('style');
        s.textContent = css;
        document.head.appendChild(s);
    }

    // -----------------------------------------------------------------
    // Toolbar (new-selection mode)
    // -----------------------------------------------------------------

    function buildToolbar() {
        toolbar = document.createElement('div');
        toolbar.id = 'tw-hl-toolbar';
        toolbar.style.display = 'none';

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

        var sep = document.createElement('div');
        sep.className = 'tw-hl-sep';
        toolbar.appendChild(sep);

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
            noteColorRow.appendChild(btn);
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
            if (h.note) {
                markEl.setAttribute('title', h.note);
            } else {
                markEl.removeAttribute('title');
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
        var abs = rangeToAbsolute(range);
        if (abs.start === -1 || abs.end === -1 || abs.start >= abs.end) return;

        var h = {
            id:    generateId(),
            start: abs.start,
            end:   abs.end,
            text:  range.toString().trim(),
            color: color,
            note:  note || ''
        };

        highlights.push(h);
        highlights.sort(function (a, b) { return a.start - b.start; });

        applyHighlightToDOM(h);
        saveHighlights();
        window.getSelection().removeAllRanges();
    }

    // -----------------------------------------------------------------
    // Event listeners
    // -----------------------------------------------------------------

    document.addEventListener('mouseup', function (e) {
        if (toolbar   && toolbar.contains(e.target))   return;
        if (notePopup && notePopup.contains(e.target)) return;

        // Give the browser a tick to finalise the selection
        setTimeout(function () {
            var sel  = window.getSelection();
            var text = sel && sel.toString().trim();
            if (!text) {
                hideToolbar();
                pendingRange = null;
                return;
            }
            pendingRange = sel.getRangeAt(0).cloneRange();
            pendingCX    = e.clientX;
            pendingCY    = e.clientY;
            showToolbar(e.clientX, e.clientY);
        }, 10);
    });

    document.addEventListener('mousedown', function (e) {
        if (toolbar   && toolbar.contains(e.target))   return;
        if (notePopup && notePopup.contains(e.target)) return;
        hideToolbar();
        if (notePopup) notePopup.style.display = 'none';
    });

    // -----------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------

    function init() {
        injectStyles();
        buildToolbar();
        buildNotePopup();
        loadHighlights(function (data) {
            highlights = Array.isArray(data) ? data : [];
            restoreHighlights();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

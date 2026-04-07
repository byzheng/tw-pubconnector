/*\
title: $:/plugins/bangyou/tw-pubconnector/script/domain-link.js
type: application/javascript

Client-side domain auto-linker injected into literature article pages.

Features:
  - Matches Domain-tagged tiddler titles in article text case-insensitively
  - Converts matches into TiddlyWiki links
  - Processes text nodes gradually to avoid blocking article rendering

\*/
(function () {
    'use strict';

    var domainLinkEntries = [];
    var domainLinkPattern = null;
    var domainLinkOptions = {
        firstOccurrencePerScope: true
    };

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

    function escapeRegExp(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function isWordChar(ch) {
        return !!ch && /[A-Za-z0-9]/.test(ch);
    }

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

    function isInsideDomainLink(node) {
        var el = node && node.parentElement;
        while (el) {
            if (el.tagName === 'A' || el.tagName === 'MARK') return true;
            if (el.id === 'tw-hl-toolbar' ||
                el.id === 'tw-hl-note-popup' ||
                el.id === 'tw-hl-note-tooltip' ||
                el.id === 'tw-hl-font-controls') {
                return true;
            }
            el = el.parentElement;
        }
        return false;
    }

    function prepareDomainLinks() {
        var linkSpecs = window.__TW_PUBCONNECTOR_DOMAIN_LINKS;
        var titles = window.__TW_PUBCONNECTOR_DOMAIN_TITLES;
        if (!Array.isArray(linkSpecs) || !linkSpecs.length) {
            linkSpecs = Array.isArray(titles) ? titles.map(function (title) {
                return {
                    title: title,
                    terms: [title]
                };
            }) : [];
        }
        if (!linkSpecs.length) return;

        var deduped = {};
        domainLinkEntries = [];

        linkSpecs.forEach(function (spec) {
            if (!spec || typeof spec.title !== 'string' || !spec.title.trim()) return;

            var canonicalTitle = spec.title.trim();
            var terms = Array.isArray(spec.terms) ? spec.terms : [canonicalTitle];

            terms.forEach(function (term) {
                if (typeof term !== 'string' || !term.trim()) return;
                var trimmed = term.trim();
                var key = trimmed.toLowerCase();
                if (deduped[key]) return;
                deduped[key] = true;
                domainLinkEntries.push({
                    title: canonicalTitle,
                    term: trimmed,
                    termLower: key
                });
            });
        });

        if (!domainLinkEntries.length) return;

        domainLinkEntries.sort(function (left, right) {
            return right.term.length - left.term.length;
        });

        domainLinkPattern = new RegExp(
            domainLinkEntries.map(function (entry) {
                return escapeRegExp(entry.term);
            }).join('|'),
            'gi'
        );
    }

    function createDomainLink(title, text) {
        var link = document.createElement('a');
        link.href = '/#' + encodeURIComponent(title);
        link.className = 'tw-domain-link tc-tiddlylink tc-tiddlylink-resolves';
        link.setAttribute('data-tw-domain-title', title);
        link.textContent = text;
        link.addEventListener('click', function (e) {
            var bridge = window.twLiveBridge;
            if (bridge && bridge.openTiddler) {
                e.preventDefault();
                e.stopPropagation();
                bridge.openTiddler(title);
            }
        });
        return link;
    }

    function findDomainEntry(matchText) {
        var lower = matchText.toLowerCase();
        for (var i = 0; i < domainLinkEntries.length; i++) {
            if (domainLinkEntries[i].termLower === lower) {
                return domainLinkEntries[i];
            }
        }
        return null;
    }

    function getLinkScope(node) {
        var el = node && node.parentElement;
        while (el) {
            if (/^(P|LI|BLOCKQUOTE|TD|TH|DD|DT|FIGCAPTION|H1|H2|H3|H4|H5|H6)$/i.test(el.tagName)) {
                return el;
            }
            el = el.parentElement;
        }
        return node && node.parentElement ? node.parentElement : null;
    }

    function hasLinkedDomainInScope(scope, domainTitle) {
        var linkedDomains = scope && scope.__twDomainLinkedTitles;
        return !!(linkedDomains && linkedDomains[domainTitle]);
    }

    function markLinkedDomainInScope(scope, domainTitle) {
        if (!scope) return;
        if (!scope.__twDomainLinkedTitles) {
            scope.__twDomainLinkedTitles = Object.create(null);
        }
        scope.__twDomainLinkedTitles[domainTitle] = true;
    }

    function linkDomainsInTextNode(node) {
        if (!node || !node.parentNode || !domainLinkPattern) return;
        if (isInsideTwIcon(node) || isInsideDomainLink(node)) return;

        var text = node.textContent;
        if (!text || !text.trim()) return;

        var scope = getLinkScope(node);
        if (!scope) return;

        domainLinkPattern.lastIndex = 0;
        var fragment = null;
        var lastIndex = 0;
        var match;

        while ((match = domainLinkPattern.exec(text))) {
            var start = match.index;
            var end = start + match[0].length;
            var prevChar = start > 0 ? text.charAt(start - 1) : '';
            var nextChar = end < text.length ? text.charAt(end) : '';

            if (isWordChar(prevChar) || isWordChar(nextChar)) {
                continue;
            }

            var entry = findDomainEntry(match[0]);
            if (!entry) continue;
            if (domainLinkOptions.firstOccurrencePerScope && hasLinkedDomainInScope(scope, entry.title)) {
                continue;
            }

            if (!fragment) {
                fragment = document.createDocumentFragment();
            }
            if (start > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
            }
            fragment.appendChild(createDomainLink(entry.title, text.slice(start, end)));
            if (domainLinkOptions.firstOccurrencePerScope) {
                markLinkedDomainInScope(scope, entry.title);
            }
            lastIndex = end;
        }

        if (!fragment) return;
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        node.parentNode.replaceChild(fragment, node);
    }

    function getDomainTextNodes() {
        var nodes = [];
        getArticleRoots().forEach(function (root) {
            var walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function (node) {
                        var tag = node.parentElement && node.parentElement.tagName;
                        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') {
                            return NodeFilter.FILTER_REJECT;
                        }
                        if (isInsideTwIcon(node) || isInsideDomainLink(node)) {
                            return NodeFilter.FILTER_SKIP;
                        }
                        if (!node.textContent || !node.textContent.trim()) {
                            return NodeFilter.FILTER_SKIP;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );
            var current;
            while ((current = walker.nextNode())) {
                nodes.push(current);
            }
        });
        return nodes;
    }

    function scheduleIdleWork(fn) {
        if (window.requestIdleCallback) {
            window.requestIdleCallback(fn, { timeout: 250 });
            return;
        }
        window.setTimeout(function () {
            fn({
                timeRemaining: function () { return 0; }
            });
        }, 16);
    }

    function restoreDomainLinksGradually() {
        if (!domainLinkPattern) return;

        var nodes = getDomainTextNodes();
        var index = 0;

        function processBatch(deadline) {
            var startTime = Date.now();
            while (index < nodes.length) {
                linkDomainsInTextNode(nodes[index]);
                index += 1;

                if (deadline && deadline.timeRemaining && deadline.timeRemaining() > 2) {
                    continue;
                }
                if (Date.now() - startTime >= 12) {
                    break;
                }
            }

            if (index < nodes.length) {
                scheduleIdleWork(processBatch);
            }
        }

        scheduleIdleWork(processBatch);
    }

    function init() {
        var options = window.__TW_PUBCONNECTOR_DOMAIN_LINK_OPTIONS;
        if (options && typeof options === 'object') {
            domainLinkOptions.firstOccurrencePerScope = options.firstOccurrencePerScope !== false;
        }
        prepareDomainLinks();
        if (!domainLinkPattern) return;
        restoreDomainLinksGradually();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();